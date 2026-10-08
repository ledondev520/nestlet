// Real disposable SQLite, bytes, backup API and CLI; no real accounts/data, network or mocked success.
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
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
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
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
  await assert.rejects(
    restorePrivateBackup({ input: output, output: join(output, 'nested-restore') }),
    /outside the source/
  );
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

test('pre-upgrade schema3 backup remains schema3 and leaves source unchanged through restore and migration rehearsal', async (t) => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-pre-upgrade-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  mkdirSync(source, { mode: 0o700 });
  const filename = join(source, 'nestlet.sqlite');
  writeFileSync(filename, '', { mode: 0o600 });
  const db = new DatabaseSync(filename);
  db.exec(readFileSync(new URL('./fixtures/schema3.sql', import.meta.url), 'utf8'));
  const createdAt = '2026-10-07T00:00:00.000Z',
    caseId = randomUUID();
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner', 'owner', 'owner', null, createdAt);
  const payload = {
    title: 'Pre-upgrade preserved',
    sourceText: 'Synthetic pre-upgrade text',
    fields: [],
    draftType: 'followup',
    draftText: ''
  };
  db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?,?)').run(
    caseId,
    'owner',
    payload.title,
    JSON.stringify(payload),
    7,
    createdAt,
    createdAt,
    null
  );
  db.close();
  const before = readFileSync(filename),
    assetsDirectory = join(source, 'assets-not-created');
  const output = join(root, 'pre-upgrade-backup');
  const backed = await backupPrivateData({ filename, assetsDirectory, output });
  assert.equal(backed.schemaVersion, 3);
  assert.equal(backed.assetCount, 0);
  assert.deepEqual(readFileSync(filename), before);
  assert.ok(!readdirSync(source).includes('assets-not-created'));
  assert.equal(verifyPrivateBackup({ input: output }).schemaVersion, 3);
  const restored = await restorePrivateBackup({ input: output, output: join(root, 'drill') });
  let check = new DatabaseSync(restored.filename, { readOnly: true });
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 3);
  check.close();
  const migrated = openStorage({ filename: restored.filename });
  try {
    assert.equal(migrated.getCase('owner', caseId).version, 7);
    assert.equal(migrated.getCase('owner', caseId).sourceText, payload.sourceText);
  } finally {
    migrated.close();
  }
  check = new DatabaseSync(restored.filename, { readOnly: true });
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 8);
  check.close();
  assert.deepEqual(readFileSync(filename), before);
  assert.equal(verifyPrivateBackup({ input: output }).schemaVersion, 3);
  const cli = spawnSync(
    process.execPath,
    ['scripts/private-data.js', 'verify', '--input', output],
    { cwd: new URL('../', import.meta.url), encoding: 'utf8' }
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), { verified: true, schemaVersion: 3, assetCount: 0 });
  assert.ok(!cli.stdout.includes(root));
});

test('a consistent backup verifies and restores while another real connection commits original uploads', async (t) => {
  const f = await fixture(t),
    output = join(f.root, 'live-snapshot');
  const underway = backupPrivateData({ ...f, output });
  const writer = openStorage({ filename: f.filename });
  const vault = openAssetVault({ directory: f.assetsDirectory });
  try {
    for (let i = 0; i < 5; i++) {
      const bytes = Buffer.from('Synthetic concurrent original ' + i);
      const metadata = await parseAsset(bytes, {
        originalFilename: 'concurrent-' + i + '.txt',
        mimeType: 'text/plain'
      });
      writer.createAsset(f.user.id, metadata, {}, (id) => vault.write(id, bytes));
    }
    assert.equal(writer.listAssets(f.user.id).total, 6);
  } finally {
    writer.close();
  }
  const result = await underway;
  assert.ok(result.assetCount >= 2 && result.assetCount <= 7);
  const checked = verifyPrivateBackup({ input: output });
  assert.equal(checked.assetCount, result.assetCount);
  const restored = await restorePrivateBackup({
    input: output,
    output: join(f.root, 'live-recovery')
  });
  const store = openStorage({ filename: restored.filename }),
    restoredVault = openAssetVault({ directory: restored.assetsDirectory });
  try {
    const records = [...store.listAssets('owner').assets, ...store.listAssets(f.user.id).assets];
    assert.equal(records.length, checked.assetCount);
    for (const asset of records)
      assert.ok(restoredVault.read(asset).toString().startsWith('Synthetic'));
  } finally {
    store.close();
  }
});


test('live committed WAL snapshots become standalone backups without changing source mode or bytes', async (t) => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-wal-backup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  mkdirSync(source, { mode: 0o700 });
  const filename = join(source, 'nestlet.sqlite');
  writeFileSync(filename, '', { mode: 0o600 });
  const writer = new DatabaseSync(filename);
  t.after(() => writer.close());
  writer.exec(readFileSync(new URL('./fixtures/schema3.sql', import.meta.url), 'utf8'));
  writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;');
  const now = '2026-10-07T00:00:00.000Z', caseId = randomUUID();
  writer.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner', 'owner', 'owner', null, now);
  writer.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?,?)').run(
    caseId, 'owner', 'Committed only in WAL', '{}', 7, now, now, null
  );
  const sourceBytes = readFileSync(filename), walBytes = readFileSync(filename + '-wal');
  assert.ok(walBytes.length > 0);
  const output = join(root, 'snapshot');
  const backed = await backupPrivateData({ filename, assetsDirectory: join(source, 'missing-assets'), output });
  assert.equal(backed.schemaVersion, 3);
  assert.equal(verifyPrivateBackup({ input: output }).verified, true);
  assert.deepEqual(readdirSync(output).sort(), ['assets', 'manifest.json', 'nestlet.sqlite']);
  assert.deepEqual(readFileSync(filename), sourceBytes);
  assert.deepEqual(readFileSync(filename + '-wal'), walBytes);
  assert.equal(writer.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.deepEqual(readdirSync(source).sort(), ['nestlet.sqlite', 'nestlet.sqlite-shm', 'nestlet.sqlite-wal']);
  const restored = await restorePrivateBackup({ input: output, output: join(root, 'restored') });
  for (const path of [join(output, 'nestlet.sqlite'), restored.filename]) {
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(check.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
      assert.equal(check.prepare('PRAGMA user_version').get().user_version, 3);
      assert.equal(check.prepare('SELECT version FROM cases WHERE id=?').get(caseId).version, 7);
    } finally { check.close(); }
  }
  assert.deepEqual(readdirSync(output).sort(), ['assets', 'manifest.json', 'nestlet.sqlite']);
  assert.deepEqual(readdirSync(join(root, 'restored')).sort(), ['assets', 'nestlet.sqlite']);
  // Later source writes remain independent; the recovery point stays immutable.
  writer.prepare('UPDATE cases SET version=8 WHERE id=?').run(caseId);
  assert.equal(verifyPrivateBackup({ input: output }).schemaVersion, 3);
});


test('backup waits for a bounded real exclusive writer and verifies its committed case plus originals', async (t) => {
  const f = await fixture(t);
  const writer = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(workerData.filename, { timeout: 5000 });
    db.exec('BEGIN EXCLUSIVE');
    db.prepare('UPDATE cases SET version=version+1 WHERE id=?').run(workerData.caseId);
    parentPort.once('message', () => setTimeout(() => {
      db.exec('COMMIT'); db.close(); parentPort.close();
    }, 150));
    parentPort.postMessage('exclusive-lock-held');
  `, { eval: true, workerData: { filename: f.filename, caseId: f.record.id } });
  const finished = new Promise((resolve, reject) => {
    writer.once('error', reject);
    writer.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Synthetic writer failed')));
  });
  // Observe rejection immediately, and still await it below; cleanup must not
  // leave an unhandled worker rejection when a backup assertion itself fails.
  finished.catch(() => {});
  t.after(async () => { await writer.terminate(); await finished.catch(() => {}); });
  await new Promise((resolve, reject) => {
    writer.once('error', reject);
    writer.once('message', (value) => {
      if (value === 'exclusive-lock-held') resolve();
      else reject(new Error('Synthetic writer did not acquire its lock'));
    });
  });
  // The worker holds an actual SQLite EXCLUSIVE lock before backup opens its
  // private read connection. It commits independently while the reader waits.
  writer.postMessage('release-after-reader-starts');
  const output = join(f.root, 'exclusive-lock-snapshot');
  const result = await backupPrivateData({ ...f, output });
  await finished;
  assert.equal(result.verified, true);
  assert.equal(result.assetCount, 2);
  assert.equal(verifyPrivateBackup({ input: output }).assetCount, 2);
  const restored = await restorePrivateBackup({ input: output, output: join(f.root, 'exclusive-lock-restored') });
  const store = openStorage({ filename: restored.filename });
  try {
    assert.equal(store.getCase(f.user.id, f.record.id).version, f.record.version + 1);
    assert.equal(store.getCase(f.user.id, f.record.id).sourceText, 'Synthetic source');
    const asset = store.getAsset(f.user.id, f.asset.id);
    assert.deepEqual(openAssetVault({ directory: restored.assetsDirectory }).read(asset), f.bytes);
    assert.equal(store.listAssets('owner').total, 1);
  } finally { store.close(); }
});

test('current-schema private snapshot preserves verified email binding, pending hash-only actions and rate limits on restore', async t => {
  const f = await fixture(t), store = openStorage({ filename: f.filename });
  const { createHash } = await import('node:crypto');
  const fingerprint = createHash('sha256').update(store.getUserById(f.user.id).passwordHash).digest('hex');
  const email = 'synthetic-backup@example.invalid', now = Date.now();
  const binding = store.emailAuth.createAction({ kind: 'bind', email, userId: f.user.id, credentialFingerprint: fingerprint, now });
  store.emailAuth.markAccepted(binding.tokenHash, now); assert.equal(store.emailAuth.verify(binding.tokenHash, { now }), true);
  const reset = store.emailAuth.createAction({ kind: 'reset', email, userId: f.user.id, credentialFingerprint: fingerprint, now });
  store.emailAuth.markAccepted(reset.tokenHash, now); assert.equal(store.emailAuth.reserveRequest(email, 'synthetic-ip', now), 'allowed');
  store.close();
  const output = join(f.root, 'email-snapshot');
  const backed = await backupPrivateData({ ...f, output }); assert.equal(backed.schemaVersion, 8);
  const restored = await restorePrivateBackup({ input: output, output: join(f.root, 'email-restored') });
  const recovered = openStorage({ filename: restored.filename });
  try {
    assert.equal(recovered.emailAuth.findByEmail(email).id, f.user.id);
    assert.equal(recovered.emailAuth.getAction(reset.tokenHash).ready, 1);
    assert.equal(recovered.emailAuth.reserveRequest(email, 'other-synthetic-ip', now + 1), 'suppressed');
    assert.equal(recovered.getCase(f.user.id, f.record.id).sourceText, 'Synthetic source');
    assert.equal(recovered.getUserById('owner').passwordHash, null);
  } finally { recovered.close(); }
  assert.equal(readFileSync(join(output, 'nestlet.sqlite')).includes(Buffer.from(reset.token)), false);
});


test('current-schema backups require the private originals directory even when no asset rows exist', async t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-schema5-vault-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const filename = join(root, 'nestlet.sqlite'), assetsDirectory = join(root, 'missing-assets'), output = join(root, 'snapshot');
  const store = openStorage({ filename }); store.close();
  await assert.rejects(backupPrivateData({ filename, assetsDirectory, output }), error => error.code === 'ENOENT');
  assert.equal(readdirSync(root).includes('snapshot'), false);
  assert.equal(readdirSync(root).includes('missing-assets'), false);
});
