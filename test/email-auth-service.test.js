// Service contract tests with explicitly fake delivery. Real SQLite/scrypt are used;
// none of these tests is real provider, mailbox, or browser acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../storage.js';
import { createEmailAuth } from '../email-auth.js';
import { createOperatorAuth } from '../auth.js';
import { hashPassword, normalizeEmail, digest } from '../email-auth-domain.js';
const password = 'public-service-test-password', ownerPassword = 'public-service-test-owner';
const ownerHash = await hashPassword(ownerPassword);
async function fixture(t, options = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-email-service-')); let at = Date.now();
  const storage = openStorage({ filename: join(root, 'nestlet.sqlite') }), messages = [];
  const delivery = { configured: true, status: () => ({ configured: true }), send: async message => { messages.push(message); return { accepted: true }; }, ...options.delivery };
  const auth = createEmailAuth({ storage: storage.emailAuth, delivery, publicOrigin: options.origin ?? 'https://trusted.example.invalid', currentCredential: id => id === 'owner' ? ownerHash : storage.getUserById(id)?.passwordHash, now: () => at });
  t.after(async () => { await auth.whenIdle(); storage.close(); rmSync(root, { recursive: true, force: true }); });
  const sessionAuth = createOperatorAuth({ passwordHash: ownerHash, publicOrigin: 'https://trusted.example.invalid', findTrialUser: name => storage.findUserByUsername(name), findTrialUserById: id => storage.getUserById(id), findUserByEmail: email => storage.emailAuth.findByEmail(email) });
  const token = (index = messages.length - 1) => new URLSearchParams(new URL(messages[index].link).hash.slice(1)).get('token');
  const register = async (email, pw = password) => { const response = await auth.register({ email, password: pw, passwordConfirmation: pw }, 'synthetic-ip'); await auth.whenIdle(); return response; };
  const advance = milliseconds => { at += milliseconds; };
  return { storage, auth, messages, token, register, advance, sessionAuth, get now() { return at; } };
}
const accepted = { accepted: true, authenticated: false, next: 'check-email-if-eligible', retryAfter: 60 };

test('canonical email policy is ASCII-first, unique lowercase and does not fold mailbox aliases', () => {
  assert.equal(normalizeEmail('  Test+tag@Example.INVALID '), 'test+tag@example.invalid');
  for (const invalid of ['K@example.invalid', 'a@exämple.invalid', 'a@b', 'a..b@example.invalid', '.a@example.invalid', 'a.@example.invalid', 'a@-example.invalid', 'a@example-.invalid', 'a\nb@example.invalid', 'a@b@example.invalid']) assert.equal(normalizeEmail(invalid), null, invalid);
  assert.notEqual(normalizeEmail('a.b@example.invalid'), normalizeEmail('ab@example.invalid'));
});

test('fake-delivery contract: enrollment remains pending until proof; fragment link is fixed-origin and no token returns publicly', async t => {
  const f = await fixture(t), email = 'new@example.invalid';
  const response = await f.register(email); assert.deepEqual(response, accepted); assert.equal(f.storage.emailAuth.findByEmail(email), null);
  assert.equal((await f.sessionAuth.login(password, email)).error, 'INVALID_CREDENTIALS');
  const url = new URL(f.messages[0].link); assert.equal(url.origin, 'https://trusted.example.invalid'); assert.equal(url.pathname, '/'); assert.equal(url.search, ''); assert.equal(new URLSearchParams(url.hash.slice(1)).get('auth'), 'verify');
  assert.equal(JSON.stringify(response).includes(f.token()), false);
  assert.deepEqual(f.auth.verify({ token: f.token() }, 'synthetic-ip'), { verified: true, authenticated: false });
  const user = await f.sessionAuth.login(password, ' NEW@EXAMPLE.INVALID '); assert.equal(user.role, 'trial'); assert.notEqual(user.userId, 'owner');
  assert.throws(() => f.auth.verify({ token: f.token() }, 'synthetic-ip'), error => error.code === 'EMAIL_TOKEN_INVALID');
});

test('fake-delivery contract: duplicate, unknown, pending and cooldown-suppressed requests have identical generic results', async t => {
  const f = await fixture(t), email = 'duplicate@example.invalid';
  assert.deepEqual(await f.register(email), accepted); const firstToken = f.token();
  assert.deepEqual(await f.register(' DUPLICATE@EXAMPLE.INVALID '), accepted); assert.equal(f.messages.length, 1);
  f.auth.verify({ token: firstToken }, 'synthetic-ip'); f.advance(61_000);
  assert.deepEqual(await f.register(email), accepted); assert.equal(f.messages.length, 1);
  assert.deepEqual(await f.auth.forgot({ email: 'absent@example.invalid' }, 'synthetic-ip'), accepted);
  assert.deepEqual(await f.auth.resend({ email: 'absent-resend@example.invalid' }, 'synthetic-ip'), accepted); await f.auth.whenIdle(); assert.equal(f.messages.length, 1);
});

test('fake-delivery contract: resend supersedes token and expiry rejects old proof without activating user', async t => {
  const f = await fixture(t), email = 'resend@example.invalid'; await f.register(email); const old = f.token();
  f.advance(61_000); assert.deepEqual(await f.auth.resend({ email }, 'synthetic-ip'), accepted); await f.auth.whenIdle();
  assert.notEqual(f.token(), old); assert.throws(() => f.auth.verify({ token: old }, 'synthetic-ip'), e => e.code === 'EMAIL_TOKEN_INVALID');
  f.advance(600_000); assert.throws(() => f.auth.verify({ token: f.token() }, 'synthetic-ip'), e => e.code === 'EMAIL_TOKEN_INVALID'); assert.equal(f.storage.emailAuth.findByEmail(email), null);
});

test('fake-delivery contract: invalid/missing trusted origin or delivery config fails truthfully without creating actions', async t => {
  for (const origin of ['', 'https://user:pass@example.invalid', 'https://example.invalid/path', 'http://public.example.invalid', 'https://example.invalid#fragment']) {
    const f = await fixture(t, { origin }); assert.equal(f.auth.configured, false); await assert.rejects(f.register('new@example.invalid'), e => e.code === 'EMAIL_DELIVERY_UNAVAILABLE'); assert.equal(f.messages.length, 0);
  }
  const f = await fixture(t, { delivery: { configured: false } }); assert.equal(f.auth.configured, false); await assert.rejects(f.auth.forgot({ email: 'unknown@example.invalid' }, 'ip'), e => e.code === 'EMAIL_DELIVERY_UNAVAILABLE');
});

test('fake-delivery contract: failed/unconfirmed sends never make usable verification tokens or report sent', async t => {
  for (const receipt of [undefined, { accepted: false }, 'throws']) {
    const f = await fixture(t, { delivery: { send: async message => { f.messages.push(message); if (receipt === 'throws') throw new Error('Synthetic upstream secret'); return receipt; } } });
    assert.deepEqual(await f.register('fail@example.invalid'), accepted);
    assert.equal(f.storage.emailAuth.getAction(digest(f.token())).ready, 0); assert.throws(() => f.auth.verify({ token: f.token() }, 'ip'), e => e.code === 'EMAIL_TOKEN_INVALID');
  }
});

test('fake-delivery contract: public forgot response does not wait on recipient-specific provider latency', async t => {
  let release; const f = await fixture(t); await f.register('timing@example.invalid'); f.auth.verify({ token: f.token() }, 'ip'); f.advance(61_000);
  // Fresh service reuses actual verified storage but a deliberately held fake provider.
  const auth = createEmailAuth({ storage: f.storage.emailAuth, publicOrigin: 'https://trusted.example.invalid', currentCredential: () => ownerHash, now: () => f.now,
    delivery: { configured: true, status: () => ({}), send: () => new Promise(resolve => { release = resolve; }) } });
  assert.deepEqual(await auth.forgot({ email: 'timing@example.invalid' }, 'ip'), accepted);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof release, 'function'); release({ accepted: true }); await auth.whenIdle();
});

test('fake-delivery contract: legacy binding requires current password and preserves account identity; owner remains private-recovery only', async t => {
  const f = await fixture(t); const legacy = f.storage.createTrialUser({ username: 'legacy-user', passwordHash: await hashPassword(password) });
  await assert.rejects(f.auth.bind({ email: 'wrong@example.invalid', currentPassword: 'wrong-password' }, { userId: legacy.id }, 'ip'), e => e.code === 'INVALID_CREDENTIALS');
  assert.equal(f.messages.length, 0);
  await f.auth.bind({ email: 'legacy@example.invalid', currentPassword: password }, { userId: legacy.id }, 'ip'); await f.auth.whenIdle(); f.auth.verify({ token: f.token() }, 'ip');
  assert.equal((await f.sessionAuth.login(password, 'legacy@example.invalid')).userId, legacy.id);
  assert.equal((await f.sessionAuth.login(password, 'legacy-user')).userId, legacy.id);
  await f.auth.bind({ email: 'owner@example.invalid', currentPassword: ownerPassword }, { userId: 'owner' }, 'ip'); await f.auth.whenIdle(); f.auth.verify({ token: f.token() }, 'ip');
  assert.equal((await f.sessionAuth.login(ownerPassword, 'owner@example.invalid')).role, 'owner');
  assert.equal(f.auth.status('owner', 'owner').passwordRecoveryMethod, 'private-bootstrap'); f.advance(61_000); const before = f.messages.length;
  assert.deepEqual(await f.auth.forgot({ email: 'owner@example.invalid' }, 'ip'), accepted); await f.auth.whenIdle(); assert.equal(f.messages.length, before); assert.equal(f.storage.getUserById('owner').passwordHash, null);
});

test('fake-delivery contract: verified password reset invalidates sessions and old tokens, while password rotation during login fails closed', async t => {
  const f = await fixture(t), email = 'reset@example.invalid'; await f.register(email); f.auth.verify({ token: f.token() }, 'ip');
  const session = await f.sessionAuth.login(password, email); f.advance(61_000);
  await f.auth.forgot({ email }, 'ip'); await f.auth.whenIdle(); const reset = f.token(); const newPassword = 'changed-public-test';
  assert.equal(new URLSearchParams(new URL(f.messages.at(-1).link).hash.slice(1)).get('auth'), 'reset');
  assert.throws(() => f.auth.verify({ token: reset }, 'ip'), e => e.code === 'EMAIL_TOKEN_INVALID');
  assert.deepEqual(await f.auth.reset({ token: reset, password: newPassword, passwordConfirmation: newPassword }, 'ip'), { reset: true, authenticated: false });
  assert.equal(f.sessionAuth.getSession({ headers: { cookie: session.cookie.split(';')[0] } }), null);
  await assert.rejects(f.auth.reset({ token: reset, password: newPassword, passwordConfirmation: newPassword }, 'ip'), e => e.code === 'EMAIL_TOKEN_INVALID');
  assert.equal((await f.sessionAuth.login(newPassword, email)).userId, session.userId);
  const attempt = f.sessionAuth.login(newPassword, email);
  f.storage.upsertTrialUser({ username: session.username, passwordHash: await hashPassword('another-new-password') });
  // A scheduling-independent stale credential check is additionally covered by storage CAS tests.
  const result = await attempt; if (result.cookie) assert.equal(f.sessionAuth.getSession({ headers: { cookie: result.cookie.split(';')[0] } }), null); else assert.equal(result.error, 'INVALID_CREDENTIALS');
});

for (const length of [6, 7, 8, 9, 10, 11, 256]) test(`fake-delivery registration accepts ${length} password characters; verification/login uses actual scrypt`, async t => {
  const f = await fixture(t), pw = 'x'.repeat(length), email = `length-${length}@example.invalid`; await f.register(email, pw); f.auth.verify({ token: f.token() }, 'ip'); assert.equal((await f.sessionAuth.login(pw, email)).role, 'trial');
});

test('fake-delivery contract: email-only resend recovers an unconfirmed registration with a fresh accepted token', async t => {
  let succeeds = false;
  const f = await fixture(t, { delivery: { send: async message => { f.messages.push(message); if (!succeeds) throw new Error('Synthetic transport failure'); return { accepted: true }; } } });
  await f.register('retry@example.invalid'); const failedToken = f.token();
  assert.equal(f.storage.emailAuth.getAction(digest(failedToken)).ready, 0);
  succeeds = true; f.advance(61_000);
  assert.deepEqual(await f.auth.resend({ email: 'retry@example.invalid' }, 'ip'), accepted); await f.auth.whenIdle();
  assert.notEqual(f.token(), failedToken); assert.throws(() => f.auth.verify({ token: failedToken }, 'ip'), e => e.code === 'EMAIL_TOKEN_INVALID');
  assert.equal(f.auth.verify({ token: f.token() }, 'ip').verified, true);
});
