// STRICT ACCEPTANCE: actual private temporary files and real scrypt, no filesystem mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, chmod, stat, readdir, rm, symlink, link, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inspectOperatorTarget, setOperatorPassword } from '../scripts/operator-setup.js';

const password = 'public-test-only-setup-password';
async function fixture(context, contents = 'HOST=127.0.0.1\nPORT=4173\n') {
  const directory = await mkdtemp(join(tmpdir(), 'nestlet-setup-acceptance-'));
  await chmod(directory, 0o700);
  context.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, 'runtime.env');
  await writeFile(target, contents, { mode: 0o600 });
  return { directory, target };
}
async function update(target, options = {}) {
  const metadata = await inspectOperatorTarget(target);
  return setOperatorPassword({ target, password, passwordConfirmation: password, confirmed: true, expectedVersion: metadata.version, ...options });
}
function verifyHash(contents) {
  const line = contents.split(/\r?\n/).find(line => line.startsWith('NESTLET_OPERATOR_PASSWORD_HASH='));
  const match = /^NESTLET_OPERATOR_PASSWORD_HASH='scrypt\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})'$/.exec(line);
  assert.ok(match, 'Expected the documented quoted scrypt format');
  assert.equal(timingSafeEqual(scryptSync(password, Buffer.from(match[1], 'base64url'), 32, { N: 16384, r: 8, p: 1 }), Buffer.from(match[2], 'base64url')), true);
  assert.equal(contents.includes(password), false);
}

test('setup adds only the operator hash, preserves other bytes, and leaves a private atomically replaced file', async context => {
  const original = '# Private test fixture\r\nHOST=127.0.0.1\r\nOTHER_SETTING="literal $value # retained"\r\n';
  const { directory, target } = await fixture(context, original);
  const before = await stat(target);
  const inspection = await inspectOperatorTarget(target);
  assert.deepEqual(Object.keys(inspection).sort(), ['configured', 'path', 'version']);
  assert.equal(inspection.configured, false);
  const result = await update(target);
  assert.deepEqual(result, { path: target, updated: true, restartRequired: true });
  const contents = await readFile(target, 'utf8');
  assert.ok(contents.startsWith(original));
  verifyHash(contents);
  const after = await stat(target);
  assert.equal(after.mode & 0o777, 0o600);
  assert.notEqual(after.ino, before.ino);
  assert.deepEqual(await readdir(directory), ['runtime.env']);
  assert.equal((await inspectOperatorTarget(target)).configured, true);
});

test('setup replaces exactly one existing operator declaration while preserving unrelated lines', async context => {
  const original = '# before\n  export NESTLET_OPERATOR_PASSWORD_HASH="old-public-test-hash"\nUNRELATED=keep-this-exactly\n# after';
  const { target } = await fixture(context, original);
  assert.equal((await inspectOperatorTarget(target)).configured, true);
  await update(target);
  const contents = await readFile(target, 'utf8');
  assert.ok(contents.startsWith('# before\nNESTLET_OPERATOR_PASSWORD_HASH='));
  assert.ok(contents.endsWith('\nUNRELATED=keep-this-exactly\n# after'));
  assert.equal(contents.split('NESTLET_OPERATOR_PASSWORD_HASH=').length, 2);
  verifyHash(contents);
});

test('setup preserves a UTF-8 BOM on unrelated configuration text', async context => {
  const original = '\uFEFF# Preserve encoding marker\nHOST=127.0.0.1\n';
  const { target } = await fixture(context, original);
  await update(target);
  const contents = await readFile(target, 'utf8');
  assert.ok(contents.startsWith(original));
  verifyHash(contents);
});

test('setup refuses missing confirmation, invalid/mismatched passwords, and stale versions without changing bytes', async context => {
  const { directory, target } = await fixture(context);
  const original = await readFile(target);
  for (const options of [
    { confirmed: false }, { confirmed: 'yes' }, { password: 'short', passwordConfirmation: 'short' },
    { password: 'x'.repeat(257), passwordConfirmation: 'x'.repeat(257) },
    { password: 'contains\ncontrol-text', passwordConfirmation: 'contains\ncontrol-text' },
    { passwordConfirmation: 'different-test-password' }, { expectedVersion: 'stale-version' },
  ]) {
    await assert.rejects(update(target, options));
    assert.deepEqual(await readFile(target), original);
    assert.deepEqual(await readdir(directory), ['runtime.env']);
  }
  const metadata = await inspectOperatorTarget(target);
  await writeFile(target, 'HOST=127.0.0.1\nNEW_SETTING=preserve-new-content\n');
  const changed = await readFile(target);
  await assert.rejects(setOperatorPassword({ target, password, passwordConfirmation: password, confirmed: true, expectedVersion: metadata.version }), /changed/);
  assert.deepEqual(await readFile(target), changed);
});

test('setup refuses public file permissions, writable parent directories, and hard-link aliases', async context => {
  const { directory, target } = await fixture(context);
  const original = await readFile(target);
  await chmod(target, 0o644);
  await assert.rejects(inspectOperatorTarget(target), /0600/);
  await chmod(target, 0o600);
  await chmod(directory, 0o770);
  await assert.rejects(inspectOperatorTarget(target), /writable/);
  await chmod(directory, 0o700);
  await link(target, join(directory, 'alias.env'));
  await assert.rejects(inspectOperatorTarget(target), /hard-link/);
  assert.deepEqual(await readFile(target), original);
});

test('setup rejects symlink targets and symlink directory parents without touching their destinations', async context => {
  const { directory, target } = await fixture(context);
  const original = await readFile(target);
  const source = join(directory, 'source.env');
  await writeFile(source, original, { mode: 0o600 });
  await rm(target);
  await symlink(source, target);
  await assert.rejects(inspectOperatorTarget(target), /symlink/);
  assert.deepEqual(await readFile(source), original);
  const realDirectory = join(directory, 'real');
  await mkdir(realDirectory, { mode: 0o700 });
  await writeFile(join(realDirectory, 'runtime.env'), original, { mode: 0o600 });
  await symlink(realDirectory, join(directory, 'linked'));
  await assert.rejects(inspectOperatorTarget(join(directory, 'linked', 'runtime.env')), /symlink/);
  assert.deepEqual(await readFile(join(realDirectory, 'runtime.env')), original);
});

test('setup rejects duplicate declarations, malformed encoding, multiline values, and oversized files', async context => {
  const { target } = await fixture(context);
  for (const content of [
    'NESTLET_OPERATOR_PASSWORD_HASH=one\nexport NESTLET_OPERATOR_PASSWORD_HASH=two\n',
    Buffer.from([0xff, 0xfe, 0xff]),
    'OTHER="multiline\nNESTLET_OPERATOR_PASSWORD_HASH=embedded\nvalue"\n',
    'HOST=127.0.0.1\rPORT=4173\r',
    'VALUE=abc\u0000def\n',
    'x'.repeat(65537),
  ]) {
    await writeFile(target, content);
    const original = await readFile(target);
    await assert.rejects(inspectOperatorTarget(target));
    assert.deepEqual(await readFile(target), original);
  }
});

test('setup accepts only an existing regular runtime.env at an absolute normalized path', async context => {
  const { directory, target } = await fixture(context);
  await assert.rejects(inspectOperatorTarget('runtime.env'));
  await assert.rejects(inspectOperatorTarget(directory + '/./runtime.env'));
  const wrongName = join(directory, 'other.env');
  await writeFile(wrongName, 'UNCHANGED=yes\n', { mode: 0o600 });
  await assert.rejects(inspectOperatorTarget(wrongName));
  await rm(target);
  await assert.rejects(inspectOperatorTarget(target));
  await mkdir(target, { mode: 0o700 });
  await assert.rejects(inspectOperatorTarget(target));
});

test('operator setup CLI refuses noninteractive input and leaves the private file unchanged', async context => {
  const { target } = await fixture(context);
  const original = await readFile(target);
  const result = spawnSync(process.execPath, ['scripts/setup-operator.js', target], {
    cwd: new URL('../', import.meta.url), input: password + '\n' + password + '\nSET OPERATOR\n', encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive terminal/);
  assert.equal((result.stdout + result.stderr).includes(password), false);
  assert.deepEqual(await readFile(target), original);
});

test('setup rejects a writable ancestor above a private child without changing the operator file', async context => {
  const { directory } = await fixture(context);
  const ancestor = join(directory, 'ancestor');
  const privateChild = join(ancestor, 'private');
  await mkdir(privateChild, { recursive: true, mode: 0o700 });
  await chmod(ancestor, 0o700);
  const target = join(privateChild, 'runtime.env');
  await writeFile(target, 'UNCHANGED=private-test-configuration\n', { mode: 0o600 });
  const original = await readFile(target);
  const metadata = await inspectOperatorTarget(target);
  const originalInode = (await stat(target)).ino;
  for (const mode of [0o777, 0o1777]) {
    await chmod(ancestor, mode);
    await assert.rejects(inspectOperatorTarget(target), /directory chain.*writable/);
    await assert.rejects(setOperatorPassword({ target, password, passwordConfirmation: password, confirmed: true, expectedVersion: metadata.version }), /directory chain.*writable/);
    assert.deepEqual(await readFile(target), original);
    assert.equal((await stat(target)).ino, originalInode);
    assert.deepEqual(await readdir(privateChild), ['runtime.env']);
  }
  await chmod(ancestor, 0o700);
  assert.equal((await inspectOperatorTarget(target)).version, metadata.version);
});
