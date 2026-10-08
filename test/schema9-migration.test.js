import { SCHEMA10_OBJECTS, sortedSchemaObjects } from './helpers/schema10-objects.js';
// Populated historical schema8, assembled without opening it through current storage.
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
import { AUTH_SESSION_SCHEMA_SQL } from '../auth-session-storage.js';
import { LIBRARY_PERMISSION_SCOPE } from '../library-consent-storage.js';
import { REVIEW_SCHEMA_SQL } from '../conversation-review-storage.js';
import { openAssetVault } from '../private-assets.js';
import {
  backupPrivateData, verifyPrivateBackup, restorePrivateBackup
} from '../scripts/private-data-operations.js';

const now = new Date().toISOString(), instant = Date.parse(now);
const passwordHash = `scrypt$${'A'.repeat(22)}$${'B'.repeat(43)}`;
const original = Buffer.from('Synthetic schema8 original; preserve these exact bytes.\n');
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
    if (name==='sqlite_sequence' && omit.includes('service_entitlement_audit')) {
      assert.deepEqual(JSON.parse(after.rows[name]).filter(row=>row.name!=='service_entitlement_audit'), JSON.parse(rows).filter(row=>row.name!=='service_entitlement_audit'));
    } else if (!omit.includes(name)) assert.equal(after.rows[name], rows, `${name} rows and sequence`);
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
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-schema9-'));
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
    db.exec(AUTH_SESSION_SCHEMA_SQL);
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
      'synthetic-schema8.txt', 'text/plain', original.length, digest(original), original.toString(),
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
    assert.equal(version(db), 8);
    db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?,?,?,?,?)').run('e'.repeat(64),id,'synthetic-schema8-user','trial','f'.repeat(64),'S'.repeat(43),1,instant,instant);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='library_permissions'").get(), undefined);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  }, false);
  return { root, source, filename, assetsDirectory, id, record, asset, review };
}

const grant = (decision, expectedVersion) => ({decision,expectedVersion,...LIBRARY_PERMISSION_SCOPE});

test('genuine populated schema8 to 9 is additive, preserves every old row/schema/sequence and grants nobody', t => {
 const f=fixture(t),before=inspect(f.filename,snapshot),assetsBefore=fileTree(f.assetsDirectory);
 for(let round=0;round<2;round++){
  const store=openStorage({filename:f.filename});
  try{
   assert.equal(store.libraryPermissions.read('owner').decision,'unset');
   assert.equal(store.libraryPermissions.read(f.id).decision,'unset');
   assert.equal(store.authSessions.size,1);
   assert.throws(()=>store.libraryPermissions.assertAllowed(f.id,0),{code:'LIBRARY_CONSENT_REQUIRED'});
  }finally{store.close();}
  inspect(f.filename,db=>{
   assert.equal(version(db),10);preserved(db,before);
   assert.deepEqual(ddl(db).filter(row=>!before.schema.some(old=>old.name===row.name)).map(row=>[row.type,row.name]),sortedSchemaObjects([['table','library_permissions'],...SCHEMA10_OBJECTS]));
   assert.equal(db.prepare("SELECT strict FROM pragma_table_list WHERE name='library_permissions'").get().strict,1);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM library_permissions').get().n,0);
  });
 }
 assert.deepEqual(fileTree(f.assetsDirectory),assetsBefore);
});

test('schema9 migration name collision fails atomically without changing populated schema8 records', t => {
 const f=fixture(t);
 inspect(f.filename,db=>db.exec('CREATE TABLE library_permissions (sentinel TEXT); INSERT INTO library_permissions VALUES(\'Synthetic migration failure marker\');'),false);
 const before=inspect(f.filename,snapshot),assetsBefore=fileTree(f.assetsDirectory);
 assert.throws(()=>openStorage({filename:f.filename}),/library_permissions.*already exists/);
 inspect(f.filename,db=>{assert.equal(version(db),8);preserved(db,before);assert.deepEqual(ddl(db),before.schema);});
 assert.deepEqual(fileTree(f.assetsDirectory),assetsBefore);
});

test('schema9 backup preserves choice; restore resets both grant and denial plus sessions/email actions, never snapshot/business data',async t=>{
 const f=fixture(t),beforeMigration=inspect(f.filename,snapshot);
 const pre=join(f.root,'pre-schema9');assert.equal((await backupPrivateData({...f,output:pre})).schemaVersion,8);
 let store=openStorage({filename:f.filename});
 store.libraryPermissions.set('owner',grant('deny',0));store.libraryPermissions.set(f.id,grant('allow',0));store.close();
 const before=inspect(f.filename,snapshot),sourceBefore=fileTree(f.source),post=join(f.root,'post-schema9');
 assert.equal((await backupPrivateData({...f,output:post})).schemaVersion,10);assert.equal(verifyPrivateBackup({input:post}).schemaVersion,10);
 assert.deepEqual(fileTree(f.source),sourceBefore);
 inspect(join(post,'nestlet.sqlite'),db=>preserved(db,before));
 const snapshotBefore=fileTree(post);
 const restored=await restorePrivateBackup({input:post,output:join(f.root,'restored-schema9')});
 assert.equal(restored.schemaVersion,10);
 inspect(restored.filename,db=>{
  assert.equal(version(db),10);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM library_permissions').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_actions').get().n,0);
  assert.equal(db.prepare('SELECT enabled FROM service_entitlements WHERE user_id=?').get(f.id).enabled,0);
  assert.equal(db.prepare('SELECT source FROM service_entitlement_audit WHERE target_user_id=?').get(f.id).source,'recovery');
  preserved(db,before,{omit:['auth_sessions','library_permissions','email_actions','service_entitlements','service_entitlement_audit']});
 });
 store=openStorage({filename:restored.filename});try{assert.equal(store.libraryPermissions.read(f.id).decision,'unset');}finally{store.close();}
 assert.deepEqual(fileTree(post),snapshotBefore);assert.deepEqual(fileTree(f.source),sourceBefore);
 assert.deepEqual(fileTree(restored.assetsDirectory),fileTree(f.assetsDirectory));
 // Rollback is a separate pre-upgrade snapshot, never a version decrement on schema9.
 const rollback=await restorePrivateBackup({input:pre,output:join(f.root,'rollback-schema8')});
 assert.equal(rollback.schemaVersion,8);
 inspect(rollback.filename,db=>{assert.equal(version(db),8);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_actions').get().n,0);preserved(db,beforeMigration,{omit:['auth_sessions','email_actions']});assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='library_permissions'").get(),undefined);});
});
