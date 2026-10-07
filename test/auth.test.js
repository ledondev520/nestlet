// STRICT ACCEPTANCE: real HTTP, real scrypt verification, and real server sessions.
// These credentials belong only to disposable test processes, never a user account.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const password = 'public-test-only-operator-password';
const salt = randomBytes(16);
const hash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url')}`;
const processes = [];
const dataDirectories = [];
let secure, local, insecurePublic;
let session;

async function start(publicOrigin, passwordHash = hash) {
  const dataDirectory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-auth-db-'));
  dataDirectories.push(dataDirectory);
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_ORIGIN: publicOrigin,
      NESTLET_OPERATOR_PASSWORD_HASH: passwordHash, NESTLET_DB_PATH: join(dataDirectory, 'nestlet.sqlite'), ENABLE_LIVE_AI: 'false', DEEPSEEK_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.push(child);
  const server = { url: `http://127.0.0.1:${port}`, origin: publicOrigin || `http://127.0.0.1:${port}`, output: '' };
  child.stdout.on('data', data => server.output += data);
  child.stderr.on('data', data => server.output += data);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${server.output}`)), 5000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${server.output}`)); });
    const ready = data => { if (data.toString().includes('Nestlet available')) { clearTimeout(timeout); child.stdout.off('data', ready); resolve(); } };
    child.stdout.on('data', ready);
  });
  return server;
}

const post = (server, path, body = {}, headers = {}) => fetch(server.url + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.origin, ...headers }, body: JSON.stringify(body),
});
const authHeaders = s => ({ Cookie: s.cookie, 'X-CSRF-Token': s.csrf });
async function login(server) {
  const response = await post(server, '/api/login', { password });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.authenticated, true);
  assert.match(data.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: data.csrfToken, setCookie: response.headers.get('set-cookie') };
}

before(async () => {
  // PUBLIC_ORIGIN exercises reverse-proxy application checks; this test does not prove TLS deployment.
  secure = await start('https://nestlet-acceptance.invalid');
  local = await start('');
  insecurePublic = await start('http://nestlet-acceptance.invalid');
  session = await login(secure);
});
after(async () => { await Promise.all(processes.map(child => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill('SIGTERM'); }))); await Promise.all(dataDirectories.map(directory => rm(directory, { recursive: true, force: true }))); });

test('real password verification issues a protected session and status exposes CSRF only to that session', async () => {
  assert.match(session.setCookie, /HttpOnly/);
  assert.match(session.setCookie, /SameSite=Strict/);
  assert.match(session.setCookie, /Secure/);
  assert.match(session.setCookie, /Max-Age=28800/);
  let response = await fetch(secure.url + '/api/status');
  let data = await response.json();
  assert.equal(data.authConfigured, true);
  assert.equal(data.authenticated, false);
  assert.equal('csrfToken' in data, false);
  response = await fetch(secure.url + '/api/status', { headers: { Cookie: session.cookie } });
  data = await response.json();
  assert.equal(data.authenticated, true);
  assert.equal(data.csrfToken, session.csrf);
  assert.equal(JSON.stringify(data).includes(password), false);
  assert.equal(secure.output.includes(password), false);
  assert.equal(secure.output.includes(hash), false);
});

test('login rejects absent or foreign origin, invalid passwords, and non-HTTPS public deployment', async () => {
  let response = await post(secure, '/api/login', { password }, { Origin: '' });
  assert.equal(response.status, 403);
  response = await post(secure, '/api/login', { password }, { Origin: 'https://untrusted.invalid' });
  assert.equal(response.status, 403);
  response = await post(secure, '/api/login', { password: 'incorrect-public-test-password' });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
  response = await post(insecurePublic, '/api/login', { password });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'HTTPS_REQUIRED');
});

test('settings require a valid session, exact CSRF token, and same-origin request', async () => {
  let response = await fetch(secure.url + '/api/settings');
  assert.equal(response.status, 401);
  response = await post(secure, '/api/settings', { enableLive: false }, { Cookie: session.cookie });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'CSRF_REJECTED');
  for (const token of ['a'.repeat(43), 'é'.repeat(43), session.csrf + 'x']) {
    response = await post(secure, '/api/settings', { enableLive: false }, { Cookie: session.cookie, 'X-CSRF-Token': token });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'CSRF_REJECTED');
  }
  response = await post(secure, '/api/settings', { enableLive: false }, { ...authHeaders(session), Origin: '' });
  assert.equal(response.status, 403);
  response = await post(secure, '/api/settings', { enableLive: false }, { ...authHeaders(session), Origin: 'https://untrusted.invalid' });
  assert.equal(response.status, 403);
  response = await post(secure, '/api/settings', { enableLive: false }, authHeaders(session));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).configured, false);
});

test('actual PDF and workbook parsers reject signed-out/CSRF-free requests and accept authorized sessions', async () => {
  for (const [path, name, type] of [
    ['/api/document', 'text.pdf', 'application/pdf'],
    ['/api/workbook', 'case.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ]) {
    const body = await readFile(new URL(`fixtures/${name}`, import.meta.url));
    const send = headers => fetch(secure.url + path, {
      method: 'POST', headers: { Origin: secure.origin, 'Content-Type': type, 'X-Document-Consent': 'synthetic-or-deidentified', ...headers }, body,
    });
    let response = await send({});
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'AUTH_REQUIRED');
    response = await send({ Cookie: session.cookie });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'CSRF_REJECTED');
    response = await send(authHeaders(session));
    assert.equal(response.status, 200);
    const result = await response.json();
    if (path === '/api/document') assert.match(result.text, /Property: 128 Example Lane, Unit B/);
    else assert.equal(result.sheets[0].rows[1][0], '128 Example Lane');
  }
});

test('no-key live extraction and connection checks fail truthfully without fabricated provider results', async () => {
  let response = await post(secure, '/api/extract', { text: 'Property: 128 Example Lane', consent: true });
  assert.equal(response.status, 401);
  response = await post(secure, '/api/extract', { text: 'Property: 128 Example Lane', consent: true }, authHeaders(session));
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.code, 'LIVE_DISABLED');
  assert.equal('fields' in data, false);
  response = await post(secure, '/api/settings/test', {}, authHeaders(session));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'API_KEY_REQUIRED');
  response = await post(secure, '/api/settings', { enableLive: true }, authHeaders(session));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'API_KEY_REQUIRED');
  response = await fetch(secure.url + '/api/settings', { headers: { Cookie: session.cookie } });
  const settings = await response.json();
  assert.equal(settings.configured, false);
  assert.equal(settings.liveEnabled, false);
  assert.equal(settings.connectionVerifiedAt, null);
});

test('local development sign-in does not permit API key settings over HTTP', async () => {
  const localSession = await login(local);
  assert.doesNotMatch(localSession.setCookie, /; Secure/);
  const response = await post(local, '/api/settings', { enableLive: false }, authHeaders(localSession));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'HTTPS_REQUIRED');
});

test('logout clears the cookie and invalidates the actual server session', async () => {
  const signedIn = await login(secure);
  let response = await post(secure, '/api/logout', {}, authHeaders(signedIn));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await response.json()).authenticated, false);
  response = await fetch(secure.url + '/api/settings', { headers: { Cookie: signedIn.cookie } });
  assert.equal(response.status, 401);
  response = await fetch(secure.url + '/api/status', { headers: { Cookie: signedIn.cookie } });
  const status = await response.json();
  assert.equal(status.authenticated, false);
  assert.equal('csrfToken' in status, false);
});

test('unconfigured and malformed operator setups fail closed for all server-side file and AI actions', async () => {
  for (const passwordHash of ['', 'invalid-test-hash']) {
    const server = await start('', passwordHash);
    for (const path of ['/api/document', '/api/workbook', '/api/extract', '/api/settings', '/api/settings/test']) {
      const response = await post(server, path, {});
      assert.equal(response.status, 503, path);
      assert.equal((await response.json()).code, 'OPERATOR_SETUP_REQUIRED', path);
    }
    const status = await (await fetch(server.url + '/api/status')).json();
    assert.equal(status.authConfigured, false);
    assert.equal(status.authenticated, false);
    assert.equal('operatorSetupInvalid' in status, false, 'Unauthenticated status must not expose owner setup diagnostics');
  }
});

test('real repeated failed sign-ins trigger a bounded login rate limit', async () => {
  const server = await start('');
  for (let count = 0; count < 10; count++) {
    const response = await post(server, '/api/login', { password: 'incorrect-test-only-password' });
    assert.equal(response.status, 401);
  }
  const response = await post(server, '/api/login', { password });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'LOGIN_RATE_LIMITED');
  assert.equal(response.headers.get('set-cookie'), null);
});
