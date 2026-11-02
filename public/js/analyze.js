/* ============ Analyse : upload captures, appel IA, rendu du plan ============ */
window.AnalyzeMgr = {
  /* ---------- Upload d'images ---------- */
  addFiles(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 5);
    if (imgs.length === 0) return;
    let room = 5 - APP.pendingImages.length;
    if (room <= 0) { toast('5 captures maximum — supprimez-en une d’abord.', 'err'); return; }
    for (const f of imgs.slice(0, room)) {
      const reader = new FileReader();
      reader.onload = () => {
        APP.pendingImages.push({ name: f.name, dataUrl: reader.result });
        AnalyzeMgr.renderThumbs();
      };
      reader.readAsDataURL(f);
    }
    if (imgs.length > room) toast(`Seules ${room} image(s) ajoutée(s) (limite : 5).`);
  },

  renderThumbs() {
    const c = $('#thumbs');
    c.innerHTML = APP.pendingImages.map((img, i) => `
      <div class="thumb">
        <img src="${img.dataUrl}" alt="">
        <button class="rm" data-i="${i}" title="Retirer">✕</button>
      </div>`).join('');
  },

  fillAssetList() { /* rempli par AssetsMgr.render() via datalist */ },

  /* ---------- Appel analyse ---------- */
  async run() {
    const btn = $('#btn-analyze');
    if (APP.pendingImages.length === 0) { toast('Ajoutez au moins une capture d’écran.', 'err'); return; }
    if (!APP.settings || !APP.settings.hasKey) {
      toast('Configurez d’abord votre clé API dans l’onglet Réglages.', 'err');
      document.querySelector('[data-tab="settings"]').click();
      return;
    }
    btn.disabled = true;
    btn.textContent = '⏳ Analyse en cours (peut prendre 1 à 2 min)…';
    try {
      const j = await api('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({
          images: APP.pendingImages.map(i => i.dataUrl),
          asset: $('#an-asset').value.trim() || null,
          timeframe: $('#an-tf').value || null,
          notes: $('#an-notes').value.trim() || '',
          direction: $('#an-direction').value,
          compare: !!($('#an-compare') && $('#an-compare').checked)
        })
      });
      AnalyzeMgr.showResult(j);
      if (j.warning) toast(j.warning, 'err');
      else toast('Analyse terminée ✓', 'ok');
      APP.pendingImages = [];
      AnalyzeMgr.renderThumbs();
      await AnalyzeMgr.refreshHistory();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Analyser';
    }
  },

  /* ---------- Rendu du résultat ---------- */
  showResult(entry) {
    APP.currentAnalysis = entry;
    $('#result-empty').hidden = true;
    const body = $('#result-body');
    body.hidden = false;
    const r = entry.result;
    if (!r) {
      body.innerHTML = `
        <div class="warn-box">⚠️ L'IA n'a pas renvoyé de JSON exploitable. Réponse brute :</div>
        <div class="raw-box">${esc(entry.raw || '(vide)')}</div>`;
      return;
    }
    const bias = String(r.biais || 'NEUTRE').toUpperCase().includes('ACHAT') ? 'ACHAT'
               : String(r.biais || '').toUpperCase().includes('VENTE') ? 'VENTE' : 'NEUTRE';
    const cls = bias === 'ACHAT' ? 'buy' : bias === 'VENTE' ? 'sell' : 'neutral';
    const tps = (r.takeProfits || []).slice(0, 3);
    const tpCells = tps.map((tp, i) => `
      <div class="level tp">
        <div class="k">TP${i + 1}</div>
        <div class="v">${fmtNum(tp && tp.niveau)}</div>
      </div>`).join('');
    const zone = r.zoneEntree && (r.zoneEntree.min != null || r.zoneEntree.max != null)
      ? `<p class="zone-note">🎯 Zone d'entrée : <b>${fmtNum(r.zoneEntree.min)} – ${fmtNum(r.zoneEntree.max)}</b></p>` : '';
    const rr = r.ratioRisqueRendement
      ? `<p class="rr-note">⚖️ Ratio risque/rendement (TP1) : <b>${fmtNum(r.ratioRisqueRendement)}</b></p>` : '';

    // Taille de position suggérée — valeurs serveur (result.taillePosition) si présentes,
    // sinon calcul local avec distance = Math.abs(entree - stopLoss)
    let sizing = '';
    const assetType = (APP.assets.find(a => (r.actif || '').toUpperCase().includes(a.symbol)) || {}).type;
    const fmtSize = (units) => assetType === 'forex'
      ? `${(units / 100000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lot (${units.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unités)`
      : `${units.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} unités`;
    if (r.taillePosition && r.taillePosition.unites != null) {
      const tp = r.taillePosition;
      sizing = `<p class="size-note">💰 Taille de position (risque ${fmtNum(tp.risqueMonetaire)} / distance SL ${fmtNum(tp.distanceStop)}) :
        <b>${fmtSize(tp.unites)}</b></p>`;
    } else {
      const s = APP.settings || {};
      const bal = parseFloat(s.balance), pct = parseFloat(s.riskPercent);
      if (bal > 0 && pct > 0 && Number.isFinite(Number(r.entree)) && Number.isFinite(Number(r.stopLoss)) && r.entree && r.stopLoss) {
        const riskAmt = bal * pct / 100;
        const dist = Math.abs(Number(r.entree) - Number(r.stopLoss));
        if (dist > 0) {
          const units = riskAmt / dist;
          sizing = `<p class="size-note">💰 Taille suggérée (risque ${pct}% = ${riskAmt.toFixed(2)} / distance SL ${fmtNum(dist)}) :
            <b>${fmtSize(units)}</b></p>`;
        }
      }
    }

    const chips = (r.figuresDetectees || []).map(f => `<span class="chip">${esc(f)}</span>`).join('');
    const indicators = (r.indicateurs || []).length ? `
      <div class="md-sec"><h3>Indicateurs lus sur le chart</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Indicateur</th><th>Lecture</th><th>Implication</th></tr></thead>
          <tbody>${r.indicateurs.map(i => `
            <tr>
              <td><b>${esc(i.nom)}</b></td><td>${esc(i.lecture)}</td>
              <td>${esc(i.implication)}</td>
            </tr>`).join('')}
          </tbody></table></div></div>` : '';
    const levelsMini = r.niveauxCles && (r.niveauxCles.supports || r.niveauxCles.resistances) ? `
      <div class="levels-mini">
        <span class="supp">Supports : <b>${(r.niveauxCles.supports || []).map(fmtNum).join(' · ') || '—'}</b></span>
        <span class="res">Résistances : <b>${(r.niveauxCles.resistances || []).map(fmtNum).join(' · ') || '—'}</b></span>
      </div>` : '';
    const warns = (r.avertissements || []).length ? `
      <div class="warn-box">⚠️ Avertissements<ul>${r.avertissements.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';
    const evProches = (r.evenementsProches || []).length ? `
      <div class="chips-line">${r.evenementsProches.map(e => `<span class="chip imp">📅 ${esc(e)}</span>`).join('')}</div>` : '';

    // Comparaison multi-IA + consensus
    let comparisonHtml = '';
    const comps = entry.comparisons || [];
    const consensus = entry.consensus;
    if (comps.length || consensus) {
      const cell = (c) => {
        if (!c || c.error) return `<div class="bt-cell"><div class="k">❌ ${esc((c && c.name) || 'IA')}</div><div class="v" style="font-size:12px;color:var(--red)">${esc((c && c.error) || 'échec')}</div></div>`;
        const q = c.result || {};
        const b = String(q.biais || '').toUpperCase();
        const bCls = b.includes('ACHAT') ? 'pos' : b.includes('VENTE') ? 'neg' : '';
        return `<div class="bt-cell">
          <div class="k">${esc(c.name)} <span class="muted" style="text-transform:none">(${esc(c.model || '')})</span></div>
          <div class="v ${bCls}">${b.includes('ACHAT') ? '▲ ACHAT' : b.includes('VENTE') ? '▼ VENTE' : '● NEUTRE'}${Number.isFinite(Number(q.confiance)) && q.confiance !== null ? ' · ' + Number(q.confiance) + '%' : ''}</div>
          <div class="muted" style="font-size:11.5px">E : ${fmtNum(q.entree)} · SL : ${fmtNum(q.stopLoss)} · TP1 : ${q.takeProfits && q.takeProfits[0] ? fmtNum(q.takeProfits[0].niveau) : '—'} · R:R : ${fmtNum(q.ratioRisqueRendement)}</div>
        </div>`;
      };
      const consensusHtml = consensus ? `
        <div class="bt-verdict ${consensus.biais === 'DÉSACCORD' ? 'stop-lim' : consensus.biais === 'ACHAT' ? 'warn-lim' : 'warn-lim'}" style="margin:10px 0">
          ${consensus.biais === 'DÉSACCORD'
            ? `⚖️ DÉSACCORD entre les IA (${consensus.votes.ACHAT} achat / ${consensus.votes.VENTE} vente / ${consensus.votes.NEUTRE} neutre)`
            : `🤝 CONSENSUS ${consensus.biais} (${consensus.n} IA — votes : ${consensus.votes.ACHAT} achat / ${consensus.votes.VENTE} vente / ${consensus.votes.NEUTRE} neutre)`}
          ${consensus.confianceMoyenne != null ? ` · confiance moyenne ${consensus.confianceMoyenne}%` : ''}
          ${consensus.entreeMediane != null ? ` · entrée médiane ${fmtNum(consensus.entreeMediane)}` : ''}
          ${consensus.stopLossMedian != null ? ` · SL médian ${fmtNum(consensus.stopLossMedian)}` : ''}
          ${consensus.tp1Median != null ? ` · TP1 médian ${fmtNum(consensus.tp1Median)}` : ''}
          ${consensus.rrMoyen != null ? ` · R:R moyen ${fmtNum(consensus.rrMoyen)}` : ''}
        </div>` : '';
      comparisonHtml = `
        <div class="md-sec"><h3>⚖️ Comparaison des IA</h3>
          ${consensusHtml}
          <div class="bt-modal-grid">${comps.map(cell).join('')}</div>
        </div>`;
    }
    const dateTxt = entry.date ? new Date(entry.date).toLocaleString('fr-FR') : '';
    const imgsTxt = (entry.images || []).length ? `<span class="muted" style="margin-left:auto">${entry.images.length} capture(s) · ${esc(entry.model || '')} · ${dateTxt}</span>` : '';

    body.innerHTML = `
      ${entry.truncated ? `<div class="warn-box">✂️ Réponse de l’IA tronquée par la limite de longueur : les niveaux sont fiables, le texte d’analyse peut être incomplet. Relancez pour obtenir l’analyse complète.</div>` : ''}
      ${(entry.macroEvents || []).some(ev => ev.minutesUntil <= 180) ? (entry.macroEvents || []).filter(ev => ev.minutesUntil <= 180).map(ev =>
        `<div class="mb-item red" style="margin-bottom:8px">⛔ FENÊTRE À ÉVITER — ${esc(ev.title)} (${esc(ev.country)}) dans ${ev.minutesUntil >= 60 ? Math.floor(ev.minutesUntil / 60) + ' h ' + String(ev.minutesUntil % 60).padStart(2, '0') : ev.minutesUntil + ' min'}</div>`
      ).join('') : ''}
      <div class="signal-head">
        <span class="badge ${cls}">${bias === 'ACHAT' ? '▲ ACHAT' : bias === 'VENTE' ? '▼ VENTE' : '● NEUTRE'}</span>
        <div class="confidence">
          <div class="pct">${Number(r.confiance) || 0}%</div>
          <div class="lbl">CONFIANCE</div>
        </div>
        <div class="sig-meta">
          <b>${esc(r.actif || entry.params?.asset || '—')}</b>
          ${r.uniteDeTemps ? `· ${esc(r.uniteDeTemps)}` : ''}
          ${r.prixActuel != null ? `· prix ≈ <b>${fmtNum(r.prixActuel)}</b>` : ''}
        </div>
        ${imgsTxt}
      </div>

      <div class="levels-grid">
        <div class="level entry"><div class="k">Entrée</div><div class="v">${fmtNum(r.entree)}</div></div>
        <div class="level sl"><div class="k">Stop Loss</div><div class="v">${fmtNum(r.stopLoss)}</div></div>
        ${tpCells || '<div class="level tp"><div class="k">TP</div><div class="v">—</div></div>'}
      </div>
      ${zone}${rr}${sizing}
      ${chips ? `<div class="chips-line">${chips}</div>` : ''}
      ${evProches}
      ${levelsMini}
      ${indicators}
      <div class="md-sec"><h3>📐 Analyse technique</h3><div class="md">${mdToHtml(r.analyseTechnique || '')}</div></div>
      <div class="md-sec"><h3>🌍 Analyse fondamentale</h3><div class="md">${mdToHtml(r.analyseFondamentale || '')}</div></div>
      ${r.invalidation ? `<div class="md-sec"><h3>🚫 Invalidation du scénario</h3><div class="md">${mdToHtml(r.invalidation)}</div></div>` : ''}
      ${r.gestion ? `<div class="md-sec"><h3>🎛️ Gestion de position</h3><div class="md">${mdToHtml(r.gestion)}</div></div>` : ''}
      ${warns}
      ${comparisonHtml}
      ${entry.id ? `<div class="btn-row" style="margin-top:14px"><button class="btn" id="btn-journal">📓 Journaliser ce plan</button><button class="btn" id="btn-notrade">🚫 Non tradé</button><button class="btn" id="btn-copyplan">📋 Copier le plan</button></div>` : ''}
    `;
  },

  /* ---------- Historique ---------- */
  async refreshHistory() {
    try {
      APP.analyses = await api('/api/analyses');
    } catch { return; }
    const list = $('#history-list');
    $('#history-count').textContent = APP.analyses.length ? `${APP.analyses.length} analyse(s)` : '';
    if (!APP.analyses.length) {
      list.innerHTML = '<p class="muted">Aucune analyse enregistrée.</p>';
      return;
    }
    list.innerHTML = APP.analyses.map(a => {
      const bias = a.result ? String(a.result.biais || 'NEUTRE').toUpperCase() : null;
      const biasCls = bias && bias.includes('ACHAT') ? 'ACHAT' : bias && bias.includes('VENTE') ? 'VENTE' : 'NEUTRE';
      const thumb = (a.images && a.images[0]) ? `<img src="/uploads/${encodeURIComponent(a.images[0])}" alt="">` : '<div class="thumb"></div>';
      return `
        <div class="hist-item" data-id="${esc(a.id)}">
          ${thumb}
          <div class="hist-main">
            <div class="hist-sym">${esc((a.result && a.result.actif) || a.params?.asset || '—')}
              ${a.params?.timeframe ? `<span class="muted">· ${esc(a.params.timeframe)}</span>` : ''}</div>
            <div class="hist-date">${new Date(a.date).toLocaleString('fr-FR')}</div>
          </div>
          <span class="hist-bias ${biasCls}">${a.result ? biasCls : 'ÉCHEC'}</span>
          <button class="hist-del" data-jour="${esc(a.id)}" title="Journaliser ce plan">📓</button>
          <button class="hist-del" data-del="${esc(a.id)}" title="Supprimer">🗑️</button>
        </div>`;
    }).join('');
  }
};

/* ---------- Écouteurs ---------- */
const dz = $('#dropzone');
dz.addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (e) => { AnalyzeMgr.addFiles(e.target.files); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', e => AnalyzeMgr.addFiles(e.dataTransfer.files));
$('#thumbs').addEventListener('click', e => {
  const i = e.target.getAttribute('data-i');
  if (i !== null && i !== undefined) {
    APP.pendingImages.splice(+i, 1);
    AnalyzeMgr.renderThumbs();
  }
});
// coller une image depuis le presse-papiers (touche PrintScreen)
document.addEventListener('paste', e => {
  const files = Array.from(e.clipboardData?.files || []);
  if (files.length && document.querySelector('#tab-analyze.active')) AnalyzeMgr.addFiles(files);
});

$('#btn-analyze').addEventListener('click', () => AnalyzeMgr.run());

$('#history-list').addEventListener('click', async e => {
  const del = e.target.getAttribute('data-del');
  const jour = e.target.getAttribute('data-jour');
  if (jour) {
    e.stopPropagation();
    await journalizeAnalysis(jour);
    return;
  }
  if (del) {
    e.stopPropagation();
    if (!confirm('Supprimer cette analyse ?')) return;
    try {
      await api(`/api/analyses/${del}`, { method: 'DELETE' });
      await AnalyzeMgr.refreshHistory();
    } catch (err) { toast(err.message, 'err'); }
    return;
  }
  const item = e.target.closest('.hist-item');
  if (item) {
    try {
      const full = await api(`/api/analyses/${item.dataset.id}`);
      AnalyzeMgr.showResult(full);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { toast(err.message, 'err'); }
  }
});

/* ---------- Démo ---------- */
$('#btn-demo').addEventListener('click', () => {
  AnalyzeMgr.showResult({
    date: new Date().toISOString(),
    model: 'démo',
    images: [],
    params: { asset: 'XAUUSD', timeframe: 'H4' },
    result: {
      actif: 'XAUUSD', uniteDeTemps: 'H4', biais: 'ACHAT', confiance: 72, prixActuel: 2738.5,
      entree: 2732, zoneEntree: { min: 2728, max: 2736 }, stopLoss: 2712,
      takeProfits: [
        { niveau: 2755, commentaire: 'Résistance intraday + extension 1,2R' },
        { niveau: 2778, commentaire: 'Sommet précédent' },
        { niveau: 2805, commentaire: 'Objectif extension Fibonacci 1,618' }
      ],
      ratioRisqueRendement: 1.15,
      figuresDetectees: ['Biseau descendant cassé', 'Pin bar haussière sur support', 'Divergence MACD haussière'],
      indicateurs: [
        { nom: 'RSI(14)', lecture: 'Sortie de zone de survente (38 → 47)', implication: 'haussière' },
        { nom: 'EMA 200', lecture: 'Prix au-dessus, pente positive', implication: 'haussière' },
        { nom: 'Volume', lecture: 'Expansion sur la cassure', implication: 'haussière' }
      ],
      niveauxCles: { supports: [2712, 2688], resistances: [2755, 2778] },
      analyseTechnique: '**Tendance** : haussière sur H4 et D1 (structure en sommets/creux ascendants).\n\nLe prix a cassé la borne haute d’un **biseau descendant** après une divergence, puis réalisé un **retest** réussi de la zone 2728-2736 (ancienne résistance devenue support).\n\n- Pin bar haussière sur le support horizontal\n- EMA 200 orientée à la hausse, prix au-dessus\n- Volume en expansion à la cassure\n\nScénario privilégié : **continuation haussière** vers 2755 puis 2778 tant que 2712 tient.',
      analyseFondamentale: 'Contexte macro : attentisme avant la publication du **CPI américain** et les déclarations de la Fed, environnement traditionnellement favorable à l’or avec des taux réels orientés à la baisse.\n\nLes news récentes (FinancialJuice) montrent un flux d’actualité mitigé sur le dollar, ce qui soutient le scénario. **Attention** : une statistique d’inflation surprise (chaude) pourrait provoquer un retour brutal au-dessus de 2760.',
      invalidation: 'Clôture H4 sous 2712 invalide la structure haussière — sortie immédiate, retournement potentiel vers 2688.',
      gestion: 'Prendre 50% de la position à TP1 (2755), placer le stop en break-even, puis suivre avec un stop suiveur sous les creux H4 pour viser TP3.',
      avertissements: ['Exemple de démonstration — niveaux fictifs à but illustratif.', 'Vérifiez toujours les niveaux sur votre plateforme avant tout ordre.']
    }
  });
});

AnalyzeMgr.refreshHistory();

/* ---------- Journalisation d'un plan d'analyse (avec checklist pré-trade) ---------- */
async function journalizeAnalysis(analysisId) {
  try {
    // état pour la checklist
    let limits = null, macro = [];
    try { limits = await api('/api/trading-limits'); } catch { /* non bloquant */ }
    try { macro = await api('/api/macro-events'); } catch { /* non bloquant */ }

    const autoNoNews = !macro.length || macro.every(e => e.minutesUntil > 180);
    const autoSize = !!(APP.settings && Number(APP.settings.balance) > 0 && Number(APP.settings.riskPercent) > 0);
    const autoNoRevenge = !limits || limits.consecutiveLosses < limits.limits.maxLossesConsecutive;

    const items = [
      { id: 'ck-sl', label: 'Mon SL est défini et placé <b>AVANT</b> d’entrer', checked: false, hint: 'À cocher manuellement' },
      { id: 'ck-rr', label: 'Mon R:R est ≥ 1 (ou justification si < 1)', checked: false, hint: 'À cocher manuellement — vérifiez le R:R affiché sur le plan' },
      { id: 'ck-news', label: 'Aucune news à fort impact dans les 3 h', checked: autoNoNews, hint: autoNoNews ? 'Auto-coché : aucun événement High < 3 h' : '⚠️ Événement High imminent — voyez le bandeau rouge' },
      { id: 'ck-size', label: 'Ma taille de position respecte mon risque max', checked: autoSize, hint: autoSize ? `Auto-coché : calcul serveur OK (solde ${APP.settings.balance}, risque ${APP.settings.riskPercent}%)` : 'Solde/risque non configurés dans Réglages' },
      { id: 'ck-revenge', label: 'Je ne suis pas en revenge trading', checked: autoNoRevenge, hint: autoNoRevenge ? 'Auto-coché : moins de 2 pertes consécutives' : `⚠️ ${limits.consecutiveLosses} pertes consécutives — pause recommandée` }
    ];

    const overlay = $('#modal-overlay'), box = $('#modal-box');
    box.innerHTML = `
      <h3>✅ Checklist pré-trade</h3>
      <div class="modal-sub">Validation obligatoire avant de journaliser ce plan. Les règles non respectées bloquent la validation.</div>
      ${items.map(it => `
        <label class="checklist-item">
          <input type="checkbox" data-ck="${it.id}" ${it.checked ? 'checked' : ''}>
          <span>${it.label}<span class="hint">${it.hint}</span></span>
        </label>`).join('')}
      <div class="checklist-error" id="ck-error"></div>
      <div class="btn-row">
        <button class="btn btn-ghost" id="ck-cancel">Annuler</button>
        <button class="btn btn-primary" id="ck-validate">Valider et journaliser</button>
      </div>`;
    overlay.hidden = false;

    const update = () => {
      const all = box.querySelectorAll('input[data-ck]');
      const ok = [...all].every(i => i.checked);
      $('#ck-validate').disabled = !ok;
      $('#ck-error').textContent = ok ? '' : '🛑 Règle de discipline non respectée — toutes les cases doivent être cochées.';
    };
    box.querySelectorAll('input[data-ck]').forEach(i => i.addEventListener('change', update));
    update();

    const close = () => { overlay.hidden = true; box.innerHTML = ''; };
    $('#ck-cancel').addEventListener('click', close);

    $('#ck-validate').addEventListener('click', async () => {
      close();
      try {
        const t = await api('/api/trades', { method: 'POST', body: JSON.stringify({ analysisId }) });
        await api(`/api/trades/${t.id}`, { method: 'PUT', body: JSON.stringify({ checklistValidated: true }) });
        toast('Plan journalisé avec checklist validée ✓ (onglet 📓)', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });
  } catch (err) { toast(err.message, 'err'); }
}
window.journalizeAnalysis = journalizeAnalysis;

$('#result-body').addEventListener('click', async e => {
  if (e.target.closest('#btn-journal')) {
    const id = APP.currentAnalysis && APP.currentAnalysis.id;
    if (!id) return;
    await journalizeAnalysis(id);
  }
  if (e.target.closest('#btn-notrade')) {
    const id = APP.currentAnalysis && APP.currentAnalysis.id;
    if (!id) return;
    const choix = prompt('Raison du non-trade ?\n1 = fenêtre macro\n2 = pas de fill\n3 = changement de plan\n4 = autre', '1');
    const raisons = { 1: 'fenêtre macro', 2: 'pas de fill', 3: 'changement de plan', 4: 'autre' };
    const raison = raisons[choix] || 'autre';
    try {
      const t = await api('/api/trades', { method: 'POST', body: JSON.stringify({ analysisId: id }) });
      await api(`/api/trades/${t.id}`, { method: 'PUT', body: JSON.stringify({ statut: 'annulé', raisonNonTrade: raison }) });
      toast(`Trade marqué non tradé (${raison}) ✓`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }
  if (e.target.closest('#btn-copyplan')) {
    await copyPlanMarkdown(APP.currentAnalysis);
  }
});

/* ---------- Copie du plan en Markdown ---------- */
async function copyPlanMarkdown(entry) {
  const r = entry && entry.result;
  if (!r) { toast('Aucun plan à copier.', 'err'); return; }
  const n = v => v == null ? '—' : String(v).replace('.', ',');
  const bias = String(r.biais || 'NEUTRE').toUpperCase();
  const L = [];
  L.push(`# Plan de trade — ${r.actif || entry.params?.asset || '—'} ${r.uniteDeTemps ? '(' + r.uniteDeTemps + ')' : ''}`);
  L.push('');
  L.push(`- **Biais** : ${bias === 'ACHAT' ? '▲ ACHAT' : bias === 'VENTE' ? '▼ VENTE' : '● NEUTRE'} — confiance ${r.confiance != null ? r.confiance + ' %' : '—'}`);
  L.push(`- **Entrée** : ${n(r.entree)}${r.zoneEntree && (r.zoneEntree.min != null || r.zoneEntree.max != null) ? ` (zone ${n(r.zoneEntree.min)} – ${n(r.zoneEntree.max)})` : ''}`);
  L.push(`- **Stop Loss** : ${n(r.stopLoss)}`);
  (r.takeProfits || []).forEach((tp, i) => L.push(`- **TP${i + 1}** : ${n(tp && tp.niveau)}${tp && tp.commentaire ? ' — ' + tp.commentaire : ''}`));
  L.push(`- **R:R (TP1)** : ${n(r.ratioRisqueRendement)}`);
  if (Array.isArray(entry.ratiosParTP) && entry.ratiosParTP.length) {
    L.push(`- **R:R par TP** : ${entry.ratiosParTP.map(x => `TP${x.tp} = ${x.rr}R`).join(' · ')}`);
  }
  if (r.taillePosition) {
    const tp = r.taillePosition;
    L.push(`- **Taille de position** : risque ${n(tp.risqueMonetaire)} / distance SL ${n(tp.distanceStop)} → ${n(tp.unites)} unités`);
  }
  if (r.niveauxCles) {
    if ((r.niveauxCles.supports || []).length) L.push(`- **Supports** : ${r.niveauxCles.supports.map(n).join(' · ')}`);
    if ((r.niveauxCles.resistances || []).length) L.push(`- **Résistances** : ${r.niveauxCles.resistances.map(n).join(' · ')}`);
  }
  if (r.invalidation) { L.push(''); L.push(`## 🚫 Invalidation`); L.push(r.invalidation); }
  if (r.gestion) { L.push(''); L.push(`## 🎛️ Gestion`); L.push(r.gestion); }
  if ((r.avertissements || []).length) { L.push(''); L.push(`## ⚠️ Avertissements`); r.avertissements.forEach(a => L.push(`- ${a}`)); }
  if ((r.evenementsProches || []).length) { L.push(''); L.push(`## 📅 Événements macro proches`); r.evenementsProches.forEach(e2 => L.push(`- ${e2}`)); }
  const md = L.join('\n');
  try {
    await navigator.clipboard.writeText(md);
    toast('Plan copié ✓', 'ok');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = md; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('Plan copié ✓', 'ok');
  }
}
window.copyPlanMarkdown = copyPlanMarkdown;

/* ---------- Bandeau macro : événements High dans les 24 h ---------- */
const MacroBanner = {
  timer: null,
  start() {
    this.refresh();
    if (!this.timer) this.timer = setInterval(() => this.refresh(), 60000);
  },
  async refresh() {
    const box = $('#macro-banner');
    if (!box) return;
    try {
      const symbol = ($('#an-asset') && $('#an-asset').value.trim()) || '';
      const high = await api('/api/macro-events' + (symbol ? '?symbol=' + encodeURIComponent(symbol) : ''));
      if (!high.length) { box.hidden = true; return; }
      const blackout = (APP.settings && Number(APP.settings.blackoutMinutes)) || 60;
      box.hidden = false;
      box.innerHTML = '<b>📅 Événements à fort impact dans les 24 h' + (symbol ? ` (${esc(symbol)})` : '') + ' :</b>' + high.map(ev => {
        const mins = ev.minutesUntil;
        const cls = mins <= blackout ? 'red' : mins <= 180 ? 'orange' : '';
        const inTxt = mins >= 60
          ? `dans ${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`
          : `dans ${mins} min`;
        // Windows n'affiche pas les emojis drapeaux (ils rendent en lettres) :
        // on privilégie le code devise, toujours lisible
        return `<span class="mb-item ${cls}"><b>${esc(ev.country)}</b> — ${esc(ev.title)} · ${inTxt}${cls === 'red' ? ' ⛔ FENÊTRE À ÉVITER' : ''}</span>`;
      }).join('');
    } catch { box.hidden = true; }
  }
};
/* ---------- Bandeau limites de discipline (sur-trading) ---------- */
const LimitsBanner = {
  timer: null,
  start() {
    this.refresh();
    if (!this.timer) this.timer = setInterval(() => this.refresh(), 60000);
  },
  async refresh() {
    const box = $('#limits-banner');
    if (!box) return;
    try {
      const l = await api('/api/trading-limits');
      const rows = [];
      const dLim = l.limits.maxTradesPerDay, wLim = l.limits.maxTradesPerWeek, lossLim = l.limits.maxLossesConsecutive;
      if (l.consecutiveLosses >= lossLim) {
        rows.push(`<div class="blink-lim">🚨 ${l.consecutiveLosses} pertes consécutives — pause de 2 h recommandée</div>`);
      }
      if (l.tradesToday >= dLim) {
        rows.push(`<div class="stop-lim">🛑 Limite journalière atteinte (${l.tradesToday}/${dLim} trades)</div>`);
      } else if (l.tradesToday >= dLim - 1) {
        rows.push(`<div class="warn-lim">⚠️ ${l.tradesToday}/${dLim} trades aujourd'hui</div>`);
      }
      if (l.tradesThisWeek >= wLim) {
        rows.push(`<div class="stop-lim">🛑 Limite hebdomadaire atteinte (${l.tradesThisWeek}/${wLim} trades)</div>`);
      } else if (l.tradesThisWeek >= wLim - 2) {
        rows.push(`<div class="warn-lim">⚠️ ${l.tradesThisWeek}/${wLim} trades cette semaine</div>`);
      }
      if (rows.length) { box.innerHTML = rows.join(''); box.hidden = false; }
      else box.hidden = true;
    } catch { box.hidden = true; }
  }
};
MacroBanner.start();
LimitsBanner.start();
