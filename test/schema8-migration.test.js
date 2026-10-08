// Populated historical schema7, assembled without opening it through current storage.
// All rows, credentials, sessions and original bytes below are synthetic local fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync,
  realpathSync, lstatSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openStorage } from '../storage.js';
import { ACCOUNT_ADMINISTRATION_SCHEMA_SQL } from '../account-administration-storage.js';
import { REVIEW_SCHEMA_SQL } from '../conversation-review-storage.js';
import { openAssetVault } from '../private-assets.js';
import {
  backupPrivateData, verifyPrivateBackup, restorePrivateBackup
} from '../scripts/private-data-operations.js';

const now = new Date().toISOString(), instant = Date.parse(now);
const passwordHash = `scrypt$${'A'.repeat(22)}$${'B'.repeat(43)}`;
const original = Buffer.from('Synthetic schema7 original; preserve these exact bytes.\n');
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = name => `"${name.replaceAll('"', '""')}"`;
const ddl = db => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
const version = db => db.prepare('PRAGMA user_version').get().user_version;

function inspect(filename, action, readOnly = true) {
  const db = new DatabaseSync(filename, { readOnly, enableForeignKeyConstraints: true, allowExtension: false });
  try { return action(db); } finally { db.close(); }
}

function snapshot(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  return {
    schema: ddl(db),
    rows: Object.fromEntries(tables.map(({ name }) => [name,
      JSON.stringify(db.prepare(`SELECT * FROM ${identifier(name)} ORDER BY rowid`).all())])),
    foreignKeys: Object.fromEntries(tables.map(({ name }) => [name,
      db.prepare(`PRAGMA foreign_key_list(${identifier(name)})`).all()]))
  };
}

// Capture nested files as well as the database itself; WAL/journal sidecars must not escape checks.
function fileTree(directory) {
  return Object.fromEntries(readdirSync(directory).sort().map(name => {
    const path = join(directory, name), info = lstatSync(path);
    return [name, { mode: info.mode & 0o777, contents: info.isDirectory() ? fileTree(path)
      : { bytes: info.size, sha256: digest(readFileSync(path)) } }];
  }));
}

function preserved(db, before, { omit = [] } = {}) {
  const after = snapshot(db);
  for (const [name, rows] of Object.entries(before.rows)) {
    if (!omit.includes(name)) assert.equal(after.rows[name], rows, `${name} rows and sequence`);
  }
  for (const old of before.schema) {
    assert.deepEqual(after.schema.find(row => row.type === old.type && row.name === old.name), old, `${old.name} DDL`);
  }
  for (const [name, keys] of Object.entries(before.foreignKeys)) {
    assert.deepEqual(after.foreignKeys[name], keys, `${name} foreign keys`);
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
}

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-schema8-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'), filename = join(source, 'records.sqlite');
  const assetsDirectory = join(source, 'assets');
  mkdirSync(source, { mode: 0o700 });
  writeFileSync(filename, '', { mode: 0o600 });
  const id = randomUUID(), client = randomUUID(), record = randomUUID(), conversation = randomUUID();
  const message = randomUUID(), artifact = randomUUID(), workflow = randomUUID(), asset = randomUUID(), review = randomUUID();
  openAssetVault({ directory: assetsDirectory }).write(asset, original);
  inspect(filename, db => {
    db.exec(readFileSync(new URL('./fixtures/schema5.sql', import.meta.url), 'utf8'));
    db.exec(ACCOUNT_ADMINISTRATION_SCHEMA_SQL);
    db.exec(REVIEW_SCHEMA_SQL);
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner', 'owner', 'owner', null, now);
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id, 'synthetic-schema8-user', 'trial', passwordHash, now);
    db.prepare('INSERT INTO clients VALUES(?,?,?,?,?,?)').run(client, id, 'Synthetic migration customer', 3, now, now);
    db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?,?)').run(record, id, 'Synthetic migration case',
      JSON.stringify({ title: 'Synthetic migration case', sourceText: 'Synthetic retained case text', fields: [], draftType: 'followup', draftText: '' }),
      7, now, now, client);
    db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run(conversation, id, record, 'Synthetic migration conversation', now, now);
    db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(message, id, conversation, 1,
      'assistant', 'Synthetic review prompt', 'complete', null, null, '[]', now);
    db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(artifact, id, record,
      'followup', 'Synthetic migration artifact', 'draft', 'Synthetic retained artifact', 2, 7, conversation, message, '{}', now);
    db.prepare('INSERT INTO telemetry_workflows VALUES(?,?,?,?,?)').run(workflow, id, record, now, now);
    db.prepare('INSERT INTO telemetry_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(8, workflow, id, randomUUID(),
      'server', 'request.chat', 'success', 200, null, 3, null, null, now);
    db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(asset, id, record, client,
      'synthetic-schema7.txt', 'text/plain', original.length, digest(original), original.toString(),
      original.toString().toLowerCase(), 'ready', 0, 'text', '[]', 2, now, now);
    db.prepare('INSERT INTO email_identities VALUES(?,?,?)').run(id, 'synthetic-migration@example.test', instant);
    db.prepare('INSERT INTO email_actions VALUES(?,?,?,?,?,?,?,?,?)').run('c'.repeat(64), 'reset',
      'synthetic-migration@example.test', id, null, digest(passwordHash), 1, instant, instant + 3600000);
    db.prepare('INSERT INTO email_rate_buckets VALUES(?,?,?)').run('d'.repeat(64), 3, instant + 3600000);
    db.prepare('INSERT INTO user_capabilities VALUES(?,?,?,?)').run(id, 1, 2, now);
    db.prepare('INSERT INTO account_capability_audit VALUES(?,?,?,?,?,?)').run(4, 'owner', id, 1, 2, now);
    db.prepare(`INSERT INTO conversation_review_intents
      (id,user_id,case_id,conversation_id,request_key,request_json,rows_json,expected_version,prompt_message_id,expires_at,state)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(review, id, record, conversation, randomUUID(),
      JSON.stringify({ action: 'prepare_case_suggestion', sourceConversationId: conversation, sourceMessageId: message }),
      JSON.stringify([{ key: 'rent', before: '', after: '$2200' }]), 7, message, instant + 900000, 'cancelled');
    db.exec("UPDATE sqlite_sequence SET seq=777 WHERE name='telemetry_events'; UPDATE sqlite_sequence SET seq=222 WHERE name='account_capability_audit';");
    assert.equal(version(db), 7);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='auth_sessions'").get(), undefined);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  }, false);
  return { root, source, filename, assetsDirectory, id, record, asset, review };
}

function addSessions(store, f) {
  const sessions = [
    ['1'.repeat(64), { userId: 'owner', username: 'owner', role: 'owner', rememberMe: false }],
    ['2'.repeat(64), { userId: f.id, username: 'synthetic-schema8-user', role: 'trial', rememberMe: true }]
  ].map(([hash, user]) => [hash, { ...user, credentialFingerprint: digest(`synthetic-${user.userId}`),
    csrfToken: 'S'.repeat(43), created: instant, lastUsed: instant + 1000 }]);
  for (const [hash, session] of sessions) store.authSessions.set(hash, session);
  return sessions;
}

test('genuine populated schema7→current preserves every old row, DDL, foreign key, sequence and original through reopen', t => {
  const f = fixture(t), before = inspect(f.filename, snapshot);
  const assetsBefore = fileTree(f.assetsDirectory);
  let store = openStorage({ filename: f.filename });
  t.after(() => store.close());
  assert.equal(store.authSessions.size, 0);
  const sessions = addSessions(store, f);
  store.close();
  for (let count = 0; count < 2; count++) {
    store = openStorage({ filename: f.filename });
    assert.equal(store.authSessions.size, 2);
    for (const [hash, session] of sessions) {
      assert.deepEqual(store.authSessions.get(hash), { tokenHash: hash, ...session });
    }
    assert.equal(store.getCase(f.id, f.record).sourceText, 'Synthetic retained case text');
    assert.equal(store.getCase(f.id, f.record).version, 7);
    assert.equal(store.getUserById(f.id).passwordHash, passwordHash);
    assert.equal(store.accountAdministration.administrator(f.id), true);
    assert.deepEqual(openAssetVault({ directory: f.assetsDirectory }).read(store.getAsset(f.id, f.asset)), original);
    store.close();
    inspect(f.filename, db => {
      assert.equal(version(db), 9);
      preserved(db, before);
      const added = ddl(db).filter(row => !before.schema.some(old => old.name === row.name));
      assert.deepEqual(added.map(row => [row.type, row.name]), [
        ['index', 'auth_sessions_user_created'], ['table', 'auth_sessions'], ['table', 'library_permissions'], ['trigger', 'auth_sessions_revoke_credentials']
      ]);
      assert.equal(db.prepare("SELECT strict FROM pragma_table_list WHERE name='auth_sessions'").get().strict, 1);
      assert.equal(db.prepare('SELECT state FROM conversation_review_intents WHERE id=?').get(f.review).state, 'cancelled');
    });
  }
  assert.deepEqual(fileTree(f.assetsDirectory), assetsBefore);
});

test('late schema8 migration failure rolls back its table, index and version and preserves all schema7 data', t => {
  const f = fixture(t);
  inspect(f.filename, db => db.exec(`CREATE TRIGGER auth_sessions_revoke_credentials BEFORE UPDATE ON users
    BEGIN SELECT 1; END;`), false);
  const before = inspect(f.filename, snapshot), assetsBefore = fileTree(f.assetsDirectory);
  assert.throws(() => openStorage({ filename: f.filename }), /auth_sessions_revoke_credentials.*already exists/u);
  inspect(f.filename, db => {
    assert.equal(version(db), 7);
    preserved(db, before);
    assert.deepEqual(ddl(db), before.schema);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='auth_sessions'").get(), undefined);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='auth_sessions_user_created'").get(), undefined);
  });
  assert.deepEqual(fileTree(f.assetsDirectory), assetsBefore);
});

test('future schema10 startup and backup reject before changing bytes or nested files in DELETE and WAL mode', async t => {
  for (const mode of ['DELETE', 'WAL']) {
    await t.test(mode, async t => {
      const f = fixture(t);
      inspect(f.filename, db => db.exec(`PRAGMA journal_mode=${mode}; PRAGMA user_version=10;`), false);
      const before = fileTree(f.root);
      assert.throws(() => openStorage({ filename: f.filename }), error => error.code === 'STORAGE_VERSION_UNSUPPORTED');
      assert.deepEqual(fileTree(f.root), before);
      await assert.rejects(backupPrivateData({ ...f, output: join(f.root, 'future-backup') }), /schema1–9/u);
      assert.deepEqual(fileTree(f.root), before);
      inspect(f.filename, db => {
        assert.equal(version(db), 10);
        assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, mode.toLowerCase());
      });
    });
  }
});

test('schema7 backup and verification are read-only and restore keeps the historical schema/business data while invalidating email actions', async t => {
  const f = fixture(t), before = inspect(f.filename, snapshot), sourceBefore = fileTree(f.source);
  const output = join(f.root, 'schema7-backup');
  const result = await backupPrivateData({ ...f, output });
  assert.equal(result.schemaVersion, 7);
  assert.equal(result.assetCount, 1);
  assert.deepEqual(fileTree(f.source), sourceBefore);
  const snapshotBefore = fileTree(output);
  assert.equal(verifyPrivateBackup({ input: output }).schemaVersion, 7);
  inspect(join(output, 'nestlet.sqlite'), db => {
    assert.equal(version(db), 7);
    preserved(db, before);
    assert.deepEqual(ddl(db), before.schema);
  });
  const restored = await restorePrivateBackup({ input: output, output: join(f.root, 'schema7-restored') });
  assert.equal(restored.schemaVersion, 7);
  inspect(restored.filename, db => {
    assert.equal(version(db), 7);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_actions').get().n, 0);
    preserved(db, before, { omit: ['email_actions'] });
    assert.deepEqual(ddl(db), before.schema);
  });
  assert.deepEqual(fileTree(restored.assetsDirectory), fileTree(f.assetsDirectory));
  assert.deepEqual(fileTree(output), snapshotBefore);
  assert.deepEqual(fileTree(f.source), sourceBefore);
});

test('current schema backup retains sessions and email actions but restore purges them without changing the snapshot or business records', async t => {
  const f = fixture(t), historical = inspect(f.filename, snapshot);
  let store = openStorage({ filename: f.filename });
  t.after(() => store.close());
  const sessions = addSessions(store, f);
  store.close();
  const before = inspect(f.filename, snapshot), sourceBefore = fileTree(f.source);
  const output = join(f.root, 'schema8-backup');
  assert.equal((await backupPrivateData({ ...f, output })).schemaVersion, 9);
  assert.deepEqual(fileTree(f.source), sourceBefore);
  inspect(join(output, 'nestlet.sqlite'), db => {
    assert.equal(version(db), 9);
    preserved(db, before);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n, 2);
  });
  const snapshotBefore = fileTree(output);
  assert.equal(verifyPrivateBackup({ input: output }).schemaVersion, 9);
  // Both credentials may have been logged out/revoked since this snapshot was taken.
  store = openStorage({ filename: f.filename });
  for (const [hash] of sessions) store.authSessions.delete(hash);
  assert.equal(store.authSessions.size, 0);
  store.close();
  const revokedSource = fileTree(f.source);
  const restored = await restorePrivateBackup({ input: output, output: join(f.root, 'schema8-restored') });
  assert.equal(restored.schemaVersion, 9);
  // Assert before application startup: restore itself, not startup expiry, must remove sessions.
  inspect(restored.filename, db => {
    assert.equal(version(db), 9);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_actions').get().n, 0);
    preserved(db, before, { omit: ['auth_sessions', 'email_actions'] });
    assert.deepEqual(ddl(db), before.schema);
  });
  store = openStorage({ filename: restored.filename });
  assert.equal(store.authSessions.size, 0);
  assert.equal(store.getCase(f.id, f.record).version, 7);
  assert.equal(store.accountAdministration.administrator(f.id), true);
  assert.deepEqual(openAssetVault({ directory: restored.assetsDirectory }).read(store.getAsset(f.id, f.asset)), original);
  store.close();
  inspect(restored.filename, db => {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_actions').get().n, 0);
    preserved(db, historical, { omit: ['email_actions'] });
  });
  assert.deepEqual(fileTree(output), snapshotBefore);
  assert.deepEqual(fileTree(f.source), revokedSource);
  assert.equal(verifyPrivateBackup({ input: output }).schemaVersion, 9);
  assert.deepEqual(fileTree(output), snapshotBefore);
});

test('future schema10 manifest rejects verification and restore before any destination or snapshot change', async t => {
  const f = fixture(t), input = join(f.root, 'unsupported-backup');
  await backupPrivateData({ ...f, output: input });
  const manifestPath = join(input, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.schemaVersion = 10;
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const before = fileTree(f.root);
  assert.throws(() => verifyPrivateBackup({ input }), /Unsupported backup manifest/u);
  await assert.rejects(restorePrivateBackup({ input, output: join(f.root, 'rejected-restore') }), /Unsupported backup manifest/u);
  assert.deepEqual(fileTree(f.root), before);
});
