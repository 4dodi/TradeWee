/* ============ Journal de trades & statistiques ============ */
// « t » désigne un trade dans ce fichier : alias de la fonction de traduction
const tj = t;
window.JournalMgr = {
  trades: [],
  filters: { asset: '', biais: '', modele: '' },
  RAISONS: ['fenêtre macro', 'pas de fill', 'changement de plan', 'autre'],

  async ensure() {
    await this.load();
  },

  async load() {
    try {
      this.trades = await api('/api/trades');
    } catch (e) {
      $('#trades-tbody').innerHTML = `<tr><td colspan="12" class="muted">⚠️ ${esc(e.message)}</td></tr>`;
      return;
    }
    this.render();
    this.renderModelStats();
  },

  /* ---------- Performance par modèle IA ---------- */
  async renderModelStats() {
    const card = $('#model-stats-card'), tb = $('#model-stats-tbody');
    if (!card || !tb) return;
    let rows = [];
    try { rows = await api('/api/trades/stats-by-model'); } catch { return; }
    if (!rows.length) { card.hidden = true; return; }
    card.hidden = false;
    tb.innerHTML = rows.map(r => `
      <tr>
        <td class="sym">${esc(r.model)}</td>
        <td>${r.count}</td>
        <td class="${r.winrate >= 50 ? 'pos' : 'neg'}">${r.winrate} %</td>
        <td class="${r.avgR >= 0 ? 'pos' : 'neg'}">${r.avgR > 0 ? '+' : ''}${r.avgR.toFixed(2)} R</td>
        <td class="${r.totalR >= 0 ? 'pos' : 'neg'}"><b>${r.totalR > 0 ? '+' : ''}${r.totalR.toFixed(2)} R</b></td>
        <td class="pos">${r.bestTrade > 0 ? '+' : ''}${r.bestTrade.toFixed(2)} R</td>
        <td class="neg">${r.worstTrade.toFixed(2)} R</td>
      </tr>`).join('');
  },

  /* ---------- Backtest visuel : évolution du trade vs prix actuel ---------- */
  async showEvolution(trade) {
    const overlay = $('#modal-overlay'), box = $('#modal-box');
    box.innerHTML = `<h3>🔍 ${esc(tj('Évolution du trade'))}</h3><p class="modal-sub">${esc(tj('Récupération du prix actuel…'))}</p>`;
    overlay.hidden = false;

    const niv = trade.niveaux || {};
    const entree = trade.prixEntreeReel != null ? trade.prixEntreeReel : niv.entree;
    let price = null, err = null;
    try {
      const j = await api(`/api/trades/${trade.id}/current-price?symbol=${encodeURIComponent(trade.asset || '')}`);
      price = j.price; err = j.error;
    } catch (e) { err = e.message; }

    const dir = String(trade.biais || '').toUpperCase().includes('VENTE') ? -1 : 1;
    const distSL = Math.abs(entree - niv.stopLoss);
    const close = () => { overlay.hidden = true; box.innerHTML = ''; };

    if (price == null) {
      box.innerHTML = `<h3>🔍 ${esc(tj('Évolution du trade'))}</h3>
        <p class="modal-sub">${esc(err || tj('Prix indisponible.'))}</p>
        <p class="muted">${esc(tj('Le prix temps réel n’est disponible que pour BTCUSD, ETHUSD et XAUUSD (source CoinGecko, sans clé).'))}</p>
        <div class="btn-row"><button class="btn btn-ghost" id="ev-close">${esc(tj('Fermer'))}</button></div>`;
      $('#ev-close').addEventListener('click', close);
      return;
    }

    const gain = (price - entree) * dir;
    const gainPct = entree ? (gain / entree) * 100 : 0;
    const rNow = distSL > 0 ? gain / distSL : null;

    const tps = niv.takeProfits || [];
    const tpState = tps.map((tp, i) => {
      if (tp == null) return null;
      const touched = dir > 0 ? price >= tp : price <= tp;
      return `<div class="bt-cell"><div class="k">TP${i + 1} (${fmtNum(tp)})</div><div class="v ${touched ? 'pos' : ''}">${touched ? esc(tj('✅ touché')) : esc(tj('⏳ en cours'))}</div></div>`;
    }).filter(Boolean).join('');
    const slTouched = niv.stopLoss != null && (dir > 0 ? price <= niv.stopLoss : price >= niv.stopLoss);

    let verdict, vCls;
    if (slTouched) { verdict = tj('🛑 Stop-loss touché — trade perdant'); vCls = 'stop-lim'; }
    else if (rNow != null && rNow >= 1) { verdict = tj('✅ Trade gagnant {r} R', { r: (rNow > 0 ? '+' : '') + rNow.toFixed(2) }); vCls = 'warn-lim'; }
    else if (rNow != null && rNow < 0) { verdict = tj('⏳ Trade en cours, drawdown {r} R', { r: rNow.toFixed(2) }); vCls = 'stop-lim'; }
    else { verdict = `${tj('⏳ Trade en cours')} ${rNow != null ? '(' + (rNow > 0 ? '+' : '') + rNow.toFixed(2) + ' R)' : ''}`; vCls = 'warn-lim'; }

    box.innerHTML = `
      <h3>🔍 ${esc(tj('Évolution'))} — ${esc(trade.asset)} ${esc(biasLabel(trade.biais))}</h3>
      <p class="modal-sub">${esc(tj('Source : CoinGecko (prix spot USD)'))}</p>
      <div class="bt-modal-grid">
        <div class="bt-cell"><div class="k">${esc(tj('Entrée'))}</div><div class="v">${fmtNum(entree)}</div></div>
        <div class="bt-cell"><div class="k">${esc(tj('Prix actuel'))}</div><div class="v">${fmtNum(price)}</div></div>
        <div class="bt-cell"><div class="k">${esc(tj('Variation'))}</div><div class="v ${gain >= 0 ? 'pos' : 'neg'}">${gain >= 0 ? '+' : ''}${fmtNum(gain)} (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)} %)</div></div>
        <div class="bt-cell"><div class="k">Stop-loss (${fmtNum(niv.stopLoss)})</div><div class="v ${slTouched ? 'neg' : 'pos'}">${slTouched ? esc(tj('🛑 touché')) : esc(tj('✅ intact'))}</div></div>
        ${tpState}
      </div>
      <div class="bt-verdict ${vCls}">${esc(verdict)}</div>
      <div class="btn-row" style="margin-top:14px"><button class="btn btn-ghost" id="ev-close">${esc(tj('Fermer'))}</button></div>`;
    $('#ev-close').addEventListener('click', close);
  },

  unique(field) {
    return [...new Set(this.trades.map(t => t[field]).filter(v => v !== '' && v != null))].sort();
  },

  fillSelect(sel, values, current, label = v => v) {
    const el = $(sel);
    el.innerHTML = `<option value="">${esc(tj('Tous'))}</option>` + values.map(v => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(label(v))}</option>`).join('');
  },

  filtered() {
    const f = this.filters;
    return this.trades.filter(t =>
      (!f.asset || t.asset === f.asset) &&
      (!f.biais || t.biais === f.biais) &&
      (!f.modele || t.modele === f.modele));
  },

  render() {
    this.fillSelect('#jf-asset', this.unique('asset'), this.filters.asset);
    this.fillSelect('#jf-biais', this.unique('biais'), this.filters.biais, biasLabel);
    this.fillSelect('#jf-modele', this.unique('modele'), this.filters.modele);

    const rows = this.filtered();
    $('#jf-count').textContent = tj('{n} trade(s) affiché(s) / {total}', { n: rows.length, total: this.trades.length });

    const closed = rows.filter(t => t.pnlR != null);
    const wins = closed.filter(t => t.pnlR > 0);
    const winrate = closed.length ? wins.length / closed.length : null;
    const rMoy = closed.length ? closed.reduce((s, t) => s + t.pnlR, 0) / closed.length : null;
    const rTot = closed.length ? closed.reduce((s, t) => s + t.pnlR, 0) : null;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlR, 0) / wins.length : 0;
    const losses = closed.filter(t => t.pnlR <= 0);
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlR, 0) / losses.length : 0;
    const expectancy = closed.length ? (winrate * avgWin + (1 - winrate) * avgLoss) : null;

    const stat = (label, value, cls = '') => `
      <div class="stat-box ${cls}">
        <div class="v">${value}</div>
        <div class="k">${label}</div>
      </div>`;
    const rTxt = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + ' R';
    $('#stats-grid').innerHTML =
      stat(tj('Trades journalisés'), rows.length) +
      stat(tj('Trades clôturés'), closed.length) +
      stat(tj('Winrate'), winrate == null ? '—' : Math.round(winrate * 100) + ' %', winrate == null ? '' : winrate >= 0.5 ? 'pos' : 'neg') +
      stat(tj('R moyen'), rTxt(rMoy), rMoy == null ? '' : rMoy >= 0 ? 'pos' : 'neg') +
      stat(tj('R total'), rTxt(rTot), rTot == null ? '' : rTot >= 0 ? 'pos' : 'neg') +
      stat(tj('Espérance'), rTxt(expectancy), expectancy == null ? '' : expectancy >= 0 ? 'pos' : 'neg');

    const tb = $('#trades-tbody');
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="12" class="muted" style="text-align:center;padding:24px">${esc(tj('Aucun trade — journalisez un plan depuis l’onglet Analyse (bouton 📓).'))}</td></tr>`;
      return;
    }
    const niv = t => t.niveaux || {};
    const raisonOptsFor = t => [''].concat(this.RAISONS).map(r =>
      `<option value="${esc(r)}" ${(t.raisonNonTrade || '') === r ? 'selected' : ''}>${r === '' ? esc(tj('— raison —')) : esc(tj(r))}</option>`).join('');
    const statutOptsFor = t => ['planifié', 'fillé', 'clôturé', 'annulé', 'expiré'].map(s =>
      `<option value="${s}" ${t.statut === s ? 'selected' : ''}>${esc(tj(s))}</option>`).join('');
    const sortieOptsFor = t => ['', 'TP1', 'TP2', 'TP3', 'SL', 'manuel'].map(s =>
      `<option value="${s}" ${((t.sortie && t.sortie.type) || '') === s ? 'selected' : ''}>${s === '' ? '—' : esc(tj(s))}</option>`).join('');

    tb.innerHTML = rows.map(t => {
      const raisonOpts = raisonOptsFor(t), statutOpts = statutOptsFor(t), sortieOpts = sortieOptsFor(t);
      const rCls = t.pnlR == null ? '' : t.pnlR > 0 ? 'pos' : 'neg';
      const uCls = t.pnlUsd == null ? '' : t.pnlUsd >= 0 ? 'pos' : 'neg';
      return `
        <tr data-id="${esc(t.id)}">
          <td class="muted">${new Date(t.date).toLocaleDateString(LOCALE)}</td>
          <td class="sym">${esc(t.asset)}</td>
          <td><span class="hist-bias ${t.biais === 'ACHAT' ? 'ACHAT' : t.biais === 'VENTE' ? 'VENTE' : 'NEUTRE'}">${esc(biasLabel(t.biais))}</span></td>
          <td>
            <div class="muted">${fmtNum(niv(t).entree)}</div>
            <input class="tr-in" data-f="prixEntreeReel" type="number" step="any" placeholder="${esc(tj('réel'))}" value="${esc(t.prixEntreeReel ?? '')}">
          </td>
          <td>${fmtNum(niv(t).stopLoss)}</td>
          <td><select class="tr-in" data-f="statut">${statutOpts}</select></td>
          <td><select class="tr-in" data-f="sortieType">${sortieOpts}</select></td>
          <td><input class="tr-in" data-f="sortiePrix" type="number" step="any" value="${esc((t.sortie && t.sortie.prix) ?? '')}"></td>
          <td>
            <select class="tr-in" data-f="raisonNonTrade">${raisonOpts}</select>
            <button class="btn btn-ghost tr-notrade" title="${esc(tj('Marquer non tradé (annulé) avec la raison choisie'))}">🚫</button>
          </td>
          <td class="${rCls}"><b>${t.pnlR == null ? '—' : (t.pnlR > 0 ? '+' : '') + t.pnlR.toFixed(2) + ' R'}</b></td>
          <td class="${uCls}">${t.pnlUsd == null ? '—' : (t.pnlUsd >= 0 ? '+' : '') + t.pnlUsd.toFixed(2) + ' $'}</td>
          <td><button class="btn btn-ghost tr-save" title="${esc(tj('Enregistrer'))}">💾</button> <button class="btn btn-ghost tr-evo" title="${esc(tj('Voir l’évolution'))}">🔍</button></td>
        </tr>`;
    }).join('');
  },

  rowBody(tr, extra = {}) {
    const get = f => {
      const el = tr.querySelector(`.tr-in[data-f="${f}"]`);
      return el ? el.value : '';
    };
    return JSON.stringify({
      prixEntreeReel: get('prixEntreeReel') === '' ? null : get('prixEntreeReel'),
      statut: get('statut') || undefined,
      sortie: { type: get('sortieType') === '' ? null : get('sortieType'), prix: get('sortiePrix') === '' ? null : get('sortiePrix') },
      raisonNonTrade: get('raisonNonTrade'),
      ...extra
    });
  },

  async saveRow(tr) {
    const id = tr.getAttribute('data-id');
    try {
      await api(`/api/trades/${id}`, { method: 'PUT', body: this.rowBody(tr) });
      toast(tj('Trade mis à jour ✓'), 'ok');
      await this.load();
    } catch (e) { toast(e.message, 'err'); }
  },

  async markNotTraded(tr) {
    const id = tr.getAttribute('data-id');
    const raison = tr.querySelector('.tr-in[data-f="raisonNonTrade"]').value || 'autre';
    try {
      await api(`/api/trades/${id}`, { method: 'PUT', body: JSON.stringify({ statut: 'annulé', raisonNonTrade: raison }) });
      toast(tj('Marqué non tradé (annulé) ✓'), 'ok');
      await this.load();
    } catch (e) { toast(e.message, 'err'); }
  }
};

$('#trades-tbody').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  if (e.target.closest('.tr-save')) return JournalMgr.saveRow(tr);
  if (e.target.closest('.tr-notrade')) return JournalMgr.markNotTraded(tr);
  if (e.target.closest('.tr-evo')) {
    const t = JournalMgr.trades.find(x => x.id === tr.getAttribute('data-id'));
    if (t) JournalMgr.showEvolution(t);
  }
});

['#jf-asset', '#jf-biais', '#jf-modele'].forEach(sel => {
  $(sel).addEventListener('change', () => {
    JournalMgr.filters.asset = $('#jf-asset').value;
    JournalMgr.filters.biais = $('#jf-biais').value;
    JournalMgr.filters.modele = $('#jf-modele').value;
    JournalMgr.render();
  });
});
