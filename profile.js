/**
 * Profil du trader : instructions personnelles envoyées à l'IA à chaque analyse.
 *
 * Stocké dans data/profile.json (jamais versionné) sous forme de blocs :
 *   { enabled, blocks: [{ id, title, text, enabled, assets }] }
 * « assets » limite un bloc à certains actifs (ex. « BTCUSD » pour des niveaux
 * propres au Bitcoin) ; vide = tous les actifs.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIMITS = { blocks: 60, title: 120, text: 8000, total: 60000, assets: 200 };

function setupProfile({ app, dataDir }) {
  const FILE = path.join(dataDir, 'profile.json');

  const load = () => {
    try {
      const p = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      return { enabled: p.enabled !== false, blocks: Array.isArray(p.blocks) ? p.blocks : [] };
    } catch { return { enabled: true, blocks: [] }; }
  };
  const save = (p) => fs.writeFileSync(FILE, JSON.stringify(p, null, 2), 'utf8');

  // Normalisation d'un symbole pour la comparaison : BINANCE:BTCUSDT → BTCUSD
  const norm = (s) => String(s || '').toUpperCase().split(':').pop().replace(/[^A-Z0-9]/g, '').replace(/USDT$|USDC$/, 'USD');
  const appliesTo = (block, asset) => {
    const list = String(block.assets || '').split(/[,\s;]+/).map(norm).filter(Boolean);
    if (!list.length) return true;          // pas de filtre : tous les actifs
    const a = norm(asset);
    return !!a && list.includes(a);         // filtre défini mais actif inconnu : bloc ignoré
  };

  function sanitize(body) {
    const blocks = (Array.isArray(body.blocks) ? body.blocks : []).slice(0, LIMITS.blocks).map(b => ({
      id: /^[A-Za-z0-9-]{8,40}$/.test(String(b.id || '')) ? String(b.id) : crypto.randomUUID(),
      title: String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.title),
      text: String(b.text || '').replace(/\r\n/g, '\n').trim().slice(0, LIMITS.text),
      enabled: b.enabled !== false,
      assets: String(b.assets || '').toUpperCase().replace(/[^A-Z0-9.,;:\s/-]/g, '').trim().slice(0, LIMITS.assets)
    })).filter(b => b.title || b.text);
    const total = blocks.reduce((n, b) => n + b.title.length + b.text.length, 0);
    if (total > LIMITS.total) throw new Error(`Profil trop long (${total} caractères, maximum ${LIMITS.total}).`);
    return { enabled: body.enabled !== false, blocks };
  }

  /**
   * Texte ajouté aux instructions système de l'IA.
   * Retourne { text, count } — count = nombre de blocs appliqués.
   */
  function buildProfileBlock(asset, lang) {
    const p = load();
    if (!p.enabled) return { text: '', count: 0 };
    const active = p.blocks.filter(b => b.enabled && (b.title || b.text) && appliesTo(b, asset));
    if (!active.length) return { text: '', count: 0 };
    const en = lang === 'en';
    const body = active.map(b => `### ${b.title || (en ? 'Instruction' : 'Consigne')}\n${b.text}`).join('\n\n');
    const text = en
      ? `\n\n=== TRADER PROFILE AND PERSONAL INSTRUCTIONS (written by the user) ===\nFollow these instructions for this analysis: they describe the user's strategy, rules and preferences and take priority over your generic habits.\n\n${body}\n\n=== OUTPUT RULES STILL APPLY ===\nWhatever the instructions above say about presentation, reply ONLY with the JSON object of the schema defined earlier, with text values in English. A "WAIT", "CASH" or "no trade" recommendation is "biais": "NEUTRE" with the reason and what to wait for. Put discipline reminders and rule violations in "avertissements". Describe the bullish / bearish / neutral scenarios in "analyseTechnique". Respect the user's risk rules (minimum R:R, stop placement, news blackout) when choosing entry, stop loss and take profits — and say so in "avertissements" if a setup breaks them.`
      : `\n\n=== PROFIL DU TRADER ET CONSIGNES PERSONNELLES (rédigés par l'utilisateur) ===\nSuis ces consignes pour cette analyse : elles décrivent la stratégie, les règles et les préférences de l'utilisateur et priment sur tes habitudes génériques.\n\n${body}\n\n=== LES RÈGLES DE SORTIE RESTENT OBLIGATOIRES ===\nQuoi que disent les consignes ci-dessus sur la présentation, réponds UNIQUEMENT par l'objet JSON du schéma défini plus haut, avec des textes en français. Une recommandation « ATTENDRE », « CASH » ou « pas de trade » correspond à "biais": "NEUTRE", avec la raison et ce qu'il faut attendre. Mets les rappels de discipline et les règles non respectées dans "avertissements". Décris les scénarios haussier / baissier / neutre dans "analyseTechnique". Respecte les règles de risque de l'utilisateur (R:R minimum, placement du stop, fenêtre de news) pour l'entrée, le stop et les objectifs — et signale-le dans "avertissements" si un setup les enfreint.`;
    return { text, count: active.length };
  }

  // ---- Routes (derrière le mot de passe, comme le reste de l'API) ----
  app.get('/api/profile', (req, res) => res.json(load()));

  app.put('/api/profile', (req, res) => {
    try {
      const p = sanitize(req.body || {});
      save(p);
      res.json(p);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Aperçu exact de ce que l'IA reçoit pour un actif donné
  app.get('/api/profile/preview', (req, res) => {
    const out = buildProfileBlock(String(req.query.asset || ''), req.lang);
    res.json({ count: out.count, text: out.text.trim() });
  });

  return { buildProfileBlock, load };
}

module.exports = { setupProfile };
