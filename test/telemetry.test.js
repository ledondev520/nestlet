// Actual SQLite fixtures and public metadata APIs; no clock, filesystem or provider mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../storage.js';
import { createTelemetry, validateClientBatch, serverTelemetryEvent, telemetryPageOptions } from '../telemetry.js';

const salt = randomBytes(16);
const hash = `scrypt$${salt.toString('base64url')}$${scryptSync('public-telemetry-test-password', salt, 32).toString('base64url')}`;
const casePayload = { title: 'Private title must stay outside logs', sourceText: 'Private synthetic document body', fields: [], draftType: 'followup', draftText: '' };
function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-telemetry-'));
  const filename = join(directory, 'nestlet.sqlite');
  const storage = openStorage({ filename });
  const a = storage.createTrialUser({ username: 'telemetry-a', passwordHash: hash });
  const b = storage.createTrialUser({ username: 'telemetry-b', passwordHash: hash });
  t.after(() => { storage.close(); rmSync(directory, { recursive: true, force: true }); });
  return { filename, storage, a, b, telemetry: createTelemetry(storage) };
}
const client = (overrides = {}) => validateClientBatch({ events: [{ event: 'review.confirm', outcome: 'success', ...overrides }] });
const backend = (overrides = {}) => serverTelemetryEvent({ event: 'request.case_read', requestId: randomUUID(), httpStatus: 200, serverElapsedMs: 7, ...overrides });
const code = expected => error => error.code === expected;

test('real schema1 to current schema migration preserves every original user/case column and credential hash', t => {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-migrate-'));
  const filename = join(directory, 'v1.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(filename, '', { mode: 0o600 });
  let db = new DatabaseSync(filename);
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY NOT NULL,username TEXT NOT NULL UNIQUE,role TEXT NOT NULL CHECK(role IN ('owner','trial')),password_hash TEXT,created_at TEXT NOT NULL,CHECK((role='owner' AND id='owner' AND username='owner' AND password_hash IS NULL) OR(role='trial' AND id!='owner' AND username!='owner' AND password_hash IS NOT NULL))) STRICT;
    CREATE TABLE cases(id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),version INTEGER NOT NULL CHECK(version>0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL) STRICT;
    CREATE INDEX cases_by_owner_updated ON cases(user_id,updated_at DESC,id); PRAGMA application_id=1314083916; PRAGMA user_version=1;`);
  const uid = randomUUID(), cid = randomUUID(), time = '2026-01-01T00:00:00.000Z';
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner', 'owner', 'owner', null, time);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(uid, 'migration-user', 'trial', hash, time);
  db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?)').run(cid, uid, casePayload.title, JSON.stringify(casePayload), 4, time, time);
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  const cases = db.prepare('SELECT * FROM cases ORDER BY id').all();
  db.close();
  const storage = openStorage({ filename });
  assert.equal(storage.getUserById(uid).passwordHash, hash);
  assert.equal(storage.getCase(uid, cid).version, 4);
  storage.close();
  db = new DatabaseSync(filename);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 10);
    assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), users);
    assert.deepEqual(db.prepare('SELECT id,user_id,title,payload_json,version,created_at,updated_at FROM cases ORDER BY id').all(), cases);
    assert.equal(db.prepare('SELECT client_id FROM cases WHERE id=?').get(cid).client_id, null);
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.equal(statSync(filename).mode & 0o777, 0o600);
  } finally { db.close(); }
});

test('client telemetry whitelist rejects content, credentials, filenames and authoritative timing/status fields', () => {
  const base = { event: 'input.file', outcome: 'success' };
  for (const key of ['text', 'sourceText', 'draftText', 'filename', 'password', 'apiKey', 'metadata', 'stack', 'url', 'userId', 'serverElapsedMs', 'httpStatus', 'source']) {
    assert.throws(() => validateClientBatch({ events: [{ ...base, [key]: 'untrusted arbitrary data' }] }), code('TELEMETRY_INVALID'));
  }
  for (const item of [{ ...base, event: 'request.extract' }, { ...base, clientActiveMs: -1 }, { ...base, clientActiveMs: 86400001 }, { ...base, clientWaitMs: 300001 }, { ...base, clientWaitMs: 1.2 }, { ...base, errorCode: 'arbitrary-error-text' }]) {
    assert.throws(() => validateClientBatch({ events: [item] }), code('TELEMETRY_INVALID'));
  }
  assert.throws(() => validateClientBatch({ events: Array(11).fill(base) }), code('TELEMETRY_INVALID'));
  assert.throws(() => validateClientBatch({ events: [] }), code('TELEMETRY_INVALID'));
  const accepted = client({ clientActiveMs: 86400000, clientWaitMs: 300000 })[0];
  assert.equal(accepted.source, 'client'); assert.equal(accepted.serverElapsedMs, null); assert.equal(accepted.httpStatus, null);
  assert.equal(backend({ httpStatus: 500, errorCode: 'private raw exception' }).errorCode, 'UNCLASSIFIED_ERROR');
});

test('actual workflow/case binding and request correlation are restricted to the same user and workflow', t => {
  const { storage, a, b } = fixture(t);
  const wa = storage.telemetryCreateWorkflow(a.id), wb = storage.telemetryCreateWorkflow(b.id), wa2 = storage.telemetryCreateWorkflow(a.id);
  const ca = storage.createCase(a.id, casePayload), cb = storage.createCase(b.id, casePayload);
  assert.throws(() => storage.telemetryBindWorkflow(a.id, wb.workflowId, ca.id), code('WORKFLOW_NOT_FOUND'));
  assert.throws(() => storage.telemetryBindWorkflow(a.id, wa.workflowId, cb.id), code('CASE_NOT_FOUND'));
  assert.deepEqual(storage.telemetryBindWorkflow(a.id, wa.workflowId, ca.id), { workflowId: wa.workflowId, caseId: ca.id });
  storage.telemetryBindWorkflow(a.id, wa.workflowId, ca.id);
  const other = storage.createCase(a.id, { ...casePayload, title: 'Other own case' });
  assert.throws(() => storage.telemetryBindWorkflow(a.id, wa.workflowId, other.id), code('WORKFLOW_ALREADY_BOUND'));
  const event = backend(); storage.telemetryAppendEvents(a.id, wa.workflowId, [event]);
  assert.throws(() => storage.telemetryAppendEvents(b.id, wb.workflowId, client({ requestId: event.requestId })), code('TELEMETRY_REQUEST_MISMATCH'));
  assert.throws(() => storage.telemetryAppendEvents(a.id, wa2.workflowId, client({ requestId: event.requestId })), code('TELEMETRY_REQUEST_MISMATCH'));
  storage.telemetryAppendEvents(a.id, wa.workflowId, client({ requestId: event.requestId }));
  assert.equal(storage.telemetryReadEvents(a.id, { workflowId: wa.workflowId }).events.length, 2);
  assert.throws(() => storage.telemetryReadEvents(b.id, { workflowId: wa.workflowId }), code('WORKFLOW_NOT_FOUND'));
  assert.throws(() => storage.telemetryReadEvents(b.id, {}, true), code('OWNER_REQUIRED'));
  const metadata = storage.telemetryReadEvents('owner', { userId: a.id }, true);
  assert.equal(metadata.events.length, 2);
  for (const secret of [casePayload.title, casePayload.sourceText, hash, a.username]) assert.equal(JSON.stringify(metadata).includes(secret), false);
});

test('telemetry read cursors and actual write rate windows enforce documented bounds', t => {
  const { storage, telemetry, a, b } = fixture(t);
  let workflow;
  for (let i = 0; i < 20; i++) workflow = telemetry.createWorkflow({ userId: a.id, role: 'trial' });
  assert.throws(() => telemetry.createWorkflow({ userId: a.id, role: 'trial' }), code('TELEMETRY_RATE_LIMITED'));
  for (let i = 0; i < 6; i++) telemetry.postEvents({ userId: a.id }, workflow.workflowId, { events: Array(10).fill({ event: 'draft.edit', outcome: 'success' }) });
  assert.throws(() => telemetry.postEvents({ userId: a.id }, workflow.workflowId, { events: [{ event: 'draft.edit', outcome: 'success' }] }), code('TELEMETRY_RATE_LIMITED'));
  assert.ok(telemetry.createWorkflow({ userId: b.id, role: 'trial' }).workflowId);
  const first = storage.telemetryReadEvents(a.id, { workflowId: workflow.workflowId, limit: 20 });
  assert.equal(first.events.length, 20); assert.ok(first.nextBeforeId);
  const next = storage.telemetryReadEvents(a.id, { workflowId: workflow.workflowId, limit: 20, beforeId: first.nextBeforeId });
  assert.ok(next.events.every(event => event.id < first.nextBeforeId));
  for (const query of ['limit=101', 'limit=0', 'beforeId=-1', 'limit=1&limit=2', 'search=private', 'userId=owner']) assert.throws(() => telemetryPageOptions(new URLSearchParams(query)), code('TELEMETRY_INVALID'));
});

test('actual workflow and per-workflow event caps remove old metadata without deleting the saved case', t => {
  const { storage, filename, a } = fixture(t);
  const saved = storage.createCase(a.id, casePayload);
  const first = storage.telemetryCreateWorkflow(a.id);
  storage.telemetryBindWorkflow(a.id, first.workflowId, saved.id);
  for (let i = 0; i < 21; i++) storage.telemetryAppendEvents(a.id, first.workflowId, Array.from({ length: 10 }, () => backend()));
  let db = new DatabaseSync(filename);
  assert.equal(db.prepare('SELECT count(*) n FROM telemetry_events WHERE workflow_id=?').get(first.workflowId).n, 200);
  db.prepare('UPDATE telemetry_workflows SET updated_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), first.workflowId);
  db.close();
  for (let i = 0; i < 100; i++) storage.telemetryCreateWorkflow(a.id);
  db = new DatabaseSync(filename);
  try { assert.equal(db.prepare('SELECT count(*) n FROM telemetry_workflows WHERE user_id=?').get(a.id).n, 100); }
  finally { db.close(); }
  assert.equal(storage.telemetryGetWorkflow(a.id, first.workflowId), null);
  assert.equal(storage.getCase(a.id, saved.id).sourceText, casePayload.sourceText);
});

test('dated actual SQLite metadata expires on reads and startup while case content remains intact', t => {
  const { storage, filename, a } = fixture(t);
  const saved = storage.createCase(a.id, casePayload);
  const workflow = storage.telemetryCreateWorkflow(a.id);
  storage.telemetryBindWorkflow(a.id, workflow.workflowId, saved.id);
  storage.telemetryAppendEvents(a.id, workflow.workflowId, [backend()]);
  const expired = new Date(Date.now() - 31 * 86400000).toISOString();
  let db = new DatabaseSync(filename);
  db.prepare('UPDATE telemetry_events SET created_at=?').run(expired);
  db.prepare('UPDATE telemetry_workflows SET updated_at=?').run(expired);
  db.close();
  assert.equal(storage.telemetryReadEvents('owner', {}, true).events.length, 0);
  assert.equal(storage.getCase(a.id, saved.id).title, casePayload.title);
  const again = storage.telemetryCreateWorkflow(a.id);
  storage.telemetryAppendEvents(a.id, again.workflowId, [backend()]);
  db = new DatabaseSync(filename); db.prepare('UPDATE telemetry_events SET created_at=?').run(expired); db.close();
  storage.close();
  const reopened = openStorage({ filename });
  try { assert.equal(reopened.telemetryReadEvents('owner', {}, true).events.length, 0); assert.equal(reopened.getCase(a.id, saved.id).title, casePayload.title); }
  finally { reopened.close(); }
});

test('actual per-user and global event caps prune oldest metadata across workflows', t => {
  const { storage, filename, a } = fixture(t);
  const db = new DatabaseSync(filename);
  t.after(() => { try { db.close(); } catch {} });
  const insert = db.prepare("INSERT INTO telemetry_events(workflow_id,user_id,request_id,source,event_name,outcome,http_status,error_code,server_elapsed_ms,client_active_ms,client_wait_ms,created_at) VALUES(?,?,?,'server','request.case_read','success',200,NULL,1,NULL,NULL,?)");
  const now = new Date().toISOString();
  function seed(userId, count) {
    const workflows = Array.from({ length: Math.ceil(count / 200) }, () => storage.telemetryCreateWorkflow(userId));
    db.exec('BEGIN');
    try { for (let i = 0; i < count; i++) insert.run(workflows[Math.floor(i / 200)].workflowId, userId, randomUUID(), now); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  seed(a.id, 2000);
  const next = storage.telemetryCreateWorkflow(a.id);
  storage.telemetryAppendEvents(a.id, next.workflowId, [backend()]);
  assert.equal(db.prepare('SELECT count(*) n FROM telemetry_events WHERE user_id=?').get(a.id).n, 2000);
  for (let i = 0; i < 9; i++) { const user = storage.createTrialUser({ username: `cap-user-${i}`, passwordHash: hash }); seed(user.id, 2000); }
  assert.equal(db.prepare('SELECT count(*) n FROM telemetry_events').get().n, 20000);
  const extra = storage.createTrialUser({ username: 'global-cap-extra', passwordHash: hash });
  const workflow = storage.telemetryCreateWorkflow(extra.id);
  const oldest = db.prepare('SELECT min(id) n FROM telemetry_events').get().n;
  storage.telemetryAppendEvents(extra.id, workflow.workflowId, [backend()]);
  assert.equal(db.prepare('SELECT count(*) n FROM telemetry_events').get().n, 20000);
  assert.equal(db.prepare('SELECT count(*) n FROM telemetry_events WHERE id=?').get(oldest).n, 0);
});

test('chat stream outcome remains failure despite HTTP200 and roundtrips actual SQLite canonical metadata', t => {
  // This checks metadata semantics, not an upstream stream or a model request.
  const { storage, a } = fixture(t);
  const workflow = storage.telemetryCreateWorkflow(a.id);
  const requestId = randomUUID();
  const failed = serverTelemetryEvent({ event: 'request.chat', requestId, httpStatus: 200, serverElapsedMs: 42, outcome: 'failure', errorCode: 'CHAT_INCOMPLETE' });
  assert.equal(failed.outcome, 'failure'); assert.equal(failed.httpStatus, 200);
  storage.telemetryAppendEvents(a.id, workflow.workflowId, [failed]);
  const events = storage.telemetryReadEvents(a.id, { workflowId: workflow.workflowId }).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, 'failure'); assert.equal(events[0].httpStatus, 200);
  assert.equal(events[0].serverElapsedMs, 42); assert.equal(events[0].clientWaitMs, null);
  assert.equal(events[0].requestId, requestId);
  assert.ok(!Object.hasOwn(events[0], 'content'));
});
