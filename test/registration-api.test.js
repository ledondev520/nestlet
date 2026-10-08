// Actual HTTP, SQLite and scrypt. Synthetic accepted challenges are seeded explicitly;
// this suite does NOT send email and does NOT claim actual provider/inbox acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { openStorage } from '../storage.js';
import { digest } from '../email-auth-domain.js';
const ownerPassword = 'public-email-owner-password', ordinaryPassword = 'public-email-user-password';
const makeHash = password => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`; };
const ownerHash = makeHash(ownerPassword);
async function app(context, { origin = 'https://nestlet-email.invalid', configured = true } = {}) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-email-http-')), filename = join(directory, 'nestlet.sqlite');
  const initial = openStorage({ filename }); initial.close();
  let child, url, output = '';
  const stop = async () => { if (child?.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); }); };
  context.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  async function start() {
    const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve)); url = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env,
      HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin, NESTLET_DB_PATH: filename,
      NESTLET_OPERATOR_PASSWORD_HASH: configured ? ownerHash : '', NESTLET_OPERATOR_USERNAME: 'owner',
      ALIBABA_CLOUD_ACCESS_KEY_ID: '', ALIBABA_CLOUD_ACCESS_KEY_SECRET: '', ALIBABA_CLOUD_SECURITY_TOKEN: '', NESTLET_EMAIL_FROM: '',
      DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error(`Startup failed: ${output}`)), 8000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`)); });
      const ready = data => { if (data.toString().includes('Nestlet available')) { clearTimeout(timeout); child.stdout.off('data', ready); resolve(); } }; child.stdout.on('data', ready); });
  }
  const request = (path, { method = 'GET', body, session, headers = {} } = {}) => fetch(url + path, { method, headers: {
    Origin: origin || url, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken } : {}), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const post = (path, body, options = {}) => request(path, { method: 'POST', body, ...options });
  const withStorage = fn => { const storage = openStorage({ filename }); try { return fn(storage); } finally { storage.close(); } };
  const pending = (email, { password = ordinaryPassword, accepted = true, kind = 'register', userId = null, now = Date.now() } = {}) => withStorage(storage => {
    const action = storage.emailAuth.createAction({ kind, email, userId, now,
      ...(kind === 'register' ? { passwordHash: makeHash(password) } : { credentialFingerprint: digest(userId === 'owner' ? ownerHash : storage.getUserById(userId).passwordHash) }) });
    if (accepted) storage.emailAuth.markAccepted(action.tokenHash, now); return action;
  });
  async function login(identity, password = ordinaryPassword, rememberMe = false) {
    const response = await post('/api/login', { [identity.includes('@') ? 'email' : 'username']: identity, password, rememberMe });
    assert.equal(response.status, 200); const data = await response.json();
    assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    return { ...data, cookie: response.headers.get('set-cookie').split(';')[0] };
  }
  await start(); return { request, post, withStorage, pending, login, filename, restart: async () => { await stop(); await start(); }, get output() { return output; } };
}
const signup = (email = 'synthetic@example.invalid', password = ordinaryPassword) => ({ email, password, passwordConfirmation: password });

test('mandatory-email registration refuses username-only input and honestly reports an unconfigured mail service', async t => {
  const site = await app(t);
  const status = await (await site.request('/api/status')).json();
  assert.equal(status.registrationEnabled, false); assert.equal(status.emailDeliveryConfigured, false);
  for (const body of [{ username: 'old-signup', password: ordinaryPassword, passwordConfirmation: ordinaryPassword },
    { ...signup(), role: 'owner' }, signup('bad-email'), signup('K@example.invalid'), signup('a@example.invalid', 'short'), signup('a@example.invalid', 'x'.repeat(257)),
    { ...signup(), passwordConfirmation: 'different' }]) {
    const response = await site.post('/api/register', body); assert.equal(response.status, 400); assert.equal((await response.json()).code, 'REGISTRATION_INVALID'); assert.equal(response.headers.get('set-cookie'), null);
  }
  for (const [path, body] of [['/api/register', signup()], ['/api/auth/email/resend', { email: 'synthetic@example.invalid' }], ['/api/auth/password/forgot', { email: 'synthetic@example.invalid' }]]) {
    const response = await site.post(path, body); assert.equal(response.status, 503); assert.equal((await response.json()).code, 'EMAIL_DELIVERY_UNAVAILABLE'); assert.equal(response.headers.get('set-cookie'), null);
  }
  site.withStorage(storage => { assert.equal(storage.emailAuth.findByEmail('synthetic@example.invalid'), null); assert.equal(storage.getUserById('owner').passwordHash, null); });
});

test('unaccepted pending enrollment cannot login; accepted verification is POST-only, single-use and returns a fresh ordinary session', async t => {
  const site = await app(t), email = 'pending@example.invalid'; const action = site.pending(email, { accepted: false });
  assert.equal((await site.post('/api/login', { email, password: ordinaryPassword })).status, 401);
  assert.equal((await site.post('/api/auth/email/verify', { token: action.token })).status, 400);
  site.withStorage(storage => storage.emailAuth.markAccepted(action.tokenHash));
  const get = await site.request('/api/auth/email/verify?token=' + action.token); assert.equal(get.status, 404);
  let response = await site.post('/api/auth/email/verify', { token: action.token }); assert.equal(response.status, 200);
  const verified = await response.json(); assert.equal(verified.authenticated, true); assert.equal(verified.verified, true); assert.equal(verified.role, 'trial');
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict.*Secure/);
  assert.equal(Object.hasOwn(verified, 'cookie'), false);
  const session = { ...verified, cookie: response.headers.get('set-cookie').split(';')[0] };
  response = await site.post('/api/auth/email/verify', { token: action.token }); assert.equal(response.status, 400); assert.equal((await response.json()).code, 'EMAIL_TOKEN_INVALID');
  assert.equal(response.headers.get('set-cookie'), null);
  const status = await (await site.request('/api/status', { session })).json();
  assert.equal(status.email, email); assert.equal(status.emailVerified, true); assert.equal(status.emailBindingRequired, false); assert.equal(status.passwordRecoveryMethod, 'email');
  assert.equal(status.role, 'trial'); assert.equal((await site.request('/api/settings', { session })).status, 403);
  assert.equal(site.output.includes(action.token), false); assert.equal(site.output.includes(email), false);
});

test('verified email account retains its isolated case and identity across actual logout and server restart', async t => {
  const site = await app(t); const a = site.pending('first@example.invalid'), b = site.pending('second@example.invalid');
  for (const action of [a, b]) assert.equal((await site.post('/api/auth/email/verify', { token: action.token })).status, 200);
  const first = await site.login('first@example.invalid'), second = await site.login('second@example.invalid');
  let response = await site.post('/api/cases', { title: 'Synthetic email-owned case', sourceText: 'Preserve this synthetic text', fields: [], draftType: 'followup', draftText: '' }, { session: first });
  assert.equal(response.status, 201); const saved = (await response.json()).case;
  assert.equal((await site.request('/api/cases/' + saved.id, { session: second })).status, 404);
  assert.equal((await site.post('/api/logout', {}, { session: first })).status, 200);
  assert.equal((await site.request('/api/cases', { session: first })).status, 401);
  await site.restart(); const reopened = await site.login('first@example.invalid'); assert.equal(reopened.userId, first.userId);
  assert.deepEqual((await (await site.request('/api/cases/' + saved.id, { session: reopened })).json()).case, saved);
});

test('password recovery atomically changes a verified trial credential, revokes all old sessions and rejects replay', async t => {
  const site = await app(t), email = 'recover@example.invalid'; const registration = site.pending(email);
  await site.post('/api/auth/email/verify', { token: registration.token });
  const first = await site.login(email), second = await site.login(email), remembered = await site.login(email, ordinaryPassword, true);
  const reset = site.pending(email, { kind: 'reset', userId: first.userId });
  const newPassword = 'new-public-test-password';
  const results = await Promise.all([0, 1].map(() => site.post('/api/auth/password/reset', { token: reset.token, password: newPassword, passwordConfirmation: newPassword })));
  assert.deepEqual(results.map(response => response.status).sort(), [200, 400]);
  for (const session of [first, second, remembered]) assert.equal((await site.request('/api/cases', { session })).status, 401);
  assert.equal((await site.post('/api/login', { email, password: ordinaryPassword })).status, 401);
  const changed = await site.login(email, newPassword); assert.equal(changed.userId, first.userId);
  await site.restart(); assert.equal((await site.request('/api/cases', { session: changed })).status, 401); assert.equal((await site.login(email, newPassword)).userId, first.userId);
  for (const secret of [ordinaryPassword, newPassword, reset.token]) assert.equal(site.output.includes(secret), false);
});

test('legacy account and owner email bindings preserve original IDs, owner ENV hash and documented recovery exception', async t => {
  const site = await app(t); const legacy = site.withStorage(storage => storage.createTrialUser({ username: 'legacy-may', passwordHash: makeHash(ordinaryPassword) }));
  const old = await site.login('legacy-may'); assert.equal(old.userId, legacy.id);
  let status = await (await site.request('/api/status', { session: old })).json(); assert.equal(status.emailBindingRequired, true); assert.equal(status.passwordRecoveryMethod, 'bind-email');
  const binding = site.pending('legacy@example.invalid', { kind: 'bind', userId: legacy.id });
  assert.equal((await site.post('/api/auth/email/verify', { token: binding.token })).status, 200);
  assert.equal((await site.login('legacy@example.invalid')).userId, legacy.id); assert.equal((await site.login('legacy-may')).userId, legacy.id);
  const owner = await site.login('owner', ownerPassword), ownerBinding = site.pending('owner@example.invalid', { kind: 'bind', userId: 'owner' });
  assert.equal((await site.post('/api/auth/email/verify', { token: ownerBinding.token })).status, 200);
  assert.equal((await site.login('owner@example.invalid', ownerPassword)).userId, 'owner');
  status = await (await site.request('/api/status', { session: owner })).json(); assert.equal(status.passwordRecoveryMethod, 'private-bootstrap'); assert.equal(status.emailVerified, true);
  site.withStorage(storage => { assert.equal(storage.getUserById('owner').passwordHash, null); assert.equal(storage.emailAuth.createAction({ kind: 'reset', userId: 'owner', email: 'owner@example.invalid', credentialFingerprint: digest(ownerHash) }), null); });
});

test('email routes retain exact Origin, CSRF, setup, HTTPS and bounded JSON gates', async t => {
  const site = await app(t), owner = await site.login('owner', ownerPassword);
  for (const headers of [{ Origin: '' }, { Origin: 'https://untrusted.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await site.post('/api/register', signup(), { headers })).status, 403);
  assert.equal((await site.post('/api/auth/email/bind', { email: 'bind@example.invalid', currentPassword: ownerPassword })).status, 401);
  assert.equal((await site.post('/api/auth/email/bind', { email: 'bind@example.invalid', currentPassword: ownerPassword }, { headers: { Cookie: owner.cookie } })).status, 403);
  const unconfigured = await app(t, { configured: false }); assert.equal((await unconfigured.post('/api/register', signup())).status, 503);
  const insecure = await app(t, { origin: 'http://public.invalid' }); assert.equal((await insecure.post('/api/register', signup())).status, 403);
  assert.equal((await site.post('/api/register', '{broken')).status, 400);
  assert.equal((await site.post('/api/register', signup(), { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await site.post('/api/register', 'x'.repeat(4097))).status, 413);
  assert.equal((await site.post('/api/login', { email: 'owner@example.invalid', username: 'owner', password: ownerPassword })).status, 401);
  for (const rememberMe of ['true', 1, null, {}]) assert.equal((await site.post('/api/login', { username: 'owner', password: ownerPassword, rememberMe })).status, 401);
  for (const email of ['', 'owner', 'not-an-email']) assert.equal((await site.post('/api/login', { email, password: ownerPassword })).status, 401);
  for (const rememberMe of [true, false]) assert.equal((await site.post('/api/login', { username: 'owner', password: ownerPassword, rememberMe })).status, 200);
});

for (const length of [6, 7, 8, 9, 10, 11, 256]) test(`verified ordinary email login accepts ${length}-character password over actual HTTP`, async t => {
  const site = await app(t), password = 'A1' + 'x'.repeat(length - 2), email = `length-${length}@example.invalid`;
  const action = site.pending(email, { password }); assert.equal((await site.post('/api/auth/email/verify', { token: action.token })).status, 200);
  assert.equal((await site.login(email, password)).role, 'trial');
});

test('registration continuation rotates a presented session and rejects invalid, expired, cross-origin and raced claims without cookies', async t => {
  const site = await app(t), previous = await site.login('owner', ownerPassword);
  const action = site.pending('continuation@example.invalid');
  for (const headers of [{ Origin: '' }, { Origin: 'https://other.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const denied = await site.post('/api/auth/email/verify', { token: action.token }, { headers });
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('set-cookie'), null);
  }
  for (const body of [{ token: action.token, role: 'owner' }, { token: action.token, userId: 'owner' }, { token: 'invalid' }]) {
    const denied = await site.post('/api/auth/email/verify', body); assert.equal(denied.status, 400); assert.equal(denied.headers.get('set-cookie'), null);
  }
  const responses = await Promise.all([0, 1].map(() => site.post('/api/auth/email/verify', { token: action.token }, { session: previous })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
  const response = responses.find(response => response.status === 200), data = await response.json();
  const session = { ...data, cookie: response.headers.get('set-cookie').split(';')[0] };
  assert.notEqual(session.cookie, previous.cookie); assert.notEqual(data.csrfToken, previous.csrfToken);
  assert.equal(data.role, 'trial'); assert.equal(data.administrator, false);
  assert.equal((await site.request('/api/cases', { session: previous })).status, 401);
  assert.equal((await site.request('/api/cases', { session })).status, 200);
  assert.equal((await site.request('/api/settings', { session })).status, 403);
  assert.equal(responses.find(response => response.status === 400).headers.get('set-cookie'), null);
  const expired = site.pending('expired-continuation@example.invalid', { now: Date.now() - 601_000 });
  const denied = await site.post('/api/auth/email/verify', { token: expired.token });
  assert.equal(denied.status, 400); assert.equal(denied.headers.get('set-cookie'), null);
  assert.equal(site.withStorage(storage => storage.emailAuth.findByEmail('expired-continuation@example.invalid')), null);
});

test('binding including owner proof and reset proof never create a sign-in session', async t => {
  const site = await app(t);
  const legacy = site.withStorage(storage => storage.createTrialUser({ username: 'bind-no-login', passwordHash: makeHash(ordinaryPassword) }));
  for (const [userId, email] of [[legacy.id, 'bind-no-login@example.invalid'], ['owner', 'owner-no-login@example.invalid']]) {
    const action = site.pending(email, { kind: 'bind', userId });
    const response = await site.post('/api/auth/email/verify', { token: action.token });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { verified: true, authenticated: false });
    assert.equal(response.headers.get('set-cookie'), null);
  }
  const reset = site.pending('bind-no-login@example.invalid', { kind: 'reset', userId: legacy.id });
  const wrongPurpose = await site.post('/api/auth/email/verify', { token: reset.token });
  assert.equal(wrongPurpose.status, 400); assert.equal(wrongPurpose.headers.get('set-cookie'), null);
  const response = await site.post('/api/auth/password/reset', { token: reset.token, password: ordinaryPassword, passwordConfirmation: ordinaryPassword });
  assert.equal(response.status, 200); assert.equal((await response.json()).authenticated, false); assert.equal(response.headers.get('set-cookie'), null);
});
