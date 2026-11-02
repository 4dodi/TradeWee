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

  // protection DNS rebinding
  const http = require('http');
  const status = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/config', headers: { Host: 'evil.example' } },
      res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.strictEqual(status, 403, 'un Host étranger doit être refusé');

  console.log('✓ smoke test OK');
})().catch(e => { console.error('✗', e.message); process.exitCode = 1; })
  .finally(() => { srv.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });
