// Real disposable SQLite, bytes, backup API and CLI; no real accounts/data, network or mocked success.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  readdirSync,
  symlinkSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { openStorage } from '../storage.js';
import { openAssetVault, parseAsset } from '../private-assets.js';
import {
  backupPrivateData,
  verifyPrivateBackup,
  restorePrivateBackup,
  exportUserAssets
} from '../scripts/private-data-operations.js';
async function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-backup-')),
    dir = join(root, 'source');
  mkdirSync(dir, { mode: 0o700 });
  const filename = join(dir, 'nestlet.sqlite'),
    assetsDirectory = join(dir, 'assets'),
    store = openStorage({ filename }),
    vault = openAssetVault({ directory: assetsDirectory });
  const salt = randomBytes(16);
  const user = store.createTrialUser({
    username: 'backup-test-user',
    passwordHash: `scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-backup-password', salt, 32).toString('base64url')}`
  });
  const bytes = Buffer.from('Synthetic backup original résumé 中文');
  const metadata = await parseAsset(bytes, {
    originalFilename: 'backup.txt',
    mimeType: 'text/plain'
  });
  const asset = store.createAsset(user.id, metadata, {}, (id) => vault.write(id, bytes));
  store.createAsset('owner', metadata, {}, (id) => vault.write(id, bytes));
  const record = store.createCase(user.id, {
    title: 'Retained during recovery',
    sourceText: 'Synthetic source',
    fields: [],
    draftType: 'followup',
    draftText: ''
  });
  store.close();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, dir, filename, assetsDirectory, bytes, asset, user, record };
}
test('verified SQLite snapshot + immutable assets restore to a new directory after simulated source loss', async (t) => {
  const f = await fixture(t),
    output = join(f.root, 'snapshot');
  const result = await backupPrivateData({ ...f, output });
  assert.equal(result.verified, true);
  assert.equal(result.assetCount, 2);
  assert.equal(verifyPrivateBackup({ input: output }).assetCount, 2);
  assert.equal(lstatSync(join(output, 'nestlet.sqlite')).mode & 0o777, 0o600);
  assert.equal(lstatSync(output).mode & 0o777, 0o700);
  rmSync(f.dir, { recursive: true });
  const restored = await restorePrivateBackup({ input: output, output: join(f.root, 'recovered') });
  const store = openStorage({ filename: restored.filename });
  try {
    assert.equal(store.getCase(f.user.id, f.record.id).sourceText, 'Synthetic source');
    assert.equal(store.getAssetText(f.user.id, f.asset.id), f.bytes.toString());
    const asset = store.getAsset(f.user.id, f.asset.id);
    assert.deepEqual(openAssetVault({ directory: restored.assetsDirectory }).read(asset), f.bytes);
    assert.equal(store.listAssets('owner').total, 1);
  } finally {
    store.close();
  }
  await assert.rejects(
    restorePrivateBackup({ input: output, output: restored.assetsDirectory }),
    /EEXIST/
  );
});
test('tampered/missing/unexpected backup bytes and database cannot be restored', async (t) => {
  const f = await fixture(t),
    output = join(f.root, 'snapshot');
  await backupPrivateData({ ...f, output });
  writeFileSync(join(output, 'assets', f.asset.id + '.blob'), 'tampered');
  assert.throws(
    () => verifyPrivateBackup({ input: output }),
    (e) => e.code === 'ASSET_INTEGRITY_FAILED'
  );
  await assert.rejects(restorePrivateBackup({ input: output, output: join(f.root, 'restore') }));
  assert.ok(!readdirSync(f.root).includes('restore'));
  const second = join(f.root, 'second');
  await backupPrivateData({ ...f, output: second });
  writeFileSync(join(second, 'extra.txt'), 'unexpected', { mode: 0o600 });
  assert.throws(() => verifyPrivateBackup({ input: second }), /unexpected/);
  const third = join(f.root, 'third');
  await backupPrivateData({ ...f, output: third });
  writeFileSync(join(third, 'nestlet.sqlite'), 'corrupt');
  assert.throws(() => verifyPrivateBackup({ input: third }), /digest mismatch/);
});
test('exact-user portable export excludes all other users and authentication records; CLI verify works', async (t) => {
  const f = await fixture(t),
    output = join(f.root, 'export');
  const result = exportUserAssets({ ...f, userId: f.user.id, output });
  assert.equal(result.assetCount, 1);
  const manifest = JSON.parse(readFileSync(join(output, 'manifest.json')));
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].id, f.asset.id);
  assert.equal(manifest.assets[0].text, f.bytes.toString());
  assert.ok(!JSON.stringify(manifest).includes('scrypt$'));
  assert.ok(!readdirSync(output).includes('nestlet.sqlite'));
  const snapshot = join(f.root, 'snapshot');
  const cli = spawnSync(
    process.execPath,
    [
      'scripts/private-data.js',
      'backup',
      '--db',
      f.filename,
      '--assets',
      f.assetsDirectory,
      '--output',
      snapshot
    ],
    { cwd: new URL('../', import.meta.url), encoding: 'utf8' }
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).verified, true);
  const verified = spawnSync(
    process.execPath,
    ['scripts/private-data.js', 'verify', '--input', snapshot],
    { cwd: new URL('../', import.meta.url), encoding: 'utf8' }
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).assetCount, 2);
  const invalid = spawnSync(
    process.execPath,
    ['scripts/private-data.js', 'restore', '--input', snapshot, '--output', f.dir],
    { cwd: new URL('../', import.meta.url), encoding: 'utf8' }
  );
  assert.notEqual(invalid.status, 0);
  assert.equal(
    openAssetVault({ directory: f.assetsDirectory }).read(f.asset).toString(),
    f.bytes.toString()
  );
});
test('unsafe source paths are rejected and uncommitted orphan files are reported without deletion', async (t) => {
  const f = await fixture(t);
  writeFileSync(join(f.assetsDirectory, 'uncommitted.blob'), 'retained orphan', { mode: 0o600 });
  const out = join(f.root, 'snapshot');
  const result = await backupPrivateData({ ...f, output: out });
  assert.equal(result.unreferencedFiles, 1);
  assert.ok(readdirSync(f.assetsDirectory).includes('uncommitted.blob'));
  const linked = join(f.root, 'linked');
  symlinkSync(f.assetsDirectory, linked);
  await assert.rejects(
    backupPrivateData({ ...f, assetsDirectory: linked, output: join(f.root, 'bad') }),
    (e) => e.code === 'ASSET_PATH_INVALID'
  );
});
