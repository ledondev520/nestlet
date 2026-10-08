// Actual SQLite files and subprocesses; synthetic inputs and disposable test credentials only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openStorage, validateCasePayload, MAX_CASE_BYTES, MAX_CASES_PER_USER } from '../storage.js';
import { FIELDS, draft } from '../public/core.js';

const hash = () => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-test-password-only', salt, 32).toString('base64url')}`;
};
const passwordHash = hash();
const payload = (overrides = {}) => ({ title: 'Synthetic paperwork', sourceText: 'Property: Synthetic example',
  fields: [], draftType: 'followup', draftText: '', extractionMode: 'manual', namesVerified: false, ...overrides });
const fixture = t => {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-storage-test-'));
  const filename = join(directory, 'private', 'nestlet.sqlite');
  const storage = openStorage({ filename });
  t.after(() => { storage.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, filename, storage };
};
const code = expected => error => error.code === expected;

test('actual SQLite schema, private new directory/file, reserved owner without credential, clean close', t => {
  const { filename, storage } = fixture(t);
  assert.equal(statSync(filename).mode & 0o777, 0o600);
  assert.equal(statSync(join(filename, '..')).mode & 0o777, 0o700);
  assert.equal(readFileSync(filename).subarray(0, 16).toString(), 'SQLite format 3\0');
  assert.equal(storage.getUserById('owner').passwordHash, null);
  assert.equal(storage.getUserById('owner').role, 'owner');
  const db = new DatabaseSync(filename);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 9);
  assert.equal(db.prepare('PRAGMA application_id').get().application_id, 0x4e53544c);
  db.close();
  storage.close(); storage.close();
});

test('trial usernames normalize uniquely; only hashes persist and rotation preserves stable identity and cases', t => {
  const { storage, filename } = fixture(t);
  const user = storage.createTrialUser({ username: '  Trial.One  ', passwordHash });
  assert.match(user.id, /^[0-9a-f-]{36}$/u);
  assert.equal(user.username, 'trial.one');
  assert.equal(user.role, 'trial');
  assert.equal('passwordHash' in user, false);
  assert.throws(() => storage.createTrialUser({ username: 'TRIAL.ONE', passwordHash }), code('USER_EXISTS'));
  assert.equal(storage.findUserByUsername(' Trial.One ').id, user.id);
  const saved = storage.createCase(user.id, payload());
  const rotatedHash = hash();
  assert.equal(storage.upsertTrialUser({ username: 'TRIAL.ONE', passwordHash: rotatedHash }).id, user.id);
  assert.equal(storage.getUserById(user.id).passwordHash, rotatedHash);
  assert.equal(storage.getCase(user.id, saved.id).id, saved.id);
  assert.equal(readFileSync(filename).includes(Buffer.from('synthetic-test-password-only')), false);
  for (const username of ['owner', ' OWNER ', '', 'ab', 'a'.repeat(65), 'trial name', "x';DROP TABLE users;--", '试用者'])
    assert.throws(() => storage.createTrialUser({ username, passwordHash }), code('USER_INVALID'));
  for (const invalid of ['', 'plaintext-test-password', 'scrypt$invalid$invalid', null])
    assert.throws(() => storage.createTrialUser({ username: 'trial.two', passwordHash: invalid }), code('USER_INVALID'));
  assert.equal(storage.findUserByUsername("anything' OR 1=1 --"), null);
  assert.equal(storage.listCases(user.id).length, 1);
});

test('all case operations isolate trial users and owner; missing and foreign IDs have identical results', t => {
  const { storage } = fixture(t);
  const alice = storage.createTrialUser({ username: 'trial-alpha', passwordHash });
  const bob = storage.createTrialUser({ username: 'trial-beta', passwordHash });
  const a = storage.createCase(alice.id, payload({ title: 'Synthetic alpha' }));
  const b = storage.createCase(bob.id, payload({ title: 'Synthetic beta' }));
  const owner = storage.createCase('owner', payload({ title: 'Synthetic owner' }));
  assert.deepEqual(storage.listCases(alice.id).map(record => record.id), [a.id]);
  assert.deepEqual(storage.listCases(bob.id).map(record => record.id), [b.id]);
  assert.deepEqual(storage.listCases('owner').map(record => record.id), [owner.id]);
  for (const id of [b.id, owner.id, randomUUID(), "' OR 1=1 --"]) {
    assert.equal(storage.getCase(alice.id, id), null);
    assert.equal(storage.updateCase(alice.id, id, payload(), 1), null);
    assert.equal(storage.deleteCase(alice.id, id, 1), false);
  }
  assert.equal(storage.getCase(bob.id, b.id).title, 'Synthetic beta');
  assert.equal(storage.getCase('owner', owner.id).title, 'Synthetic owner');
  assert.throws(() => storage.createCase(randomUUID(), payload()), code('USER_INVALID'));
  assert.throws(() => storage.getCase('', a.id), code('USER_INVALID'));
  assert.throws(() => storage.createCase(alice.id, payload({ userId: bob.id })), code('CASE_INVALID'));
  assert.equal('sourceText' in storage.listCases(alice.id)[0], false);
});

test('save/reopen and fresh process preserve source, confirmations, provenance, draft edits and stable IDs', t => {
  const { storage, filename } = fixture(t);
  const user = storage.createTrialUser({ username: 'trial-durable', passwordHash });
  const fields = FIELDS.map(key => ({ key, value: key === 'property' ? 'Synthetic example' : '',
    source: 'Synthetic example', sources: ['Synthetic example'], confirmed: true, conflict: false, edited: true,
    sourceCell: { sheet: 'Synthetic', row: 2, column: 'A' } }));
  const input = payload({ fields, extractionMode: 'live', namesVerified: true, draftText: draft(fields) + '\nSynthetic manual edit.' });
  const created = storage.createCase(user.id, input);
  storage.close();
  const reopened = openStorage({ filename });
  assert.deepEqual(reopened.getCase(user.id, created.id), created);
  assert.equal(reopened.findUserByUsername('TRIAL-DURABLE').id, user.id);
  reopened.close();
  const script = `import { openStorage } from ${JSON.stringify(new URL('../storage.js', import.meta.url).href)};
    const input=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>resolve(s))}));
    const s=openStorage({filename:input.filename});process.stdout.write(JSON.stringify(s.getCase(input.userId,input.caseId)));s.close();`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    input: JSON.stringify({ filename, userId: user.id, caseId: created.id }), encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), created);
});

test('actual second connection cannot overwrite or delete a stale version; failed transaction rolls back', t => {
  const { storage, filename } = fixture(t);
  const second = openStorage({ filename });
  t.after(() => second.close());
  const created = storage.createCase('owner', payload());
  const stale = second.getCase('owner', created.id);
  assert.equal(created.version, 1);
  const edited = storage.updateCase('owner', created.id, payload({ title: 'Fresh review' }), 1);
  assert.equal(edited.version, 2);
  assert.equal(edited.createdAt, created.createdAt);
  assert.throws(() => second.updateCase('owner', created.id, payload({ title: 'Stale review' }), stale.version), code('CASE_CONFLICT'));
  assert.throws(() => second.deleteCase('owner', created.id, stale.version), code('CASE_CONFLICT'));
  assert.equal(second.getCase('owner', created.id).title, 'Fresh review');
  for (const invalid of [undefined, null, 0, -1, 1.5, '2'])
    assert.throws(() => second.updateCase('owner', created.id, payload(), invalid), code('CASE_INVALID'));
  assert.equal(second.deleteCase('owner', created.id, 2), true);
  assert.equal(storage.getCase('owner', created.id), null);
  assert.equal(storage.deleteCase('owner', created.id, 2), false);
});

test('strict bounded schema rejects malformed, binary, unknown keys, unreviewed drafts and oversized JSON', t => {
  const { storage } = fixture(t);
  const malformed = [null, [], 'text', {}, payload({ title: '' }), payload({ title: 'bad\nline' }),
    payload({ sourceText: Buffer.from('binary') }), payload({ sourceText: { type: 'Buffer', data: [1, 2] } }),
    payload({ fileBytes: [1, 2] }), payload({ apiKey: 'test-value' }), payload({ sourceText: 'bad\0text' }),
    payload({ fields: [{}] }), payload({ draftType: 'approval' }), payload({ draftText: 'Unreviewed draft' }),
    payload({ namesVerified: 'true' }), payload({ namesVerified: null }), payload({ extractionMode: 'demo' })];
  for (const invalid of malformed) assert.throws(() => storage.createCase('owner', invalid), code('CASE_INVALID'));
  const circular = payload(); circular.fields = [circular];
  assert.throws(() => validateCasePayload(circular), code('CASE_INVALID'));
  for (const invalid of [payload({ title: 'x'.repeat(121) }), payload({ sourceText: 'x'.repeat(50_001) }), payload({ draftText: 'x'.repeat(50_001) })])
    assert.throws(() => storage.createCase('owner', invalid), code('CASE_TOO_LARGE'));
  const fields = FIELDS.map(key => ({ key, value: '', source: '中'.repeat(30_000), conflict: false, confirmed: true }));
  const tooManyBytes = payload({ fields });
  assert.ok(Buffer.byteLength(JSON.stringify(tooManyBytes)) > MAX_CASE_BYTES);
  assert.throws(() => storage.createCase('owner', tooManyBytes), code('CASE_TOO_LARGE'));
  const duplicates = FIELDS.map(() => ({ key: 'owner', value: '', source: '', confirmed: false, conflict: false }));
  assert.throws(() => storage.createCase('owner', payload({ fields: duplicates })), code('CASE_INVALID'));
  assert.deepEqual(storage.listCases('owner'), []);
});

test('all five facts are canonicalized into the frontend field order when saving a valid permutation', t => {
  const { storage } = fixture(t);
  const fields = [...FIELDS].reverse().map(key => ({ key, value: `Synthetic ${key}`, source: '', confirmed: false, conflict: false }));
  const saved = storage.createCase('owner', payload({ fields }));
  assert.deepEqual(saved.fields.map(field => field.key), FIELDS);
  assert.deepEqual(storage.getCase('owner', saved.id).fields.map(field => field.key), FIELDS);
  assert.deepEqual(fields.map(field => field.key), [...FIELDS].reverse());
  assert.throws(() => validateCasePayload(payload({ fields: new Array(5) })), code('CASE_INVALID'));
});

test('SQL metacharacters are data, update changes only the scoped row, delete remains durable', t => {
  const { storage, filename } = fixture(t);
  const injected = "Synthetic '; DROP TABLE cases; --";
  const created = storage.createCase('owner', payload({ title: injected, sourceText: injected }));
  assert.equal(storage.getCase('owner', created.id).sourceText, injected);
  assert.equal(storage.updateCase('owner', created.id, payload({ title: 'Updated synthetic' }), 1).version, 2);
  assert.equal(storage.deleteCase('owner', created.id, 2), true);
  storage.close();
  const reopened = openStorage({ filename });
  assert.deepEqual(reopened.listCases('owner'), []);
  reopened.close();
});

test('unsupported or unrelated database schemas fail closed without destructive migrations', t => {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-schema-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [name, pragma] of [['future', 'PRAGMA user_version=109;'], ['unrelated', '']]) {
    const filename = join(directory, `${name}.sqlite`);
    const db = new DatabaseSync(filename);
    db.exec(`CREATE TABLE must_preserve(value TEXT); INSERT INTO must_preserve VALUES ('synthetic sentinel'); ${pragma}`);
    db.exec('PRAGMA journal_mode=WAL;');
    db.close();
    chmodSync(filename, 0o600);
    const before = readFileSync(filename);
    assert.throws(() => openStorage({ filename }), code('STORAGE_VERSION_UNSUPPORTED'));
    assert.deepEqual(readFileSync(filename), before);
    const reopened = new DatabaseSync(filename);
    assert.equal(reopened.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.equal(reopened.prepare('SELECT value FROM must_preserve').get().value, 'synthetic sentinel');
    reopened.close();
  }
});

test('file-backed storage refuses memory, symlinks, sidecar symlinks and nonregular file paths', t => {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-path-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const filename of [undefined, '', ':memory:', directory])
    assert.throws(() => openStorage({ filename }), code('STORAGE_PATH_INVALID'));
  const target = join(directory, 'target'); writeFileSync(target, 'synthetic untouched');
  const link = join(directory, 'linked.sqlite'); symlinkSync(target, link);
  assert.throws(() => openStorage({ filename: link }), code('STORAGE_PATH_INVALID'));
  const path = join(directory, 'sidecar.sqlite'); symlinkSync(target, path + '-journal');
  assert.throws(() => openStorage({ filename: path }), code('STORAGE_PATH_INVALID'));
  const directoryLink = join(directory, 'linked-directory'); symlinkSync(directory, directoryLink);
  assert.throws(() => openStorage({ filename: join(directoryLink, 'db.sqlite') }), code('STORAGE_PATH_INVALID'));
  assert.equal(readFileSync(target, 'utf8'), 'synthetic untouched');
});

test('existing untrusted file/directory modes and hard links are refused without chmod or content changes', t => {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-private-path-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const target = join(directory, 'private.sqlite');
  writeFileSync(target, 'synthetic existing file', { mode: 0o644 });
  chmodSync(target, 0o644);
  assert.throws(() => openStorage({ filename: target }), code('STORAGE_PATH_INVALID'));
  assert.equal(statSync(target).mode & 0o777, 0o644);
  chmodSync(target, 0o600);
  const hardLink = join(directory, 'alias.sqlite'); linkSync(target, hardLink);
  assert.throws(() => openStorage({ filename: hardLink }), code('STORAGE_PATH_INVALID'));
  assert.throws(() => openStorage({ filename: target }), code('STORAGE_PATH_INVALID'));
  const withSidecar = join(directory, 'sidecar.sqlite'); linkSync(target, withSidecar + '-journal');
  assert.throws(() => openStorage({ filename: withSidecar }), code('STORAGE_PATH_INVALID'));
  assert.equal(readFileSync(target, 'utf8'), 'synthetic existing file');
  const child = join(directory, 'private-child'); mkdirSync(child, { mode: 0o700 });
  chmodSync(directory, 0o777);
  assert.throws(() => openStorage({ filename: join(child, 'db.sqlite') }), code('STORAGE_PATH_INVALID'));
  chmodSync(directory, 0o755);
  assert.throws(() => openStorage({ filename: join(directory, 'new.sqlite') }), code('STORAGE_PATH_INVALID'));
  assert.equal(statSync(directory).mode & 0o777, 0o755);
});

test('per-user case cap bounds storage/listing, permits updates and frees a slot after owner-scoped delete', t => {
  const { storage } = fixture(t);
  const user = storage.createTrialUser({ username: 'trial-cap', passwordHash });
  for (let index = 0; index < MAX_CASES_PER_USER; index++) storage.createCase(user.id, payload({ title: `Synthetic ${index}` }));
  assert.equal(storage.listCases(user.id).length, MAX_CASES_PER_USER);
  assert.throws(() => storage.createCase(user.id, payload()), code('CASE_LIMIT_REACHED'));
  const row = storage.listCases(user.id)[0];
  const edited = storage.updateCase(user.id, row.id, payload({ title: 'Still editable' }), row.version);
  assert.equal(edited.version, 2);
  assert.equal(storage.deleteCase(user.id, row.id, edited.version), true);
  storage.createCase(user.id, payload());
  assert.equal(storage.listCases(user.id).length, MAX_CASES_PER_USER);
  assert.equal(storage.createCase('owner', payload()).version, 1);
});
