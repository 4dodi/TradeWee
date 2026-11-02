/**
 * Google Sheets : enregistre les analyses dans une feuille de calcul.
 *
 * Pas de compte Google Cloud ni d'OAuth : l'utilisateur colle une fois un petit
 * script Apps Script (public/sheets/tradewee-sheets.gs) dans SA feuille et le
 * déploie en « application Web ». Tradewee envoie ensuite chaque analyse à
 * l'URL de ce déploiement, avec un jeton secret que le script vérifie.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Seules les URL de déploiement Apps Script sont acceptées (aucune requête vers d'autres hôtes)
const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const REDIRECT_HOSTS = new Set(['script.googleusercontent.com', 'script.google.com']);
const TEMPLATE = path.join(__dirname, 'public', 'sheets', 'tradewee-sheets.gs');
const MAX_CELL = 45000; // une cellule Google Sheets contient au plus 50 000 caractères

const HEADERS = {
  en: ['Date', 'Asset', 'Timeframe', 'Source', 'Bias', 'Confidence %', 'Entry', 'Entry zone low', 'Entry zone high', 'Stop loss',
    'TP1', 'TP2', 'TP3', 'R:R (TP1)', 'Position size (units)', 'Risk amount', 'AI model', 'Language', 'Patterns',
    'Technical analysis', 'Fundamental analysis', 'Invalidation', 'Management', 'Warnings', 'Notes', 'Tradewee ID'],
  fr: ['Date', 'Actif', 'Unité de temps', 'Source', 'Biais', 'Confiance %', 'Entrée', 'Zone d’entrée basse', 'Zone d’entrée haute', 'Stop loss',
    'TP1', 'TP2', 'TP3', 'R:R (TP1)', 'Taille de position (unités)', 'Montant risqué', 'Modèle IA', 'Langue', 'Figures',
    'Analyse technique', 'Analyse fondamentale', 'Invalidation', 'Gestion', 'Avertissements', 'Notes', 'ID Tradewee']
};

function setupSheets({ app, getSettings, saveSettings, fetchWithTimeout, loadAnalyses, saveAnalyses, toEnglish }) {
  const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : '';
  };
  // Texte sûr pour une cellule : jamais interprété comme une formule, longueur bornée
  const text = (v) => {
    let s = Array.isArray(v) ? v.filter(x => x != null && x !== '').join('\n') : String(v ?? '');
    if (s.length > MAX_CELL) s = s.slice(0, MAX_CELL) + '…';
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  };

  function buildRow(e, lang) {
    const src = (e.lang === 'en' || e.lang === 'fr') ? e.lang : 'fr';
    const useTr = lang !== src && e.translations && e.translations[lang];
    const r = useTr ? e.translations[lang] : e.result;
    const outLang = useTr ? lang : src;
    const en = lang === 'en';
    const b = String(r.biais || '').toUpperCase();
    const bias = b.includes('ACHAT') ? (en ? 'BUY' : 'ACHAT') : b.includes('VENTE') ? (en ? 'SELL' : 'VENTE') : (en ? 'NEUTRAL' : 'NEUTRE');
    const tps = (r.takeProfits || []).map(tp => num(tp && tp.niveau));
    const d = new Date(e.date);
    const pad = (x) => String(x).padStart(2, '0');
    const date = isNaN(d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const size = r.taillePosition || e.taillePosition || {};
    // les avertissements ajoutés par le serveur sont en français : traduits si besoin
    const warnings = (r.avertissements || []).map(w => (en && toEnglish) ? toEnglish(w) : w);
    const source = (e.params && e.params.source) === 'tradingview' ? 'TradingView' : (en ? 'Screenshot' : 'Capture');
    return [
      text(date), text(r.actif || (e.params && e.params.asset) || ''), text(r.uniteDeTemps || (e.params && e.params.timeframe) || ''),
      text(source), text(bias), num(r.confiance), num(r.entree),
      num(r.zoneEntree && r.zoneEntree.min), num(r.zoneEntree && r.zoneEntree.max), num(r.stopLoss),
      tps[0] ?? '', tps[1] ?? '', tps[2] ?? '', num(r.ratioRisqueRendement), num(size.unites), num(size.risqueMonetaire),
      text(e.model || ''), text(outLang.toUpperCase()), text(r.figuresDetectees || []),
      text(r.analyseTechnique), text(r.analyseFondamentale), text(r.invalidation), text(r.gestion),
      text(warnings), text((e.params && e.params.notes) || ''), text(e.id)
    ];
  }

  // POST vers Apps Script : Google répond par une redirection vers le résultat (suivie en GET)
  async function callScript(url, payload) {
    let r = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }, 30000);
    for (let hops = 0; hops < 3 && r.status >= 300 && r.status < 400; hops++) {
      const loc = r.headers && (typeof r.headers.get === 'function' ? r.headers.get('location') : r.headers.location);
      if (!loc) break;
      const next = new URL(loc, url);
      if (next.protocol !== 'https:' || !REDIRECT_HOSTS.has(next.hostname)) throw new Error('Redirection Google inattendue.');
      r = await fetchWithTimeout(next.toString(), {}, 30000);
    }
    const body = await r.text();
    let j = null;
    try { j = JSON.parse(body); } catch { /* page HTML : déploiement mal configuré */ }
    if (!j) {
      throw new Error(r.status === 401 || r.status === 403 || /accounts\.google\.com|ServiceLogin/i.test(body)
        ? 'Google refuse l’accès : redéployez le script avec « Qui a accès : Tout le monde ».'
        : `Réponse inattendue de Google (HTTP ${r.status}) : vérifiez l’URL de l’application Web.`);
    }
    if (!j.ok) {
      throw new Error(j.error === 'Invalid token'
        ? 'Jeton refusé : recopiez le script depuis Tradewee dans votre feuille, puis redéployez-le.'
        : `Erreur du script Google : ${j.error || 'inconnue'}`);
    }
    return j;
  }

  async function saveEntry(e, lang) {
    const s = getSettings();
    if (!s.sheetsUrl || !s.sheetsToken) throw new Error('Google Sheets n’est pas connecté (Réglages).');
    if (!e.result) throw new Error('Rien à enregistrer : cette analyse n’a pas de plan.');
    const j = await callScript(s.sheetsUrl, {
      token: s.sheetsToken, action: 'save', id: e.id,
      headers: HEADERS[lang] || HEADERS.en, row: buildRow(e, lang)
    });
    // mémorise l'enregistrement dans l'historique
    const list = loadAnalyses();
    const cur = list.find(a => a.id === e.id);
    if (cur) {
      cur.sheetsSavedAt = new Date().toISOString();
      saveAnalyses(list);
    }
    return { entry: cur || e, row: j.row, updated: !!j.updated, sheetUrl: j.sheetUrl };
  }

  const ensureToken = () => {
    if (!getSettings().sheetsToken) saveSettings({ sheetsToken: crypto.randomBytes(24).toString('base64url') });
    return getSettings().sheetsToken;
  };

  // ---- Routes (derrière le mot de passe, comme le reste de l'API) ----
  app.get('/api/sheets/status', (req, res) => {
    const s = getSettings();
    res.json({ connected: !!s.sheetsUrl, url: s.sheetsUrl || '', name: s.sheetsName || '', sheetUrl: s.sheetsSheetUrl || '', auto: !!s.sheetsAuto });
  });

  // Script Apps Script avec le jeton de l'utilisateur déjà renseigné
  app.get('/api/sheets/script', (req, res) => {
    try {
      const code = fs.readFileSync(TEMPLATE, 'utf8').replace('{{TOKEN}}', ensureToken());
      res.type('text/plain; charset=utf-8').send(code);
    } catch (e) {
      res.status(500).json({ error: `Script introuvable : ${e.message}` });
    }
  });

  app.post('/api/sheets/connect', async (req, res) => {
    const url = String((req.body && req.body.url) || '').trim();
    if (!URL_RE.test(url)) {
      return res.status(400).json({ error: 'URL invalide : collez l’« URL de l’application Web » (https://script.google.com/macros/s/…/exec).' });
    }
    try {
      const j = await callScript(url, { token: ensureToken(), action: 'ping' });
      saveSettings({ sheetsUrl: url, sheetsName: String(j.name || '').slice(0, 120), sheetsSheetUrl: String(j.sheetUrl || '').slice(0, 300) });
      res.json({ ok: true, name: j.name || '', sheetUrl: j.sheetUrl || '' });
    } catch (e) {
      res.status(502).json({ error: `Connexion à Google Sheets impossible : ${e.message}` });
    }
  });

  app.post('/api/sheets/disconnect', (req, res) => {
    saveSettings({ sheetsUrl: '', sheetsName: '', sheetsSheetUrl: '', sheetsAuto: false });
    res.json({ ok: true });
  });

  app.put('/api/sheets/auto', (req, res) => {
    saveSettings({ sheetsAuto: !!(req.body && req.body.auto) });
    res.json({ ok: true, auto: getSettings().sheetsAuto });
  });

  app.post('/api/sheets/save/:id', async (req, res) => {
    const e = loadAnalyses().find(a => a.id === req.params.id);
    if (!e) return res.status(404).json({ error: 'Analyse introuvable.' });
    try {
      res.json(await saveEntry(e, (req.body && req.body.lang) === 'fr' ? 'fr' : 'en'));
    } catch (err) {
      res.status(502).json({ error: `Enregistrement dans Google Sheets impossible : ${err.message}` });
    }
  });

  // Enregistrement automatique après chaque nouvelle analyse (si activé) — jamais bloquant
  function autoSave(entry, lang) {
    const s = getSettings();
    if (!s.sheetsAuto || !s.sheetsUrl || !entry || !entry.result) return;
    saveEntry(entry, lang).catch(err => console.warn(`[Sheets] enregistrement automatique impossible : ${err.message}`));
  }

  return { autoSave, buildRow, URL_RE };
}

module.exports = { setupSheets, URL_RE };
