/* ============ Google Sheets : rapports d'analyse dans une feuille de calcul ============ */
window.SheetsMgr = {
  status: null,

  async load() {
    try { this.status = await api('/api/sheets/status'); } catch { return; }
    this.render();
  },

  render() {
    const s = this.status;
    if (!s || !$('#gs-card')) return;
    $('#gs-connected').hidden = !s.connected;
    $('#gs-setup').hidden = !!s.connected;
    if (s.connected) {
      $('#gs-name').textContent = s.name || 'Google Sheets';
      const open = $('#gs-open');
      open.hidden = !s.sheetUrl;
      if (s.sheetUrl) open.href = safeUrl(s.sheetUrl);
      $('#gs-auto').checked = !!s.auto;
    }
  },

  async copyScript() {
    try {
      const r = await fetch('/api/sheets/script', { headers: { 'X-Lang': LANG } });
      if (!r.ok) throw new Error(t('Erreur {n}', { n: r.status }));
      await TradingViewMgr.copy(await r.text(), t('Script copié ✓ — collez-le dans Extensions → Apps Script.'));
    } catch (e) { toast(e.message, 'err'); }
  },

  async connect() {
    const url = $('#gs-url').value.trim();
    if (!url) { toast(t('Collez d’abord l’URL de l’application Web.'), 'err'); return; }
    const btn = $('#gs-connect');
    btn.disabled = true; btn.textContent = t('⏳ Connexion…');
    try {
      const j = await api('/api/sheets/connect', { method: 'POST', body: JSON.stringify({ url }) });
      toast(t('Connecté à « {name} » ✓', { name: j.name || 'Google Sheets' }), 'ok');
      $('#gs-url').value = '';
      await this.load();
    } catch (e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = t('🔗 Connecter');
  },

  async disconnect() {
    if (!confirm(t('Déconnecter Google Sheets ? Votre feuille et ses données restent intactes.'))) return;
    try { await api('/api/sheets/disconnect', { method: 'POST' }); toast(t('Google Sheets déconnecté.'), 'ok'); }
    catch (e) { toast(e.message, 'err'); }
    this.load();
  },

  goToSettings() {
    document.querySelector('[data-tab="settings"]').click();
    setTimeout(() => $('#gs-card') && $('#gs-card').scrollIntoView({ behavior: 'smooth' }), 100);
  },

  // Bouton « Enregistrer dans Sheets » d'une analyse : enregistre la version affichée (langue choisie)
  async saveCurrent() {
    const entry = APP.currentAnalysis, view = APP.currentView;
    if (!entry || !entry.id) return;
    if (!this.status || !this.status.connected) {
      toast(t('Connectez d’abord Google Sheets dans les Réglages.'), 'err');
      this.goToSettings();
      return;
    }
    const btn = $('#btn-sheets');
    if (btn) { btn.disabled = true; btn.textContent = t('⏳ Enregistrement…'); }
    try {
      const j = await api(`/api/sheets/save/${encodeURIComponent(entry.id)}`, {
        method: 'POST', body: JSON.stringify({ lang: (view && view.viewLang) || LANG })
      });
      toast(j.updated ? t('Ligne {row} mise à jour dans Google Sheets ✓', { row: j.row }) : t('Ajouté à Google Sheets (ligne {row}) ✓', { row: j.row }), 'ok');
      if (APP.currentAnalysis && APP.currentAnalysis.id === entry.id) AnalyzeMgr.showResult(j.entry);
    } catch (e) {
      toast(e.message, 'err');
      if (btn) { btn.disabled = false; btn.textContent = '📊 ' + t('Enregistrer dans Sheets'); }
    }
  },

  // Envoie tout l'historique (analyses avec un plan), une par une
  async saveAll() {
    let list = [];
    try { list = (await api('/api/analyses')).filter(a => a.result); } catch (e) { toast(e.message, 'err'); return; }
    if (!list.length) { toast(t('Aucune analyse à enregistrer.'), 'err'); return; }
    if (!confirm(t('Enregistrer {n} analyse(s) dans Google Sheets ? Les analyses déjà présentes sont mises à jour, pas dupliquées.', { n: list.length }))) return;
    const btn = $('#gs-save-all');
    btn.disabled = true;
    let ok = 0, failed = 0;
    for (const a of list.reverse()) { // de la plus ancienne à la plus récente
      btn.textContent = t('⏳ {done}/{total}…', { done: ok + failed + 1, total: list.length });
      try {
        await api(`/api/sheets/save/${encodeURIComponent(a.id)}`, { method: 'POST', body: JSON.stringify({ lang: LANG }) });
        ok++;
      } catch (e) {
        failed++;
        if (failed === 1) toast(e.message, 'err');
        if (failed >= 3 && ok === 0) break; // configuration manifestement incorrecte : on arrête
      }
    }
    btn.disabled = false;
    btn.textContent = '📤 ' + t('Enregistrer tout l’historique');
    toast(t('{ok} analyse(s) enregistrée(s) dans Google Sheets{failed}', { ok, failed: failed ? t(' — {n} échec(s)', { n: failed }) : '' }), failed ? 'err' : 'ok');
    AnalyzeMgr.refreshHistory();
  }
};

/* ---------- Écouteurs ---------- */
$('#gs-copy-script').addEventListener('click', () => SheetsMgr.copyScript());
$('#gs-connect').addEventListener('click', () => SheetsMgr.connect());
$('#gs-url').addEventListener('keydown', e => { if (e.key === 'Enter') SheetsMgr.connect(); });
$('#gs-disconnect').addEventListener('click', () => SheetsMgr.disconnect());
$('#gs-save-all').addEventListener('click', () => SheetsMgr.saveAll());
$('#gs-auto').addEventListener('change', async (e) => {
  try {
    await api('/api/sheets/auto', { method: 'PUT', body: JSON.stringify({ auto: e.target.checked }) });
    toast(e.target.checked ? t('Enregistrement automatique activé ✓') : t('Enregistrement automatique désactivé.'), 'ok');
  } catch (err) { toast(err.message, 'err'); }
  SheetsMgr.load();
});

SheetsMgr.load();
