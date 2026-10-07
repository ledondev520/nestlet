// Strict end-to-end registration acceptance: real HTTP, SQLite and password hashing only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { openStorage } from '../storage.js';
import { extract } from '../public/core.js';

const ownerPassword = 'public-registration-owner-password';
const ordinaryPassword = 'public-registration-user-password';
const makeHash = password => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`; };
const ownerHash = makeHash(ownerPassword);

async function app(context, { origin = 'https://nestlet-registration.invalid', configured = true, initialUsers = 0 } = {}) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-registration-'));
  const filename = join(directory, 'nestlet.sqlite');
  const storage = openStorage({ filename });
  try {
    if (initialUsers) {
      const hash = makeHash(ordinaryPassword);
      for (let index = 0; index < initialUsers; index++) storage.createTrialUser({ username: `existing-${index}`, passwordHash: hash });
    }
  } finally { storage.close(); }
  let child, url, output = '';
  async function stop() {
    if (child?.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  }
  context.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  async function start() {
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    url = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin,
        NESTLET_DB_PATH: filename, NESTLET_OPERATOR_PASSWORD_HASH: configured ? ownerHash : '',
        DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => output += data);
    child.stderr.on('data', data => output += data);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Startup failed: ${output}`)), 5000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`)); });
      const ready = data => { if (data.toString().includes('Nestlet available')) { clearTimeout(timeout); child.stdout.off('data', ready); resolve(); } };
      child.stdout.on('data', ready);
    });
  }
  const request = (path, { method = 'GET', body, session, headers = {} } = {}) => fetch(url + path, {
    method, headers: { Origin: origin || url, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}), ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  const register = (username, overrides = {}, headers = {}) => request('/api/register', { method: 'POST',
    body: { username, password: ordinaryPassword, passwordConfirmation: ordinaryPassword, ...overrides }, headers });
  async function login(username, password = ordinaryPassword) {
    const response = await request('/api/login', { method: 'POST', body: { username, password } });
    assert.equal(response.status, 200);
    return sessionFrom(response);
  }
  await start();
  return { request, register, login, filename, restart: async () => { await stop(); await start(); }, get output() { return output; } };
}
async function sessionFrom(response) {
  const data = await response.json();
  assert.equal(data.authenticated, true);
  assert.match(data.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  return { ...data, csrf: data.csrfToken, cookie: setCookie.split(';')[0] };
}

test('web registration creates an ordinary session that can save, reopen, and recover its own reviewed case after restart', async context => {
  const site = await app(context);
  const status = await (await site.request('/api/status')).json();
  assert.equal(status.registrationEnabled, true);
  const response = await site.register('ordinary-one');
  assert.equal(response.status, 201);
  const ordinary = await sessionFrom(response);
  assert.equal(ordinary.role, 'trial');
  assert.notEqual(ordinary.userId, 'owner');
  assert.equal(ordinary.username, 'ordinary-one');
  const fields = extract('Property: Example Lane\nOwner: Example LLC').map(field => ({ ...field, confirmed: true }));
  const document = { title: 'Registered user working copy', sourceText: 'Property: Example Lane\nOwner: Example LLC', fields,
    draftType: 'status-summary', draftText: 'DRAFT — FOR HUMAN REVIEW\nAwaiting verified agency instructions.', extractionMode: 'manual', namesVerified: false };
  let result = await site.request('/api/cases', { method: 'POST', session: ordinary, body: document });
  assert.equal(result.status, 201);
  const saved = (await result.json()).case;
  assert.equal(saved.version, 1);
  result = await site.request('/api/logout', { method: 'POST', session: ordinary, body: {} });
  assert.equal(result.status, 200);
  result = await site.request('/api/cases/' + saved.id, { session: ordinary });
  assert.equal(result.status, 401);
  const signedIn = await site.login('ordinary-one');
  result = await site.request('/api/cases/' + saved.id, { session: signedIn });
  assert.deepEqual((await result.json()).case, saved);
  await site.restart();
  const reopened = await site.login('ordinary-one');
  assert.equal(reopened.userId, ordinary.userId);
  result = await site.request('/api/cases/' + saved.id, { session: reopened });
  assert.deepEqual((await result.json()).case, saved);
  for (const value of [ordinaryPassword, ownerPassword]) assert.equal(site.output.includes(value), false);
});

test('web-registered ordinary accounts cannot access another account cases or administrator settings', async context => {
  const site = await app(context);
  const firstResponse = await site.register('ordinary-first');
  assert.equal(firstResponse.status, 201);
  const first = await sessionFrom(firstResponse);
  const secondResponse = await site.register('ordinary-second');
  assert.equal(secondResponse.status, 201);
  const second = await sessionFrom(secondResponse);
  const payload = { title: 'First account case', sourceText: 'Property: Example Lane', fields: [], draftType: 'followup', draftText: '' };
  let response = await site.request('/api/cases', { method: 'POST', body: payload, session: first });
  const saved = (await response.json()).case;
  for (const [method, body] of [['GET', undefined], ['PUT', { ...payload, expectedVersion: 1 }], ['DELETE', { expectedVersion: 1 }]]) {
    response = await site.request('/api/cases/' + saved.id, { method, body, session: second });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, 'CASE_NOT_FOUND');
  }
  for (const [method, path, body] of [['GET', '/api/settings', undefined], ['POST', '/api/settings', { enableLive: false }], ['POST', '/api/settings/test', {}]]) {
    response = await site.request(path, { method, body, session: first });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'OWNER_REQUIRED');
  }
  const owner = await site.login('owner', ownerPassword);
  assert.equal(owner.role, 'owner');
  response = await site.request('/api/settings', { session: owner });
  assert.equal(response.status, 200);
  response = await site.request('/api/cases/' + saved.id, { session: owner });
  assert.equal(response.status, 404, 'Administrator API management does not grant access to another user case');
});

test('registration rejects reserved administrator names, requested roles, and invalid or mismatched credentials', async context => {
  const valid = { username: 'invalid-candidate', password: ordinaryPassword, passwordConfirmation: ordinaryPassword };
  const invalid = [
    { ...valid, username: ' OWNER ' }, { ...valid, role: 'owner' }, { ...valid, role: 'trial' },
    { username: 'missing-confirmation', password: ordinaryPassword },
    { ...valid, passwordConfirmation: 'a-different-public-password' },
    { ...valid, username: 'ab' }, { ...valid, username: 'contains spaces' }, { ...valid, username: 'x'.repeat(65) },
    { ...valid, password: 'short', passwordConfirmation: 'short' },
    { ...valid, password: 'x'.repeat(257), passwordConfirmation: 'x'.repeat(257) },
    { ...valid, password: 'control\u0000characters', passwordConfirmation: 'control\u0000characters' },
    { ...valid, password: [] },
  ];
  for (let offset = 0; offset < invalid.length; offset += 4) {
    const site = await app(context);
    for (const body of invalid.slice(offset, offset + 4)) {
      const response = await site.request('/api/register', { method: 'POST', body });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'REGISTRATION_INVALID');
      assert.equal(response.headers.get('set-cookie'), null);
    }
    const storage = openStorage({ filename: site.filename });
    try { assert.equal(storage.findUserByUsername('invalid-candidate'), null); assert.equal(storage.getUserById('owner').passwordHash, null); }
    finally { storage.close(); }
  }
});

test('registration requires configured ownership, exact Origin, and HTTPS outside local development', async context => {
  const site = await app(context);
  for (const headers of [{ Origin: '' }, { Origin: 'https://untrusted.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await site.register('origin-test', {}, headers);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'ORIGIN_REJECTED');
  }
  const unconfigured = await app(context, { configured: false });
  let response = await unconfigured.register('no-administrator');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'OPERATOR_SETUP_REQUIRED');
  assert.equal((await (await unconfigured.request('/api/status')).json()).registrationEnabled, false);
  const insecure = await app(context, { origin: 'http://public-registration.invalid' });
  response = await insecure.register('public-http-user');
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'HTTPS_REQUIRED');
  assert.equal((await (await insecure.request('/api/status')).json()).registrationEnabled, false);
});

test('registration rejects malformed JSON, unsupported media, and oversized request bodies before creating users', async context => {
  const site = await app(context);
  let response = await site.request('/api/register', { method: 'POST', body: '{broken' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_JSON');
  response = await site.register('wrong-media', {}, { 'Content-Type': 'text/plain' });
  assert.equal(response.status, 415);
  response = await site.request('/api/register', { method: 'POST', body: 'x'.repeat(4097) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'REGISTRATION_INVALID');
});

test('concurrent registration of one normalized username creates exactly one ordinary identity', async context => {
  const site = await app(context);
  const responses = await Promise.all([site.register('duplicate-user'), site.register(' DUPLICATE-USER ')]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const winner = await sessionFrom(responses.find(response => response.status === 201));
  const rejected = responses.find(response => response.status === 409);
  assert.equal((await rejected.json()).code, 'USER_EXISTS');
  assert.equal(rejected.headers.get('set-cookie'), null);
  const storage = openStorage({ filename: site.filename });
  try { assert.equal(storage.findUserByUsername('duplicate-user').id, winner.userId); }
  finally { storage.close(); }
  const signedIn = await site.login('duplicate-user');
  assert.equal(signedIn.userId, winner.userId);
});

test('the sixth actual signup attempt is rate-limited without creating a user or session', async context => {
  const site = await app(context);
  for (let index = 0; index < 5; index++) {
    const response = await site.register('ab');
    assert.equal(response.status, 400);
  }
  const response = await site.register('rate-limited-user', {}, { 'X-Forwarded-For': '198.51.100.25' });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'REGISTRATION_RATE_LIMITED');
  assert.equal(response.headers.get('set-cookie'), null);
  const storage = openStorage({ filename: site.filename });
  try { assert.equal(storage.findUserByUsername('rate-limited-user'), null); }
  finally { storage.close(); }
});

test('actual SQLite account capacity admits the 100th ordinary account and rejects the 101st atomically', async context => {
  const site = await app(context, { initialUsers: 99 });
  const hundredth = await site.register('hundredth-user');
  assert.equal(hundredth.status, 201);
  const account = await sessionFrom(hundredth);
  assert.equal(account.role, 'trial');
  const denied = await site.register('over-account-cap');
  assert.equal(denied.status, 409);
  assert.equal((await denied.json()).code, 'USER_LIMIT_REACHED');
  assert.equal(denied.headers.get('set-cookie'), null);
  const storage = openStorage({ filename: site.filename });
  try {
    assert.equal(storage.findUserByUsername('over-account-cap'), null);
    assert.equal(storage.findUserByUsername('hundredth-user').id, account.userId);
    assert.equal(storage.getUserById('owner').role, 'owner');
    const rotated = storage.upsertTrialUser({ username: 'hundredth-user', passwordHash: makeHash('rotated-capacity-user-password') });
    assert.equal(rotated.id, account.userId, 'Rotation must remain possible at account capacity');
  } finally { storage.close(); }
  const signedIn = await site.login('hundredth-user', 'rotated-capacity-user-password');
  assert.equal(signedIn.userId, account.userId);
});

test('two actual processes racing for the final SQLite account slot allow exactly one new identity', async context => {
  const site = await app(context, { initialUsers: 99 });
  const hash = makeHash(ordinaryPassword);
  const program = `
    import { openStorage } from './storage.js';
    const storage = openStorage({filename:process.argv[1]});
    try { const user=storage.createTrialUser({username:process.argv[2],passwordHash:process.argv[3]}); console.log(JSON.stringify({ok:true,id:user.id})); }
    catch(error) { console.log(JSON.stringify({ok:false,code:error.code,status:error.status})); }
    finally { storage.close(); }
  `;
  const createInProcess = username => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', program, site.filename, username, hash], { cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', data => output += data);
    child.stderr.on('data', data => errors += data);
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) return reject(new Error(`Account process exited ${code}: ${errors}`));
      try { resolve(JSON.parse(output.trim())); } catch (error) { reject(error); }
    });
  });
  const results = await Promise.all(['last-slot-a', 'last-slot-b'].map(createInProcess));
  assert.equal(results.filter(result => result.ok).length, 1);
  const rejected = results.find(result => !result.ok);
  assert.equal(rejected.code, 'USER_LIMIT_REACHED');
  assert.equal(rejected.status, 409);
});

for (const length of [6, 7, 8, 9, 10, 11]) {
  test(`ordinary registration and subsequent login accept exactly ${length} password characters over real HTTP`, async context => {
    // One isolated real server/database per length avoids mistaking the five-attempt
    // registration rate limit for a password-boundary failure.
    const site = await app(context);
    const password = 'A1' + 'x'.repeat(length - 2);
    assert.equal(password.length, length);
    const username = `password-length-${length}`;
    const response = await site.register(username, { password, passwordConfirmation: password });
    assert.equal(response.status, 201);
    const created = await sessionFrom(response);
    assert.equal(created.role, 'trial');
    const logout = await site.request('/api/logout', { method: 'POST', session: created, body: {} });
    assert.equal(logout.status, 200);
    const returned = await site.login(username, password);
    assert.equal(returned.userId, created.userId);
    assert.equal(returned.role, 'trial');
    const settings = await site.request('/api/settings', { session: returned });
    assert.equal(settings.status, 403);
  });
}
