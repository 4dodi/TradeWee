/**
 * Tradewee App — serveur local
 * Analyse de captures d'écran de charts via IA vision (API compatible OpenAI),
 * gestion d'actifs, calendrier économique (ForexFactory) et alertes (FinancialJuice RSS).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
// Par défaut l'app n'écoute que sur la machine locale. Pour un hébergement
// (Render, Railway, VPS…), définir HOST=0.0.0.0 ET APP_PASSWORD.
const HOST = process.env.HOST || '127.0.0.1';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const APP_USER = process.env.APP_USER || 'admin';
const IS_LOOPBACK = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
// Repli TLS non vérifié (antivirus qui inspecte le HTTPS) : désactivé sauf demande explicite.
const ALLOW_INSECURE_TLS = process.env.ALLOW_INSECURE_TLS === '1';

if (!IS_LOOPBACK && !APP_PASSWORD && process.env.ALLOW_NO_AUTH !== '1') {
  console.error(
    `\n  Refus de démarrer : HOST=${HOST} expose l'app sur le réseau sans mot de passe.\n` +
    `  N'importe qui pourrait utiliser votre clé API et lire votre journal.\n` +
    `  Définissez APP_PASSWORD (recommandé) ou ALLOW_NO_AUTH=1 (à vos risques).\n`
  );
  process.exit(1);
}

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ANALYSES_FILE = path.join(DATA_DIR, 'analyses.json');

for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  settings: {
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: '',
    model: 'gemini-2.5-flash',
    balance: 1000,
    riskPercent: 1,
    blackoutMinutes: 60,
    maxTradesPerDay: 3,
    maxTradesPerWeek: 10,
    maxLossesConsecutive: 2,
    alertsIntervalSec: 30,
    useNewsContext: true,
    providers: [] // IA supplémentaires pour la comparaison : [{id,name,baseUrl,apiKey,model}]
  },
  assets: [
    { id: 'a1', symbol: 'EURUSD', type: 'forex', notes: 'Euro / Dollar US' },
    { id: 'a2', symbol: 'GBPUSD', type: 'forex', notes: '' },
    { id: 'a3', symbol: 'XAUUSD', type: 'commodity', notes: 'Or spot' },
    { id: 'a4', symbol: 'BTCUSD', type: 'crypto', notes: 'Bitcoin / Dollar' },
    { id: 'a5', symbol: 'NAS100', type: 'index', notes: 'Nasdaq 100' }
  ]
};

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
let config = (() => {
  const c = loadJson(CONFIG_FILE, DEFAULT_CONFIG);
  // fusion défensive avec les défauts (en cas de vieille config)
  c.settings = { ...DEFAULT_CONFIG.settings, ...(c.settings || {}) };
  if (!Array.isArray(c.assets)) c.assets = DEFAULT_CONFIG.assets;
  return c;
})();
const saveConfig = () => saveJson(CONFIG_FILE, config);

function loadAnalyses() {
  const a = loadJson(ANALYSES_FILE, []);
  return Array.isArray(a) ? a : [];
}

function maskKey(key) {
  if (!key) return '';
  return key.length <= 6 ? '••••••' : '••••••••' + key.slice(-4);
}

// Modèle par défaut par hébergeur : permet d'appeler la bonne IA même si le
// champ "modèle" est vide ou contient encore le défaut d'un autre fournisseur.
const MODEL_DEFAULTS_BY_HOST = [
  ['api.z.ai', 'glm-4.5v'],
  ['api.openai.com', 'gpt-4o'],
  ['generativelanguage.googleapis.com', ''],
  ['api.groq.com', ''],
  ['api.mistral.ai', 'mistral-small-latest'],
  ['models.github.ai', 'openai/gpt-4o'],
  ['openrouter.ai', '']
];
const KNOWN_DEFAULT_MODELS = new Set(MODEL_DEFAULTS_BY_HOST.map(([, m]) => m).filter(Boolean));

// Certains fournisseurs (Google notamment) renvoient l'erreur dans un tableau.
function extractApiError(j, status) {
  const pick = (o) => (o && o.error && (o.error.message || o.error.code || o.error.status)) || (o && (o.message || o.detail)) || null;
  const candidates = [j, Array.isArray(j) ? j[0] : null, j && j.error];
  for (const c of candidates) {
    const msg = pick(c);
    if (typeof msg === 'string' && msg) return msg;
  }
  return `HTTP ${status}`;
}

function isModelNotFound(status, msg) {
  if (status !== 404 && status !== 400) return false;
  return /model/i.test(msg || '') && /(not found|not exist|does not exist|unsupported|invalid|unknown|access)/i.test(msg || '');
}

// Quota épuisé (429) ou palier gratuit inexistant pour ce modèle (limit: 0).
function isQuotaError(status, msg) {
  if (status === 429) return true;
  return /(quota|rate limit|rate_limit|exceeded|limit: 0|no free tier|billing)/i.test(msg || '');
}

// Surcharge passagère du fournisseur : 500/502/503/504, ou message « high demand ».
function isTransientError(status, msg) {
  if (status >= 500) return true;
  return /(high demand|overloaded|temporarily|try again later|unavailable)/i.test(msg || '');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Classe les modèles du meilleur au moins bon pour l'analyse d'images.
function rankModels(entries) {
  const excluded = /(embed|tts|aqa|audio|speech|whisper|veo|imagen|dall|nano-banana|safety|moderation|rerank|image-gen|guard)/i;
  let list = entries.map(e => (typeof e === 'string' ? { id: e } : e))
    .filter(e => e && e.id && !excluded.test(e.id));
  // si le fournisseur expose les modalités, ne garder que ceux qui lisent les images
  const withModalities = list.filter(e => e.architecture && Array.isArray(e.architecture.input_modalities));
  if (withModalities.length) {
    const vision = withModalities.filter(e => e.architecture.input_modalities.includes('image'));
    if (vision.length) list = vision;
  }
  const score = (e) => {
    const id = String(e.id);
    let s = 0;
    if (/flash/i.test(id)) s += 30;                                  // rapide et économique
    if (/vision|vl\b|multimodal/i.test(id)) s += 22;
    if (/pro\b/i.test(id)) s += 12;
    if (/lite|nano|mini/i.test(id)) s += 8;
    if (/omni|thinking|reasoning|ultra|max\b/i.test(id)) s -= 12;    // souvent hors palier gratuit
    if (/preview|exp\b|beta|experimental/i.test(id)) s -= 10;
    const v = id.match(/(\d+)(?:[.\-](\d+))?/);
    if (v) s += Math.min(24, Number(v[1]) * 2 + (Number(v[2]) || 0));
    return s;
  };
  return list.slice().sort((a, b) => score(b) - score(a)).map(e => String(e.id));
}

// Interroge l'API pour obtenir les modèles réellement accessibles à cette clé.
// Retourne { model, status, error } — l'erreur sert à expliquer un échec (clé invalide…).
async function discoverModel(baseUrl, apiKey) {
  if (!baseUrl || !apiKey) return { model: null, status: 400, error: 'URL de base ou clé API manquante.' };
  try {
    const r = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    }, 20000);
    const j = await r.json().catch(() => null);
    if (!r.ok) return { model: null, status: r.status, error: extractApiError(j, r.status) };
    const list = (j && Array.isArray(j.data)) ? j.data
      : (j && Array.isArray(j.models)) ? j.models
      : (Array.isArray(j) ? j : []);
    if (!list.length) return { model: null, list: [], status: 200, error: 'Le fournisseur ne renvoie aucun modèle.' };
    const ranked = rankModels(list);
    return { model: ranked[0] || null, list: ranked, status: 200, error: null };
  } catch (e) {
    return { model: null, status: 502, error: `Connexion impossible : ${e.message}` };
  }
}

function resolveModel(baseUrl, model) {
  const url = String(baseUrl || '').toLowerCase();
  const entry = MODEL_DEFAULTS_BY_HOST.find(([h]) => url.includes(h));
  const m = (model || '').trim();
  if (!entry) return m; // hôte inconnu : modèle vide = découverte automatique
  const [, def] = entry;
  // def vide = pas de défaut fiable (catalogue qui bouge) → '' signifie « à découvrir »
  if (!def) return KNOWN_DEFAULT_MODELS.has(m) ? '' : m;
  if (!m || (KNOWN_DEFAULT_MODELS.has(m) && m !== def)) return def;
  return m;
}

// ---------------------------------------------------------------------------
// Prompt IA
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Tu es "Tradewee Analyst", analyste trading senior (15 ans d'expérience) expert en analyse technique chartiste, price action et analyse fondamentale macro.

MÉTHODE D'ANALYSE :
1. Lis attentivement CHAQUE image fournie : type de graphique, actif, unité de temps, bougies et structure, indicateurs visibles (RSI, MACD, EMA/SMA, Volume, Bollinger, Stochastique...), tracés (supports/résistances, lignes de tendance, figures, zones d'offre/demande, Fibonacci, triangles...) et tout texte ou notes de stratégie visibles sur la capture.
2. Analyse technique : tendance de fond et intermédiaire, structure de marché (HH/HL ou LH/LL), figures chartistes et price action, dynamique des indicateurs, volumes, divergence éventuelle.
3. Analyse fondamentale : contexte macro lié à l'actif (taux directeurs, inflation, croissance, géopolitique, sentiment de marché, actualités). Si des news récentes te sont fournies dans le contexte, exploite-les explicitement.
4. Déduis un scénario privilégié et un plan de trade concret, réaliste et prudent.

RÈGLES STRICTES :
- N'invente JAMAIS de niveaux de prix illisibles : déduis-les de l'échelle de l'image. Si l'échelle n'est pas lisible, propose des niveaux relatifs (en % par rapport au prix estimé) et signale-le dans "avertissements".
- Le champ ratioRisqueRendement doit être cohérent : |(TP1 - entree)| / |(entree - stopLoss)|.
- Si la configuration n'est pas assez claire pour trader, mets "biais": "NEUTRE" et explique ce qui manque ou ce qu'il faut attendre.
- Le biais doit être exactement l'un des trois : "ACHAT", "VENTE", "NEUTRE".
- Les champs numériques inconnus doivent valoir null (pas de chaîne vide).
- Réponds en FRANÇAIS.
- Sois dense et concis : 4 à 8 phrases par section d'analyse, sans remplissage. La réponse JSON complète doit tenir dans un seul message.
- Renseigne "evenementsProches" avec les événements macro de la liste fournie qui concernent l'actif analysé (laisser vide si aucun). Si un événement à fort impact concernant l'actif tombe dans les 3 h suivant l'analyse, ajoute OBLIGATOIREMENT un avertissement recommandant de ne pas maintenir de position pendant l'annonce, et adapte le conseil de gestion en conséquence.
- Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises markdown, au schéma suivant :
{
  "actif": "string",
  "uniteDeTemps": "string ou null",
  "biais": "ACHAT" | "VENTE" | "NEUTRE",
  "confiance": 0-100,
  "prixActuel": nombre | null,
  "entree": nombre | null,
  "zoneEntree": { "min": nombre|null, "max": nombre|null },
  "stopLoss": nombre | null,
  "takeProfits": [ { "niveau": nombre|null, "commentaire": "string" } ],
  "ratioRisqueRendement": nombre | null,
  "figuresDetectees": ["string"],
  "indicateurs": [ { "nom": "string", "lecture": "string", "implication": "haussière|baissière|neutre" } ],
  "niveauxCles": { "supports": [nombre], "resistances": [nombre] },
  "analyseTechnique": "markdown détaillé (paragraphes structurés)",
  "analyseFondamentale": "markdown détaillé",
  "invalidation": "ce qui invalide le scénario",
  "gestion": "conseils de gestion de position (partiels, break-even, trailing)",
  "evenementsProches": ["string — événements macro de la liste fournie qui concernent l'actif (vide si aucun)"],
  "avertissements": ["string"]
}`;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
function extractJson(text) {
  if (!text) return null;
  let t = text.trim();
  // retire d'éventuelles balises de code
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  try {
    return JSON.parse(t);
  } catch { /* continue */ }
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(t.slice(first, last + 1));
    } catch { /* continue */ }
  }
  return repairTruncatedJson(t);
}

/**
 * Répare une réponse JSON coupée en plein milieu (dépassement de max_tokens).
 * Repère la dernière valeur complète possible, ferme les chaînes/objets/tableaux
 * restés ouverts et retente l'analyse. Retourne null si irrécupérable.
 */
function repairTruncatedJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  const body = text.slice(start);

  const boundaries = [];
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') { inStr = false; boundaries.push({ end: i + 1, stack: stack.slice() }); }
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') { stack.push(c); continue; }
    if (c === '}' || c === ']') { stack.pop(); boundaries.push({ end: i + 1, stack: stack.slice() }); continue; }
    // fin d'un littéral ou d'un nombre
    if (/[0-9]/.test(c) || /^(?:true|false|null)/.test(body.slice(i, i + 5))) {
      const next = body[i + 1];
      if (next === undefined || /[,\]\}\s]/.test(next)) boundaries.push({ end: i + 1, stack: stack.slice() });
    }
  }

  // on essaie les derniers points de coupure, du plus tardif au plus ancien
  for (let k = boundaries.length - 1; k >= Math.max(0, boundaries.length - 400); k--) {
    const b = boundaries[k];
    let closers = '';
    for (let j = b.stack.length - 1; j >= 0; j--) closers += b.stack[j] === '{' ? '}' : ']';
    try {
      const obj = JSON.parse(body.slice(0, b.end) + closers);
      if (obj && typeof obj === 'object') return obj;
    } catch { /* essaie un point plus ancien */ }
  }
  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function xmlTag(tag, chunk) {
  const m = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1].trim()) : '';
}

// Certains antivirus/proxies interceptent le HTTPS (scanning SSL) avec leur propre
// certificat, que Node rejette (SELF_SIGNED_CERT_IN_CHAIN…). On retente alors via
// node:https avec validation assouplie, sans quoi l'app serait inutilisable.
const TLS_INTERCEPT_CODES = [
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'
];

function httpsFetchLoose(urlStr, opts = {}, ms = 20000) {
  const https = require('https');
  const { URL } = require('url');
  const u = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      rejectUnauthorized: false,
      timeout: ms
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        headers: res.headers,
        text: async () => data,
        json: async () => JSON.parse(data)
      }));
    });
    req.on('timeout', () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    try {
      return await fetch(url, { ...opts, signal: ctl.signal });
    } catch (e) {
      const code = String((e.cause && (e.cause.code || e.cause.message)) || e.message || '');
      if (ALLOW_INSECURE_TLS && TLS_INTERCEPT_CODES.some(c => code.includes(c))) {
        const { signal, ...rest } = opts;
        return await httpsFetchLoose(url, rest, ms);
      }
      throw e;
    }
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------
app.disable('x-powered-by');

// En mode local : n'accepter que les requêtes adressées à localhost
// (bloque les attaques par « DNS rebinding » depuis un site malveillant).
if (IS_LOOPBACK) {
  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
  app.use((req, res, next) => {
    const h = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    if (LOCAL_HOSTS.has(h)) return next();
    res.status(403).send('Hôte non autorisé.');
  });
}

// Mot de passe optionnel (obligatoire si l'app est exposée) : authentification HTTP Basic.
if (APP_PASSWORD) {
  const safeEqual = (a, b) => {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
  };
  app.use((req, res, next) => {
    const m = String(req.headers.authorization || '').match(/^Basic\s+(.+)$/i);
    if (m) {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      const user = decoded.slice(0, i), pass = decoded.slice(i + 1);
      if (i !== -1 && safeEqual(user, APP_USER) & safeEqual(pass, APP_PASSWORD)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Tradewee", charset="UTF-8"');
    res.status(401).send('Authentification requise.');
  });
}

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

// N'envoie la clé enregistrée qu'à l'URL enregistrée : sinon n'importe quelle
// requête pourrait indiquer sa propre URL et récupérer la clé.
function resolveKeyFor(body, savedUrl, savedKey) {
  const typed = body.apiKey && !String(body.apiKey).startsWith('••') && String(body.apiKey).trim();
  if (typed) return typed;
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  if (body.baseUrl && norm(body.baseUrl) !== norm(savedUrl)) return '';
  return savedKey;
}

app.use(express.json({ limit: '40mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------------------------------------------------------------------------
// Config & réglages
// ---------------------------------------------------------------------------
app.get('/api/config', (req, res) => {
  const { apiKey, providers, ...rest } = config.settings;
  res.json({
    settings: {
      ...rest,
      apiKeyMasked: maskKey(apiKey),
      hasKey: !!apiKey,
      providers: (providers || []).map(p => ({ ...p, apiKey: undefined, apiKeyMasked: maskKey(p.apiKey), hasKey: !!p.apiKey }))
    },
    assets: config.assets
  });
});

app.put('/api/config', (req, res) => {
  const s = req.body && req.body.settings;
  if (!s) return res.status(400).json({ error: 'Corps de requête invalide.' });
  const allowed = ['provider', 'baseUrl', 'model', 'balance', 'riskPercent', 'blackoutMinutes', 'maxTradesPerDay', 'maxTradesPerWeek', 'maxLossesConsecutive', 'alertsIntervalSec', 'useNewsContext', 'providers'];
  for (const k of allowed) {
    if (s[k] !== undefined) config.settings[k] = s[k];
  }
  // IA supplémentaires : sanitisation (clés vides/masquées conservent l'existante)
  if (Array.isArray(s.providers)) {
    const old = Array.isArray(config.settings.providers) ? config.settings.providers : [];
    config.settings.providers = s.providers.slice(0, 4).map((p, i) => {
      const prev = old.find(o => o.id === p.id);
      let key = String(p.apiKey || '').trim();
      if (!key || key.startsWith('••')) key = (prev && prev.apiKey) || '';
      return {
        id: p.id || crypto.randomUUID(),
        name: String(p.name || `IA ${i + 1}`).slice(0, 40),
        baseUrl: String(p.baseUrl || '').trim(),
        model: String(p.model || '').trim(),
        apiKey: key
      };
    }).filter(p => p.baseUrl);
  }
  const bm = coerceNum(config.settings.blackoutMinutes);
  config.settings.blackoutMinutes = bm == null ? 60 : Math.min(600, Math.max(0, bm));
  for (const k of ['maxTradesPerDay', 'maxTradesPerWeek', 'maxLossesConsecutive']) {
    const v = coerceNum(config.settings[k]);
    config.settings[k] = v == null ? null : Math.max(1, Math.round(v));
  }
  // la clé n'est écrasée que si l'utilisateur en saisit une nouvelle (pas le masque)
  if (typeof s.apiKey === 'string' && s.apiKey.trim() !== '' && !s.apiKey.startsWith('••')) {
    config.settings.apiKey = s.apiKey.trim();
  }
  if (s.clearApiKey === true) config.settings.apiKey = '';
  saveConfig();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Actifs (watchlist)
// ---------------------------------------------------------------------------
app.post('/api/assets', (req, res) => {
  const { symbol, type, notes } = req.body || {};
  if (!symbol || !String(symbol).trim()) return res.status(400).json({ error: 'Symbole obligatoire.' });
  const asset = {
    id: crypto.randomUUID(),
    symbol: String(symbol).trim().toUpperCase(),
    type: ['forex', 'crypto', 'index', 'action', 'commodity'].includes(type) ? type : 'forex',
    notes: String(notes || '').trim()
  };
  config.assets.push(asset);
  saveConfig();
  res.json(asset);
});

app.put('/api/assets/:id', (req, res) => {
  const asset = config.assets.find(a => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Actif introuvable.' });
  const { symbol, type, notes } = req.body || {};
  if (symbol !== undefined && String(symbol).trim()) asset.symbol = String(symbol).trim().toUpperCase();
  if (type !== undefined && ['forex', 'crypto', 'index', 'action', 'commodity'].includes(type)) asset.type = type;
  if (notes !== undefined) asset.notes = String(notes).trim();
  saveConfig();
  res.json(asset);
});

app.delete('/api/assets/:id', (req, res) => {
  const before = config.assets.length;
  config.assets = config.assets.filter(a => a.id !== req.params.id);
  if (config.assets.length === before) return res.status(404).json({ error: 'Actif introuvable.' });
  saveConfig();
  res.json({ ok: true });
});

// Appelle /chat/completions avec un modèle donné.
function chatCall(url, key, mdl, payload, ms) {
  return fetchWithTimeout(`${url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...payload, model: mdl })
  }, ms).then(async r => ({ r, j: await r.json().catch(() => null) }));
}

// Un appel, avec quelques reprises si le fournisseur est momentanément surchargé.
// state : 'ok' | 'transient' (surcharge/délai) | 'fallback' (modèle absent/quota) | 'fatal' (clé, requête)
async function attemptModel(url, key, model, payload, ms, maxAttempts = 2, deadline = Infinity) {
  const simulated = (message) => ({ r: { ok: false, status: 504 }, j: [{ error: { message } }], model });
  let out = null;
  for (let i = 0; i < maxAttempts; i++) {
    if (Date.now() > deadline) return { out: out || simulated('Délai total dépassé'), state: 'transient' };
    try {
      out = { ...(await chatCall(url, key, model, payload, ms)), model };
    } catch (e) {
      out = simulated(e.name === 'AbortError'
        ? `Aucune réponse du fournisseur en ${Math.round(ms / 1000)} s`
        : `Connexion impossible : ${e.message}`);
      if (i < maxAttempts - 1) { await sleep(700 * (i + 1)); continue; }
      return { out, state: 'transient' };
    }
    if (out.r.ok) return { out, state: 'ok' };
    const err = extractApiError(out.j, out.r.status);
    if (isTransientError(out.r.status, err)) {
      if (i < maxAttempts - 1) { await sleep(700 * (i + 1)); continue; }
      return { out, state: 'transient' };
    }
    if (isModelNotFound(out.r.status, err) || isQuotaError(out.r.status, err)) return { out, state: 'fallback' };
    return { out, state: 'fatal' }; // clé invalide, requête refusée…
  }
  return { out, state: 'transient' };
}

// Envoie la requête ; si le modèle a disparu, si son quota est épuisé ou s'il est
// surchargé, essaie les suivants de la liste réelle du compte.
async function chatWithFallback(url, key, mdl, payload, ms, budgetMs = 120000) {
  const deadline = Date.now() + budgetMs;
  const tried = [];
  let firstState = null;
  const attempt = (model) => {
    tried.push(model);
    return attemptModel(url, key, model, payload, ms, 2, deadline);
  };

  if (mdl) {
    const res = await attempt(mdl);
    if (res.state === 'ok') return res.out;
    if (res.state === 'fatal') return res.out;
    firstState = res.state;
  }

  if (Date.now() > deadline) {
    return { r: { ok: false, status: 504 }, j: null, model: null, error: 'Délai total dépassé avant de pouvoir tester un autre modèle.' };
  }

  const disc = await discoverModel(url, key);
  if (!disc.list || !disc.list.length) {
    return {
      r: { ok: false, status: disc.status || 400 }, j: null, model: null,
      error: `Impossible de déterminer un modèle — ${disc.error}`
    };
  }

  let last = null, lastState = null;
  for (const candidate of disc.list.filter(m => !tried.includes(m)).slice(0, 3)) {
    if (Date.now() > deadline) break;
    const res = await attempt(candidate);
    last = res.out; lastState = res.state;
    if (res.state === 'ok') return { ...last, discovered: true, previousModel: mdl || null, reason: firstState || 'fallback', tried };
    if (res.state === 'fatal') return last;
  }

  if (last) {
    const err = extractApiError(last.j, last.r.status);
    if (lastState === 'fallback' && isQuotaError(last.r.status, err)) {
      return {
        ...last,
        error: `Quota gratuit épuisé sur les modèles testés (${tried.join(', ')}). Réessayez plus tard, ou choisissez un autre fournisseur (OpenRouter « :free », Mistral, GitHub Models).`
      };
    }
    if (lastState === 'transient') {
      return {
        ...last,
        error: `Aucun modèle n’a répondu (surcharge ou délai dépassé) chez ${url.replace(/^https?:\/\//, '').split('/')[0]}. Modèles essayés : ${tried.join(', ')}. Patientez une à deux minutes, ou basculez sur un autre fournisseur.`
      };
    }
    return last;
  }
  return { r: { ok: false, status: 400 }, j: null, model: null, error: 'Aucun modèle utilisable trouvé (délai total dépassé).' };
}

// ---------------------------------------------------------------------------
// Test de connexion IA
// ---------------------------------------------------------------------------
app.post('/api/test-connection', async (req, res) => {
  const body = req.body || {};
  const s = config.settings;
  const url = ((body.baseUrl || s.baseUrl) || '').replace(/\/+$/, '');
  const key = resolveKeyFor(body, s.baseUrl, s.apiKey);
  if (!key) return res.status(400).json({ ok: false, error: 'Aucune clé API pour cette URL : saisissez la clé du fournisseur (Réglages).' });
  try {
    const configured = body.model || s.model;
    const mdl = resolveModel(url, configured);
    const out = await chatWithFallback(url, key, mdl,
      { messages: [{ role: 'user', content: 'Réponds uniquement: OK' }], max_tokens: 10 }, 20000, 70000);
    if (out.error) return res.status(400).json({ ok: false, error: out.error });
    if (!out.r.ok) {
      const msg = extractApiError(out.j, out.r.status);
      return res.status(out.r.status).json({ ok: false, error: `Erreur API (${out.r.status}) : ${msg}` });
    }
    const reply = (out.j && out.j.choices && out.j.choices[0] && out.j.choices[0].message && out.j.choices[0].message.content || '').trim();
    res.json({
      ok: true,
      model: out.model,
      discovered: !!out.discovered,
      note: out.discovered
        ? (out.reason === 'transient'
          ? `Le modèle « ${mdl || configured} » n’a pas répondu à temps (surcharge ou délai dépassé) : « ${out.model} » a été utilisé à la place. Enregistrez les réglages pour le conserver.`
          : `Le modèle « ${mdl || configured} » n’est plus disponible chez ce fournisseur : « ${out.model} » a été détecté automatiquement. Enregistrez les réglages pour le conserver.`)
        : null,
      reply
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: `Connexion impossible : ${e.message}` });
  }
});

function coerceNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function enforceCoherence(result, settings) {
  const fixes = [];
  const ratiosParTP = [];
  if (!result || typeof result !== 'object') return { fixes, ratiosParTP };
  const entree = coerceNum(result.entree);
  const sl = coerceNum(result.stopLoss);
  const biais = String(result.biais || '').toUpperCase();
  const long = biais.includes('ACHAT');
  const short = biais.includes('VENTE');
  if (entree == null || sl == null || entree === sl) return { fixes, ratiosParTP };
  const distanceStop = Math.abs(entree - sl);

  // SL du bon côté selon le biais
  if (long && sl >= entree) fixes.push(`SL (${sl}) devrait être SOUS l'entrée (${entree}) pour un biais ACHAT.`);
  if (short && sl <= entree) fixes.push(`SL (${sl}) devrait être AU-DESSUS de l'entrée (${entree}) pour un biais VENTE.`);

  // TP : côté, ordre et R:R de chaque niveau
  if (Array.isArray(result.takeProfits)) {
    let prev = null;
    result.takeProfits.forEach((tp, i) => {
      const lvl = coerceNum(tp && tp.niveau);
      if (lvl == null) return;
      if ((long && lvl <= entree) || (short && lvl >= entree)) {
        fixes.push(`TP${i + 1} (${lvl}) est du mauvais côté de l'entrée (${entree}) pour un biais ${long ? 'ACHAT' : 'VENTE'}.`);
      }
      if (prev != null && ((long && lvl <= prev) || (short && lvl >= prev))) {
        fixes.push(`TP${i + 1} (${lvl}) n'est pas ordonné après le TP${i} (${prev}).`);
      }
      ratiosParTP.push({ tp: i + 1, niveau: lvl, rr: Math.round((Math.abs(lvl - entree) / distanceStop) * 100) / 100 });
      prev = lvl;
    });
  }

  // R:R TP1 annoncé vs réel
  const tp1 = Array.isArray(result.takeProfits) && result.takeProfits[0]
    ? coerceNum(result.takeProfits[0].niveau) : null;
  if (tp1 != null) {
    const rrReel = Math.round((Math.abs(tp1 - entree) / distanceStop) * 100) / 100;
    const rrAnnonce = coerceNum(result.ratioRisqueRendement);
    if (rrAnnonce == null || Math.abs(rrAnnonce - rrReel) > 0.15) {
      fixes.push(`Ratio R:R annoncé (${rrAnnonce}) incohérent avec entrée/SL/TP1 : valeur recalculée = ${rrReel}.`);
      result.ratioRisqueRendement = rrReel;
    }
  }

  // la zone d'entrée doit contenir l'entrée
  if (result.zoneEntree && entree != null) {
    const zmin = coerceNum(result.zoneEntree.min);
    const zmax = coerceNum(result.zoneEntree.max);
    if (zmin != null && zmax != null && (entree < Math.min(zmin, zmax) || entree > Math.max(zmin, zmax))) {
      fixes.push(`Entrée (${entree}) hors de la zone d'entrée annoncée [${Math.min(zmin, zmax)} – ${Math.max(zmin, zmax)}].`);
    }
  }

  // taille de position recalculée depuis balance/riskPercent
  const balance = coerceNum(settings.balance);
  const riskPercent = coerceNum(settings.riskPercent);
  if (balance != null && riskPercent != null) {
    const risqueMonetaire = balance * riskPercent / 100;
    result.taillePosition = {
      risqueMonetaire: Math.round(risqueMonetaire * 100) / 100,
      distanceStop: Math.round(distanceStop * 1e6) / 1e6,
      unites: Math.round((risqueMonetaire / distanceStop) * 1e6) / 1e6
    };
  }

  if (fixes.length) {
    result.avertissements = Array.isArray(result.avertissements)
      ? result.avertissements.concat(fixes) : fixes;
  }
  return { fixes, ratiosParTP };
}

// ---------------------------------------------------------------------------
// Analyse IA des captures d'écran
// ---------------------------------------------------------------------------
app.post('/api/analyze', async (req, res) => {
  const { images, asset, timeframe, notes, direction } = req.body || {};
  const { baseUrl, apiKey, useNewsContext, balance, riskPercent } = config.settings;
  const model = resolveModel(baseUrl, config.settings.model);

  if (!apiKey) return res.status(400).json({ error: 'Aucune clé API configurée. Ouvrez l’onglet Réglages pour en saisir une.' });
  if (!Array.isArray(images) || images.length === 0) return res.status(400).json({ error: 'Aucune image fournie.' });
  if (images.length > 5) return res.status(400).json({ error: '5 captures maximum par analyse.' });

  // contexte : news récentes FinancialJuice (optionnel) + événements macro à fort impact
  let newsContext = '';
  if (useNewsContext) {
    try {
      const alerts = await getFinancialJuice();
      const top = alerts.slice(0, 10).map(a => `- [${a.date}] ${a.title}`).join('\n');
      if (top) newsContext = `\n\nNEWS RÉCENTES (FinancialJuice, pour le volet fondamental) :\n${top}`;
    } catch { /* pas bloquant */ }
  }

  let highImpact = [];
  let macroBlock = '';
  try {
    highImpact = await getHighImpactEvents(asset);
    if (highImpact.length) {
      const fmtIn = (m) => m >= 60
        ? `dans ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
        : `dans ${m} min`;
      macroBlock = `\n\nÉVÉNEMENTS MACRO À FORT IMPACT DANS LES 24 H (à prendre en compte obligatoirement) :\n` +
        highImpact.map(e => `- [${fmtIn(e.minutesUntil)}] ${e.title} (${e.country})`).join('\n');
    }
  } catch { /* pas bloquant */ }

  const dirTxt = direction && direction !== 'aucun'
    ? `\nBiais directionnel souhaité par l'utilisateur : ${direction.toUpperCase()} (à confronter à ta propre lecture, tu peux le contredire avec justification).`
    : '';
  const userText = `Analyse ces ${images.length === 1 ? 'capture d’écran' : 'captures d’écran'} de trading et propose un plan de trade complet.
- Actif indiqué par l'utilisateur : ${asset || 'non précisé (identifie-le sur l’image si possible)'}
- Unité de temps indiquée : ${timeframe || 'non précisée (identifie-la sur l’image si possible)'}
- Notes / stratégie de l'utilisateur : ${notes || 'aucune'}${dirTxt}
- Gestion du risque de l'utilisateur : solde ${balance} ${Number.isFinite(balance) ? '' : '(non défini)'}, risque par trade ${riskPercent}%${newsContext}${macroBlock}

Rappel : réponds uniquement par le JSON au schéma demandé, en français.`;

  const content = [{ type: 'text', text: userText }];
  for (const img of images) {
    if (typeof img !== 'string' || !img.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Format d’image invalide (dataURL attendu).' });
    }
    content.push({ type: 'image_url', image_url: { url: img } });
  }

  const url = baseUrl.replace(/\/+$/, '');
  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content }
    ],
    temperature: 0.3,
    max_tokens: 8000
  };

  // IA supplémentaires : même analyse en parallèle, pour comparaison
  let comparisons = [];
  const extraProviders = (config.settings.providers || []).filter(p => p.baseUrl && p.apiKey);
  const wantCompare = req.body.compare === true && extraProviders.length > 0;
  if (wantCompare) {
    comparisons = await Promise.allSettled(extraProviders.slice(0, 4).map(async p => {
      const pUrl = p.baseUrl.replace(/\/+$/, '');
      const pModel = resolveModel(pUrl, p.model) || undefined;
      const out = await chatWithFallback(pUrl, p.apiKey, pModel, payload, 120000, 240000);
      const raw = (out.j && out.j.choices && out.j.choices[0] && out.j.choices[0].message && out.j.choices[0].message.content) || '';
      const parsed2 = extractJson(raw);
      if (!parsed2) return { name: p.name, model: out.model || pModel, error: 'Réponse non exploitable (JSON illisible ou vide).' };
      const coh2 = enforceCoherence(parsed2, config.settings);
      return {
        name: p.name,
        model: out.model || pModel,
        result: parsed2,
        coherenceFixes: coh2.fixes,
        ratiosParTP: coh2.ratiosParTP
      };
    })).then(rs => rs.map(r => r.status === 'fulfilled'
      ? r.value
      : { name: '?', error: `Échec : ${r.reason && r.reason.message || 'inconnu'}` }));
  }

  let aiRaw, usage = null, modelUsed = model;
  try {
    const out = await chatWithFallback(url, apiKey, model, payload, 120000, 240000);
    if (out.error) return res.status(400).json({ error: out.error });
    if (!out.r.ok) {
      const msg = extractApiError(out.j, out.r.status);
      return res.status(out.r.status === 401 || out.r.status === 403 ? 401 : 502)
        .json({ error: `Erreur API (${out.r.status}) : ${msg}` });
    }
    aiRaw = (out.j && out.j.choices && out.j.choices[0] && out.j.choices[0].message && out.j.choices[0].message.content) || '';
    usage = (out.j && out.j.usage) || null;
    if (out.r.ok && !aiRaw) return res.status(502).json({ error: 'Réponse vide ou illisible du fournisseur IA. Réessayez.' });
    modelUsed = out.model;
    if (out.discovered) {
      // mémorise le modèle valide pour les prochaines analyses
      config.settings.model = out.model;
      saveConfig();
    }
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Délai dépassé (180s) — réessayez avec moins d’images.' : e.message;
    return res.status(502).json({ error: `Appel IA impossible : ${msg}` });
  }

  const parsed = extractJson(aiRaw);
  const coh = parsed ? enforceCoherence(parsed, config.settings) : { fixes: [], ratiosParTP: [] };
  const coherenceFixes = coh.fixes;

  // garde-fou macro : avertissement blackout si un événement High pertinent est imminent
  let evenementsProches = [];
  try {
    evenementsProches = highImpact;
    if (parsed) {
      const bm = coerceNum(config.settings.blackoutMinutes);
      const blackout = bm == null ? 60 : bm;
      const danger = highImpact.filter(e => e.minutesUntil <= blackout);
      if (danger.length) {
        const warns = danger.map(e => `⛔ FENÊTRE À ÉVITER : ${e.title} (${e.country}) dans ${e.minutesUntil} min — volatilité extrême attendue.`);
        parsed.avertissements = Array.isArray(parsed.avertissements) ? parsed.avertissements.concat(warns) : warns;
      }
    }
  } catch { /* pas bloquant */ }
  // réponse coupée par la limite de longueur ? (le JSON a alors été réparé)
  const cleanRaw = String(aiRaw || '').trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  const truncated = !!parsed && cleanRaw.length > 0 && !cleanRaw.endsWith('}');

  // sauvegarde des images
  const savedFiles = [];
  for (const img of images) {
    try {
      const m = img.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
      if (!m) continue;
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(m[2], 'base64'));
      savedFiles.push(name);
    } catch { /* non bloquant */ }
  }

  // Consensus entre l'IA principale et les IA supplémentaires (plans exploitables seulement)
  let consensus = null;
  if (wantCompare) {
    const plans = [{ name: 'Principale', result: parsed }, ...comparisons]
      .filter(c => c.result && c.result.biais)
      .map(c => ({
        name: c.name,
        biais: String(c.result.biais).toUpperCase().includes('ACHAT') ? 'ACHAT'
             : String(c.result.biais).toUpperCase().includes('VENTE') ? 'VENTE' : 'NEUTRE',
        confiance: coerceNum(c.result.confiance),
        entree: coerceNum(c.result.entree),
        stopLoss: coerceNum(c.result.stopLoss),
        tp1: Array.isArray(c.result.takeProfits) && c.result.takeProfits[0] ? coerceNum(c.result.takeProfits[0].niveau) : null,
        rr: coerceNum(c.result.ratioRisqueRendement)
      }));
    if (plans.length >= 2) {
      const count = k => plans.filter(p => p[k] != null).map(p => p[k]);
      const median = arr => {
        if (!arr.length) return null;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 1e4) / 1e4;
      };
      const votes = { ACHAT: 0, VENTE: 0, NEUTRE: 0 };
      plans.forEach(p => votes[p.biais]++);
      const [topBias, topN] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
      consensus = {
        n: plans.length,
        votes,
        // majorité STRICTE : à égalité (ex. 1 achat / 1 vente), c'est un désaccord
        biais: topN / plans.length > 0.5 ? topBias : 'DÉSACCORD',
        confianceMoyenne: count('confiance').length
          ? Math.round(count('confiance').reduce((a, b) => a + b, 0) / count('confiance').length) : null,
        entreeMediane: median(count('entree')),
        stopLossMedian: median(count('stopLoss')),
        tp1Median: median(count('tp1')),
        rrMoyen: count('rr').length ? Math.round((count('rr').reduce((a, b) => a + b, 0) / count('rr').length) * 100) / 100 : null
      };
    }
  }

  const entry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    model: modelUsed,
    params: { asset: asset || null, timeframe: timeframe || null, notes: notes || '', direction: direction || 'aucun' },
    images: savedFiles,
    result: parsed,
    raw: parsed ? null : aiRaw,
    coherenceFixes: coh.fixes,
    ratiosParTP: coh.ratiosParTP,
    taillePosition: (parsed && parsed.taillePosition) || null,
    macroEvents: highImpact,
    comparisons,
    consensus
  };

  const analyses = loadAnalyses();
  analyses.unshift(entry);
  saveJson(ANALYSES_FILE, analyses.slice(0, 100));

  res.json({
    ...entry,
    truncated,
    usage,
    coherenceFixes,
    evenementsProches,
    macroEvents: evenementsProches,
    warning: !parsed
      ? 'L’IA n’a pas renvoyé un JSON exploitable ; réponse brute affichée.'
      : truncated
        ? 'La réponse de l’IA a été coupée par la limite de longueur : les niveaux (entrée, SL, TP) sont exploitables, mais l’analyse écrite peut être incomplète. Relancez l’analyse pour un texte complet.'
        : null
  });
});

// ---------------------------------------------------------------------------
// Historique
// ---------------------------------------------------------------------------
app.get('/api/analyses', (req, res) => {
  res.json(loadAnalyses());
});

app.get('/api/analyses/:id', (req, res) => {
  const e = loadAnalyses().find(a => a.id === req.params.id);
  if (!e) return res.status(404).json({ error: 'Analyse introuvable.' });
  res.json(e);
});

app.delete('/api/analyses/:id', (req, res) => {
  let analyses = loadAnalyses();
  const e = analyses.find(a => a.id === req.params.id);
  if (!e) return res.status(404).json({ error: 'Analyse introuvable.' });
  for (const f of e.images || []) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); } catch { /* ignore */ }
  }
  saveJson(ANALYSES_FILE, analyses.filter(a => a.id !== req.params.id));
  res.json({ ok: true });
});

// Liste des modèles réellement disponibles sur le compte de l'utilisateur
app.post('/api/models', async (req, res) => {
  const body = req.body || {};
  const url = ((body.baseUrl || config.settings.baseUrl) || '').replace(/\/+$/, '');
  const key = resolveKeyFor(body, config.settings.baseUrl, config.settings.apiKey);
  if (!url) return res.status(400).json({ error: 'URL de base manquante.' });
  if (!key) return res.status(400).json({ error: 'Collez d’abord votre clé API (champ Clé API ci-dessus), puis listez les modèles.' });
  try {
    const r = await fetchWithTimeout(`${url}/models`, { headers: { Authorization: `Bearer ${key}` } }, 20000);
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = (j && j.error && (j.error.message || j.error.code)) || `HTTP ${r.status}`;
      return res.status(r.status).json({ error: `Erreur API (${r.status}) : ${msg}` });
    }
    const models = Array.isArray(j && j.data) ? j.data.map(m => m.id).filter(Boolean).sort() : [];
    res.json({ models });
  } catch (e) {
    res.status(502).json({ error: `Récupération impossible : ${e.message}` });
  }
});

// ---------------------------------------------------------------------------
// Journal de trades
// ---------------------------------------------------------------------------
const TRADES_FILE = path.join(DATA_DIR, 'trades.json');
function loadTrades() {
  const t = loadJson(TRADES_FILE, []);
  return Array.isArray(t) ? t : [];
}

const TRADE_STATUTS = ['planifié', 'fillé', 'annulé', 'expiré', 'clôturé'];
const TRADE_SORTIES = ['TP1', 'TP2', 'TP3', 'SL', 'manuel'];

// P&L automatique, recalculé à chaque PUT :
// ACHAT → (prixSortie - prixEntreeReel) / (prixEntreeReel - stopLoss)
// VENTE → (prixEntreeReel - prixSortie) / (stopLoss - prixEntreeReel)
// Garde : dénominateur > 0. pnlUsd = pnlR × risqueMonetaire du trade.
function computePnL(t) {
  const biais = String(t.biais || '').toUpperCase();
  const entree = coerceNum(t.prixEntreeReel != null ? t.prixEntreeReel : t.niveaux && t.niveaux.entree);
  const sortie = coerceNum(t.sortie && t.sortie.prix);
  const sl = coerceNum(t.niveaux && t.niveaux.stopLoss);
  if (entree == null || sortie == null || sl == null) return null;
  let r;
  if (biais.includes('VENTE')) {
    const den = sl - entree;
    if (!(den > 0)) return null;
    r = (entree - sortie) / den;
  } else {
    const den = entree - sl;
    if (!(den > 0)) return null;
    r = (sortie - entree) / den;
  }
  r = Math.round(r * 100) / 100;
  // risque monétaire : champ dédié, sinon taille × distance (formule du brief)
  let risque = coerceNum(t.risqueMonetaire);
  if (risque == null) {
    const taille = coerceNum(t.taille);
    if (taille != null) risque = Math.round(taille * Math.abs(entree - sl) * 100) / 100;
  }
  const usd = risque != null ? Math.round(r * risque * 100) / 100 : null;
  return { r, usd };
}

app.get('/api/trades', (req, res) => {
  res.json(loadTrades());
});

app.post('/api/trades', (req, res) => {
  const b = req.body || {};
  if (!b.analysisId) return res.status(400).json({ error: 'analysisId requis.' });
  const an = loadAnalyses().find(a => a.id === b.analysisId);
  if (!an) return res.status(404).json({ error: 'Analyse introuvable.' });
  const trades = loadTrades();
  const existing = trades.find(t => t.analysisId === b.analysisId);
  if (existing) return res.json({ ...existing, _created: false });

  const r = an.result || {};
  const trade = {
    id: crypto.randomUUID(),
    analysisId: an.id,
    date: new Date().toISOString(),
    asset: r.actif || (an.params && an.params.asset) || '',
    biais: r.biais || 'NEUTRE',
    modele: an.model || '',
    niveaux: {
      entree: coerceNum(r.entree),
      zoneEntree: {
        min: r.zoneEntree ? coerceNum(r.zoneEntree.min) : null,
        max: r.zoneEntree ? coerceNum(r.zoneEntree.max) : null
      },
      stopLoss: coerceNum(r.stopLoss),
      takeProfits: (Array.isArray(r.takeProfits) ? r.takeProfits : []).map(t => coerceNum(t && t.niveau))
    },
    taille: (r.taillePosition && coerceNum(r.taillePosition.unites)) || null,
    risqueMonetaire: (r.taillePosition && coerceNum(r.taillePosition.risqueMonetaire)) || null,
    statut: 'planifié',
    prixEntreeReel: null,
    sortie: { type: null, prix: null },
    raisonNonTrade: '',
    checklistValidated: false,
    pnlUsd: null,
    pnlR: null
  };
  trades.unshift(trade);
  saveJson(TRADES_FILE, trades);
  res.json({ ...trade, _created: true });
});

app.put('/api/trades/:id', (req, res) => {
  const trades = loadTrades();
  const t = trades.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Trade introuvable.' });
  const b = req.body || {};
  if (b.statut !== undefined && TRADE_STATUTS.includes(b.statut)) t.statut = b.statut;
  if (b.prixEntreeReel !== undefined) t.prixEntreeReel = coerceNum(b.prixEntreeReel);
  if (b.sortie !== undefined && typeof b.sortie === 'object' && b.sortie !== null) {
    t.sortie = {
      type: TRADE_SORTIES.includes(b.sortie.type) ? b.sortie.type : null,
      prix: coerceNum(b.sortie.prix)
    };
  }
  if (b.raisonNonTrade !== undefined) t.raisonNonTrade = String(b.raisonNonTrade).slice(0, 300);
  if (b.taille !== undefined) t.taille = coerceNum(b.taille);
  if (b.checklistValidated !== undefined) t.checklistValidated = !!b.checklistValidated;
  // une sortie avec prix clôt le trade automatiquement
  if (t.sortie && t.sortie.type && t.sortie.prix != null && !['annulé', 'expiré'].includes(t.statut)) {
    t.statut = 'clôturé';
  }
  const p = computePnL(t);
  t.pnlR = p ? p.r : null;
  t.pnlUsd = p ? p.usd : null;
  saveJson(TRADES_FILE, trades);
  res.json(t);
});

// ---------------------------------------------------------------------------
// Sauvegarde : ZIP "store" (sans compression) en Node pur, zéro dépendance
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(files) {
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);            // méthode store
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(f.data.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, f.data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(f.data.length, 20);
    cd.writeUInt32LE(f.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + f.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

app.get('/api/backup', (req, res) => {
  try {
    const files = [];
    const add = (name, file) => {
      try { files.push({ name, data: fs.readFileSync(path.join(DATA_DIR, file)) }); } catch { /* fichier absent */ }
    };
    add('config.json', 'config.json');
    add('analyses.json', 'analyses.json');
    add('trades.json', 'trades.json');
    if (req.query.includeUploads === '1') {
      try {
        for (const f of fs.readdirSync(UPLOADS_DIR)) {
          const p = path.join(UPLOADS_DIR, f);
          if (fs.statSync(p).isFile()) files.push({ name: 'uploads/' + f, data: fs.readFileSync(p) });
        }
      } catch { /* dossier absent */ }
    }
    const zip = buildZip(files);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="tradewee-backup-${new Date().toISOString().slice(0, 10)}.zip"`);
    res.send(zip);
  } catch (e) {
    res.status(500).json({ error: `Sauvegarde impossible : ${e.message}` });
  }
});

// ---------------------------------------------------------------------------
// Marché : cotations temps réel + surveillances de prix
// ---------------------------------------------------------------------------
const COINGECKO_IDS = { BTCUSD: 'bitcoin', ETHUSD: 'ethereum', SOLUSD: 'solana', XAUUSD: 'pax-gold', XAGUSD: 'tether-gold' };

async function fetchQuotes(symbols) {
  const out = {};
  const crypto = [], forex = [];
  for (const s of symbols) {
    const S = String(s).toUpperCase();
    if (COINGECKO_IDS[S]) crypto.push(S); else forex.push(S);
  }
  await Promise.allSettled([
    (async () => {
      if (!crypto.length) return;
      const ids = crypto.map(s => COINGECKO_IDS[s]).join(',');
      const r = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, {}, 10000);
      if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
      const j = await r.json();
      for (const s of crypto) {
        const p = j[COINGECKO_IDS[s]] && j[COINGECKO_IDS[s]].usd;
        if (p) out[s] = { price: p, source: 'CoinGecko' };
      }
    })(),
    (async () => {
      // inversion USD→X valable uniquement pour les paires « XXXUSD » ;
      // les paires croisées (EURJPY…) passent par fetchQuoteAny
      const usdPairs = forex.filter(s => s.slice(3, 6) === 'USD');
      const ccy = [...new Set(usdPairs.map(s => s.slice(0, 3)))];
      if (!usdPairs.length || !ccy.length) return;
      const r = await fetchWithTimeout(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${ccy.join(',')}`, {}, 10000);
      if (!r.ok) throw new Error(`Frankfurter HTTP ${r.status}`);
      const j = await r.json();
      for (const s of usdPairs) {
        // XXXUSD = combien de USD pour 1 XXX : la devise de base est la 1re moitié
        const base = s.slice(0, 3);
        const rate = j.rates && j.rates[base];
        if (rate > 0) out[s] = { price: Math.round((1 / rate) * 1e6) / 1e6, source: 'Frankfurter (BCE)' };
      }
    })()
  ]);
  return out;
}

// FX paires exotiques : Frankfurter (BCE) ne couvre pas tout — gestion par inversion
// ex. USDJPY : base=USD symbols=JPY → rates.JPY = prix d'1 USD en JPY → paire = ce taux direct
async function fetchQuoteAny(symbol) {
  const S = String(symbol).toUpperCase();
  const direct = await fetchQuotes([S]);
  if (direct[S]) return direct[S];
  // paires croisées du type EURJPY : base=EUR cible=JPY via les deux taux USD
  const base = S.slice(0, 3), quote = S.slice(3, 6);
  const KNOWN = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY'];
  if (KNOWN.includes(base) && KNOWN.includes(quote)) {
    try {
      const r = await fetchWithTimeout(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quote}`, {}, 10000);
      if (r.ok) {
        const j = await r.json();
        const v = j.rates && j.rates[quote];
        if (v > 0) return { price: v, source: 'Frankfurter (BCE)' };
      }
    } catch { /* ignore */ }
  }
  return null;
}

// Surveillances de prix : [{ id, symbol, condition 'above'|'below', target, createdAt, lastPrice, triggered, triggeredAt }]
const MONITORS_FILE = path.join(DATA_DIR, 'monitors.json');
function loadMonitors() {
  const m = loadJson(MONITORS_FILE, []);
  return Array.isArray(m) ? m : [];
}
function saveMonitors(list) {
  fs.writeFileSync(MONITORS_FILE, JSON.stringify(list.slice(0, 100), null, 2));
}

app.get('/api/monitors', (req, res) => {
  res.json(loadMonitors());
});

app.post('/api/monitors', (req, res) => {
  const b = req.body || {};
  const symbol = String(b.symbol || '').trim().toUpperCase();
  const condition = b.condition === 'below' ? 'below' : 'above';
  const target = coerceNum(b.target);
  if (!symbol) return res.status(400).json({ error: 'Symbole requis.' });
  if (target == null) return res.status(400).json({ error: 'Prix cible requis.' });
  const list = loadMonitors();
  const monitor = {
    id: crypto.randomUUID(),
    symbol,
    condition,
    target,
    createdAt: new Date().toISOString(),
    lastPrice: null,
    triggered: false,
    triggeredAt: null
  };
  list.unshift(monitor);
  saveMonitors(list);
  res.json(monitor);
});

app.delete('/api/monitors/:id', (req, res) => {
  const list = loadMonitors();
  const before = list.length;
  saveMonitors(list.filter(m => m.id !== req.params.id));
  if (list.length === before) return res.status(404).json({ error: 'Surveillance introuvable.' });
  res.json({ ok: true });
});

// Rafraîchit toutes les surveillances : cote chaque symbole, détecte les franchissements
async function pollMonitors() {
  const list = loadMonitors();
  const active = list.filter(m => !m.triggered);
  if (!active.length) return { refreshed: 0, alerts: [] };
  const symbols = [...new Set(active.map(m => m.symbol))];
  const quotes = {};
  await Promise.allSettled(symbols.map(async s => {
    const q = await fetchQuoteAny(s);
    if (q) quotes[s] = q.price;
  }));
  const alerts = [];
  const nowIso = new Date().toISOString();
  for (const m of active) {
    const price = quotes[m.symbol];
    if (price == null) continue;
    m.lastPrice = price;
    m.lastCheck = nowIso;
    if ((m.condition === 'above' && price >= m.target) || (m.condition === 'below' && price <= m.target)) {
      m.triggered = true;
      m.triggeredAt = nowIso;
      alerts.push({ symbol: m.symbol, condition: m.condition, target: m.target, price });
    }
  }
  saveMonitors(list);
  return { refreshed: active.length, quotes, alerts };
}

app.get('/api/monitors/poll', async (req, res) => {
  try {
    res.json(await pollMonitors());
  } catch (e) {
    res.status(502).json({ error: `Surveillance indisponible : ${e.message}` });
  }
});

app.get('/api/market/quotes', async (req, res) => {
  const symbols = String(req.query.symbols || 'BTCUSD,XAUUSD,EURUSD')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
  try {
    const quotes = await fetchQuotes(symbols);
    // compléter avec les paires croisées (EURJPY…) et les défauts manquants
    await Promise.allSettled(symbols.map(async s => {
      if (!quotes[s]) {
        const q = await fetchQuoteAny(s);
        if (q) quotes[s] = q;
      }
    }));
    res.json({ quotes, at: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: `Cotations indisponibles : ${e.message}` });
  }
});

// ---------------------------------------------------------------------------
// Monitoring du marché — vue d'ensemble (Fear & Greed, Altcoin Season,
// market cap global, dérivés Long/Short, tendances)
// Sources publiques sans clé : alternative.me, CoinGecko, Binance futures
// ---------------------------------------------------------------------------
let overviewCache = { at: 0, data: null };
const UA_BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' };

async function getJson(url, ms = 15000) {
  const r = await fetchWithTimeout(url, { headers: UA_BROWSER }, ms);
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.json();
}

function altcoinSeasonIndex(coins) {
  const alts = coins.filter(c => c.symbol.toUpperCase() !== 'BTC' && !/USDT|USDC|DAI|FDUSD|TUSD|BUSD|USD1/i.test(c.symbol));
  const btc = coins.find(c => c.symbol.toUpperCase() === 'BTC');
  if (!btc || btc.price_change_percentage_30d_in_currency == null || alts.length < 5) return null;
  const btcChg = btc.price_change_percentage_30d_in_currency;
  const out = alts.filter(c => (c.price_change_percentage_30d_in_currency ?? -Infinity) > btcChg).length;
  return Math.round((out / alts.length) * 100); // 75+ = saison altcoins, 25- = saison BTC
}

async function fetchOverview() {
  const [fngR, globalR, coinsR, derivR, lsR, trendR] = await Promise.allSettled([
    getJson('https://api.alternative.me/fng/?limit=1'),
    getJson('https://api.coingecko.com/api/v3/global'),
    getJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=30d'),
    getJson('https://api.coingecko.com/api/v3/derivatives?per_page=100'),
    getJson('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1d&limit=30'),
    getJson('https://api.coingecko.com/api/v3/search/trending')
  ]);

  const data = {};

  if (fngR.status === 'fulfilled' && fngR.value?.data?.[0]) {
    data.fearGreed = { value: Number(fngR.value.data[0].value), label: fngR.value.data[0].value_classification };
  }
  if (globalR.status === 'fulfilled' && globalR.value?.data) {
    const g = globalR.value.data;
    data.global = {
      mcap: g.total_market_cap?.usd ?? null,
      mcapChange24h: g.market_cap_change_percentage_24h_usd ?? null,
      volume: g.total_volume?.usd ?? null,
      btcDominance: g.market_cap_percentage?.btc ?? null,
      ethDominance: g.market_cap_percentage?.eth ?? null
    };
  }
  if (coinsR.status === 'fulfilled' && Array.isArray(coinsR.value)) {
    data.altcoinSeason = altcoinSeasonIndex(coinsR.value);
  }
  if (derivR.status === 'fulfilled' && Array.isArray(derivR.value)) {
    const oi = derivR.value.reduce((s, d) => s + (Number(d.open_interest) || 0), 0);
    data.derivatives = { openInterest: oi, exchanges: new Set(derivR.value.map(d => d.market)).size };
  }
  if (lsR.status === 'fulfilled' && Array.isArray(lsR.value) && lsR.value.length) {
    data.longShort = lsR.value.map(d => ({
      t: Number(d.timestamp) * 1000,
      long: Number(d.longShortRatio) / (1 + Number(d.longShortRatio)) * 100,
      short: 1 / (1 + Number(d.longShortRatio)) * 100,
      ratio: Number(d.longShortRatio)
    }));
  }
  if (trendR.status === 'fulfilled' && Array.isArray(trendR.value?.coins)) {
    data.trending = trendR.value.coins.slice(0, 7).map(c => ({
      id: c.item.id, symbol: c.item.symbol, name: c.item.name, rank: c.item.market_cap_rank,
      thumb: c.item.thumb,
      chg24h: c.item.data?.price_change_percentage_24h?.usd ?? null
    }));
  }
  return data;
}

app.get('/api/market/overview', async (req, res) => {
  if (overviewCache.data && Date.now() - overviewCache.at < 5 * 60 * 1000) {
    return res.json(overviewCache.data);
  }
  try {
    const data = await fetchOverview();
    if (!Object.keys(data).length) throw new Error('Aucune source répondue');
    // fusion : garder les blocs du cache précédent que les sources n'ont pas fourni (rate-limit…)
    if (overviewCache.data) {
      for (const k of Object.keys(overviewCache.data)) {
        if (data[k] == null) data[k] = overviewCache.data[k];
      }
    }
    overviewCache = { at: Date.now(), data };
  } catch (e) {
    if (overviewCache.data) return res.json(overviewCache.data); // repli sur l'ancien cache
    return res.status(502).json({ error: `Sources de marché indisponibles : ${e.message}` });
  }
  res.json(overviewCache.data);
});

// Historique market cap global (24h / 30d / all) — cache 15 min.
// L'endpoint officiel global/market_cap_chart est réservé aux clés payantes :
// on reconstruit l'histoire à partir des 8 premières cryptos, mise à l'échelle
// sur la capitalisation totale actuelle.
let mcapChartCache = {};
const MCAP_TOP_N = 8;

async function fetchMcapChart(days) {
  const d = days === 'max' ? '365' : days; // daily interval
  const interval = days === '1' ? '' : '&interval=daily';
  const markets = await getJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${MCAP_TOP_N}&page=1`);
  if (!Array.isArray(markets) || !markets.length) throw new Error('Marchés indisponibles');
  const totalMcap = markets.reduce((s, c) => s + (c.market_cap || 0), 0);

  // appels séquentiels (CoinGecko limite les rafales) + reprise sur erreur
  const bucket = days === '1' ? 3600e3 : 86400e3; // regrouper par heure ou par jour
  const series = []; // [{ mcap, prices: Map<bucket, prix>}]
  for (const c of markets) {
    if (!c.market_cap) continue;
    let P = null;
    for (let att = 0; att < 2 && !P; att++) {
      try {
        const ch = await getJson(`https://api.coingecko.com/api/v3/coins/${c.id}/market_chart?vs_currency=usd&days=${d}${interval}`, 20000);
        if (Array.isArray(ch?.prices) && ch.prices.length) P = ch.prices;
        else if (att === 0) await new Promise(r => setTimeout(r, 1200));
      } catch {
        if (att === 0) await new Promise(r => setTimeout(r, 1200));
      }
    }
    if (!P) continue;
    const prices = new Map();
    for (const [t, v] of P) {
      if (v) prices.set(Math.floor(t / bucket) * bucket, v);
    }
    if (prices.size) series.push({ mcap: c.market_cap, prices });
  }
  if (series.length < 2) throw new Error('Historique indisponible');

  // intersection des buckets présents dans TOUTES les séries retenues
  let buckets = [...series[0].prices.keys()];
  for (const s of series.slice(1)) {
    buckets = buckets.filter(b => s.prices.has(b));
  }
  buckets.sort((a, b) => a - b);
  if (buckets.length < 5) throw new Error('Historique incomplet');

  // indice pondéré par les parts de marché, base 100 au premier bucket commun,
  // puis ramené à la capitalisation totale actuelle du marché
  const wSum = series.reduce((s, x) => s + x.mcap, 0);
  const prices = buckets.map(b => {
    const idx = series.reduce((s, x) => s + x.mcap * (x.prices.get(b) / x.prices.get(buckets[0])), 0);
    return { t: b, v: (idx / wSum) * totalMcap };
  });
  return { prices, volumes: [] };
}

app.get('/api/market/mcap-chart', async (req, res) => {
  const days = ['1', '30', 'max'].includes(String(req.query.days)) ? String(req.query.days) : '30';
  const c = mcapChartCache[days];
  if (c && Date.now() - c.at < 15 * 60 * 1000) return res.json(c.data);
  try {
    const data = await fetchMcapChart(days);
    mcapChartCache[days] = { at: Date.now(), data };
    res.json(data);
  } catch (e) {
    if (c) return res.json(c.data); // repli sur un cache périmé plutôt qu'une erreur
    res.status(502).json({ error: `Historique indisponible : ${e.message}` });
  }
});

// ---------------------------------------------------------------------------
// Calendrier économique (ForexFactory, JSON public)
// ---------------------------------------------------------------------------
let calCache = { at: 0, events: null };
async function refreshCalendar() {
  if (!calCache.events || Date.now() - calCache.at > 10 * 60 * 1000) {
    const urls = [
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      'https://nfs.faireconomy.media/ff_calendar_nextweek.json'
    ];
    const events = [];
    await Promise.all(urls.map(async u => {
      try {
        const r = await fetchWithTimeout(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 15000);
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j)) events.push(...j);
        }
      } catch { /* tolérant */ }
    }));
    if (events.length === 0) throw new Error('Aucun événement récupéré');
    calCache = { at: Date.now(), events };
  }
  return calCache.events;
}

// Devises → libellés "country" possibles dans le flux ForexFactory (code ou nom complet)
const COUNTRY_BY_CCY = {
  USD: ['USD', 'United States'],
  EUR: ['EUR', 'Euro Zone'],
  GBP: ['GBP', 'United Kingdom'],
  JPY: ['JPY', 'Japan'],
  CHF: ['CHF', 'Switzerland'],
  CAD: ['CAD', 'Canada'],
  AUD: ['AUD', 'Australia'],
  NZD: ['NZD', 'New Zealand']
};

function relevantCountries(symbol) {
  const s = String(symbol || '').toUpperCase();
  const out = new Set();
  for (const ccy of Object.keys(COUNTRY_BY_CCY)) {
    if (s.includes(ccy)) COUNTRY_BY_CCY[ccy].forEach(c => out.add(c));
  }
  if (out.size === 0) out.add('USD'); // crypto, indices, or… : macro US par défaut
  return [...out];
}

// Événements ForexFactory à fort impact pertinents pour l'actif, dans les 24 h.
async function getHighImpactEvents(symbol) {
  await refreshCalendar();
  const now = Date.now();
  const countries = relevantCountries(symbol);
  return (calCache.events || [])
    .filter(e => e && e.impact === 'High' && e.date && countries.includes(e.country))
    .map(e => ({ title: e.title, country: e.country, date: e.date, t: new Date(e.date).getTime() }))
    .filter(e => Number.isFinite(e.t) && e.t > now && e.t - now <= 24 * 3600 * 1000)
    .sort((a, b) => a.t - b.t)
    .map(({ title, country, date, t }) => ({ title, country, date, minutesUntil: Math.max(0, Math.round((t - now) / 60000)) }));
}

app.get('/api/calendar', async (req, res) => {
  try {
    res.json(await refreshCalendar());
  } catch (e) {
    res.status(502).json({ error: `Calendrier indisponible : ${e.message}` });
  }
});

app.get('/api/macro-events', async (req, res) => {
  try {
    res.json(await getHighImpactEvents(req.query.symbol || 'BTCUSD'));
  } catch (e) {
    res.status(502).json({ error: `Événements macro indisponibles : ${e.message}` });
  }
});

// Compteurs de discipline : trades du jour / de la semaine, pertes consécutives
app.get('/api/trading-limits', (req, res) => {
  const trades = loadTrades();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const tradesToday = trades.filter(t => t.date && t.date.startsWith(today) && t.statut !== 'annulé').length;
  const tradesThisWeek = trades.filter(t => t.date && new Date(t.date) >= weekAgo && t.statut !== 'annulé').length;

  // série en cours de pertes consécutives (du plus récent au plus ancien, trades clôturés)
  let consecutiveLosses = 0;
  for (const t of [...trades].sort((a, b) => new Date(b.date) - new Date(a.date))) {
    if (t.statut !== 'clôturé' || t.pnlR == null) continue;
    if (t.pnlR < 0) consecutiveLosses++;
    else break;
  }

  res.json({
    tradesToday,
    tradesThisWeek,
    consecutiveLosses,
    limits: {
      maxTradesPerDay: config.settings.maxTradesPerDay || 3,
      maxTradesPerWeek: config.settings.maxTradesPerWeek || 10,
      maxLossesConsecutive: config.settings.maxLossesConsecutive || 2
    }
  });
});

// Performance par modèle IA (trades clôturés uniquement)
app.get('/api/trades/stats-by-model', (req, res) => {
  const stats = {};
  for (const t of loadTrades()) {
    if (t.statut !== 'clôturé' || t.pnlR == null) continue;
    const model = t.modele || 'inconnu';
    if (!stats[model]) stats[model] = { count: 0, wins: 0, totalR: 0, bestR: -Infinity, worstR: Infinity };
    stats[model].count++;
    if (t.pnlR > 0) stats[model].wins++;
    stats[model].totalR += t.pnlR;
    stats[model].bestR = Math.max(stats[model].bestR, t.pnlR);
    stats[model].worstR = Math.min(stats[model].worstR, t.pnlR);
  }
  const result = Object.entries(stats).map(([model, s]) => ({
    model,
    count: s.count,
    winrate: Math.round((s.wins / s.count) * 100),
    avgR: Math.round((s.totalR / s.count) * 100) / 100,
    totalR: Math.round(s.totalR * 100) / 100,
    bestTrade: s.bestR === -Infinity ? 0 : s.bestR,
    worstTrade: s.worstR === Infinity ? 0 : s.worstR
  })).sort((a, b) => b.totalR - a.totalR);
  res.json(result);
});

// Prix temps réel (CoinGecko, gratuit, sans clé) pour le backtest visuel
app.get('/api/trades/:id/current-price', async (req, res) => {
  const symbol = String(req.query.symbol || 'BTCUSD').toUpperCase();
  const coinMap = { BTCUSD: 'bitcoin', ETHUSD: 'ethereum', XAUUSD: 'pax-gold' };
  const coinId = coinMap[symbol];
  if (!coinId) return res.json({ price: null, error: 'Actif non supporté pour le prix en temps réel (BTC, ETH, XAU uniquement).' });
  try {
    const r = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`, {}, 10000);
    if (!r.ok) return res.json({ price: null, error: `Prix indisponible (HTTP ${r.status}).` });
    const j = await r.json();
    const price = j[coinId] && j[coinId].usd;
    res.json({ price: price || null, error: price ? null : 'Prix indisponible.' });
  } catch (e) {
    res.json({ price: null, error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Alertes FinancialJuice (RSS)
// ---------------------------------------------------------------------------
let fjCache = { at: 0, items: null, stale: false };
async function getFinancialJuice() {
  if (fjCache.items && Date.now() - fjCache.at < 25 * 1000) return fjCache.items;
  try {
    const r = await fetchWithTimeout('https://www.financialjuice.com/feed.ashx?xy=rss', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' }
    }, 15000);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    const items = xml.split('<item>').slice(1).map(chunk => {
      let title = xmlTag('title', chunk).replace(/^FinancialJuice:\s*/i, '');
      return {
        id: xmlTag('guid', chunk) || xmlTag('link', chunk) || title,
        title,
        link: xmlTag('link', chunk),
        date: xmlTag('pubDate', chunk)
      };
    }).filter(i => i.title);
    if (!items.length) throw new Error('flux vide');
    fjCache = { at: Date.now(), items, stale: false };
    return items;
  } catch (e) {
    // limite de débit ou panne passagère : on ressert la dernière liste connue
    if (fjCache.items) {
      fjCache.stale = true;
      return fjCache.items;
    }
    throw e;
  }
}

app.get('/api/alerts', async (req, res) => {
  try {
    const items = await getFinancialJuice();
    res.json(items);
  } catch (e) {
    res.status(502).json({ error: `Alertes FinancialJuice indisponibles : ${e.message}` });
  }
});

// ---------------------------------------------------------------------------
app.listen(PORT, HOST, () => {
  const shown = IS_LOOPBACK ? 'localhost' : HOST;
  console.log(`\n  Tradewee App démarrée : http://${shown}:${PORT}${APP_PASSWORD ? ' (mot de passe actif)' : ''}\n`);
  if (process.platform === 'win32' && IS_LOOPBACK && !process.env.NO_OPEN) {
    require('child_process').exec(`start "" http://localhost:${PORT}`);
  }
});

module.exports = { resolveModel, extractJson, repairTruncatedJson };
