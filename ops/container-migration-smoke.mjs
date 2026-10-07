// CI ONLY: migrate a disposable, genuine schema-1 SQLite database using the
// shipped storage module. Schema-1 DDL matches baseline 2c13615; all rows are synthetic.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { closeSync, lstatSync, mkdtempSync, openSync, rmSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { openStorage } from './storage.js';
import { openAssetVault, parseAsset } from './private-assets.js';
// Default is the disposable Docker CI volume; a private local directory enables
// the same real-SQLite smoke without Docker. Never use a production data path.
const dataDirectory = process.env.NESTLET_CI_DATA_DIR || '/data';
assert.ok(isAbsolute(dataDirectory));
const dataInfo = lstatSync(dataDirectory);
assert.ok(dataInfo.isDirectory());
assert.equal(dataInfo.mode & 0o777, 0o700);
assert.equal(dataInfo.uid, process.getuid());
const directory = mkdtempSync(join(dataDirectory, 'ci-migration-'));
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
  const beforeCases = database.prepare('SELECT id,user_id,title,payload_json,version,created_at,updated_at FROM cases ORDER BY id').all();
  database.close(); database = undefined;
  storage = openStorage({ filename });
  assert.ok(storage.getUserById(userId).passwordHash === passwordHash, 'Migration changed the public-test credential hash');
  assert.equal(storage.getCase(userId, caseId).sourceText, payload.sourceText);
  assert.equal(storage.getCase(userId, caseId).version, 3);
  assert.equal(storage.getCase('owner', caseId), null);
  // Exercise the newly migrated asset structures through shipped runtime code,
  // including a real immutable original, case association, search and isolation.
  const original = Buffer.from('Synthetic migration original');
  const vault = openAssetVault({ directory: join(directory, 'assets') });
  const asset = storage.createAsset(userId, await parseAsset(original, {
    originalFilename: 'synthetic-migration.txt', mimeType: 'text/plain'
  }), { caseId }, id => vault.write(id, original));
  assert.equal(asset.caseId, caseId);
  assert.equal(storage.listAssets(userId, { q: 'migration original' }).total, 1);
  assert.equal(storage.getAsset('owner', asset.id), null);
  assert.deepEqual(vault.read(asset), original);
  storage.close(); storage = openStorage({ filename });
  assert.equal(storage.getAsset(userId, asset.id).sha256, asset.sha256);
  assert.equal(storage.getAsset(userId, asset.id).caseId, caseId);
  assert.equal(storage.getAsset('owner', asset.id), null);
  assert.equal(storage.getCase(userId, caseId).version, 3);
  storage.close(); storage = undefined;
  database = new DatabaseSync(filename, { readOnly: true });
  assert.equal(database.prepare('PRAGMA application_id').get().application_id, 0x4e53544c);
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 6);
  assert.ok(JSON.stringify(database.prepare('SELECT * FROM users ORDER BY id').all()) === JSON.stringify(beforeUsers), 'Migration changed user columns');
  assert.ok(JSON.stringify(database.prepare('SELECT id,user_id,title,payload_json,version,created_at,updated_at FROM cases ORDER BY id').all()) === JSON.stringify(beforeCases), 'Migration changed case columns');
  assert.equal(database.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  assert.equal(database.prepare('SELECT client_id FROM cases WHERE id=?').get(caseId).client_id, null);
  for (const table of ['clients','conversations','messages','artifacts','email_identities','email_actions','email_rate_buckets','user_capabilities','account_capability_audit']) assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM assets').get().n, 1);
  const schemaObjects = new Set(database.prepare('SELECT name FROM sqlite_master').all().map(row => row.name));
  for (const name of ['assets', 'assets_owner_created', 'assets_owner_case', 'assets_owner_client',
    'assets_owner_insert', 'assets_owner_update', 'assets_immutable_content',
    'assets_follow_case_customer', 'assets_preserve_case_delete', 'email_identities', 'email_actions', 'email_rate_buckets', 'email_actions_expiry', 'email_rate_expiry', 'user_capabilities', 'account_capability_audit', 'account_capability_audit_no_update', 'account_capability_audit_no_delete']) {
    assert.ok(schemaObjects.has(name), `Missing schema6 structure: ${name}`);
  }
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.equal(statSync(join(directory, 'assets', asset.id + '.blob')).mode & 0o777, 0o600);
  assert.equal(statSync(filename).mode & 0o777, 0o600);
  console.log('Actual schema1→6 migration preserved every synthetic user/case column, credential hash, identity and version; schema6 capability/audit and email/asset structures, original bytes, search, ownership, reopen and private file modes passed. Application database was not modified by this test.');
} finally {
  storage?.close();
  database?.close();
  // Only this freshly created CI fixture directory in the disposable CI volume.
  rmSync(directory, { recursive: true, force: true });
}
