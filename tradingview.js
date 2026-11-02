/**
 * Alertes TradingView → analyse automatique.
 *
 * TradingView envoie le message de l'alerte (JSON) en POST sur
 *   /api/webhook/tradingview
 * Ce point d'entrée est volontairement placé AVANT le mot de passe et le
 * contrôle « localhost » (TradingView ne peut pas s'authentifier) : il est
 * protégé par un secret propre, ne fait qu'une chose (lancer une analyse) et
 * n'expose aucune donnée.
 *
 * Exemple de message d'alerte (le bouton « Copier » des Réglages le génère) :
 * {"secret":"…","symbol":"{{ticker}}","exchange":"{{exchange}}","interval":"{{interval}}",
 *  "open":{{open}},"high":{{high}},"low":{{low}},"close":{{close}},"volume":{{volume}},
 *  "time":"{{timenow}}","message":"RSI crossed 30","lang":"en"}
 */
const crypto = require('crypto');

const WEBHOOK_PATH = '/api/webhook/tradingview';
const MAX_PENDING = 3;            // analyses en cours + en attente
const DEDUPE_MS = 60 * 1000;      // même symbole + unité de temps : ignoré pendant 60 s
const MAX_EVENTS = 30;            // journal en mémoire affiché dans les Réglages

// Intervalle TradingView ({{interval}}) → libellé de l'app et intervalle Binance
const INTERVALS = {
  '1': ['M1', '1m'], '3': ['M3', '3m'], '5': ['M5', '5m'], '15': ['M15', '15m'], '30': ['M30', '30m'],
  '45': ['M45', null], '60': ['H1', '1h'], '120': ['H2', '2h'], '180': ['H3', null], '240': ['H4', '4h'],
  'D': ['D1', '1d'], '1D': ['D1', '1d'], 'W': ['W1', '1w'], '1W': ['W1', '1w'], 'M': ['MN', '1M'], '1M': ['MN', '1M']
};
// Devises et métaux : jamais envoyés à Binance
const NOT_CRYPTO = new Set(['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY', 'XAU', 'XAG', 'XPT', 'XPD']);

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Paire Binance pour un ticker crypto (BTCUSD → BTCUSDT, ETHUSDT.P → ETHUSDT), sinon null
function binancePair(symbol) {
  const m = String(symbol).match(/^([A-Z0-9]{2,12}?)(USDT|USDC|USD|BUSD)(\.P|PERP)?$/);
  if (!m || NOT_CRYPTO.has(m[1])) return null;
  return m[1] + (m[2] === 'USDC' ? 'USDC' : 'USDT');
}

function setupTradingView({ app, express, getSettings, saveSettings, runAnalysis, recordFailure, fetchWithTimeout }) {
  const events = [];   // [{ at, symbol, interval, status, analysisId, error }]
  const lastSeen = new Map();
  let running = 0;
  const queue = [];

  const logEvent = (e) => {
    events.unshift({ at: new Date().toISOString(), ...e });
    events.length = Math.min(events.length, MAX_EVENTS);
  };

  async function fetchCandles(symbol, tvInterval) {
    const pair = binancePair(symbol);
    const iv = INTERVALS[tvInterval] && INTERVALS[tvInterval][1];
    if (!pair || !iv) return null;
    // api.binance.com est bloqué dans certains pays (HTTP 451) : repli sur le miroir public de données de marché
    for (const host of ['https://api.binance.com', 'https://data-api.binance.vision']) {
      try {
        const r = await fetchWithTimeout(`${host}/api/v3/klines?symbol=${pair}&interval=${iv}&limit=60`, {}, 8000);
        if (!r.ok) continue;
        const rows = await r.json();
        if (!Array.isArray(rows) || !rows.length) continue;
        return {
        pair, iv,
        lines: rows.map(k => [new Date(k[0]).toISOString().slice(0, 16).replace('T', ' '),
          +k[1], +k[2], +k[3], +k[4], Math.round(+k[5])].join(','))
        };
      } catch { /* essaie l'hôte suivant */ }
    }
    return null;
  }

  async function handleJob(job) {
    const { symbol, exchange, tvInterval, timeframe, bar, message, direction, lang, time } = job;
    const en = lang === 'en';
    let block = en ? '\n\nTRADINGVIEW ALERT DATA:' : '\n\nDONNÉES DE L’ALERTE TRADINGVIEW :';
    block += `\n- ${en ? 'Symbol' : 'Symbole'}: ${symbol}${exchange ? ` (${exchange})` : ''}`;
    block += `\n- ${en ? 'Timeframe' : 'Unité de temps'}: ${timeframe || tvInterval || '?'}`;
    const ohlc = ['open', 'high', 'low', 'close', 'volume'].filter(k => bar[k] != null).map(k => `${k}=${bar[k]}`).join(' ');
    if (ohlc) block += `\n- ${en ? 'Alert bar' : 'Bougie de l’alerte'}: ${ohlc}`;
    if (time) block += `\n- ${en ? 'Fired at' : 'Déclenchée à'}: ${time}`;
    if (message) block += `\n- ${en ? 'Alert message (user signal)' : 'Message de l’alerte (signal de l’utilisateur)'}: ${message}`;

    const candles = await fetchCandles(symbol, tvInterval);
    if (candles) {
      block += en
        ? `\n\nRECENT CANDLES (Binance ${candles.pair} ${candles.iv}, oldest → newest, UTC; columns: time,open,high,low,close,volume):\n`
        : `\n\nBOUGIES RÉCENTES (Binance ${candles.pair} ${candles.iv}, de la plus ancienne à la plus récente, UTC ; colonnes : heure,ouverture,haut,bas,clôture,volume) :\n`;
      block += candles.lines.join('\n');
    }

    const out = await runAnalysis({
      images: [], asset: symbol, timeframe, notes: message ? `TradingView: ${message}` : 'TradingView',
      direction, lang, source: 'tradingview', alertBlock: block
    });
    if (out.status === 200) {
      logEvent({ symbol, interval: timeframe, status: 'ok', analysisId: out.body.id, candles: !!candles });
    } else {
      const error = (out.body && out.body.error) || `HTTP ${out.status}`;
      const id = recordFailure({ asset: symbol, timeframe, notes: message, error });
      logEvent({ symbol, interval: timeframe, status: 'error', analysisId: id, error });
    }
  }

  async function pump() {
    if (running || !queue.length) return;
    running = 1;
    const job = queue.shift();
    try { await handleJob(job); } catch (e) { logEvent({ symbol: job.symbol, interval: job.timeframe, status: 'error', error: e.message }); }
    running = 0;
    pump();
  }

  // ---- Point d'entrée public (avant mot de passe / contrôle d'hôte) ----
  function mountWebhook() {
    app.post(WEBHOOK_PATH, express.text({ type: () => true, limit: '16kb' }), (req, res) => {
      const s = getSettings();
      if (!s.webhookEnabled || !s.webhookSecret) return res.status(404).json({ error: 'Not found' });

      let p;
      try {
        // {{volume}} vaut parfois NaN, ce qui rend le JSON invalide : on le remplace par null
        p = JSON.parse(String(req.body || '').replace(/:\s*NaN\b/g, ': null'));
      } catch {
        return res.status(400).json({ error: 'The alert message must be JSON (copy the template from Tradewee settings).' });
      }
      if (!p || typeof p !== 'object') return res.status(400).json({ error: 'Invalid payload.' });

      const given = p.secret || req.query.secret || '';
      if (!given || !safeEqual(given, s.webhookSecret)) {
        logEvent({ symbol: String(p.symbol || '?').slice(0, 30), status: 'rejected', error: 'bad secret' });
        return res.status(401).json({ error: 'Invalid secret.' });
      }

      const rawSym = String(p.symbol || p.ticker || '').toUpperCase();
      const symbol = rawSym.split(':').pop().replace(/[^A-Z0-9._!-]/g, '').slice(0, 30);
      if (!symbol) return res.status(400).json({ error: 'Missing symbol.' });
      const exchange = String(p.exchange || (rawSym.includes(':') ? rawSym.split(':')[0] : '')).replace(/[^A-Z0-9_ -]/gi, '').slice(0, 30);
      const tvInterval = String(p.interval || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 5);
      const timeframe = (INTERVALS[tvInterval] && INTERVALS[tvInterval][0]) || tvInterval || null;
      const d = String(p.direction || p.side || '').toLowerCase();
      const direction = /^(buy|long|achat)$/.test(d) ? 'achat' : /^(sell|short|vente)$/.test(d) ? 'vente' : 'aucun';
      const job = {
        symbol, exchange, tvInterval, timeframe, direction,
        bar: { open: num(p.open), high: num(p.high), low: num(p.low), close: num(p.close ?? p.price), volume: num(p.volume) },
        message: String(p.message || '').replace(/\s+/g, ' ').slice(0, 500),
        time: String(p.time || '').slice(0, 40),
        lang: p.lang === 'fr' ? 'fr' : 'en'
      };

      const key = `${symbol}|${timeframe}`;
      if (Date.now() - (lastSeen.get(key) || 0) < DEDUPE_MS) {
        logEvent({ symbol, interval: timeframe, status: 'skipped', error: 'duplicate within 60 s' });
        return res.status(202).json({ ok: true, skipped: 'duplicate' });
      }
      if (running + queue.length >= MAX_PENDING) {
        logEvent({ symbol, interval: timeframe, status: 'skipped', error: 'queue full' });
        return res.status(429).json({ error: 'Too many alerts at once, try again later.' });
      }
      lastSeen.set(key, Date.now());
      queue.push(job);
      logEvent({ symbol, interval: timeframe, status: 'queued' });
      // TradingView attend une réponse rapide : l'analyse continue en arrière-plan
      res.status(202).json({ ok: true, queued: true });
      pump();
    });
  }

  // ---- Routes de gestion (derrière le mot de passe, comme le reste de l'API) ----
  function mountApi() {
    app.get('/api/webhook/status', (req, res) => {
      const s = getSettings();
      res.json({
        enabled: !!s.webhookEnabled,
        secret: s.webhookSecret || '',
        path: WEBHOOK_PATH,
        pending: running + queue.length,
        events
      });
    });
    app.post('/api/webhook/secret', (req, res) => {
      saveSettings({ webhookSecret: crypto.randomBytes(24).toString('base64url') });
      res.json({ ok: true, secret: getSettings().webhookSecret });
    });
    app.put('/api/webhook/enabled', (req, res) => {
      const enabled = !!(req.body && req.body.enabled);
      const patch = { webhookEnabled: enabled };
      if (enabled && !getSettings().webhookSecret) patch.webhookSecret = crypto.randomBytes(24).toString('base64url');
      saveSettings(patch);
      res.json({ ok: true, enabled });
    });
  }

  return { mountWebhook, mountApi, WEBHOOK_PATH, binancePair };
}

module.exports = { setupTradingView, binancePair };
