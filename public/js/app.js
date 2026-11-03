/* ============ Application : navigation + réglages ============ */

/* ---------- Navigation par onglets ---------- */
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
    const badge = $(`#badge-${btn.dataset.tab}`);
    if (badge) badge.hidden = true;
    if (btn.dataset.tab === 'calendar') window.CalendarMgr && CalendarMgr.ensure();
    if (btn.dataset.tab === 'alerts') window.AlertsMgr && AlertsMgr.ensure();
    if (btn.dataset.tab === 'journal') window.JournalMgr && JournalMgr.ensure();
    if (btn.dataset.tab === 'market') window.MarketMgr && MarketMgr.ensure();
    if (btn.dataset.tab === 'profile') window.ProfileMgr && ProfileMgr.ensure();
    if (btn.dataset.tab === 'analyze') window.AnalyzeMgr && AnalyzeMgr.refreshHistory();
  });
});

/* ---------- Chargement de la config ---------- */
async function loadConfig() {
  const cfg = await api('/api/config');
  APP.settings = cfg.settings;
  APP.assets = cfg.assets;
  updateAiStatus();
  fillSettingsForm();
  window.AssetsMgr && AssetsMgr.render();
  window.AnalyzeMgr && AnalyzeMgr.fillAssetList();
  window.AlertsMgr && AlertsMgr.applyInterval();
}

function updateAiStatus() {
  const el = $('#ai-status');
  if (APP.settings && APP.settings.hasKey) {
    el.textContent = t('IA : {model} ✓', { model: APP.settings.model || t('auto') });
    el.className = 'ai-status ok';
  } else {
    el.textContent = t('IA : aucune clé API (voir Réglages)');
    el.className = 'ai-status ko';
  }
}

/* ---------- Formulaire réglages ---------- */
const PROVIDER_PRESETS = {
  zai: { baseUrl: 'https://api.z.ai/api/paas/v4', model: 'glm-4.5v' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: '' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  github: { baseUrl: 'https://models.github.ai/inference', model: 'openai/gpt-4o' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemma-4-31b-it:free' },
  custom: null
};

/* Lien où obtenir une clé, par fournisseur */
const KEY_URLS = {
  gemini: 'https://aistudio.google.com/app/apikey',
  groq: 'https://console.groq.com/keys',
  mistral: 'https://console.mistral.ai/api-keys',
  github: 'https://github.com/settings/tokens',
  openrouter: 'https://openrouter.ai/keys',
  zai: 'https://z.ai/manage-api-key/apikey-list',
  openai: 'https://platform.openai.com/api-keys'
};

/* Conseils spécifiques par fournisseur (quotas, particularités) */
const PROVIDER_HINTS = {
  gemini: t('🆓 Gratuit : créez une clé sur Google AI Studio (compte Google suffit). Laissez le modèle vide : l’app détecte automatiquement le modèle Gemini avec vision de votre compte (les noms changent souvent).'),
  groq: t('🆓 Gratuit et ultra rapide. ⚠️ Groq a retiré ses modèles vision (Llama 4) de son catalogue : après avoir collé votre clé, cliquez sur « 📋 Lister » — s’il n’y a aucun modèle acceptant les images, préférez Gemini ou OpenRouter pour l’analyse de charts.'),
  mistral: t('🆓 Gratuit : activez le plan « Experiment » gratuit de La Plateforme à l’inscription, puis créez une clé API.'),
  github: t('🆓 Gratuit avec un compte GitHub : créez un Personal Access Token (fine-grained, permission « Models : read ») et collez-le comme clé.'),
  openrouter: t('🆓 Gratuit : les modèles « :free » ne coûtent rien (quotas/jour). Modèles gratuits qui lisent les images : google/gemma-4-31b-it:free, nvidia/nemotron-3.5-super-vl:free, thinkingmachines/inkling:free… Cliquez sur « 📋 Lister » pour voir ceux de votre compte.'),
  zai: t('💳 Payant : clé sur z.ai (tarifs compétitifs, GLM-4.5V très bon en lecture de charts).'),
  openai: t('💳 Payant : clé sur platform.openai.com (nécessite un crédit).'),
  custom: t('Toute API compatible OpenAI : renseignez l’URL de base (…/v1) et le modèle avec vision.')
};

function updateProviderUi() {
  const p = $('#st-provider').value;
  const link = $('#st-key-url');
  if (KEY_URLS[p]) {
    link.href = KEY_URLS[p];
    link.hidden = false;
    link.textContent = p === 'github' ? t('🔑 Créer un token GitHub →') : t('🔑 Obtenir une clé API →');
  } else {
    link.hidden = true;
  }
  $('#st-provider-hint').textContent = PROVIDER_HINTS[p] || '';
}

function fillSettingsForm() {
  const s = APP.settings;
  if (!s) return;
  const preset = PROVIDER_PRESETS[s.provider];
  $('#st-provider').value = s.provider || 'zai';
  $('#st-baseurl').value = s.baseUrl || (preset ? preset.baseUrl : '');
  // modèle absent ou hérité d'un autre fournisseur → défaut du fournisseur choisi
  const knownDefaults = ['glm-4.5v', 'gpt-4o', 'gemini-2.5-flash', 'mistral-small-latest', 'google/gemma-4-31b-it:free', 'meta-llama/llama-4-scout:free', 'meta-llama/llama-4-scout-17b-16e-instruct'];
  const stale = knownDefaults.includes(s.model) && preset && preset.model !== s.model;
  $('#st-model').value = (s.model && !stale) ? s.model : (preset ? preset.model : (s.model || ''));
  $('#st-model').placeholder = (preset && !preset.model && !$('#st-model').value)
    ? t('auto — modèle détecté par l’app') : t('ex : glm-4.5v');
  $('#st-balance').value = s.balance ?? '';
  $('#st-risk').value = s.riskPercent ?? '';
  $('#st-blackout').value = s.blackoutMinutes ?? 60;
  $('#st-maxday').value = s.maxTradesPerDay ?? 3;
  $('#st-maxweek').value = s.maxTradesPerWeek ?? 10;
  $('#st-maxloss').value = s.maxLossesConsecutive ?? 2;
  $('#st-interval').value = s.alertsIntervalSec ?? 30;
  $('#st-news').checked = !!s.useNewsContext;
  $('#st-feedback').checked = s.useFeedback !== false;
  $('#st-backup-ai').checked = s.useBackupAI !== false;
  $('#st-key').value = '';
  $('#st-key-hint').textContent = s.hasKey ? t('Clé enregistrée : {key}', { key: s.apiKeyMasked }) : t('Aucune clé enregistrée.');
  updateProviderUi();
  renderProviders();
}

/* ---------- IA supplémentaires (comparaison) ---------- */
function renderProviders() {
  const box = $('#st-providers');
  if (!box) return;
  const list = (APP.settings && APP.settings.providers) || [];
  box.innerHTML = list.map((p, i) => `
    <div class="prov-row" data-i="${i}">
      <div class="field"><input data-p="name" placeholder="${esc(t('Nom (ex : Gemini 2)'))}" value="${esc(p.name)}"></div>
      <div class="field"><input data-p="baseUrl" placeholder="https://…/v1" value="${esc(p.baseUrl)}"></div>
      <div class="field"><input data-p="model" placeholder="${esc(t('modèle'))}" value="${esc(p.model)}"></div>
      <div class="field"><input data-p="apiKey" type="password" placeholder="${esc(p.hasKey ? t('clé : {key}', { key: p.apiKeyMasked }) : t('clé API'))}"></div>
      <button class="prov-del" type="button" title="${esc(t('Retirer'))}">✕</button>
    </div>`).join('');
  box.querySelectorAll('.prov-del').forEach(btn => btn.addEventListener('click', () => {
    const i = +btn.closest('.prov-row').getAttribute('data-i');
    APP.settings.providers.splice(i, 1);
    renderProviders();
  }));
}

function collectProviders() {
  return [...document.querySelectorAll('#st-providers .prov-row')].map(row => ({
    id: (APP.settings.providers && APP.settings.providers[+row.getAttribute('data-i')]?.id) || undefined,
    name: row.querySelector('[data-p="name"]').value.trim(),
    baseUrl: row.querySelector('[data-p="baseUrl"]').value.trim(),
    model: row.querySelector('[data-p="model"]').value.trim(),
    apiKey: row.querySelector('[data-p="apiKey"]').value.trim()
  }));
}

$('#st-add-provider').addEventListener('click', () => {
  if (!APP.settings) return;
  if (!Array.isArray(APP.settings.providers)) APP.settings.providers = [];
  if (APP.settings.providers.length >= 4) { toast(t('4 IA supplémentaires maximum.'), 'err'); return; }
  APP.settings.providers.push({ name: t('IA {n}', { n: APP.settings.providers.length + 1 }), baseUrl: '', model: '', apiKey: '', hasKey: false, apiKeyMasked: '' });
  renderProviders();
});

$('#st-provider').addEventListener('change', () => {
  const p = PROVIDER_PRESETS[$('#st-provider').value];
  if (p) { $('#st-baseurl').value = p.baseUrl; $('#st-model').value = p.model; }
  $('#st-model').placeholder = (p && !p.model) ? t('auto — modèle détecté par l’app') : t('ex : glm-4.5v');
  updateProviderUi();
});

$('#st-save').addEventListener('click', async () => {
  const p = PROVIDER_PRESETS[$('#st-provider').value];
  const body = {
    settings: {
      provider: $('#st-provider').value,
      baseUrl: $('#st-baseurl').value.trim() || (p ? p.baseUrl : ''),
      model: $('#st-model').value.trim() || (p ? p.model : ''),
      balance: parseFloat($('#st-balance').value) || 0,
      riskPercent: parseFloat($('#st-risk').value) || 1,
      blackoutMinutes: Math.min(600, Math.max(0, parseInt($('#st-blackout').value) || 0)),
      maxTradesPerDay: Math.max(1, parseInt($('#st-maxday').value) || 3),
      maxTradesPerWeek: Math.max(1, parseInt($('#st-maxweek').value) || 10),
      maxLossesConsecutive: Math.max(1, parseInt($('#st-maxloss').value) || 2),
      providers: collectProviders(),
      alertsIntervalSec: Math.min(600, Math.max(15, parseInt($('#st-interval').value) || 30)),
      useNewsContext: $('#st-news').checked,
      useFeedback: $('#st-feedback').checked,
      useBackupAI: $('#st-backup-ai').checked
    }
  };
  const key = $('#st-key').value.trim();
  if (key) body.settings.apiKey = key;
  try {
    await api('/api/config', { method: 'PUT', body: JSON.stringify(body) });
    toast(t('Réglages enregistrés ✓'), 'ok');
    await loadConfig();
    window.AlertsMgr && AlertsMgr.applyInterval();
  } catch (e) { toast(e.message, 'err'); }
});

$('#st-models').addEventListener('click', async () => {
  const p = PROVIDER_PRESETS[$('#st-provider').value];
  const baseUrl = $('#st-baseurl').value.trim() || (p ? p.baseUrl : '');
  if (!baseUrl) { toast(t('Renseignez d’abord l’URL de base de l’API.'), 'err'); return; }
  try {
    const j = await api('/api/models', {
      method: 'POST',
      body: JSON.stringify({ baseUrl, apiKey: $('#st-key').value.trim() || undefined })
    });
    $('#model-list').innerHTML = (j.models || []).map(m => `<option value="${esc(m)}">`).join('');
    if (!(j.models || []).length) toast(t('Le fournisseur n’a renvoyé aucun modèle.'), 'err');
    else toast(t('{n} modèles disponibles — cliquez dans le champ Modèle pour en choisir un ✓', { n: j.models.length }), 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

$('#st-backup').addEventListener('click', () => {
  window.location.href = '/api/backup?includeUploads=1';
  toast(t('Sauvegarde en cours de téléchargement…'), 'ok');
});

$('#st-test').addEventListener('click', async () => {
  const res = $('#st-test-result');
  res.textContent = t('Test en cours…');
  res.className = 'test-result';
  const p = PROVIDER_PRESETS[$('#st-provider').value];
  const body = {
    baseUrl: $('#st-baseurl').value.trim() || (p ? p.baseUrl : undefined),
    model: $('#st-model').value.trim() || (p ? p.model : undefined),
    apiKey: $('#st-key').value.trim() || undefined
  };
  try {
    const j = await api('/api/test-connection', { method: 'POST', body: JSON.stringify(body) });
    if (j.ok) {
      res.textContent = t('✓ Connexion OK — modèle « {model} » : "{reply}"', { model: j.model, reply: j.reply });
      res.className = 'test-result ok';
      if (j.discovered) {
        $('#st-model').value = j.model;
        toast(j.note || t('Modèle détecté automatiquement ✓'), 'ok');
      }
    } else { res.textContent = `✗ ${j.error}`; res.className = 'test-result ko'; }
  } catch (e) {
    res.textContent = `✗ ${e.message}`;
    res.className = 'test-result ko';
  }
});

/* ---------- Démarrage ---------- */
loadConfig().catch(e => {
  console.error(e);
  toast(t('Impossible de charger la configuration : {msg}', { msg: e.message }), 'err');
});
