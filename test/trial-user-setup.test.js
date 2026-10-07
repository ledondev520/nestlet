// Strict acceptance: private actual SQLite files and real scrypt; no I/O or credential mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, chmod, readFile, writeFile, rm, symlink, link, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { openStorage } from '../storage.js';
import { inspectTrialDatabase, setTrialUserPassword } from '../scripts/trial-user-setup.js';

const password = 'public-trial-setup-test-password';
async function fixture(context) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-trial-setup-'));
  await chmod(directory, 0o700);
  context.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, 'nestlet.sqlite');
  openStorage({ filename: target }).close();
  return { directory, target };
}
async function setUser(target, options = {}) {
  const username = options.username ?? 'trial.example';
  const metadata = await inspectTrialDatabase(target, username);
  return setTrialUserPassword({ target, username, password, passwordConfirmation: password, confirmed: true, expectedIdentity: metadata.identity, ...options });
}
function verify(passwordHash, plain) {
  const parts = passwordHash.split('$');
  assert.equal(parts[0], 'scrypt');
  assert.equal(timingSafeEqual(scryptSync(plain, Buffer.from(parts[1], 'base64url'), 32), Buffer.from(parts[2], 'base64url')), true);
}

test('private trial setup creates only a named trial identity and returns no password or hash', async context => {
  const { target } = await fixture(context);
  const metadata = await inspectTrialDatabase(target, ' Trial.Example ');
  assert.equal(metadata.username, 'trial.example');
  assert.equal(metadata.exists, false);
  assert.deepEqual(Object.keys(metadata).sort(), ['exists', 'identity', 'path', 'username']);
  const result = await setUser(target, { username: ' Trial.Example ' });
  assert.equal(result.role, 'trial');
  assert.equal(result.username, 'trial.example');
  assert.equal(result.updated, true);
  assert.deepEqual(Object.keys(result).sort(), ['path', 'role', 'updated', 'userId', 'username']);
  assert.equal(JSON.stringify(result).includes(password), false);
  const storage = openStorage({ filename: target });
  try {
    const user = storage.findUserByUsername('trial.example');
    assert.equal(user.id, result.userId);
    verify(user.passwordHash, password);
    assert.equal(storage.getUserById('owner').passwordHash, null);
    assert.equal(storage.getUserById('owner').role, 'owner');
  } finally { storage.close(); }
});

test('private trial credential rotation preserves identity and its actual saved cases', async context => {
  const { target } = await fixture(context);
  const first = await setUser(target);
  let record;
  let storage = openStorage({ filename: target });
  try { record = storage.createCase(first.userId, { title: 'Retained fixture', sourceText: 'Property: Example Lane', fields: [], draftType: 'followup', draftText: '' }); }
  finally { storage.close(); }
  const nextPassword = 'rotated-public-trial-test-password';
  const rotated = await setUser(target, { password: nextPassword, passwordConfirmation: nextPassword });
  assert.equal(rotated.userId, first.userId);
  storage = openStorage({ filename: target });
  try {
    verify(storage.getUserById(first.userId).passwordHash, nextPassword);
    assert.deepEqual(storage.getCase(first.userId, record.id), record);
  } finally { storage.close(); }
});

test('trial setup rejects unconfirmed, mismatched, invalid, reserved-owner, and stale-identity inputs without changes', async context => {
  const { target } = await fixture(context);
  const initial = await readFile(target);
  for (const options of [
    { confirmed: false }, { confirmed: 'yes' }, { passwordConfirmation: 'different-public-password' },
    { password: 'short', passwordConfirmation: 'short' }, { password: 'x'.repeat(257), passwordConfirmation: 'x'.repeat(257) },
    { username: 'owner' }, { username: 'contains spaces' }, { expectedIdentity: 'stale:inode' },
  ]) {
    await assert.rejects(setUser(target, options));
    assert.deepEqual(await readFile(target), initial);
  }
  const storage = openStorage({ filename: target });
  try { assert.equal(storage.findUserByUsername('trial.example'), null); }
  finally { storage.close(); }
});

test('trial setup rejects public permissions and writable ancestors while leaving actual SQLite unchanged', async context => {
  const { target, directory } = await fixture(context);
  const initial = await readFile(target);
  await chmod(target, 0o644);
  await assert.rejects(inspectTrialDatabase(target, 'trial.example'), /0600/);
  await chmod(target, 0o600);
  await chmod(directory, 0o777);
  await assert.rejects(inspectTrialDatabase(target, 'trial.example'), /writable/);
  await chmod(directory, 0o700);
  const privateChild = join(directory, 'private');
  await mkdir(privateChild, { mode: 0o700 });
  const nested = join(privateChild, 'nested.sqlite');
  openStorage({ filename: nested }).close();
  await chmod(directory, 0o1777);
  await assert.rejects(inspectTrialDatabase(nested, 'trial.example'), /writable/);
  await chmod(directory, 0o700);
  assert.deepEqual(await readFile(target), initial);
});

test('trial setup refuses symlink and hard-link aliases instead of following or modifying them', async context => {
  const { target, directory } = await fixture(context);
  const initial = await readFile(target);
  const alias = join(directory, 'alias.sqlite');
  await symlink(target, alias);
  await assert.rejects(inspectTrialDatabase(alias, 'trial.example'), /symlink|regular file/);
  await rm(alias);
  await link(target, alias);
  await assert.rejects(inspectTrialDatabase(target, 'trial.example'), /hard-link|regular file/);
  assert.deepEqual(await readFile(target), initial);
});

test('trial setup refuses absent, wrong-name, relative, and non-database targets without replacing bytes', async context => {
  const { target, directory } = await fixture(context);
  await assert.rejects(inspectTrialDatabase('nestlet.sqlite', 'trial.example'));
  await assert.rejects(inspectTrialDatabase(join(directory, 'missing.sqlite'), 'trial.example'));
  const wrong = join(directory, 'runtime.env');
  await writeFile(wrong, 'UNRELATED_CONFIGURATION=yes\n', { mode: 0o600 });
  await assert.rejects(inspectTrialDatabase(wrong, 'trial.example'));
  const invalid = join(directory, 'invalid.sqlite');
  const original = Buffer.from('Unrelated content must not be replaced');
  await writeFile(invalid, original, { mode: 0o600 });
  await assert.rejects(inspectTrialDatabase(invalid, 'trial.example'));
  assert.deepEqual(await readFile(invalid), original);
  assert.equal((await readFile(target)).subarray(0, 16).toString(), 'SQLite format 3\u0000');
});

test('trial provisioning CLI refuses noninteractive input without echoing credentials or changing the database', async context => {
  const { target } = await fixture(context);
  const original = await readFile(target);
  const result = spawnSync(process.execPath, ['scripts/setup-trial-user.js', target, 'trial.example'], {
    cwd: new URL('../', import.meta.url), input: password + '\n' + password + '\nSET TRIAL USER\n', encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Run privately: node scripts\/setup-trial-user\.js \/absolute\/path\/nestlet\.sqlite username/);
  assert.equal((result.stdout + result.stderr).includes(password), false);
  assert.deepEqual(await readFile(target), original);
});
