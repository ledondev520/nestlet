// Actual SQLite migration from historical schema3 + schema4 DDL, not a downgraded schema5 database.
// Asset DDL was extracted verbatim from c540c89:storage.js; its historical fileBytes was 5 * 1024 * 1024.
// Synthetic rows/credentials only. No Git history or external services are needed to run this test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { openStorage } from '../storage.js';

const SCHEMA4_ASSETS_SQL = `CREATE TABLE assets (
          id TEXT PRIMARY KEY NOT NULL,
          owner_user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
          client_id TEXT REFERENCES clients(id),
          original_filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880),
          sha256 TEXT NOT NULL CHECK(length(sha256)=64),
          extracted_text TEXT NOT NULL,
          search_text TEXT NOT NULL,
          text_status TEXT NOT NULL CHECK(text_status IN ('ready','unavailable')),
          text_truncated INTEGER NOT NULL CHECK(text_truncated IN (0,1)),
          preview_kind TEXT NOT NULL CHECK(preview_kind IN ('pdf','image','text')),
          warnings_json TEXT NOT NULL CHECK(json_valid(warnings_json)),
          version INTEGER NOT NULL CHECK(version > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(owner_user_id,id)
        ) STRICT;
        CREATE INDEX assets_owner_created ON assets(owner_user_id,created_at DESC,id);
        CREATE INDEX assets_owner_case ON assets(owner_user_id,case_id,created_at DESC,id);
        CREATE INDEX assets_owner_client ON assets(owner_user_id,client_id,created_at DESC,id);
        CREATE TRIGGER assets_owner_insert BEFORE INSERT ON assets
          WHEN (NEW.case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cases WHERE id=NEW.case_id AND user_id=NEW.owner_user_id AND client_id IS NEW.client_id))
          OR (NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.owner_user_id))
          BEGIN SELECT RAISE(ABORT,'Invalid private asset association'); END;
        CREATE TRIGGER assets_owner_update BEFORE UPDATE OF owner_user_id,case_id,client_id ON assets
          WHEN NEW.owner_user_id != OLD.owner_user_id
          OR (NEW.case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cases WHERE id=NEW.case_id AND user_id=NEW.owner_user_id AND client_id IS NEW.client_id))
          OR (NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.owner_user_id))
          BEGIN SELECT RAISE(ABORT,'Invalid private asset association'); END;
        CREATE TRIGGER assets_immutable_content BEFORE UPDATE OF id,original_filename,mime_type,size_bytes,sha256,extracted_text,search_text,text_status,text_truncated,preview_kind,warnings_json,created_at ON assets
          BEGIN SELECT RAISE(ABORT,'Original assets are immutable'); END;
        CREATE TRIGGER assets_follow_case_customer AFTER UPDATE OF client_id ON cases WHEN NEW.client_id IS NOT OLD.client_id
          BEGIN UPDATE assets SET client_id=NEW.client_id,version=version+1,updated_at=NEW.updated_at WHERE case_id=NEW.id AND owner_user_id=NEW.user_id; END;
        CREATE TRIGGER assets_preserve_case_delete BEFORE DELETE ON cases
          BEGIN UPDATE assets SET case_id=NULL,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE case_id=OLD.id AND owner_user_id=OLD.user_id; END;
        PRAGMA user_version = 4;`;
const TABLES = ['users', 'clients', 'cases', 'conversations', 'messages', 'artifacts', 'telemetry_workflows', 'telemetry_events', 'assets', 'sqlite_sequence'];
const now = new Date().toISOString();
const salt = randomBytes(16),
  passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-schema5-migration-password', salt, 32).toString('base64url')}`;
const rows = (db, table) => JSON.stringify(db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all());
const schema = db => db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
const foreignKeys = (db, table) => db.prepare('PRAGMA foreign_key_list(' + table + ')').all();
function snapshot(db) {
  return {
    rows: Object.fromEntries(TABLES.map(table => [table, rows(db, table)])),
    schema: schema(db),
    foreignKeys: Object.fromEntries(TABLES.map(table => [table, foreignKeys(db, table)]))
  };
}
function inspect(filename, callback) {
  const db = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
  try { return callback(db); } finally { db.close(); }
}
function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-schema5-')),
    filename = join(directory, 'records.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(filename, '', { mode: 0o600 });
  const db = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
  db.exec(readFileSync(new URL('./fixtures/schema3.sql', import.meta.url), 'utf8'));
  db.exec(SCHEMA4_ASSETS_SQL);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner', 'owner', 'owner', null, now);
  const records = [];
  for (let i = 0; i < 2; i++) {
    const user = randomUUID(), client = randomUUID(), record = randomUUID(), conversation = randomUUID(),
      message = randomUUID(), artifact = randomUUID(), workflow = randomUUID(), asset = randomUUID();
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user, `synthetic-legacy-${i}`, 'trial', passwordHash, now);
    db.prepare('INSERT INTO clients VALUES(?,?,?,?,?,?)').run(client, user, `Synthetic preserved customer ${i}`, 2 + i, now, now);
    db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?,?)').run(record, user, `Synthetic preserved case ${i}`,
      JSON.stringify({ title: `Synthetic preserved case ${i}`, sourceText: `Original synthetic source ${i}`, fields: [], draftType: 'followup', draftText: '', extractionMode: 'manual', namesVerified: false }), 4 + i, now, now, client);
    db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run(conversation, user, record, `Synthetic preserved conversation ${i}`, now, now);
    db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(message, user, conversation, 1, 'user', `Synthetic preserved message ${i}`, 'complete', null, randomUUID(), '[]', now);
    db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(artifact, user, record, 'followup', `Synthetic preserved version ${i}`, 'draft', `Synthetic preserved artifact ${i}`, 2 + i, 4 + i, conversation, message, '{}', now);
    db.prepare('INSERT INTO telemetry_workflows VALUES(?,?,?,?,?)').run(workflow, user, record, now, now);
    db.prepare('INSERT INTO telemetry_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(99 + i, workflow, user, randomUUID(), 'server', 'request.chat', 'success', 200, null, 9 + i, null, null, now);
    db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(asset, user, record, client,
      `synthetic-original-${i}.txt`, 'text/plain', 20 + i, String(i).repeat(64), `Original synthetic asset ${i}`, `original synthetic asset ${i}`, 'ready', 0, 'text', '[]', 1 + i, now, now);
    records.push({ user, client, record, conversation, message, artifact, asset });
  }
  // Preserve a high-water mark larger than the current maximum event ID as well as every table row.
  db.prepare("UPDATE sqlite_sequence SET seq=777 WHERE name='telemetry_events'").run();
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'email_%'").get().n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  const before = snapshot(db);
  db.close();
  return { directory, filename, before, records };
}
function assertPreserved(db, before) {
  for (const table of TABLES) {
    assert.equal(rows(db, table), before.rows[table], `${table} rows`);
    assert.deepEqual(foreignKeys(db, table), before.foreignKeys[table], `${table} foreign keys`);
  }
  const currentSchema = schema(db);
  for (const old of before.schema)
    assert.deepEqual(currentSchema.find(object => object.name === old.name && object.type === old.type), old, `${old.name} DDL`);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
}

test('historical schema4→current is additive and preserves every users/data row, schema object and foreign key after restart', t => {
  const f = fixture(t);
  const storage = openStorage({ filename: f.filename });
  try {
    for (let i = 0; i < f.records.length; i++) {
      const record = f.records[i];
      assert.equal(storage.getCase(record.user, record.record).version, 4 + i);
      assert.equal(storage.getCase(record.user, record.record).sourceText, `Original synthetic source ${i}`);
      assert.equal(storage.listAssets(record.user).total, 1);
      assert.equal(storage.emailAuth.identity(record.user), null);
      assert.equal(storage.getUserById(record.user).passwordHash, passwordHash);
    }
  } finally { storage.close(); }
  inspect(f.filename, db => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 9);
    assert.equal(db.prepare('PRAGMA application_id').get().application_id, 0x4e53544c);
    assertPreserved(db, f.before);
    for (const table of ['email_identities', 'email_actions', 'email_rate_buckets'])
      assert.equal(db.prepare('SELECT count(*) AS n FROM ' + table).get().n, 0);
    assert.equal(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='telemetry_events'").get().seq, 777);
  });
  const reopened = openStorage({ filename: f.filename });
  try {
    for (const record of f.records) {
      assert.equal(reopened.getCase(record.user, record.record).id, record.record);
      assert.equal(reopened.getUserById(record.user).id, record.user);
      assert.equal(reopened.emailAuth.identity(record.user), null);
    }
  } finally { reopened.close(); }
  inspect(f.filename, db => assertPreserved(db, f.before));
});

test('schema5 migration leaves immutable owner identity and credential CHECK exactly unchanged', t => {
  const f = fixture(t), storage = openStorage({ filename: f.filename });
  storage.close();
  inspect(f.filename, db => {
    const oldUsers = f.before.schema.find(object => object.type === 'table' && object.name === 'users');
    assert.deepEqual(schema(db).find(object => object.type === 'table' && object.name === 'users'), oldUsers);
    assert.throws(() => db.prepare("UPDATE users SET password_hash=? WHERE id='owner'").run(passwordHash), /CHECK/u);
    assert.throws(() => db.prepare("UPDATE users SET username='different-owner' WHERE id='owner'").run(), /CHECK/u);
    assert.throws(() => db.prepare("INSERT INTO users VALUES(?,?,'owner',NULL,?)").run(randomUUID(), 'other-owner', now), /CHECK/u);
    assert.throws(() => db.prepare("UPDATE users SET password_hash=NULL WHERE id=?").run(f.records[0].user), /CHECK/u);
    assertPreserved(db, f.before);
  });
});

test('failure late in schema5 migration rolls back all email DDL and leaves schema4 rows/version untouched', t => {
  const f = fixture(t);
  inspect(f.filename, db => {
    // Fail after email_identities/email_actions and their index were created inside the migration transaction.
    db.exec('CREATE TABLE email_rate_buckets(sentinel TEXT) STRICT;');
    db.prepare('INSERT INTO email_rate_buckets VALUES(?)').run('synthetic untouched rollback sentinel');
  });
  const beforeFailure = inspect(f.filename, db => schema(db));
  assert.throws(() => openStorage({ filename: f.filename }), /email_rate_buckets/u);
  inspect(f.filename, db => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
    assertPreserved(db, f.before);
    assert.deepEqual(schema(db), beforeFailure);
    assert.equal(db.prepare('SELECT sentinel FROM email_rate_buckets').get().sentinel, 'synthetic untouched rollback sentinel');
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('email_identities','email_actions','email_actions_expiry','email_rate_expiry')").get().n, 0);
  });
});

test('future schema10 fails closed without changing persistent database bytes, schema or journal mode', t => {
  const f = fixture(t);
  inspect(f.filename, db => { db.exec('PRAGMA journal_mode=WAL; PRAGMA user_version=10;'); });
  const bytes = readFileSync(f.filename), files = readdirSync(f.directory).sort();
  assert.throws(() => openStorage({ filename: f.filename }), error => error.code === 'STORAGE_VERSION_UNSUPPORTED');
  assert.deepEqual(readFileSync(f.filename), bytes);
  assert.deepEqual(readdirSync(f.directory).sort(), files);
  inspect(f.filename, db => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 10);
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assertPreserved(db, f.before);
    assert.deepEqual(schema(db), f.before.schema);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'email_%'").get().n, 0);
  });
});
