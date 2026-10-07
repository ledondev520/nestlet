// Disposable CI-only SQLite file, separate from the application's schema.
// Confirms real node:sqlite persistence through a container recreation.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { closeSync, lstatSync, openSync, statSync, unlinkSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
// Override only for a private disposable local smoke directory, never production.
const dataDirectory = process.env.NESTLET_CI_DATA_DIR || '/data';
assert.ok(isAbsolute(dataDirectory));
const path = join(dataDirectory, 'ci-lifetime.sqlite');
const operation = process.argv[2];
assert.equal(process.getuid(), 1000);
const dataInfo = lstatSync(dataDirectory);
assert.ok(dataInfo.isDirectory());
assert.equal(dataInfo.mode & 0o777, 0o700);
assert.equal(dataInfo.uid, process.getuid());
const actual = statSync(join(dataDirectory, 'nestlet.sqlite'));
assert.equal(actual.mode & 0o777, 0o600);
assert.equal(actual.uid, process.getuid());
const applicationDb = new DatabaseSync(join(dataDirectory, 'nestlet.sqlite'), { readOnly: true });
assert.equal(applicationDb.prepare('PRAGMA application_id').get().application_id, 0x4e53544c);
assert.equal(applicationDb.prepare('PRAGMA user_version').get().user_version, 5);
assert.equal(applicationDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assets'").get()?.name, 'assets');
for (const table of ['email_identities', 'email_actions', 'email_rate_buckets']) assert.equal(applicationDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)?.name, table);
assert.equal(applicationDb.prepare('PRAGMA quick_check').get().quick_check, 'ok');
assert.equal(applicationDb.prepare('PRAGMA foreign_key_check').all().length, 0);
applicationDb.close();
if (operation === 'write') {
  closeSync(openSync(path, 'wx', 0o600));
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE persistence_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare('INSERT INTO persistence_probe (id,value) VALUES (?,?)').run(1, 'public-disposable-ci-marker');
  db.close();
  console.log('Disposable SQLite marker written; application database unchanged.');
} else if (operation === 'read') {
  const db = new DatabaseSync(path, { readOnly: true });
  assert.equal(db.prepare('SELECT value FROM persistence_probe WHERE id=?').get(1).value, 'public-disposable-ci-marker');
  db.close();
  unlinkSync(path);
  console.log('Real SQLite persistence marker matched; disposable fixture removed.');
} else throw new Error('Expected write or read');
