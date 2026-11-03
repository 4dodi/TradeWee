/* ============ Profil du trader : consignes personnelles pour l'IA ============ */
// identifiant de consigne (crypto.randomUUID n'existe qu'en HTTPS ou sur localhost)
const pfId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : 'pf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
window.ProfileMgr = {
  data: { enabled: true, blocks: [] },
  loaded: false,
  dirty: false,

  async ensure() {
    if (this.loaded) return;
    try { this.data = await api('/api/profile'); this.loaded = true; }
    catch (e) { toast(e.message, 'err'); return; }
    this.render();
  },

  setDirty(v) {
    this.dirty = v;
    const b = $('#pf-save');
    if (b) {
      b.classList.toggle('pf-dirty', v);
      b.textContent = v ? t('💾 Enregistrer (modifié)') : t('💾 Enregistrer');
    }
    this.renderStats();
  },

  renderStats() {
    const bl = this.data.blocks;
    const on = bl.filter(b => b.enabled).length;
    const chars = bl.filter(b => b.enabled).reduce((n, b) => n + (b.title || '').length + (b.text || '').length, 0);
    $('#pf-stats').textContent = bl.length
      ? t('{on}/{n} consigne(s) active(s) · {chars} caractères', { on, n: bl.length, chars: chars.toLocaleString(LOCALE) }) : '';
  },

  render() {
    $('#pf-enabled').checked = this.data.enabled !== false;
    const box = $('#pf-blocks');
    if (!this.data.blocks.length) {
      box.innerHTML = `<div class="pf-empty">
        <p>${esc(t('Aucune consigne pour l’instant. Importez votre texte d’instructions (par exemple celui de votre configuration initiale) : il sera découpé en consignes à chaque titre.'))}</p>
        <button class="btn btn-primary" type="button" data-act="import">📥 ${esc(t('Importer un texte'))}</button>
      </div>`;
    } else {
      box.innerHTML = this.data.blocks.map((b, i) => `
        <div class="pf-block ${b.enabled ? '' : 'off'}" data-i="${i}">
          <div class="pf-head">
            <label class="pf-on" title="${esc(t('Activer / désactiver cette consigne'))}"><input type="checkbox" data-k="enabled" ${b.enabled ? 'checked' : ''}></label>
            <input class="pf-title" data-k="title" value="${esc(b.title)}" placeholder="${esc(t('Titre (ex. Règles de discipline)'))}">
            <input class="pf-assets" data-k="assets" value="${esc(b.assets || '')}" placeholder="${esc(t('Actifs : tous'))}" title="${esc(t('Limiter à certains actifs, ex. BTCUSD ou EURUSD, GBPUSD (vide = tous)'))}">
            <button type="button" class="pf-btn" data-act="up" title="${esc(t('Monter'))}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="pf-btn" data-act="down" title="${esc(t('Descendre'))}" ${i === this.data.blocks.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="pf-btn" data-act="del" title="${esc(t('Supprimer'))}">🗑️</button>
          </div>
          <textarea class="pf-text" data-k="text" rows="${Math.min(14, Math.max(3, (b.text || '').split('\n').length + 1))}" spellcheck="false" placeholder="${esc(t('Votre consigne pour l’IA…'))}">${esc(b.text)}</textarea>
        </div>`).join('');
    }
    this.setDirty(this.dirty);
  },

  add() {
    this.data.blocks.push({ id: pfId(), title: '', text: '', enabled: true, assets: '' });
    this.setDirty(true);
    this.render();
    const last = $('#pf-blocks .pf-block:last-child .pf-title');
    if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); last.focus(); }
  },

  async save() {
    try {
      this.data = await api('/api/profile', { method: 'PUT', body: JSON.stringify(this.data) });
      this.setDirty(false);
      this.render();
      toast(t('Profil enregistré ✓ — il sera utilisé dès la prochaine analyse.'), 'ok');
      return true;
    } catch (e) { toast(e.message, 'err'); return false; }
  },

  /* Découpe un texte (Markdown) en consignes : un bloc par titre ## ou ###.
     Les ### reprennent le titre ## parent (« Méthode › Unités de temps »). */
  parse(raw) {
    // retire le gras Markdown et les caractères invisibles laissés par un emoji perdu au copier-coller
    const clean = s => s.replace(/\*\*/g, '').replace(/[\uFE0E\uFE0F\u200B-\u200D\u2060]/g, '').replace(/\s+/g, ' ').trim();
    const txt = String(raw || '').replace(/\r\n/g, '\n')
      .replace(/([^\n#])[ \t]+(#{1,3} )/g, '$1\n$2'); // titres collés en fin de ligne (copier-coller)
    const blocks = [];
    let parent = '', cur = null;
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*(#{1,3})\s+(.*)$/);
      if (m) {
        const title = clean(m[2]);
        if (m[1].length <= 2) { parent = title; cur = { title, text: '' }; }
        else cur = { title: parent ? `${parent} › ${title}` : title, text: '' };
        blocks.push(cur);
      } else {
        if (/^\s*-{3,}\s*$/.test(line)) continue; // séparateur « --- »
        if (!cur) { cur = { title: t('Introduction'), text: '' }; blocks.push(cur); }
        cur.text += line + '\n';
      }
    }
    return blocks
      .map(b => ({ ...b, text: b.text.replace(/\n{3,}/g, '\n\n').trim() }))
      .filter(b => b.text)
      .map(b => {
        // titre du type « Niveaux clés (BTC/USD) » : consigne limitée à cet actif
        const pair = b.title.match(/\(([A-Z]{3,5})\s*\/\s*([A-Z]{3,4})\)/);
        return {
          id: pfId(), title: b.title.slice(0, 120), text: b.text.slice(0, 8000), enabled: true,
          assets: pair ? (pair[1] + pair[2]).replace(/USDT$/, 'USD') : ''
        };
      });
  },

  showImport() {
    const overlay = $('#modal-overlay'), box = $('#modal-box');
    box.classList.add('wide');
    box.innerHTML = `
      <h3>📥 ${esc(t('Importer des consignes'))}</h3>
      <div class="modal-sub">${esc(t('Collez votre texte d’instructions. Il est découpé en une consigne par titre (## ou ###) ; chaque consigne reste modifiable ensuite.'))}</div>
      <textarea class="pine-code" id="pf-import-text" spellcheck="false" placeholder="${esc(t('Collez ici votre texte…'))}"></textarea>
      <div class="pf-import-opts">
        <label class="check"><input type="radio" name="pf-mode" value="append" checked> ${esc(t('Ajouter à la suite des consignes existantes'))}</label>
        <label class="check"><input type="radio" name="pf-mode" value="replace"> ${esc(t('Remplacer toutes les consignes'))}</label>
      </div>
      <p class="muted" id="pf-import-count"></p>
      <div class="btn-row">
        <button class="btn btn-ghost" id="pf-import-cancel">${esc(t('Annuler'))}</button>
        <button class="btn btn-primary" id="pf-import-go">📥 ${esc(t('Importer'))}</button>
      </div>`;
    overlay.hidden = false;
    const close = () => { overlay.hidden = true; box.innerHTML = ''; box.classList.remove('wide'); };
    const ta = $('#pf-import-text');
    ta.focus();
    ta.addEventListener('input', () => {
      const n = this.parse(ta.value).length;
      $('#pf-import-count').textContent = n ? t('{n} consigne(s) détectée(s).', { n }) : '';
    });
    $('#pf-import-cancel').addEventListener('click', close);
    $('#pf-import-go').addEventListener('click', async () => {
      const blocks = this.parse(ta.value);
      if (!blocks.length) { toast(t('Aucun texte à importer.'), 'err'); return; }
      const mode = (document.querySelector('input[name="pf-mode"]:checked') || {}).value;
      if (mode === 'replace' && this.data.blocks.length && !confirm(t('Remplacer les {n} consigne(s) actuelles ?', { n: this.data.blocks.length }))) return;
      this.data.blocks = mode === 'replace' ? blocks : this.data.blocks.concat(blocks);
      close();
      this.setDirty(true);
      this.render();
      if (await this.save()) toast(t('{n} consigne(s) importée(s) ✓', { n: blocks.length }), 'ok');
    });
  },

  exportText() {
    return this.data.blocks.map(b => `## ${b.title}${b.assets ? ` [${b.assets}]` : ''}${b.enabled ? '' : ' (off)'}\n\n${b.text}`).join('\n\n');
  },

  async showPreview() {
    if (this.dirty && !(await this.save())) return;
    const asset = ($('#an-asset') && $('#an-asset').value.trim()) || 'BTCUSD';
    let j;
    try { j = await api('/api/profile/preview?asset=' + encodeURIComponent(asset)); }
    catch (e) { toast(e.message, 'err'); return; }
    const overlay = $('#modal-overlay'), box = $('#modal-box');
    box.classList.add('wide');
    box.innerHTML = `
      <h3>👁 ${esc(t('Ce que l’IA reçoit'))}</h3>
      <div class="modal-sub">${esc(j.count
        ? t('{n} consigne(s) ajoutée(s) aux instructions de l’IA pour {asset}.', { n: j.count, asset })
        : t('Aucune consigne active pour {asset} : l’IA utilise seulement ses instructions par défaut.', { asset }))}</div>
      <div class="field"><label for="pf-prev-asset">${esc(t('Actif'))}</label>
        <div class="input-row"><input id="pf-prev-asset" value="${esc(asset)}" list="asset-list"><button class="btn btn-ghost" id="pf-prev-go">🔄</button></div></div>
      <textarea class="pine-code" readonly spellcheck="false" id="pf-prev-text"></textarea>
      <div class="btn-row"><button class="btn btn-ghost" id="pf-prev-close">${esc(t('Fermer'))}</button></div>`;
    $('#pf-prev-text').value = j.text || '';
    overlay.hidden = false;
    $('#pf-prev-close').addEventListener('click', () => { overlay.hidden = true; box.innerHTML = ''; box.classList.remove('wide'); });
    $('#pf-prev-go').addEventListener('click', async () => {
      const a = $('#pf-prev-asset').value.trim();
      try {
        const r = await api('/api/profile/preview?asset=' + encodeURIComponent(a));
        $('#pf-prev-text').value = r.text || '';
        box.querySelector('.modal-sub').textContent = r.count
          ? t('{n} consigne(s) ajoutée(s) aux instructions de l’IA pour {asset}.', { n: r.count, asset: a })
          : t('Aucune consigne active pour {asset} : l’IA utilise seulement ses instructions par défaut.', { asset: a });
      } catch (e) { toast(e.message, 'err'); }
    });
  }
};

/* ---------- Écouteurs ---------- */
$('#pf-blocks').addEventListener('input', (e) => {
  const el = e.target.closest('[data-k]');
  const blk = e.target.closest('.pf-block');
  if (!el || !blk) return;
  const b = ProfileMgr.data.blocks[+blk.dataset.i];
  if (el.dataset.k === 'enabled') { b.enabled = el.checked; blk.classList.toggle('off', !el.checked); }
  else b[el.dataset.k] = el.value;
  ProfileMgr.setDirty(true);
});
$('#pf-blocks').addEventListener('change', (e) => {
  if (e.target.matches('[data-k="enabled"]')) e.target.dispatchEvent(new Event('input', { bubbles: true }));
});
$('#pf-blocks').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'import') return ProfileMgr.showImport();
  const i = +btn.closest('.pf-block').dataset.i, bl = ProfileMgr.data.blocks;
  if (btn.dataset.act === 'del') {
    if (!confirm(t('Supprimer la consigne « {title} » ?', { title: bl[i].title || t('sans titre') }))) return;
    bl.splice(i, 1);
  } else if (btn.dataset.act === 'up' && i > 0) [bl[i - 1], bl[i]] = [bl[i], bl[i - 1]];
  else if (btn.dataset.act === 'down' && i < bl.length - 1) [bl[i + 1], bl[i]] = [bl[i], bl[i + 1]];
  ProfileMgr.setDirty(true);
  ProfileMgr.render();
});
$('#pf-enabled').addEventListener('change', (e) => { ProfileMgr.data.enabled = e.target.checked; ProfileMgr.setDirty(true); });
$('#pf-add').addEventListener('click', () => ProfileMgr.add());
$('#pf-save').addEventListener('click', () => ProfileMgr.save());
$('#pf-import').addEventListener('click', () => ProfileMgr.showImport());
$('#pf-preview').addEventListener('click', () => ProfileMgr.showPreview());
$('#pf-export').addEventListener('click', () => {
  if (!ProfileMgr.data.blocks.length) { toast(t('Aucune consigne à copier.'), 'err'); return; }
  TradingViewMgr.copy(ProfileMgr.exportText(), t('Profil copié ✓'));
});
// avertit si l'on quitte la page avec des modifications non enregistrées
window.addEventListener('beforeunload', (e) => { if (ProfileMgr.dirty) { e.preventDefault(); e.returnValue = ''; } });
