/* ============ Gestion des actifs (watchlist) ============ */
window.AssetsMgr = {
  render() {
    const tbody = $('#assets-tbody');
    if (!tbody) return;
    if (APP.assets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center;padding:24px">${esc(t('Aucun actif — ajoutez-en un ci-dessus.'))}</td></tr>`;
    } else {
      tbody.innerHTML = APP.assets.map(a => `
        <tr>
          <td class="sym">${esc(a.symbol)}</td>
          <td><span class="type-tag">${esc(TYPE_LABELS[a.type] || a.type)}</span></td>
          <td class="muted">${esc(a.notes) || '—'}</td>
          <td>
            <div class="row-actions">
              <button data-edit="${esc(a.id)}" title="${esc(t('Modifier'))}">✏️</button>
              <button data-del="${esc(a.id)}" title="${esc(t('Supprimer'))}">🗑️</button>
            </div>
          </td>
        </tr>`).join('');
    }
    // datalist de l'onglet analyse : la watchlist d'abord, puis les actifs populaires
    const dl = $('#asset-list');
    if (dl) {
      const mine = new Set(APP.assets.map(a => a.symbol));
      dl.innerHTML = APP.assets.map(a => `<option value="${esc(a.symbol)}" label="${esc(a.notes || TYPE_LABELS[a.type] || '')}">`).join('')
        + SymbolSuggest.all().filter(x => !mine.has(x.symbol))
          .map(x => `<option value="${esc(x.symbol)}" label="${esc(x.name + ' · ' + (TYPE_LABELS[x.type] || ''))}">`).join('');
    }
    this.renderSuggestions();
  },

  /* ---------- Suggestions : 20 actifs populaires du type choisi ---------- */
  renderSuggestions() {
    const type = $('#as-type').value;
    const list = SymbolSuggest.list(type);
    // liste déroulante du champ Symbole
    $('#as-symbol-list').innerHTML = list.map(x => `<option value="${esc(x.symbol)}" label="${esc(x.name)}">`).join('');
    // boutons rapides (✓ = déjà dans la watchlist)
    const mine = new Set(APP.assets.map(a => a.symbol));
    $('#as-suggest').innerHTML = `<span class="muted">${esc(t('Populaires — {type} :', { type: TYPE_LABELS[type] || type }))}</span>`
      + list.map(x => {
        const has = mine.has(x.symbol);
        return `<button type="button" class="chip-btn sugg ${has ? 'on' : ''}" data-sym="${esc(x.symbol)}" title="${esc(has ? t('{name} — déjà dans votre liste', { name: x.name }) : x.name)}">${has ? '✓ ' : ''}${esc(x.symbol)}</button>`;
      }).join('');
  },

  // Remplit le formulaire à partir d'une suggestion (type et notes inclus)
  applySuggestion(symbol) {
    const s = SymbolSuggest.find(symbol);
    if (!s) return false;
    $('#as-symbol').value = s.symbol;
    if ($('#as-type').value !== s.type) { $('#as-type').value = s.type; this.renderSuggestions(); }
    const notes = $('#as-notes');
    if (!notes.value.trim() || notes.dataset.auto === '1') { notes.value = s.name; notes.dataset.auto = '1'; }
    return true;
  },

  startEdit(id) {
    const a = APP.assets.find(x => x.id === id);
    if (!a) return;
    $('#as-id').value = a.id;
    $('#as-symbol').value = a.symbol;
    $('#as-type').value = a.type;
    $('#as-notes').value = a.notes || '';
    $('#as-submit').textContent = t('💾 Modifier');
    $('#as-cancel').hidden = false;
  },

  resetForm() {
    const type = $('#as-type').value; // garder le type choisi : pratique pour ajouter plusieurs actifs du même type
    $('#asset-form').reset();
    $('#as-type').value = type;
    $('#as-id').value = '';
    $('#as-submit').textContent = t('➕ Ajouter');
    $('#as-cancel').hidden = true;
    $('#as-notes').dataset.auto = '';
    this.renderSuggestions();
  }
};

$('#as-type').addEventListener('change', () => AssetsMgr.renderSuggestions());
// symbole choisi dans la liste (ou tapé) : type et description remplis automatiquement
$('#as-symbol').addEventListener('change', () => AssetsMgr.applySuggestion($('#as-symbol').value));
$('#as-notes').addEventListener('input', () => { $('#as-notes').dataset.auto = ''; });
$('#as-suggest').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sym]');
  if (!b) return;
  if (b.classList.contains('on')) { toast(t('{sym} est déjà dans votre liste.', { sym: b.dataset.sym })); return; }
  AssetsMgr.applySuggestion(b.dataset.sym);
  $('#as-submit').focus();
});

$('#asset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    symbol: $('#as-symbol').value.trim(),
    type: $('#as-type').value,
    notes: $('#as-notes').value.trim()
  };
  if (!payload.symbol) return;
  const id = $('#as-id').value;
  try {
    if (id) {
      await api(`/api/assets/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast(t('Actif modifié ✓'), 'ok');
    } else {
      await api('/api/assets', { method: 'POST', body: JSON.stringify(payload) });
      toast(t('Actif ajouté ✓'), 'ok');
    }
    AssetsMgr.resetForm();
    await loadConfig();
  } catch (err) { toast(err.message, 'err'); }
});

$('#as-cancel').addEventListener('click', () => AssetsMgr.resetForm());

$('#assets-tbody').addEventListener('click', async (e) => {
  const editId = e.target.getAttribute('data-edit');
  const delId = e.target.getAttribute('data-del');
  if (editId) return AssetsMgr.startEdit(editId);
  if (delId) {
    const a = APP.assets.find(x => x.id === delId);
    if (!confirm(t('Supprimer l’actif {sym} ?', { sym: a ? a.symbol : '' }))) return;
    try {
      await api(`/api/assets/${delId}`, { method: 'DELETE' });
      toast(t('Actif supprimé ✓'), 'ok');
      await loadConfig();
    } catch (err) { toast(err.message, 'err'); }
  }
});
