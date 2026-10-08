// Historical schema3 DDL + synthetic records on actual SQLite; no runtime mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { openStorage } from '../storage.js';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'nestlet-schema4-')),
    file = join(dir, 'records.sqlite');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(file, '', { mode: 0o600 });
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  db.exec(readFileSync(new URL('./fixtures/schema3.sql', import.meta.url), 'utf8'));
  const user = randomUUID(),
    client = randomUUID(),
    record = randomUUID(),
    conversation = randomUUID(),
    message = randomUUID(),
    artifact = randomUUID(),
    workflow = randomUUID(),
    now = '2026-10-07T09:00:00.000Z';
  const salt = randomBytes(16),
    hash = `scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-migration-password', salt, 32).toString('base64url')}`;
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner', 'owner', 'owner', null, now);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    user,
    'legacy-assets-user',
    'trial',
    hash,
    now
  );
  db.prepare('INSERT INTO clients VALUES(?,?,?,?,?,?)').run(
    client,
    user,
    'Synthetic preserved customer',
    2,
    now,
    now
  );
  db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?,?)').run(
    record,
    user,
    'Synthetic preserved case',
    JSON.stringify({
      title: 'Synthetic preserved case',
      sourceText: 'Preserved original case source',
      fields: [],
      draftType: 'followup',
      draftText: ''
    }),
    4,
    now,
    now,
    client
  );
  db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run(
    conversation,
    user,
    record,
    'Preserved conversation',
    now,
    now
  );
  db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    message,
    user,
    conversation,
    1,
    'user',
    'Preserved synthetic message',
    'complete',
    null,
    randomUUID(),
    '[]',
    now
  );
  db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    artifact,
    user,
    record,
    'followup',
    'Preserved version',
    'draft',
    'Preserved synthetic artifact',
    2,
    4,
    conversation,
    message,
    '{}',
    now
  );
  db.prepare('INSERT INTO telemetry_workflows VALUES(?,?,?,?,?)').run(
    workflow,
    user,
    record,
    now,
    now
  );
  db.prepare('INSERT INTO telemetry_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    99,
    workflow,
    user,
    randomUUID(),
    'server',
    'request.chat',
    'success',
    200,
    null,
    9,
    null,
    null,
    now
  );
  const tables = [
    'users',
    'clients',
    'cases',
    'conversations',
    'messages',
    'artifacts',
    'telemetry_workflows',
    'telemetry_events',
    'sqlite_sequence'
  ];
  const before = Object.fromEntries(
    tables.map((n) => [
      n,
      JSON.stringify(db.prepare('SELECT * FROM ' + n + ' ORDER BY rowid').all())
    ])
  );
  db.close();
  return { dir, file, user, record, before };
}
test('schema3→current is additive, preserves every old row, and keeps original case/history after restart', (t) => {
  const f = fixture(t);
  const storage = openStorage({ filename: f.file });
  assert.equal(storage.getCase(f.user, f.record).version, 4);
  storage.close();
  const db = new DatabaseSync(f.file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8);
  for (const [n, rows] of Object.entries(f.before))
    assert.equal(
      JSON.stringify(db.prepare('SELECT * FROM ' + n + ' ORDER BY rowid').all()),
      rows,
      n
    );
  assert.equal(db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
  const again = openStorage({ filename: f.file });
  assert.equal(again.getCase(f.user, f.record).sourceText, 'Preserved original case source');
  assert.equal(again.listAssets(f.user).total, 0);
  again.close();
});
test('failed schema4 transaction leaves original rows/version intact; future schemas fail without writes', (t) => {
  const f = fixture(t);
  let db = new DatabaseSync(f.file);
  db.exec('CREATE TABLE assets(sentinel TEXT);');
  db.prepare('INSERT INTO assets VALUES(?)').run('untouched');
  db.close();
  assert.throws(() => openStorage({ filename: f.file }));
  db = new DatabaseSync(f.file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(db.prepare('SELECT sentinel FROM assets').get().sentinel, 'untouched');
  for (const [n, rows] of Object.entries(f.before))
    assert.equal(
      JSON.stringify(db.prepare('SELECT * FROM ' + n + ' ORDER BY rowid').all()),
      rows,
      n
    );
  db.exec('PRAGMA user_version=9;');
  db.close();
  const before = readFileSync(f.file);
  assert.throws(
    () => openStorage({ filename: f.file }),
    (e) => e.code === 'STORAGE_VERSION_UNSUPPORTED'
  );
  assert.deepEqual(readFileSync(f.file), before);
});
