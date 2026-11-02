/* ============ Alertes FinancialJuice (RSS, polling) ============ */
window.AlertsMgr = {
  timer: null,
  paused: false,
  sound: localStorage.getItem('tw-sound') !== '0',
  notify: localStorage.getItem('tw-notify') === '1',
  seen: new Set(JSON.parse(localStorage.getItem('tw-seen') || '[]')),
  lastIds: [],
  unread: 0,
  started: false,

  applyInterval() {
    if (this.timer) clearInterval(this.timer);
    const sec = (APP.settings && APP.settings.alertsIntervalSec) || 30;
    this.timer = setInterval(() => this.poll(), Math.max(15, sec) * 1000);
  },

  async ensure() {
    this.refreshButtons();
    if (this.started) return;
    this.started = true;
    this.applyInterval();
    await this.poll(true);
  },

  beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 830; o.type = 'sine';
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.start(); o.stop(ctx.currentTime + 0.5);
    } catch { /* audio bloqué */ }
  },

  filters() {
    const inc = ($('#al-include').value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const exc = ($('#al-exclude').value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return { inc, exc };
  },

  async poll(first = false) {
    if (this.paused) return;
    const dot = $('#alerts-dot'), status = $('#alerts-status');
    dot.className = 'live-dot on';
    status.textContent = 'Connexion au flux…';
    let items;
    try {
      items = await api('/api/alerts');
    } catch (e) {
      dot.className = 'live-dot off';
      status.textContent = `⚠️ ${e.message}`;
      return;
    }
    const { inc, exc } = this.filters();
    let filtered = items;
    if (inc.length) filtered = filtered.filter(i => inc.some(k => i.title.toLowerCase().includes(k)));
    if (exc.length) filtered = filtered.filter(i => !exc.some(k => i.title.toLowerCase().includes(k)));

    // détection de nouveautés (sur le flux non filtré)
    const ids = new Set(items.map(i => i.id));
    const fresh = first ? [] : items.filter(i => !this.seen.has(i.id));
    if (!first) {
      for (const f of fresh.slice(0, 5)) {
        if (this.sound) this.beep();
        if (this.notify && Notification.permission === 'granted' && document.hidden) {
          new Notification('🔔 FinancialJuice', { body: f.title });
        }
      }
      if (fresh.length) {
        this.unread += fresh.length;
        const badge = $('#badge-alerts');
        badge.hidden = false;
        badge.textContent = this.unread > 99 ? '99+' : this.unread;
        document.title = `(${this.unread}) Tradewee — Analyse de charts`;
      }
    }
    for (const id of ids) this.seen.add(id);
    this.seen = new Set([...this.seen].slice(-500));
    localStorage.setItem('tw-seen', JSON.stringify([...this.seen]));

    const freshIds = new Set(fresh.map(f => f.id));
    const sec = (APP.settings && APP.settings.alertsIntervalSec) || 30;
    this.lastItems = items;
    status.textContent = `${items.length} news · MAJ auto toutes les ${sec} s · dernière : ${new Date().toLocaleTimeString('fr-FR')}`;
    this.render(filtered, freshIds);
  },

  render(items, freshIds) {
    const list = $('#alerts-list');
    if (!items.length) {
      list.innerHTML = '<p class="muted">Aucune news ne correspond à vos filtres.</p>';
      return;
    }
    list.innerHTML = items.slice(0, 120).map(i => {
      const d = new Date(i.date);
      const t = isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `
        <div class="alert-item ${freshIds.has(i.id) ? 'new' : ''}">
          <span class="alert-time">${t}</span>
          <span class="alert-title"><a href="${esc(safeUrl(i.link))}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a></span>
        </div>`;
    }).join('');
  },

  refreshButtons() {
    $('#al-sound').classList.toggle('sound-on', this.sound);
    $('#al-sound').textContent = this.sound ? '🔊 Son' : '🔈 Son';
    $('#al-notify').classList.toggle('notif-on', this.notify && Notification.permission === 'granted');
  },

  resetUnread() {
    this.unread = 0;
    const badge = $('#badge-alerts');
    badge.hidden = true;
    document.title = 'Tradewee — Analyse de charts';
  }
};

/* ---------- Écouteurs ---------- */
$('#al-pause').addEventListener('click', () => {
  AlertsMgr.paused = !AlertsMgr.paused;
  $('#al-pause').textContent = AlertsMgr.paused ? '▶️ Reprendre' : '⏸ Pause';
  $('#alerts-dot').className = AlertsMgr.paused ? 'live-dot off' : 'live-dot on';
  $('#alerts-status').textContent = AlertsMgr.paused ? 'Flux en pause.' : 'Reprise…';
  if (!AlertsMgr.paused) AlertsMgr.poll();
});

$('#al-sound').addEventListener('click', () => {
  AlertsMgr.sound = !AlertsMgr.sound;
  localStorage.setItem('tw-sound', AlertsMgr.sound ? '1' : '0');
  if (AlertsMgr.sound) AlertsMgr.beep();
  AlertsMgr.refreshButtons();
});

$('#al-notify').addEventListener('click', async () => {
  if (!AlertsMgr.notify || Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    AlertsMgr.notify = p === 'granted';
  } else {
    AlertsMgr.notify = false;
  }
  localStorage.setItem('tw-notify', AlertsMgr.notify ? '1' : '0');
  AlertsMgr.refreshButtons();
  toast(AlertsMgr.notify ? 'Notifications activées ✓' : 'Notifications désactivées.');
});

['al-include', 'al-exclude'].forEach(id =>
  $('#' + id).addEventListener('input', () => {
    // re-rendu local à partir du dernier poll sans re-cliquer
    if (AlertsMgr.lastItems) {
      const { inc, exc } = AlertsMgr.filters();
      let filtered = AlertsMgr.lastItems;
      if (inc.length) filtered = filtered.filter(i => inc.some(k => i.title.toLowerCase().includes(k)));
      if (exc.length) filtered = filtered.filter(i => !exc.some(k => i.title.toLowerCase().includes(k)));
      AlertsMgr.render(filtered, new Set());
    }
  })
);

// reset du compteur quand l'onglet est consulté
document.querySelector('[data-tab="alerts"]').addEventListener('click', () => AlertsMgr.resetUnread());
