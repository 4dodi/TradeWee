// Test de fumée : vérifie la syntaxe, démarre le serveur sur un dossier de données
// temporaire et interroge quelques routes qui ne dépendent pas d'Internet.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const files = ['server.js', ...fs.readdirSync(path.join(root, 'public/js')).map(f => 'public/js/' + f)];
for (const f of files) execFileSync(process.execPath, ['--check', path.join(root, f)]);

const PORT = 3999;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-'));
const srv = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT, DATA_DIR: dataDir, NO_OPEN: '1' },
  stdio: 'inherit'
});

const base = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    try { ok = (await fetch(base + '/')).ok; } catch { await wait(250); }
  }
  assert(ok, 'le serveur ne répond pas');

  const cfg = await (await fetch(base + '/api/config')).json();
  assert.strictEqual(cfg.settings.apiKey, undefined, 'la clé API ne doit jamais être renvoyée');
  assert(Array.isArray(cfg.assets));

  const trades = await (await fetch(base + '/api/trades')).json();
  assert(Array.isArray(trades));

  // la clé enregistrée ne doit pas partir vers une URL arbitraire
  await fetch(base + '/api/config', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: { apiKey: 'secret-test-key' } })
  });
  const r = await fetch(base + '/api/models', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: 'http://attacker.invalid/v1' })
  });
  assert.strictEqual(r.status, 400, 'la clé ne doit pas être envoyée à une autre URL');

  // langue des messages : anglais par défaut / sur demande, français avec X-Lang: fr
  const notFound = async (lang) => (await (await fetch(base + '/api/analyses/inconnu', { headers: lang ? { 'X-Lang': lang } : {} })).json()).error;
  assert.strictEqual(await notFound('en'), 'Analysis not found.');
  assert.strictEqual(await notFound(), 'Analysis not found.');
  assert.strictEqual(await notFound('fr'), 'Analyse introuvable.');

  // traduction d'une analyse : analyse inconnue → 404 (traduit en anglais par défaut)
  const trRes = await fetch(base + '/api/analyses/inconnu/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"lang":"en"}' });
  assert.strictEqual(trRes.status, 404);

  // Alertes TradingView : désactivées par défaut, puis protégées par un secret
  const hook = (body, headers = {}) => fetch(base + '/api/webhook/tradingview', { method: 'POST', headers, body });
  assert.strictEqual((await hook('{}')).status, 404, 'webhook désactivé par défaut');
  await fetch(base + '/api/webhook/enabled', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
  const st = await (await fetch(base + '/api/webhook/status')).json();
  assert(st.enabled && st.secret.length >= 24, 'secret généré à l’activation');
  assert(!JSON.stringify(await (await fetch(base + '/api/config')).json()).includes(st.secret), 'secret absent de /api/config');
  assert.strictEqual((await hook(JSON.stringify({ secret: 'faux', symbol: 'BTCUSD' }))).status, 401);
  assert.strictEqual((await hook('pas du json')).status, 400);
  // sans clé API configurée, l'alerte est acceptée puis l'échec est consigné
  assert.strictEqual((await hook(JSON.stringify({ secret: st.secret, symbol: 'EURUSD', interval: '60', volume: 'x' }))).status, 202);

  // protection DNS rebinding
  const http = require('http');
  const status = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/config', headers: { Host: 'evil.example' } },
      res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.strictEqual(status, 403, 'un Host étranger doit être refusé');
  // …sauf pour le webhook TradingView (accessible via un tunnel), qui garde son secret
  const hookStatus = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/webhook/tradingview', method: 'POST', headers: { Host: 'tunnel.example' } },
      res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end('{"secret":"faux","symbol":"BTCUSD"}');
  });
  assert.strictEqual(hookStatus, 401, 'le webhook répond via un tunnel, avec contrôle du secret');

  console.log('✓ smoke test OK');
})().catch(e => { console.error('✗', e.message); process.exitCode = 1; })
  .finally(() => { srv.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });
