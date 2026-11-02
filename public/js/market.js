/* ============ Marché : vue d'ensemble + cotations + surveillances de prix ============ */
window.MarketMgr = {
  timer: null,
  pollTimer: null,
  lastAlerts: [],
  mcapDays: '30',
  ov: null,

  async ensure() {
    if (this.timer) return;
    const dl = $('#mk-symbol-list');
    if (dl) dl.innerHTML = this.symbols().map(s => `<option value="${esc(s)}">`).join('');
    this.loadOverview();
    await this.refreshQuotes();
    await this.loadMonitors();
    this.timer = setInterval(() => this.refreshQuotes(), 60000);
    this.pollTimer = setInterval(() => this.poll(), 30000);
    this.pollTimer2 = setInterval(() => this.loadOverview(), 5 * 60000);
    this.poll();
  },

  symbols() {
    const watch = APP.assets.map(a => a.symbol);
    for (const def of ['BTCUSD', 'ETHUSD', 'XAUUSD', 'EURUSD']) {
      if (!watch.includes(def)) watch.push(def);
    }
    return watch.slice(0, 12);
  },

  async refreshQuotes() {
    const box = $('#market-quotes');
    if (!box) return;
    box.innerHTML = '<p class="muted">Récupération des cotations…</p>';
    try {
      const j = await api('/api/market/quotes?symbols=' + encodeURIComponent(this.symbols().join(',')));
      const entries = Object.entries(j.quotes || {});
      if (!entries.length) { box.innerHTML = '<p class="muted">Aucune cotation disponible pour le moment.</p>'; return; }
      box.innerHTML = `
        <div class="muted" style="margin-bottom:8px">MAJ : ${new Date(j.at).toLocaleTimeString('fr-FR')} · sources CoinGecko (crypto, métaux) et BCE (forex)</div>
        <div class="quotes-grid">
          ${entries.map(([sym, q]) => `
            <div class="quote-cell">
              <div class="k">${esc(sym)}</div>
              <div class="v">${fmtNum(q.price)}</div>
              <div class="src">${esc(q.source || '')}</div>
            </div>`).join('')}
        </div>`;
    } catch (e) {
      box.innerHTML = `<p class="muted">⚠️ ${esc(e.message)} — réessayez dans un instant (CORS/réseau).</p>`;
    }
  },

  async loadMonitors() {
    let list = [];
    try { list = await api('/api/monitors'); } catch { return; }
    this.monitors = list;
    const tb = $('#monitors-tbody');
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">Aucune surveillance — ajoutez-en une ci-dessus.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(m => `
      <tr data-id="${esc(m.id)}">
        <td class="sym">${esc(m.symbol)}</td>
        <td>${m.condition === 'above' ? '≥ passe au-dessus de' : '≤ passe sous'}</td>
        <td><b>${fmtNum(m.target)}</b></td>
        <td>${m.lastPrice != null ? fmtNum(m.lastPrice) : '—'}</td>
        <td>${m.triggered
          ? `<span class="type-tag" style="border-color:var(--red);color:#f87171">🔔 déclenchée ${new Date(m.triggeredAt).toLocaleString('fr-FR')}</span>`
          : '<span class="type-tag">en veille</span>'}</td>
        <td><button class="btn btn-ghost mon-del" title="Supprimer">🗑️</button></td>
      </tr>`).join('');
  },

  async addMonitor(e) {
    e.preventDefault();
    const payload = {
      symbol: ($('#mk-symbol').value || '').trim(),
      condition: $('#mk-condition').value,
      target: $('#mk-target').value
    };
    if (!payload.symbol || payload.target === '') { toast('Symbole et prix cible requis.', 'err'); return; }
    try {
      await api('/api/monitors', { method: 'POST', body: JSON.stringify(payload) });
      toast('Surveillance ajoutée ✓', 'ok');
      $('#mk-form').reset();
      await this.loadMonitors();
      await this.poll(true);
    } catch (err) { toast(err.message, 'err'); }
  },

  async removeMonitor(id) {
    try {
      await api(`/api/monitors/${id}`, { method: 'DELETE' });
      await this.loadMonitors();
    } catch (err) { toast(err.message, 'err'); }
  },

  async poll(silent = false) {
    let j;
    try { j = await api('/api/monitors/poll'); } catch { return; }
    if (!j.alerts || !j.alerts.length) return;
    for (const a of j.alerts) {
      if (this.lastAlerts.some(x => x.symbol === a.symbol && x.target === a.target)) continue;
      this.lastAlerts.push(a);
      const msg = `🔔 ${a.symbol} ${a.condition === 'above' ? '≥' : '≤'} ${fmtNum(a.target)} — prix actuel ${fmtNum(a.price)}`;
      toast(msg, 'ok');
      try {
        if (Notification.permission === 'granted' && document.hidden) {
          new Notification('🔔 Tradewee — Surveillance de prix', { body: msg });
        }
      } catch { /* notifications indisponibles */ }
      if (!silent) this.beep();
    }
    await this.loadMonitors();
  },

  beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 950; o.type = 'sine';
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start(); o.stop(ctx.currentTime + 0.6);
    } catch { /* audio bloqué */ }
  },

  /* ================= Vue d'ensemble style CMC ================= */

  fmtBig(v) {
    if (v == null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e12) return (v / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(2);
  },
  fmtPct(v) {
    if (v == null || isNaN(v)) return '';
    const cls = v >= 0 ? 'up' : 'down';
    return `<span class="pct ${cls}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(2)}%</span>`;
  },

  async loadOverview() {
    try {
      this.ov = await api('/api/market/overview');
      this.renderDerivatives();
      this.renderStatus();
      this.renderDonut();
      this.renderTrending();
      this.renderMcapChart();
    } catch (e) {
      const g = $('#ov-grid');
      if (g) g.innerHTML = `<div class="card ov-card ov-wide"><p class="muted">⚠️ Vue d'ensemble indisponible : ${esc(e.message)}</p></div>`;
    }
  },

  /* --- Carte Dérivés : Long/Short 30j en barres + stats --- */
  renderDerivatives() {
    const box = $('#ov-derivatives .ov-body');
    if (!box) return;
    const ov = this.ov || {};
    const ls = ov.longShort || [];
    if (!ls.length && ov.derivatives == null) {
      box.innerHTML = '<p class="muted">Données dérivés indisponibles.</p>';
      return;
    }
    const avgRatio = ls.length ? ls.reduce((s, d) => s + d.ratio, 0) / ls.length : null;
    const longPct = avgRatio != null ? avgRatio / (1 + avgRatio) * 100 : null;
    const shortPct = longPct != null ? 100 - longPct : null;
    const oi = ov.derivatives?.openInterest;
    box.innerHTML = `
      <div class="ov-stats">
        <div class="ov-stat"><div class="lbl">Long/Short (30j) — comptes</div>
          <div class="vals">
            ${longPct != null ? `<span class="v" style="color:var(--green)">Long ${longPct.toFixed(1)}%</span>` : ''}
            ${shortPct != null ? `<span class="v" style="color:var(--red)">Short ${shortPct.toFixed(1)}%</span>` : ''}
          </div>
        </div>
        ${oi != null ? `<div class="ov-stat"><div class="lbl">Open Interest total</div><div class="big">$${this.fmtBig(oi)}</div></div>` : ''}
      </div>
      ${ls.length ? `<div class="ls-bars">${ls.map(d => {
        const longH = Math.round(d.long), shortH = Math.round(d.short);
        return `<div class="ls-col" title="${new Date(d.t).toLocaleDateString('fr-FR')} — ratio L/S ${d.ratio.toFixed(2)}">
          ${longH > shortH ? `<div class="bar bar-long" style="height:${longH}%"></div>` : `<div class="bar bar-short" style="height:${shortH}%"></div>`}
          <div class="bar bar-mini ${d.long >= d.short ? 'bar-short' : 'bar-long'}" style="height:12%"></div>
        </div>`;
      }).join('')}</div>
      <div class="muted" style="font-size:11px;margin-top:6px">Ratio comptes longs/shorts BTC futures (Binance, 30 jours)</div>` : ''}`;
  },

  /* --- Carte Statut : jauge Fear & Greed + Altcoin Season --- */
  renderStatus() {
    const box = $('#ov-status .ov-body');
    if (!box) return;
    const fg = this.ov?.fearGreed;
    const alt = this.ov?.altcoinSeason;
    if (fg == null && alt == null) { box.innerHTML = '<p class="muted">Statut indisponible.</p>'; return; }

    let gauge = '';
    if (fg) {
      // jauge semi-circulaire : arc coloré de 180° (0 à gauche → 100 à droite)
      const v = Math.max(0, Math.min(100, fg.value));
      const R = 70, cx = 90, cy = 90;
      const a0 = Math.PI * (1 - v / 100); // angle du curseur (0 à gauche)
      const px = cx + R * Math.cos(a0), py = cy - R * Math.sin(a0);
      const arc = (from, to, color) => {
        const a1 = Math.PI * (1 - from / 100), a2 = Math.PI * (1 - to / 100);
        const x1 = cx + R * Math.cos(a1), y1 = cy - R * Math.sin(a1);
        const x2 = cx + R * Math.cos(a2), y2 = cy - R * Math.sin(a2);
        return `<path d="M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}" stroke="${color}" stroke-width="14" fill="none" stroke-linecap="round"/>`;
      };
      gauge = `
        <div class="fg-card">
          <div class="fg-title">Fear &amp; Greed</div>
          <svg viewBox="0 0 180 105" class="fg-gauge">
            ${arc(0, 24, '#ef4444')}${arc(26, 49, '#f59e0b')}${arc(51, 74, '#a3e635')}${arc(76, 100, '#22c55e')}
            <circle cx="${px}" cy="${py}" r="8" fill="#0b0e14" stroke="#dbe2f0" stroke-width="3"/>
          </svg>
          <div class="fg-value">${fg.value}</div>
          <div class="fg-label" style="background:${fg.value < 25 ? 'var(--red)' : fg.value < 50 ? 'var(--orange)' : 'var(--green)'}">${esc(fg.label || '')}</div>
        </div>`;
    }

    let altRow = '';
    if (alt != null) {
      const pos = Math.max(4, Math.min(96, alt));
      altRow = `
        <div class="alt-row">
          <div class="alt-head"><span class="alt-score">${alt}</span> <span class="muted">Altcoin Season (0 = saison BTC, 100 = altcoins)</span></div>
          <div class="alt-bar">
            <div class="alt-fill" style="width:8%"></div>
            <div class="alt-fill" style="width:26%"></div>
            <div class="alt-fill" style="width:32%"></div>
            <div class="alt-fill" style="width:34%"></div>
            <div class="alt-dot" style="left:${pos}%"></div>
          </div>
        </div>`;
    }
    box.innerHTML = gauge + altRow;
  },

  /* --- Donut de dominance --- */
  renderDonut() {
    const box = $('#ov-donut .ov-body');
    if (!box) return;
    const g = this.ov?.global;
    if (!g || g.btcDominance == null) { box.innerHTML = '<p class="muted">Données indisponibles.</p>'; return; }
    const btc = g.btcDominance, eth = g.ethDominance ?? 0, others = 100 - btc - eth;
    const segs = [
      { l: 'Bitcoin', v: btc, c: '#3b82f6' },
      { l: 'Ethereum', v: eth, c: '#22c55e' },
      { l: 'Autres', v: others, c: '#f59e0b' }
    ];
    let a = -Math.PI / 2;
    const cx = 70, cy = 70, R = 55, r = 34;
    const paths = segs.map(s => {
      const a2 = a + (s.v / 100) * Math.PI * 2;
      const large = (a2 - a) > Math.PI ? 1 : 0;
      const p = `M ${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)}
        A ${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(a2)} ${cy + R * Math.sin(a2)}
        L ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}
        A ${r} ${r} 0 ${large} 0 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)} Z`;
      a = a2;
      return `<path d="${p}" fill="${s.c}"/>`;
    }).join('');
    box.innerHTML = `
      <div class="donut-wrap">
        <svg viewBox="0 0 140 140" class="donut">${paths}</svg>
        <div class="donut-legend">
          ${segs.map(s => `<div class="dl"><i style="background:${s.c}"></i> ${s.l} <b>${s.v.toFixed(2)}%</b></div>`).join('')}
        </div>
      </div>`;
  },

  /* --- Tendances (CoinGecko) --- */
  renderTrending() {
    const box = $('#ov-trending .ov-body');
    if (!box) return;
    const list = this.ov?.trending || [];
    if (!list.length) { box.innerHTML = '<p class="muted">Aucune donnée de tendance.</p>'; return; }
    box.innerHTML = `<div class="trend-list">${list.map((c, i) => `
      <div class="trend-row">
        <span class="trend-rank">${i + 1}</span>
        <img class="trend-ico" src="${esc(safeUrl(c.thumb))}" alt="" referrerpolicy="no-referrer">
        <span class="trend-sym">${esc(String(c.symbol || '').toUpperCase())}</span>
        <span class="spacer"></span>
        ${c.chg24h != null ? this.fmtPct(c.chg24h) : '<span class="muted">—</span>'}
      </div>`).join('')}</div>`;
  },

  /* --- Graphique market cap global (aire) --- */
  async renderMcapChart() {
    const box = $('#ov-mcap .ov-body');
    if (!box) return;
    try {
      const j = await api('/api/market/mcap-chart?days=' + this.mcapDays);
      const g = this.ov?.global;
      const chg = g?.mcapChange24h;
      const stats = `
        <div class="mcap-stats">
          <div>
            <div class="lbl muted">Market Cap</div>
            <div class="big">$${this.fmtBig(g?.mcap)} ${chg != null ? this.fmtPct(chg) : ''}</div>
          </div>
          <div>
            <div class="lbl muted">Volume 24h</div>
            <div class="big">$${this.fmtBig(g?.volume)}</div>
          </div>
        </div>`;
      const pts = j.prices || [];
      if (pts.length < 2) { box.innerHTML = stats + '<p class="muted">Historique indisponible.</p>'; return; }
      const W = 600, H = 140;
      const vs = pts.map(p => p.v);
      const min = Math.min(...vs), max = Math.max(...vs), rng = (max - min) || 1;
      const xy = pts.map((p, i) => `${(i / (pts.length - 1) * W).toFixed(1)},${(H - (p.v - min) / rng * (H - 10) - 5).toFixed(1)}`);
      const stroke = vs[vs.length - 1] >= vs[0] ? 'var(--green)' : 'var(--red)';
      const dLine = 'M ' + xy.join(' L ');
      const dArea = dLine + ` L ${W} ${H} L 0 ${H} Z`;
      box.innerHTML = `${stats}
        <svg class="mcap-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs><linearGradient id="mcapGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${stroke}" stop-opacity=".25"/>
            <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
          </linearGradient></defs>
          <path d="${dArea}" fill="url(#mcapGrad)"/>
          <path d="${dLine}" fill="none" stroke="${stroke}" stroke-width="2"/>
        </svg>
        <div class="muted" style="font-size:11px">Capitalisation totale du marché crypto — CoinGecko</div>`;
    } catch (e) {
      box.innerHTML = `<p class="muted">⚠️ ${esc(e.message)}</p>`;
    }
  }
};

$('#mk-form').addEventListener('submit', e => MarketMgr.addMonitor(e));
$('#mk-refresh').addEventListener('click', () => MarketMgr.refreshQuotes());
$('#monitors-tbody').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-id]');
  if (tr && e.target.closest('.mon-del')) MarketMgr.removeMonitor(tr.getAttribute('data-id'));
});
$('#mcap-seg').addEventListener('click', e => {
  const btn = e.target.closest('button[data-days]');
  if (!btn) return;
  $$('#mcap-seg button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  MarketMgr.mcapDays = btn.getAttribute('data-days');
  MarketMgr.renderMcapChart();
});
