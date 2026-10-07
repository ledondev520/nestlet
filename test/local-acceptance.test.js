// Independent acceptance: real loopback HTTP and actual files; no provider/parser mocks.
// Run explicitly; package scripts are owned by the main development lane.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { randomBytes, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';

let child, base, sessionHeaders;
const password = 'public-test-only-local-acceptance';
const salt = randomBytes(16);
const passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
before(async () => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ENABLE_LIVE_AI: 'false',
      DEEPSEEK_API_KEY: '', DEEPSEEK_MODEL: 'deepseek-flash', PUBLIC_ORIGIN: '', NESTLET_OPERATOR_PASSWORD_HASH: passwordHash },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    child.stdout.on('data', data => {
      if (data.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
  });
  const login = await fetch(base + '/api/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200);
  const result = await login.json();
  sessionHeaders = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': result.csrfToken, Origin: base };
});
after(async () => {
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
});
const workbook = (bytes, extraHeaders = {}, authenticated = true) => fetch(base + '/api/workbook', {
  method: 'POST', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'X-Document-Consent': 'synthetic-or-deidentified', ...(authenticated ? sessionHeaders : {}), ...extraHeaders }, body: bytes,
});

test('missing authentication fails closed on the document-processing route', async () => {
  const response = await workbook(await readFile(new URL('./fixtures/case.xlsx', import.meta.url)), {}, false);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
});

test('workbook processing rejects a foreign Origin', async () => {
  const response = await workbook(await readFile(new URL('./fixtures/case.xlsx', import.meta.url)), { Origin: 'https://synthetic.invalid' });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'ORIGIN_REJECTED');
});

for (const [name, bytes] of [
  ['renamed text', Buffer.from('Synthetic text is not an Excel workbook')],
  ['truncated ZIP', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])],
]) {
  test(`actual workbook parser rejects ${name}`, async () => {
    const response = await workbook(bytes);
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'INVALID_WORKBOOK');
  });
}


test('legacy model configuration fails at startup without a provider call', () => {
  const result = spawnSync(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 3000,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', PUBLIC_ORIGIN: '',
      ENABLE_LIVE_AI: 'false', DEEPSEEK_API_KEY: '', DEEPSEEK_MODEL: 'deepseek-chat', NESTLET_OPERATOR_PASSWORD_HASH: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Only DEEPSEEK_MODEL=deepseek-flash is supported/);
});
