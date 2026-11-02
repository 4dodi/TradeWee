/* ============ TradingView : export Pine Script + alertes webhook ============ */
window.TradingViewMgr = {
  status: null,
  lastSeenAt: null,
  pollTimer: null,

  /* ---------- Plan → script Pine (indicateur qui trace les niveaux) ---------- */
  buildPine(entry) {
    const r = entry && entry.result;
    if (!r) return null;
    const n = v => {
      const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
      return Number.isFinite(x) ? x : null;
    };
    // texte sûr dans une chaîne Pine entre guillemets
    const str = s => String(s ?? '').replace(/[\\"]/g, '').replace(/[\r\n]+/g, ' ').slice(0, 60);
    const bias = String(r.biais || '').toUpperCase().includes('ACHAT') ? 'ACHAT'
      : String(r.biais || '').toUpperCase().includes('VENTE') ? 'VENTE' : 'NEUTRE';
    const asset = str(r.actif || entry.params?.asset || '').replace(/[^A-Za-z0-9 ./:_-]/g, '') || 'Plan';
    const day = (entry.date ? new Date(entry.date) : new Date()).toISOString().slice(0, 10);

    const entree = n(r.entree), sl = n(r.stopLoss);
    const zLo = n(r.zoneEntree && r.zoneEntree.min), zHi = n(r.zoneEntree && r.zoneEntree.max);
    const tps = (r.takeProfits || []).slice(0, 3).map(tp => n(tp && tp.niveau));
    if (entree == null && sl == null && !tps.some(v => v != null)) return null;
    const rrOk = entree != null && sl != null && entree !== sl;
    // littéral Pine toujours décimal (2732 → 2732.0, 1e-7 → 0.0000001)
    const f = x => { const t2 = x.toFixed(10).replace(/0+$/, ''); return t2.endsWith('.') ? t2 + '0' : t2; };

    const L = [];
    L.push('//@version=6');
    L.push(`// ${t('Plan généré par Tradewee')} — ${asset} — ${day}`);
    L.push(`// ${t('Niveaux modifiables dans les paramètres de l’indicateur.')}`);
    L.push(`indicator("Tradewee — ${asset} ${str(biasLabel(bias))} (${day})", overlay = true, max_labels_count = 20)`);
    L.push('');
    if (entree != null) L.push(`entryLvl = input.float(${f(entree)}, "${str(t('Entrée'))}", group = "Plan")`);
    if (zLo != null && zHi != null) {
      L.push(`zoneLo = input.float(${f(Math.min(zLo, zHi))}, "${str(t('Zone d’entrée basse'))}", group = "Plan")`);
      L.push(`zoneHi = input.float(${f(Math.max(zLo, zHi))}, "${str(t('Zone d’entrée haute'))}", group = "Plan")`);
    }
    if (sl != null) L.push(`slLvl = input.float(${f(sl)}, "Stop loss", group = "Plan")`);
    tps.forEach((v, i) => { if (v != null) L.push(`tp${i + 1}Lvl = input.float(${f(v)}, "TP${i + 1}", group = "Plan")`); });
    L.push(`showLabels = input.bool(true, "${str(t('Afficher les étiquettes'))}", group = "Display")`);
    L.push('');
    if (entree != null) L.push(`hline(entryLvl, "${str(t('Entrée'))}", color = color.blue, linestyle = hline.style_solid, linewidth = 2)`);
    if (zLo != null && zHi != null) {
      L.push(`zLoLine = hline(zoneLo, "${str(t('Zone d’entrée basse'))}", color = color.new(color.blue, 60), linestyle = hline.style_dotted)`);
      L.push(`zHiLine = hline(zoneHi, "${str(t('Zone d’entrée haute'))}", color = color.new(color.blue, 60), linestyle = hline.style_dotted)`);
      L.push(`fill(zLoLine, zHiLine, color = color.new(color.blue, 88), title = "${str(t('Zone d’entrée'))}")`);
    }
    if (sl != null) L.push(`hline(slLvl, "Stop loss", color = color.red, linestyle = hline.style_solid, linewidth = 2)`);
    tps.forEach((v, i) => { if (v != null) L.push(`hline(tp${i + 1}Lvl, "TP${i + 1}", color = color.green, linestyle = hline.style_dashed, linewidth = ${i === 0 ? 2 : 1})`); });
    L.push('');
    L.push('var array<label> tags = array.new<label>()');
    L.push('tag(float price, string txt, color col) =>');
    L.push('    label.new(bar_index + 3, price, txt, style = label.style_label_left, color = col, textcolor = color.white, size = size.small)');
    if (rrOk) L.push('rr(float tp) => " (" + str.tostring(math.abs(tp - entryLvl) / math.abs(entryLvl - slLvl), "#.##") + "R)"');
    L.push('');
    L.push('if barstate.islast and showLabels');
    L.push('    for l in tags');
    L.push('        label.delete(l)');
    L.push('    array.clear(tags)');
    if (entree != null) L.push(`    array.push(tags, tag(entryLvl, "${str(t('Entrée'))} " + str.tostring(entryLvl, format.mintick), color.blue))`);
    if (sl != null) L.push('    array.push(tags, tag(slLvl, "SL " + str.tostring(slLvl, format.mintick), color.red))');
    tps.forEach((v, i) => {
      if (v != null) L.push(`    array.push(tags, tag(tp${i + 1}Lvl, "TP${i + 1} " + str.tostring(tp${i + 1}Lvl, format.mintick)${rrOk ? ` + rr(tp${i + 1}Lvl)` : ''}, color.green))`);
    });
    return L.join('\n') + '\n';
  },

  showPine(entry) {
    const code = this.buildPine(entry);
    if (!code) { toast(t('Aucun niveau à exporter pour ce plan.'), 'err'); return; }
    const overlay = $('#modal-overlay'), box = $('#modal-box');
    box.classList.add('wide');
    box.innerHTML = `
      <h3>📈 ${esc(t('Tracer ce plan sur TradingView'))}</h3>
      <div class="modal-sub">${esc(t('Ce script Pine dessine l’entrée, la zone d’entrée, le stop loss et les TP sur votre graphique.'))}</div>
      <ol class="tv-steps">
        <li>${esc(t('Copiez le script ci-dessous.'))}</li>
        <li>${esc(t('Dans TradingView, ouvrez le graphique de l’actif puis l’onglet « Pine Editor » en bas de l’écran.'))}</li>
        <li>${esc(t('Créez un nouvel indicateur, remplacez tout le code par celui-ci, puis cliquez sur « Add to chart ».'))}</li>
      </ol>
      <textarea class="pine-code" id="pine-code" readonly spellcheck="false"></textarea>
      <div class="btn-row">
        <button class="btn btn-ghost" id="pine-close">${esc(t('Fermer'))}</button>
        <button class="btn btn-primary" id="pine-copy">📋 ${esc(t('Copier le script'))}</button>
      </div>`;
    $('#pine-code').value = code;
    overlay.hidden = false;
    const close = () => { overlay.hidden = true; box.innerHTML = ''; box.classList.remove('wide'); };
    $('#pine-close').addEventListener('click', close);
    $('#pine-copy').addEventListener('click', () => this.copy(code, t('Script copié ✓')));
  },

  async copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(okMsg, 'ok');
  },

  /* ---------- Alertes webhook : réglages ---------- */
  webhookUrl() {
    return `${location.origin}${(this.status && this.status.path) || '/api/webhook/tradingview'}`;
  },

  template() {
    const secret = (this.status && this.status.secret) || '';
    return `{
  "secret": "${secret}",
  "symbol": "{{ticker}}",
  "exchange": "{{exchange}}",
  "interval": "{{interval}}",
  "open": {{open}},
  "high": {{high}},
  "low": {{low}},
  "close": {{close}},
  "volume": {{volume}},
  "time": "{{timenow}}",
  "message": "Describe your signal",
  "lang": "${LANG}"
}`;
  },

  async load() {
    try { this.status = await api('/api/webhook/status'); }
    catch { return; }
    if (this.lastSeenAt === null) {
      // ne pas notifier les alertes déjà présentes au chargement
      this.lastSeenAt = (this.status.events[0] && this.status.events[0].at) || '';
    } else {
      this.notifyNew();
    }
    this.render();
    this.schedule();
  },

  schedule() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = this.status && this.status.enabled ? setInterval(() => this.load(), 20000) : null;
  },

  notifyNew() {
    const fresh = (this.status.events || []).filter(e => e.at > this.lastSeenAt && (e.status === 'ok' || e.status === 'error'));
    if (this.status.events[0]) this.lastSeenAt = this.status.events[0].at;
    if (!fresh.length) return;
    for (const e of fresh.reverse()) {
      const what = `${e.symbol || '?'}${e.interval ? ' ' + e.interval : ''}`;
      if (e.status === 'ok') toast(t('📡 Alerte TradingView {what} : analyse prête ✓', { what }), 'ok');
      else toast(t('📡 Alerte TradingView {what} : échec — {err}', { what, err: e.error || '' }), 'err');
    }
    window.AnalyzeMgr && AnalyzeMgr.refreshHistory();
  },

  render() {
    const s = this.status;
    if (!s || !$('#tv-card')) return;
    $('#tv-enabled').checked = !!s.enabled;
    $('#tv-details').hidden = !s.enabled;
    if (!s.enabled) return;
    $('#tv-url').value = this.webhookUrl();
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    $('#tv-url-hint').classList.toggle('warn-text', local);
    $('#tv-template').value = this.template();

    const labels = {
      ok: t('✅ analyse prête'), error: t('❌ échec'), rejected: t('⛔ refusée'),
      skipped: t('⏭️ ignorée'), queued: t('⏳ en attente')
    };
    const box = $('#tv-events');
    box.innerHTML = (s.events || []).length ? s.events.slice(0, 15).map(e => `
      <div class="tv-ev ${esc(e.status)}">
        <span class="when">${esc(new Date(e.at).toLocaleString(LOCALE))}</span>
        <b>${esc(e.symbol || '?')}${e.interval ? ' · ' + esc(e.interval) : ''}</b>
        <span class="st">${esc(labels[e.status] || e.status)}${e.error ? ' — ' + esc(e.error) : ''}${e.status === 'ok' && e.candles ? ' · ' + esc(t('avec bougies Binance')) : ''}</span>
        ${e.analysisId ? `<button class="btn btn-ghost tv-open" data-id="${esc(e.analysisId)}">${esc(t('Ouvrir'))}</button>` : ''}
      </div>`).join('') : `<p class="muted">${esc(t('Aucune alerte reçue pour l’instant.'))}</p>`;
  },

  async sendTest() {
    if (!confirm(t('Envoyer une alerte de test ? Elle lance une vraie analyse BTCUSD H4 avec votre IA.'))) return;
    let close = null;
    try {
      const q = await api('/api/market/quotes?symbols=BTCUSD');
      close = q.quotes && q.quotes.BTCUSD ? q.quotes.BTCUSD.price : null;
    } catch { /* prix facultatif */ }
    const payload = {
      secret: this.status.secret, symbol: 'BTCUSD', exchange: 'TEST', interval: '240',
      close, time: new Date().toISOString(), message: 'Test alert sent from Tradewee settings', lang: LANG
    };
    try {
      const r = await fetch(this.status.path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      toast(j.skipped ? t('Alerte ignorée : doublon (attendez 60 s).') : t('Alerte de test envoyée — l’analyse arrive dans 1 à 2 min.'), j.skipped ? 'err' : 'ok');
    } catch (e) { toast(e.message, 'err'); }
    setTimeout(() => this.load(), 1500);
  }
};

/* ---------- Écouteurs ---------- */
$('#tv-enabled').addEventListener('change', async (e) => {
  try {
    await api('/api/webhook/enabled', { method: 'PUT', body: JSON.stringify({ enabled: e.target.checked }) });
    toast(e.target.checked ? t('Alertes TradingView activées ✓') : t('Alertes TradingView désactivées.'), 'ok');
  } catch (err) { toast(err.message, 'err'); }
  TradingViewMgr.load();
});
$('#tv-copy-url').addEventListener('click', () => TradingViewMgr.copy($('#tv-url').value, t('URL copiée ✓')));
$('#tv-copy-template').addEventListener('click', () => TradingViewMgr.copy($('#tv-template').value, t('Message copié ✓')));
$('#tv-new-secret').addEventListener('click', async () => {
  if (!confirm(t('Créer un nouveau secret ? Les alertes TradingView existantes devront être mises à jour avec le nouveau message.'))) return;
  try { await api('/api/webhook/secret', { method: 'POST' }); toast(t('Nouveau secret créé ✓ — recopiez le message dans vos alertes.'), 'ok'); }
  catch (err) { toast(err.message, 'err'); }
  TradingViewMgr.load();
});
$('#tv-test').addEventListener('click', () => TradingViewMgr.sendTest());
$('#tv-events').addEventListener('click', async (e) => {
  const b = e.target.closest('.tv-open');
  if (!b) return;
  try {
    const full = await api(`/api/analyses/${encodeURIComponent(b.dataset.id)}`);
    document.querySelector('[data-tab="analyze"]').click();
    AnalyzeMgr.showResult(full);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { toast(err.message, 'err'); }
});

TradingViewMgr.load();
