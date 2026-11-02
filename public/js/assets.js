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
    // datalist de l'onglet analyse
    const dl = $('#asset-list');
    if (dl) dl.innerHTML = APP.assets.map(a => `<option value="${esc(a.symbol)}">`).join('');
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
    $('#asset-form').reset();
    $('#as-id').value = '';
    $('#as-submit').textContent = t('➕ Ajouter');
    $('#as-cancel').hidden = true;
  }
};

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
