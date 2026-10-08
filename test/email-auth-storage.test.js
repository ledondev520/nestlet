// Actual file-backed SQLite, real scrypt and subprocess races; synthetic credentials only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openStorage } from '../storage.js';
import { createOperatorAuth } from '../auth.js';
import { EMAIL_LIMITS, digest, normalizeEmail } from '../email-auth-domain.js';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const password = 'synthetic-email-storage-password';
const nextPassword = 'synthetic-email-storage-replacement';
function hash(value) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${scryptSync(value, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url')}`;
}
const passwordHash = hash(password), replacementHash = hash(nextPassword), ownerHash = hash('synthetic-owner-storage-password');
const payload = { title: 'Synthetic preserved case', sourceText: 'Synthetic retained source', fields: [], draftType: 'followup', draftText: '' };
const invalid = error => error.code === 'EMAIL_AUTH_INVALID';
function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-email-storage-'));
  const filename = join(directory, 'records.sqlite');
  const connections = [];
  const reopen = () => { const storage = openStorage({ filename }); connections.push(storage); return storage; };
  const storage = reopen();
  t.after(() => { for (const connection of connections) connection.close(); rmSync(directory, { recursive: true, force: true }); });
  return { filename, storage, reopen };
}
function inspect(filename, callback) {
  const db = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
  try { return callback(db); } finally { db.close(); }
}
function register(storage, email, now = NOW) {
  const action = storage.emailAuth.createAction({ kind: 'register', email, passwordHash, now });
  assert.ok(action);
  assert.equal(storage.emailAuth.markAccepted(action.tokenHash, now), true);
  assert.equal(storage.emailAuth.verify(action.tokenHash, { now }), true);
  return storage.emailAuth.findByEmail(email);
}
function accepted(storage, input) {
  const action = storage.emailAuth.createAction({ now: NOW, ...input });
  assert.ok(action);
  assert.equal(storage.emailAuth.markAccepted(action.tokenHash, NOW), true);
  return action;
}

test('pending registration stores only token/password hashes and creates no user until accepted verification', t => {
  const { storage, filename, reopen } = fixture(t), email = normalizeEmail('  Synthetic.User+tag@EXAMPLE.TEST  ');
  assert.equal(email, 'synthetic.user+tag@example.test');
  const action = storage.emailAuth.createAction({ kind: 'register', email, passwordHash, now: NOW });
  assert.match(action.token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(action.tokenHash, digest(action.token));
  assert.equal(action.expiresAt, NOW + EMAIL_LIMITS.verifyMs);
  assert.equal(storage.emailAuth.findByEmail(email), null);
  assert.equal(storage.emailAuth.pendingRegistration(email, NOW).passwordHash, passwordHash);
  inspect(filename, db => {
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
    const row = db.prepare('SELECT * FROM email_actions').get();
    assert.equal(row.token_hash, digest(action.token));
    assert.equal(row.password_hash, passwordHash);
    assert.equal(row.user_id, null);
    assert.equal(row.ready, 0);
    const persisted = JSON.stringify(db.prepare('SELECT * FROM email_actions').all());
    assert.equal(persisted.includes(action.token), false);
    assert.equal(persisted.includes(password), false);
  });
  assert.equal(readFileSync(filename).includes(Buffer.from(action.token)), false);
  assert.equal(readFileSync(filename).includes(Buffer.from(password)), false);
  assert.equal(storage.emailAuth.verify(action.tokenHash, { now: NOW }), false);
  assert.equal(storage.emailAuth.markAccepted(action.tokenHash, NOW), true);
  assert.equal(storage.emailAuth.findByEmail(email), null);
  storage.close();
  const again = reopen();
  assert.equal(again.emailAuth.verify(action.tokenHash, { now: NOW + 1 }), true);
  const user = again.emailAuth.findByEmail(email);
  assert.match(user.id, /^[0-9a-f-]{36}$/u);
  assert.equal(user.role, 'trial');
  assert.equal(user.passwordHash, passwordHash);
  assert.equal(again.emailAuth.identity(user.id).email, email);
  assert.equal(again.emailAuth.getAction(action.tokenHash), null);
  assert.equal(again.emailAuth.pendingRegistration(email, NOW), null);
  assert.equal(again.emailAuth.verify(action.tokenHash, { now: NOW + 2 }), false);
  assert.equal(again.emailAuth.markAccepted(action.tokenHash, NOW + 2), false);
});

test('canonical verified email is unique across registration/binding and enforced by actual SQLite', t => {
  const { storage, filename } = fixture(t);
  const email = normalizeEmail('  Canonical@EXAMPLE.TEST '), user = register(storage, email);
  const other = storage.createTrialUser({ username: 'legacy-unique', passwordHash });
  assert.equal(storage.emailAuth.createAction({ kind: 'register', email, passwordHash, now: NOW }), null);
  assert.equal(storage.emailAuth.createAction({ kind: 'bind', email, userId: other.id, credentialFingerprint: digest(passwordHash), now: NOW }), null);
  for (const uncanonical of ['Canonical@example.test', ' canonical@example.test ', 'invalid', 'a@invalid'])
    assert.throws(() => storage.emailAuth.createAction({ kind: 'register', email: uncanonical, passwordHash, now: NOW }), invalid);
  inspect(filename, db => {
    assert.throws(() => db.prepare('INSERT INTO email_identities VALUES(?,?,?)').run(other.id, email, NOW), /UNIQUE/u);
    assert.throws(() => db.prepare('INSERT INTO email_identities VALUES(?,?,?)').run(other.id, 'UPPER@example.test', NOW), /CHECK/u);
    assert.throws(() => db.prepare('INSERT INTO email_identities VALUES(?,?,?)').run(user.id, 'another@example.test', NOW), /UNIQUE/u);
    assert.throws(() => db.prepare('INSERT INTO email_identities VALUES(?,?,?)').run(randomUUID(), 'missing@example.test', NOW), /FOREIGN KEY/u);
    assert.equal(db.prepare('SELECT count(*) AS n FROM email_identities').get().n, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
});

test('expired, unknown, cancelled and superseded verification links cannot create accounts', t => {
  const { storage, filename } = fixture(t);
  const first = accepted(storage, { kind: 'register', email: 'expiry@example.test', passwordHash });
  assert.equal(storage.emailAuth.verify(first.tokenHash, { now: first.expiresAt }), false);
  assert.equal(storage.emailAuth.markAccepted(first.tokenHash, first.expiresAt), false);
  assert.equal(storage.emailAuth.pendingRegistration('expiry@example.test', first.expiresAt), null);
  const old = accepted(storage, { kind: 'register', email: 'resend@example.test', passwordHash });
  const latest = accepted(storage, { kind: 'register', email: 'resend@example.test', passwordHash });
  assert.equal(storage.emailAuth.verify(old.tokenHash, { now: NOW }), false);
  storage.emailAuth.cancel(latest.tokenHash);
  assert.equal(storage.emailAuth.verify(latest.tokenHash, { now: NOW }), false);
  assert.equal(storage.emailAuth.verify(digest('synthetic-missing-link'), { now: NOW }), false);
  assert.throws(() => storage.emailAuth.verify(latest.token), invalid);
  inspect(filename, db => assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 1));
});

test('register, bind and reset tokens remain purpose-separated and reset requires accepted, live, single-use token', t => {
  const { storage } = fixture(t);
  const registration = accepted(storage, { kind: 'register', email: 'purpose-register@example.test', passwordHash });
  assert.equal(storage.emailAuth.reset(registration.tokenHash, replacementHash, NOW), false);
  assert.equal(storage.emailAuth.verify(registration.tokenHash, { now: NOW }), true);
  const user = storage.emailAuth.findByEmail('purpose-register@example.test');
  const legacy = storage.createTrialUser({ username: 'purpose-legacy', passwordHash });
  const binding = accepted(storage, { kind: 'bind', email: 'purpose-bind@example.test', userId: legacy.id, credentialFingerprint: digest(passwordHash) });
  assert.equal(storage.emailAuth.reset(binding.tokenHash, replacementHash, NOW), false);
  assert.equal(storage.emailAuth.verify(binding.tokenHash, { now: NOW }), true);
  const reset = storage.emailAuth.createAction({ kind: 'reset', email: user.email, userId: user.id, credentialFingerprint: digest(passwordHash), now: NOW });
  assert.equal(reset.expiresAt, NOW + EMAIL_LIMITS.resetMs);
  assert.equal(storage.emailAuth.reset(reset.tokenHash, replacementHash, NOW), false);
  assert.equal(storage.emailAuth.markAccepted(reset.tokenHash, NOW), true);
  assert.equal(storage.emailAuth.verify(reset.tokenHash, { now: NOW }), false);
  assert.equal(storage.emailAuth.reset(reset.tokenHash, replacementHash, reset.expiresAt), false);
  assert.equal(storage.getUserById(user.id).passwordHash, passwordHash);
  assert.equal(storage.emailAuth.reset(reset.tokenHash, replacementHash, NOW + 1), true);
  assert.equal(storage.emailAuth.reset(reset.tokenHash, passwordHash, NOW + 2), false);
  assert.equal(storage.getUserById(user.id).passwordHash, replacementHash);
  assert.equal(storage.emailAuth.findByEmail(user.email).id, user.id);
  assert.equal(storage.getUserById(legacy.id).passwordHash, passwordHash);
});

test('reset rotates actual stored credential, invalidates old sessions and preserves user/case identity across restart', async t => {
  const { storage, reopen } = fixture(t);
  const user = register(storage, 'session-reset@example.test'), saved = storage.createCase(user.id, payload);
  const auth = createOperatorAuth({ passwordHash: ownerHash, findTrialUser: name => storage.findUserByUsername(name), findTrialUserById: id => storage.getUserById(id), findUserByEmail: email => storage.emailAuth.findByEmail(email) });
  const login = await auth.login(password, user.email);
  assert.equal(login.userId, user.id);
  const request = { headers: { cookie: login.cookie } };
  assert.equal(auth.getSession(request).userId, user.id);
  const reset = accepted(storage, { kind: 'reset', email: user.email, userId: user.id, credentialFingerprint: digest(passwordHash) });
  assert.equal(storage.emailAuth.reset(reset.tokenHash, replacementHash, NOW), true);
  assert.equal(auth.getSession(request), null);
  assert.equal((await auth.login(password, user.email)).error, 'INVALID_CREDENTIALS');
  const newLogin = await auth.login(nextPassword, user.email);
  assert.equal(newLogin.userId, user.id);
  assert.equal(auth.getSession({ headers: { cookie: newLogin.cookie } }).userId, user.id);
  assert.deepEqual(storage.getCase(user.id, saved.id), saved);
  storage.close();
  const again = reopen();
  assert.equal(again.emailAuth.findByEmail(user.email).passwordHash, replacementHash);
  assert.deepEqual(again.getCase(user.id, saved.id), saved);
});

test('bind/reset compare current credential fingerprints and reject intervening password rotations', t => {
  const { storage } = fixture(t);
  const legacy = storage.createTrialUser({ username: 'fingerprint-bind', passwordHash });
  assert.equal(storage.emailAuth.createAction({ kind: 'bind', email: 'cas-bind@example.test', userId: legacy.id, credentialFingerprint: digest(replacementHash), now: NOW }), null);
  const binding = accepted(storage, { kind: 'bind', email: 'cas-bind@example.test', userId: legacy.id, credentialFingerprint: digest(passwordHash) });
  storage.upsertTrialUser({ username: legacy.username, passwordHash: replacementHash });
  assert.equal(storage.emailAuth.verify(binding.tokenHash, { now: NOW }), false);
  assert.equal(storage.emailAuth.identity(legacy.id), null);
  assert.equal(storage.getUserById(legacy.id).passwordHash, replacementHash);
  const user = register(storage, 'cas-reset@example.test');
  const reset = accepted(storage, { kind: 'reset', email: user.email, userId: user.id, credentialFingerprint: digest(passwordHash) });
  storage.upsertTrialUser({ username: user.username, passwordHash: replacementHash });
  assert.equal(storage.emailAuth.reset(reset.tokenHash, passwordHash, NOW), false);
  assert.equal(storage.getUserById(user.id).passwordHash, replacementHash);
  assert.equal(storage.emailAuth.createAction({ kind: 'reset', email: user.email, userId: user.id, credentialFingerprint: digest(passwordHash), now: NOW }), null);
  assert.equal(storage.emailAuth.createAction({ kind: 'reset', email: 'foreign@example.test', userId: user.id, credentialFingerprint: digest(replacementHash), now: NOW }), null);
});

test('binding preserves legacy users/cases and owner CHECK stays intact with external owner fingerprint', t => {
  const { storage, filename } = fixture(t);
  const legacy = storage.createTrialUser({ username: 'legacy-bind-preserved', passwordHash });
  const saved = storage.createCase(legacy.id, payload), ownerCase = storage.createCase('owner', payload);
  const before = storage.getUserById(legacy.id), owner = storage.getUserById('owner');
  const binding = accepted(storage, { kind: 'bind', email: 'legacy-preserved@example.test', userId: legacy.id, credentialFingerprint: digest(passwordHash) });
  assert.equal(storage.emailAuth.verify(binding.tokenHash, { now: NOW }), true);
  assert.deepEqual(storage.getUserById(legacy.id), before);
  assert.deepEqual(storage.getCase(legacy.id, saved.id), saved);
  assert.equal(storage.emailAuth.createAction({ kind: 'bind', email: 'second-identity@example.test', userId: legacy.id, credentialFingerprint: digest(passwordHash), now: NOW }), null);
  const ownerBinding = accepted(storage, { kind: 'bind', email: 'synthetic-owner@example.test', userId: 'owner', credentialFingerprint: digest(ownerHash) });
  assert.equal(storage.emailAuth.verify(ownerBinding.tokenHash, { now: NOW }), false);
  assert.equal(storage.emailAuth.verify(ownerBinding.tokenHash, { now: NOW, ownerFingerprint: digest(replacementHash) }), false);
  assert.equal(storage.emailAuth.verify(ownerBinding.tokenHash, { now: NOW, ownerFingerprint: digest(ownerHash) }), true);
  assert.deepEqual(storage.getUserById('owner'), owner);
  assert.deepEqual(storage.getCase('owner', ownerCase.id), ownerCase);
  assert.equal(storage.emailAuth.createAction({ kind: 'reset', email: 'synthetic-owner@example.test', userId: 'owner', credentialFingerprint: digest(ownerHash), now: NOW }), null);
  inspect(filename, db => {
    assert.throws(() => db.prepare("UPDATE users SET password_hash=? WHERE id='owner'").run(passwordHash), /CHECK/u);
    assert.throws(() => db.prepare("UPDATE users SET username='renamed-owner' WHERE id='owner'").run(), /CHECK/u);
    assert.throws(() => db.prepare("UPDATE users SET role='owner' WHERE id=?").run(legacy.id), /CHECK/u);
    assert.equal(db.prepare("SELECT password_hash FROM users WHERE id='owner'").get().password_hash, null);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
});

// All workers open their own SQLite connection before an IPC barrier releases verification.
async function raceVerification(t, filename, tokenHashes) {
  const script = `import { openStorage } from ${JSON.stringify(new URL('../storage.js', import.meta.url).href)};
    const storage = openStorage({ filename: process.argv[1] });
    process.once('message', input => {
      try { const result = storage.emailAuth.verify(input.tokenHash, { now: input.now });
        storage.close(); process.stdout.write(JSON.stringify(result)); process.disconnect();
      } catch (error) { storage.close(); console.error(error); process.exitCode=1; process.disconnect(); }
    });
    process.send('ready');`;
  const workers = tokenHashes.map(tokenHash => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, filename], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    let output = '', errors = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    const ready = new Promise((resolve, reject) => {
      child.once('message', message => message === 'ready' ? resolve() : reject(new Error('Unexpected worker readiness')));
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Worker exited before readiness (${code}): ${errors}`)));
    });
    const done = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => {
        try { assert.equal(code, 0, errors); resolve(JSON.parse(output)); } catch (error) { reject(error); }
      });
    });
    // Attach rejection handlers immediately while waiting for the barrier.
    ready.catch(() => {}); done.catch(() => {});
    return { child, tokenHash, ready, done };
  });
  const timeout = new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('SQLite verification race timed out')), 15_000); t.after(() => clearTimeout(timer)); timer.unref(); });
  return Promise.race([timeout, (async () => {
    await Promise.all(workers.map(worker => worker.ready));
    for (const worker of workers) worker.child.send({ tokenHash: worker.tokenHash, now: NOW });
    return Promise.all(workers.map(worker => worker.done));
  })()]);
}

test('four real processes racing the same accepted token produce exactly one verified account', async t => {
  const { storage, filename, reopen } = fixture(t);
  const action = accepted(storage, { kind: 'register', email: 'race-token@example.test', passwordHash });
  storage.close();
  const results = await raceVerification(t, filename, Array(4).fill(action.tokenHash));
  assert.equal(results.filter(Boolean).length, 1);
  inspect(filename, db => {
    assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE role='trial'").get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM email_identities').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM email_actions').get().n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
  assert.ok(reopen().emailAuth.findByEmail('race-token@example.test'));
});

test('real processes racing registration and legacy binding for the same canonical email preserve uniqueness', async t => {
  const { storage, filename, reopen } = fixture(t);
  const legacy = storage.createTrialUser({ username: 'race-existing-user', passwordHash }), saved = storage.createCase(legacy.id, payload);
  const email = normalizeEmail('Race.Identity@EXAMPLE.TEST');
  const registration = accepted(storage, { kind: 'register', email, passwordHash });
  const binding = accepted(storage, { kind: 'bind', email, userId: legacy.id, credentialFingerprint: digest(passwordHash) });
  storage.close();
  const results = await raceVerification(t, filename, [registration.tokenHash, binding.tokenHash]);
  assert.equal(results.filter(Boolean).length, 1);
  inspect(filename, db => {
    assert.equal(db.prepare('SELECT count(*) AS n FROM email_identities WHERE email=?').get(email).n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE role='trial'").get().n, results[0] ? 2 : 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM email_actions WHERE email=?').get(email).n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
  const again = reopen();
  assert.deepEqual(again.getCase(legacy.id, saved.id), saved);
  assert.equal(again.emailAuth.findByEmail(email).id === legacy.id, results[1]);
});

test('email cooldown/hour buckets persist across restart, expire, and contain only hashed identifiers', t => {
  const { storage, filename, reopen } = fixture(t), email = 'limits-email@example.test', ip = '192.0.2.10';
  assert.equal(storage.emailAuth.reserveRequest(email, ip, NOW), 'allowed');
  storage.close();
  const again = reopen();
  assert.equal(again.emailAuth.reserveRequest(email, ip, NOW + 1), 'suppressed');
  for (let i = 1; i < EMAIL_LIMITS.requestsPerEmailHour; i++)
    assert.equal(again.emailAuth.reserveRequest(email, ip, NOW + i * EMAIL_LIMITS.resendMs), 'allowed');
  assert.equal(again.emailAuth.reserveRequest(email, ip, NOW + EMAIL_LIMITS.requestsPerEmailHour * EMAIL_LIMITS.resendMs), 'suppressed');
  inspect(filename, db => {
    const rows = db.prepare('SELECT * FROM email_rate_buckets').all();
    assert.ok(rows.length > 0);
    for (const row of rows) assert.match(row.bucket_hash, /^[0-9a-f]{64}$/u);
    assert.equal(JSON.stringify(rows).includes(email), false);
    assert.equal(JSON.stringify(rows).includes(ip), false);
  });
  assert.equal(again.emailAuth.reserveRequest(email, ip, NOW + 3600_000 + EMAIL_LIMITS.resendMs), 'allowed');
});

test('send buckets enforce distinct IP and global limits across restarted storage', t => {
  const first = fixture(t);
  for (let i = 0; i < EMAIL_LIMITS.requestsPerIpHour; i++)
    assert.equal(first.storage.emailAuth.reserveRequest(`ip-${i}@example.test`, '192.0.2.20', NOW), 'allowed');
  first.storage.close();
  assert.equal(first.reopen().emailAuth.reserveRequest('ip-over@example.test', '192.0.2.20', NOW), 'rate-limited');
  const second = fixture(t);
  for (let i = 0; i < EMAIL_LIMITS.requestsPerHour; i++)
    assert.equal(second.storage.emailAuth.reserveRequest(`global-${i}@example.test`, `198.51.100.${i + 1}`, NOW), 'allowed');
  second.storage.close();
  const again = second.reopen();
  assert.equal(again.emailAuth.reserveRequest('global-over@example.test', '203.0.113.1', NOW), 'rate-limited');
  assert.equal(again.emailAuth.reserveRequest('global-over@example.test', '203.0.113.1', NOW + 3600_000), 'allowed');
});

test('claim rate limits persist across restart and expired buckets recover bounded capacity', t => {
  const { storage, filename, reopen } = fixture(t);
  for (let i = 0; i < 60; i++) assert.equal(storage.emailAuth.reserveClaim('192.0.2.30', NOW), true);
  storage.close();
  const again = reopen();
  assert.equal(again.emailAuth.reserveClaim('192.0.2.30', NOW), false);
  assert.equal(again.emailAuth.reserveClaim('192.0.2.30', NOW + 600_000), true);
  inspect(filename, db => {
    db.exec('DELETE FROM email_rate_buckets; BEGIN IMMEDIATE');
    const insert = db.prepare('INSERT INTO email_rate_buckets VALUES(?,1,?)');
    for (let i = 0; i < 4096; i++) insert.run(digest('synthetic-capacity-' + i), NOW + 3600_000);
    db.exec('COMMIT');
  });
  assert.equal(again.emailAuth.reserveClaim('192.0.2.31', NOW), false);
  inspect(filename, db => assert.equal(db.prepare('SELECT count(*) AS n FROM email_rate_buckets').get().n, 4096));
  assert.equal(again.emailAuth.reserveClaim('192.0.2.31', NOW + 3600_000), true);
  inspect(filename, db => assert.equal(db.prepare('SELECT count(*) AS n FROM email_rate_buckets').get().n, 2));
});

// Separate global limit from the per-IP ceiling by distributing synthetic callers.
test('claim global bucket is durable across restart and resets after its ten-minute window', t => {
  const { storage, reopen } = fixture(t);
  for (let i = 0; i < 600; i++)
    assert.equal(storage.emailAuth.reserveClaim(`203.0.113.${i % 11 + 1}`, NOW), true);
  storage.close();
  const again = reopen();
  assert.equal(again.emailAuth.reserveClaim('198.51.100.240', NOW), false);
  assert.equal(again.emailAuth.reserveClaim('198.51.100.240', NOW + 600_000), true);
});

test('an exhausted single IP cannot spend other IPs remaining global send or claim budgets', t => {
  const { storage } = fixture(t);
  for (let i = 0; i < 20; i++) assert.equal(storage.emailAuth.reserveRequest(`one-${i}@example.invalid`, 'one-ip', NOW), 'allowed');
  for (let i = 0; i < 100; i++) assert.equal(storage.emailAuth.reserveRequest(`blocked-${i}@example.invalid`, 'one-ip', NOW), 'rate-limited');
  assert.equal(storage.emailAuth.reserveRequest('other@example.invalid', 'other-ip', NOW), 'allowed');
  for (let i = 0; i < 60; i++) assert.equal(storage.emailAuth.reserveClaim('one-ip', NOW), true);
  for (let i = 0; i < 650; i++) assert.equal(storage.emailAuth.reserveClaim('one-ip', NOW), false);
  assert.equal(storage.emailAuth.reserveClaim('other-ip', NOW), true);
});

test('ordinary account capacity is reserved atomically at verification; pending users never bypass the cap', t => {
  const { storage } = fixture(t);
  for (let i = 0; i < 99; i++) storage.createTrialUser({ username: `existing-capacity-${i}`, passwordHash });
  const a = storage.emailAuth.createAction({ kind: 'register', email: 'last-a@example.invalid', passwordHash, now: NOW });
  const b = storage.emailAuth.createAction({ kind: 'register', email: 'last-b@example.invalid', passwordHash, now: NOW });
  storage.emailAuth.markAccepted(a.tokenHash, NOW); storage.emailAuth.markAccepted(b.tokenHash, NOW);
  assert.equal(storage.emailAuth.verify(a.tokenHash, { now: NOW }), true);
  assert.equal(storage.emailAuth.verify(b.tokenHash, { now: NOW }), false);
  assert.equal(storage.emailAuth.findByEmail('last-b@example.invalid'), null);
  assert.equal(storage.emailAuth.createAction({ kind: 'register', email: 'over-cap@example.invalid', passwordHash, now: NOW }), null);
});

test('registration session refusal rolls back both new identity and token consumption', t => {
  const { storage } = fixture(t);
  const action = accepted(storage, { kind: 'register', email: 'session-refusal@example.invalid', passwordHash });
  let target;
  assert.throws(() => storage.emailAuth.verify(action.tokenHash, { now: NOW, onRegistration(user) { target = user; throw new Error('Synthetic session capacity refusal'); } }), /capacity refusal/);
  assert.equal(target.role, 'trial'); assert.notEqual(target.id, 'owner');
  assert.equal(storage.getUserById(target.id), null); assert.equal(storage.emailAuth.findByEmail('session-refusal@example.invalid'), null);
  assert.equal(storage.emailAuth.getAction(action.tokenHash).ready, 1);
  let calls = 0;
  assert.equal(storage.emailAuth.verify(action.tokenHash, { now: NOW, onRegistration() { calls++; } }), true);
  assert.equal(storage.emailAuth.verify(action.tokenHash, { now: NOW, onRegistration() { calls++; } }), false);
  assert.equal(calls, 1);
});
