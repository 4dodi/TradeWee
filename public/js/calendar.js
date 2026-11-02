/* ============ Calendrier économique (ForexFactory) ============ */
window.CalendarMgr = {
  events: [],
  loaded: false,
  filterCcy: new Set(),
  timer: null,

  async ensure() {
    if (this.loaded) return;
    await this.load();
    this.loaded = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.load(), 5 * 60 * 1000);
  },

  async load() {
    const c = $('#cal-container');
    try {
      this.events = await api('/api/calendar');
      this.renderChips();
      this.render();
    } catch (e) {
      c.innerHTML = `<p class="muted">⚠️ ${esc(e.message)}</p>`;
    }
  },

  renderChips() {
    const ccys = [...new Set(this.events.map(e => e.country).filter(Boolean))].sort();
    const box = $('#cal-chips');
    box.innerHTML = ccys.map(c =>
      `<button class="chip-btn ${this.filterCcy.has(c) ? 'on' : ''}" data-ccy="${esc(c)}">${CCY_FLAGS[c] || ''} ${esc(c)}</button>`
    ).join('');
    box.querySelectorAll('.chip-btn').forEach(b => b.addEventListener('click', () => {
      const c2 = b.dataset.ccy;
      if (this.filterCcy.has(c2)) this.filterCcy.delete(c2); else this.filterCcy.add(c2);
      this.renderChips(); this.render();
    }));
  },

  render() {
    const c = $('#cal-container');
    const q = ($('#cal-search').value || '').toLowerCase();
    let events = [...this.events].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (this.filterCcy.size) events = events.filter(e => this.filterCcy.has(e.country));
    if (q) events = events.filter(e => (e.title || '').toLowerCase().includes(q) || (e.country || '').toLowerCase().includes(q));

    this.renderNextHigh();

    if (!events.length) { c.innerHTML = `<p class="muted">${esc(t('Aucun événement pour ces filtres.'))}</p>`; return; }

    // regroupement par jour (heure locale)
    const byDay = new Map();
    for (const ev of events) {
      const d = new Date(ev.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!byDay.has(key)) byDay.set(key, { date: d, rows: [] });
      byDay.get(key).rows.push(ev);
    }
    const todayKey = (() => { const t = new Date(); return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`; })();
    const now = Date.now();

    let html = '';
    for (const [, day] of byDay) {
      const label = day.date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
      html += `<div class="cal-day ${`${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}` === todayKey ? 'today' : ''}">${esc(label)}</div>`;
      for (const ev of day.rows) {
        const d = new Date(ev.date);
        const past = d.getTime() < now;
        const impact = ['High', 'Medium', 'Low', 'Holiday'].includes(ev.impact) ? ev.impact : 'Low';
        html += `
          <div class="cal-row ${past ? 'past' : ''}">
            <span class="cal-time">${d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</span>
            <span class="cal-ccy">${CCY_FLAGS[ev.country] || ''} ${esc(ev.country)}</span>
            <span class="cal-impact ${impact}">${impact === 'High' ? t('ÉLEVÉ') : impact === 'Medium' ? t('MOYEN') : impact === 'Holiday' ? t('FÉRIÉ') : t('FAIBLE')}</span>
            <span class="cal-title">${esc(ev.title)}</span>
            <span class="cal-fc" title="${esc(t('Prévision'))}">${esc(t('P :'))} ${esc(ev.forecast || '—')}</span>
            <span class="cal-prev" title="${esc(t('Précédent'))}">${esc(t('Prec :'))} ${esc(ev.previous || '—')}</span>
          </div>`;
      }
    }
    c.innerHTML = html;
  },

  renderNextHigh() {
    const box = $('#cal-next');
    const next = this.events
      .map(e => ({ ...e, t: new Date(e.date).getTime() }))
      .filter(e => e.t > Date.now() && e.impact === 'High')
      .sort((a, b) => a.t - b.t)[0];
    if (!next) { box.hidden = true; return; }
    const mins = Math.round((next.t - Date.now()) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    const inTxt = h > 0 ? t('dans {h} h {m}', { h, m: m.toString().padStart(2, '0') }) : t('dans {m} min', { m });
    box.hidden = false;
    box.innerHTML = `🔴 <b>${esc(t('Prochain événement à fort impact'))}</b> : ${CCY_FLAGS[next.country] || ''} <b>${esc(next.country)}</b> — ${esc(next.title)} · ${new Date(next.date).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })} (${esc(inTxt)})`;
  }
};

$('#cal-search') && $('#cal-search').addEventListener('input', () => CalendarMgr.render());
