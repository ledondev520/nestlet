// Explicit incremental check: run after integrating the private-assets backend,
// or set NESTLET_ASSET_TEST_ROOT to an authorized backend checkout. This runs real
// HTTP, authenticated sessions and disposable SQLite/private files, never mocks.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { createApiClient } from '../../lib/api.js';
import { emptyCasePayload } from './copy.js';
import { assetPath, assetSearchPath, validAssetPage } from './assets-model.js';

const serverRoot = process.env.NESTLET_ASSET_TEST_ROOT ? resolve(process.env.NESTLET_ASSET_TEST_ROOT) : fileURLToPath(new URL('../../../', import.meta.url));
const { openStorage } = await import(pathToFileURL(join(serverRoot, 'storage.js')).href);
const password = 'Synthetic-assets-UI-test-password';
const passwordHash = () => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`; };
let directory, child, origin, api, foreign, session;
let savedClient, savedCase, savedAsset;
const original = Buffer.from('Synthetic résumé 中文 100%_\n<script>alert("text only")</script>\nA preserved original.');

before(async () => {
  directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-assets-ui-http-'));
  const filename = join(directory, 'records.sqlite');
  const storage = openStorage({ filename });
  try { for (const username of ['original-ui-a', 'original-ui-b']) storage.createTrialUser({ username, passwordHash: passwordHash() }); }
  finally { storage.close(); }
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], { cwd: serverRoot, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: '', NESTLET_DB_PATH: filename, NESTLET_ASSETS_PATH: join(directory, 'assets'), NESTLET_OPERATOR_PASSWORD_HASH: passwordHash(), DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', value => output += value); child.stderr.on('data', value => output += value);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
    child.stdout.on('data', value => { if (value.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); } });
  });
  const clients = [];
  for (const username of ['original-ui-a', 'original-ui-b', 'owner']) {
    const response = await fetch(origin + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0], { csrfToken } = await response.json();
    const identity = { cookie, csrfToken };
    if (username === 'original-ui-a') session = identity;
    clients.push(createApiClient({ getCsrfToken: () => csrfToken, fetchImpl: (path, options) => fetch(origin + path, { ...options, headers: { ...options.headers, Origin: origin, Cookie: cookie } }) }));
  }
  [api, ...foreign] = clients;
});
after(async () => {
  if (child?.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('actual frontend query and text helpers find a private uploaded original by customer, case and literal text', async () => {
  savedClient = (await api.post('/api/clients', { displayName: 'Synthetic original customer' })).client;
  savedCase = (await api.post('/api/cases', emptyCasePayload('Synthetic original case', savedClient.id))).case;
  const upload = await fetch(origin + `/api/assets?caseId=${savedCase.id}`, { method: 'POST', headers: { Origin: origin, Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'text/plain', 'X-Asset-Filename': encodeURIComponent('合成 résumé.txt'), 'X-Asset-Consent': 'persist-private' }, body: original });
  assert.equal(upload.status, 201, await upload.clone().text());
  savedAsset = (await upload.json()).asset;
  const result = await api.get(assetSearchPath({ clientId: savedClient.id, caseId: savedCase.id, q: '100%_' }));
  assert.equal(validAssetPage(result), true); assert.equal(result.total, 1); assert.equal(result.assets[0].id, savedAsset.id);
  assert.equal(result.assets[0].originalFilename, '合成 résumé.txt'); assert.match(result.assets[0].snippet, /100%_/);
  const text = await api.get(assetPath(savedAsset.id, 'text'));
  assert.equal(text.asset.id, savedAsset.id); assert.equal(text.text, original.toString());
  const later = await api.get(assetSearchPath({ clientId: savedClient.id, offset: 50 }));
  assert.deepEqual(later.assets, []); assert.equal(later.total, 1);
});

test('same-origin preview/download return safe headers and exact bytes while other accounts get 404', async () => {
  const preview = await fetch(origin + assetPath(savedAsset.id, 'preview'), { headers: { Cookie: session.cookie, Origin: origin, 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(preview.status, 200); assert.match(preview.headers.get('content-type'), /^text\/plain/); assert.match(preview.headers.get('content-security-policy'), /sandbox/); assert.equal(await preview.text(), original.toString());
  const downloaded = await fetch(origin + assetPath(savedAsset.id, 'download'), { headers: { Cookie: session.cookie, Origin: origin, 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(downloaded.status, 200); assert.equal(downloaded.headers.get('cache-control'), 'no-store'); assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
  assert.match(downloaded.headers.get('content-disposition'), /^attachment;/);
  const bytes = Buffer.from(await downloaded.arrayBuffer()); assert.deepEqual(bytes, original);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), savedAsset.sha256);
  for (const other of foreign) {
    await assert.rejects(other.get(assetSearchPath({ clientId: savedClient.id })), error => error.status === 404);
    await assert.rejects(other.get(assetPath(savedAsset.id, 'text')), error => error.status === 404);
  }
});
