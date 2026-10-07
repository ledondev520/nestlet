// CI ONLY: migrate a disposable, genuine schema-1 SQLite database using the
// shipped storage module. Schema-1 DDL matches baseline 2c13615; all rows are synthetic.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { closeSync, mkdtempSync, openSync, rmSync, statSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { openStorage } from './storage.js';
const directory = mkdtempSync('/data/ci-migration-');
const filename = directory + '/schema1.sqlite';
const userId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const createdAt = '2026-01-01T00:00:00.000Z';
const salt = randomBytes(16);
const passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync('public-ci-migration-password', salt, 32).toString('base64url')}`;
const payload = { title: 'Synthetic migration case', sourceText: 'Property: Synthetic example', fields: [], draftType: 'followup', draftText: '', extractionMode: 'manual', namesVerified: false };
let database;
let storage;
try {
  closeSync(openSync(filename, 'wx', 0o600));
  database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'trial')),
      password_hash TEXT,
      created_at TEXT NOT NULL,
      CHECK ((role = 'owner' AND id = 'owner' AND username = 'owner' AND password_hash IS NULL) OR
        (role = 'trial' AND id != 'owner' AND username != 'owner' AND password_hash IS NOT NULL))
    ) STRICT;
    CREATE TABLE cases (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      version INTEGER NOT NULL CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX cases_by_owner_updated ON cases(user_id, updated_at DESC, id);
    PRAGMA application_id=1314083916;
    PRAGMA user_version=1;
  `);
  assert.equal(database.prepare('PRAGMA application_id').get().application_id, 0x4e53544c);
  database.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('owner', 'owner', 'owner', null, createdAt);
  database.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(userId, 'ci-migration-user', 'trial', passwordHash, createdAt);
  database.prepare('INSERT INTO cases VALUES (?,?,?,?,?,?,?)').run(caseId, userId, payload.title, JSON.stringify(payload), 3, createdAt, createdAt);
  const beforeUsers = database.prepare('SELECT * FROM users ORDER BY id').all();
  const beforeCases = database.prepare('SELECT * FROM cases ORDER BY id').all();
  database.close(); database = undefined;
  storage = openStorage({ filename });
  assert.ok(storage.getUserById(userId).passwordHash === passwordHash, 'Migration changed the public-test credential hash');
  assert.equal(storage.getCase(userId, caseId).sourceText, payload.sourceText);
  assert.equal(storage.getCase(userId, caseId).version, 3);
  assert.equal(storage.getCase('owner', caseId), null);
  storage.close(); storage = undefined;
  database = new DatabaseSync(filename, { readOnly: true });
  assert.equal(database.prepare('PRAGMA application_id').get().application_id, 0x4e53544c);
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 2);
  assert.ok(JSON.stringify(database.prepare('SELECT * FROM users ORDER BY id').all()) === JSON.stringify(beforeUsers), 'Migration changed user columns');
  assert.ok(JSON.stringify(database.prepare('SELECT * FROM cases ORDER BY id').all()) === JSON.stringify(beforeCases), 'Migration changed case columns');
  assert.equal(database.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  assert.equal(statSync(filename).mode & 0o777, 0o600);
  console.log('Actual schema1→2 migration preserved every synthetic user/case column, credential hash, identity, version and private file mode. Application database was not modified by this test.');
} finally {
  storage?.close();
  database?.close();
  // Only this freshly created CI fixture directory in the disposable CI volume.
  rmSync(directory, { recursive: true, force: true });
}
