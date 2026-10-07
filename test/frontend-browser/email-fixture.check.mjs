// Actual Node HTTP + SQLite sanity. Simulated DirectMail acceptance, NOT delivery,
// real elapsed TTL, or browser execution. No production credential/endpoint changes.
import assert from 'node:assert/strict';
import { startBrowserFixture } from '../helpers/browser-fixture.mjs';
const app = await startBrowserFixture({ simulatedMail: true });
const accepted = { accepted: true, authenticated: false, next: 'check-email-if-eligible', retryAfter: 60 };
const password = 'Case26', nextPassword = 'Next27', email = 'synthetic-http-auth@example.invalid';
const tokens = [];
async function call(path, body, cookie = '') {
  return fetch(app.origin + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: app.origin, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function expectAccepted(path, body) {
  const response = await call(path, body);
  assert.equal(response.status, 202); assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), accepted);
}
async function register(address) {
  await expectAccepted('/api/register', { email: address, password, passwordConfirmation: password });
  const mail = await app.mailFor(address, 'verify'); tokens.push(mail.token); return mail;
}
try {
  assert.equal((await (await call('/api/status')).json()).registrationEnabled, true);
  for (const path of ['/test/helpers/simulated-email-bootstrap.mjs', '/api/test/email', '/api/debug/email', '/test/frontend-browser/email-support.js']) assert.equal((await call(path)).status, 404);
  assert.equal((await call('/api/register', { username: 'obsolete-bypass', password, passwordConfirmation: password })).status, 400);
  assert.equal((await call('/api/register', { email, password, passwordConfirmation: 'Wrong6' })).status, 400);
  const first = await register(email);
  assert.equal((await call('/api/login', { email, password })).status, 401);
  assert.equal(app.withDatabase(db => db.prepare('SELECT count(*) AS n FROM email_identities').get().n), 0);
  await expectAccepted('/api/auth/email/resend', { email });
  assert.equal(app.mailCount(email, 'verify'), 1);
  app.endEmailCooldown(email); // Private disposable preparation, not elapsed time.
  await expectAccepted('/api/auth/email/resend', { email });
  const replacement = await app.mailFor(email, 'verify', 1); tokens.push(replacement.token);
  assert.equal((await call('/api/auth/email/verify', { token: first.token })).status, 400);
  const verified = await call('/api/auth/email/verify', { token: replacement.token });
  assert.equal(verified.status, 200); assert.deepEqual(await verified.json(), { verified: true, authenticated: false });
  assert.equal((await call('/api/auth/email/verify', { token: replacement.token })).status, 400);
  const login = await call('/api/login', { email, password }); assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const before = await (await call('/api/status', undefined, cookie)).json();
  assert.equal(before.authenticated, true); assert.equal(before.emailVerified, true); assert.equal(before.email, email);
  app.endEmailCooldown(email);
  await expectAccepted('/api/register', { email, password, passwordConfirmation: password });
  app.endEmailCooldown(email);
  await expectAccepted('/api/auth/password/forgot', { email });
  await expectAccepted('/api/auth/password/forgot', { email: 'unknown-http@example.invalid' });
  const reset = await app.mailFor(email, 'reset'); tokens.push(reset.token);
  assert.equal((await call('/api/auth/password/reset', { token: reset.token, password: nextPassword, passwordConfirmation: 'Wrong6' })).status, 400);
  assert.equal((await (await call('/api/status', undefined, cookie)).json()).authenticated, true);
  const changed = await call('/api/auth/password/reset', { token: reset.token, password: nextPassword, passwordConfirmation: nextPassword });
  assert.equal(changed.status, 200); assert.deepEqual(await changed.json(), { reset: true, authenticated: false });
  assert.equal((await (await call('/api/status', undefined, cookie)).json()).authenticated, false);
  assert.equal((await call('/api/cases', undefined, cookie)).status, 401);
  assert.equal((await call('/api/login', { email, password })).status, 401);
  assert.equal((await call('/api/login', { email, password: nextPassword })).status, 200);
  assert.equal((await call('/api/auth/password/reset', { token: reset.token, password: 'Again8', passwordConfirmation: 'Again8' })).status, 400);
  const expired = await register('synthetic-http-expired@example.invalid'); assert.equal(app.expireToken(expired.token), 1);
  assert.equal((await call('/api/auth/email/verify', { token: expired.token })).status, 400);
  app.endEmailCooldown(email); await expectAccepted('/api/auth/password/forgot', { email });
  const expiredReset = await app.mailFor(email, 'reset', 1); tokens.push(expiredReset.token); assert.equal(app.expireToken(expiredReset.token), 1);
  assert.equal((await call('/api/auth/password/reset', { token: expiredReset.token, password: 'Again8', passwordConfirmation: 'Again8' })).status, 400);
  assert.equal((await call('/api/login', { email, password: nextPassword })).status, 200);
  for (const token of tokens) assert.equal(app.logs().includes(token), false, 'One-time secrets must not appear in server logs');
  assert.equal(app.logs().includes(password), false);
  assert.equal(app.logs().includes('public-synthetic-test-key-secret'), false);
  console.log('PASS: real Node HTTP/SQLite required-email enrollment, generic requests, explicit activation, resend replacement/cooldown, single-use reset, active-session invalidation, expired-token rejection and log hygiene. Mail transport SIMULATED; expiry aged privately; browser/genuine delivery NOT RUN.');
} finally { await app.stop(); }
