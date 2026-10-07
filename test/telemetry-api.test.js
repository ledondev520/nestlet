// Real HTTP/SQLite telemetry acceptance. Failure injection uses real SQLite constraints, not mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { openStorage } from '../storage.js';
const password = 'public-telemetry-http-password';
const salt = randomBytes(16);
const hash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const payload = title => ({ title, sourceText: 'PRIVATE_SYNTHETIC_DOCUMENT_SENTINEL', fields: [], draftType: 'followup', draftText: '' });
async function app(t) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-telemetry-http-'));
  const filename = join(directory, 'nestlet.sqlite');
  const storage = openStorage({ filename });
  try { for (const username of ['telemetry-a', 'telemetry-b']) storage.createTrialUser({ username, passwordHash: hash }); } finally { storage.close(); }
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const url = `http://127.0.0.1:${port}`, origin = 'https://telemetry-acceptance.invalid';
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env,
    HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin, NESTLET_DB_PATH: filename,
    NESTLET_OPERATOR_PASSWORD_HASH: hash, DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
  t.after(async () => { if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); }); await rm(directory, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output || 'Server startup timeout')), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Startup exited ${code}: ${output}`)); });
    child.stdout.on('data', data => { if (data.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); } });
  });
  const headers = session => session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {};
  const request = (path, { method = 'GET', body, session, extra = {} } = {}) => fetch(url + path, {
    method, headers: { Origin: origin, ...headers(session), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  const sessions = {};
  for (const username of ['owner', 'telemetry-a', 'telemetry-b']) {
    const response = await request('/api/login', { method: 'POST', body: { username, password } }); assert.equal(response.status, 200);
    const value = await response.json(); sessions[username] = { ...value, cookie: response.headers.get('set-cookie').split(';')[0], csrf: value.csrfToken };
  }
  async function workflow(session) { const response = await request('/api/workflows', { method: 'POST', body: {}, session }); assert.equal(response.status, 201); return (await response.json()).workflowId; }
  return { request, workflow, sessions, filename, url, origin, headers };
}

 test('actual case request IDs correlate with client events while admin receives metadata only', async t => {
  const site = await app(t), a = site.sessions['telemetry-a'], b = site.sessions['telemetry-b'];
  const wa = await site.workflow(a), wb = await site.workflow(b);
  const submittedId = randomUUID();
  let response = await site.request('/api/cases', { method: 'POST', session: a, body: payload('PRIVATE_TITLE_SENTINEL'), extra: { 'X-Workflow-Id': wa, 'X-Request-Id': submittedId } });
  assert.equal(response.status, 201);
  const requestId = response.headers.get('x-request-id'); assert.match(requestId, uuid); assert.notEqual(requestId, submittedId);
  assert.equal(response.headers.get('x-workflow-id'), wa); assert.equal(response.headers.get('x-telemetry-status'), 'active');
  const record = (await response.json()).case;
  response = await site.request(`/api/workflows/${wa}/events`, { method: 'POST', session: a, body: { events: [{ event: 'case.save', outcome: 'success', clientActiveMs: 1234, clientWaitMs: 250, requestId }] } });
  assert.equal(response.status, 201);
  response = await site.request(`/api/workflows/${wa}/events`, { session: a });
  const result = await response.json(); assert.equal(result.events.length, 2);
  const server = result.events.find(event => event.source === 'server'), client = result.events.find(event => event.source === 'client');
  assert.equal(server.caseId, record.id); assert.equal(server.requestId, requestId); assert.equal(server.httpStatus, 201);
  assert.equal(server.clientActiveMs, null); assert.equal(server.clientWaitMs, null); assert.ok(Number.isInteger(server.serverElapsedMs));
  assert.equal(client.serverElapsedMs, null); assert.equal(client.clientActiveMs, 1234); assert.equal(client.clientWaitMs, 250);
  response = await site.request(`/api/workflows/${wb}/events`, { method: 'POST', session: b, body: { events: [{ event: 'case.save', outcome: 'success', requestId }] } });
  assert.equal(response.status, 400); assert.equal((await response.json()).code, 'TELEMETRY_REQUEST_MISMATCH');
  response = await site.request(`/api/workflows/${wa}/events`, { session: b }); assert.equal(response.status, 404);
  response = await site.request(`/api/cases/${record.id}/events`, { session: b }); assert.equal(response.status, 404);
  response = await site.request('/api/admin/telemetry', { session: a }); assert.equal(response.status, 403);
  response = await site.request(`/api/admin/telemetry?workflowId=${wa}&userId=${a.userId}`, { session: site.sessions.owner }); assert.equal(response.status, 200);
  const admin = await response.json(); assert.equal(admin.events.length, 2);
  for (const value of ['PRIVATE_TITLE_SENTINEL', 'PRIVATE_SYNTHETIC_DOCUMENT_SENTINEL', password, hash, 'telemetry-a']) assert.equal(JSON.stringify(admin).includes(value), false);
  response = await site.request('/api/cases/' + record.id, { session: site.sessions.owner }); assert.equal(response.status, 404);
});

test('server timing is measured across actual delayed body delivery and cannot be replaced by client timing', async t => {
  const site = await app(t), session = site.sessions['telemetry-a'];
  const workflowId = await site.workflow(session);
  const body = JSON.stringify(payload('Measured operation'));
  const started = performance.now();
  const response = await new Promise((resolve, reject) => {
    const request = http.request(site.url + '/api/cases', { method: 'POST', headers: { Origin: site.origin, ...site.headers(session), 'Content-Type': 'application/json', 'X-Workflow-Id': workflowId, 'Transfer-Encoding': 'chunked' } }, incoming => {
      let text = ''; incoming.on('data', data => text += data); incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: JSON.parse(text) })); incoming.on('error', reject);
    });
    request.on('error', reject); request.flushHeaders(); request.write(body.slice(0, 10));
    setTimeout(() => request.end(body.slice(10)), 90);
  });
  const elapsed = performance.now() - started;
  assert.equal(response.status, 201);
  const result = await (await site.request(`/api/workflows/${workflowId}/events`, { session })).json();
  const event = result.events.find(item => item.requestId === response.headers['x-request-id']);
  assert.ok(event.serverElapsedMs >= 50, `Server body timing was ${event.serverElapsedMs} ms`);
  assert.ok(event.serverElapsedMs <= elapsed + 100);
  assert.equal(event.clientWaitMs, null);
  const forged = await site.request(`/api/workflows/${workflowId}/events`, { method: 'POST', session, body: { events: [{ event: 'case.save', outcome: 'success', serverElapsedMs: 1 }] } });
  assert.equal(forged.status, 400);
  assert.equal((await forged.json()).code, 'TELEMETRY_INVALID');
});

test('foreign workflows cannot be used or bound, and ignored tracking never blocks the actual save', async t => {
  const site = await app(t), a = site.sessions['telemetry-a'], b = site.sessions['telemetry-b'];
  const wa = await site.workflow(a), wb = await site.workflow(b);
  let response = await site.request('/api/cases', { method: 'POST', session: a, body: payload('Own case'), extra: { 'X-Workflow-Id': wb } });
  assert.equal(response.status, 201); assert.equal(response.headers.get('x-telemetry-status'), 'ignored-invalid-workflow');
  assert.equal(response.headers.get('x-workflow-id'), null);
  const saved = (await response.json()).case;
  response = await site.request(`/api/workflows/${wb}/bind`, { method: 'POST', session: a, body: { caseId: saved.id } });
  assert.equal(response.status, 404);
  response = await site.request(`/api/workflows/${wb}/bind`, { method: 'POST', session: b, body: { caseId: saved.id } });
  assert.equal(response.status, 404);
  for (let i = 0; i < 2; i++) {
    response = await site.request(`/api/workflows/${wa}/bind`, { method: 'POST', session: a, body: { caseId: saved.id } }); assert.equal(response.status, 200);
  }
  response = await site.request('/api/cases', { method: 'POST', session: a, body: payload('Different own case') });
  const other = (await response.json()).case;
  response = await site.request(`/api/workflows/${wa}/bind`, { method: 'POST', session: a, body: { caseId: other.id } });
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'WORKFLOW_ALREADY_BOUND');
});

test('real SQLite telemetry write failures do not roll back case creation or updates', async t => {
  const site = await app(t), session = site.sessions['telemetry-a'];
  const workflowId = await site.workflow(session);
  const db = new DatabaseSync(site.filename);
  try { db.exec("CREATE TRIGGER fail_metadata BEFORE INSERT ON telemetry_events BEGIN SELECT RAISE(ABORT,'intentional test-only metadata constraint'); END;"); }
  finally { db.close(); }
  let response = await site.request('/api/cases', { method: 'POST', session, body: payload('Must survive log failure'), extra: { 'X-Workflow-Id': workflowId } });
  assert.equal(response.status, 201); assert.equal(response.headers.get('x-telemetry-status'), 'unavailable');
  const saved = (await response.json()).case;
  response = await site.request('/api/cases/' + saved.id, { method: 'PUT', session, body: { ...payload('Update survives log failure'), expectedVersion: 1 }, extra: { 'X-Workflow-Id': workflowId } });
  assert.equal(response.status, 200); assert.equal((await response.json()).case.version, 2);
  response = await site.request('/api/cases/' + saved.id, { session });
  assert.equal(response.status, 200); assert.equal((await response.json()).case.title, 'Update survives log failure');
  response = await site.request(`/api/workflows/${workflowId}/events`, { method: 'POST', session, body: { events: [{ event: 'case.save', outcome: 'success' }] } });
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'TELEMETRY_UNAVAILABLE');
});

test('telemetry HTTP auth, CSRF, Origin, metadata whitelist, batch bytes and pagination fail closed', async t => {
  const site = await app(t), session = site.sessions['telemetry-a'];
  let response = await site.request('/api/workflows', { method: 'POST', body: {} }); assert.equal(response.status, 401);
  response = await site.request('/api/workflows', { method: 'POST', body: {}, session, extra: { 'X-CSRF-Token': '' } }); assert.equal(response.status, 403);
  response = await site.request('/api/workflows', { method: 'POST', body: {}, session, extra: { Origin: 'https://untrusted.invalid' } }); assert.equal(response.status, 403);
  const workflowId = await site.workflow(session), path = `/api/workflows/${workflowId}/events`;
  for (const body of [
    { events: [{ event: 'input.file', outcome: 'success', filename: 'do-not-store.txt' }] },
    { events: [{ event: 'draft.edit', outcome: 'success', text: 'DO_NOT_STORE_DOCUMENT' }] },
    { events: [{ event: 'case.save', outcome: 'success', userId: 'owner' }] },
    { events: Array(11).fill({ event: 'input.paste', outcome: 'success' }) },
  ]) { response = await site.request(path, { method: 'POST', session, body }); assert.equal(response.status, 400); assert.equal((await response.json()).code, 'TELEMETRY_INVALID'); }
  response = await site.request(path, { method: 'POST', session, body: 'x'.repeat(4097) }); assert.equal(response.status, 413);
  for (const query of ['?limit=101', '?limit=1&limit=2', '?beforeId=0', '?search=private', '?userId=owner']) { response = await site.request(path + query, { session }); assert.equal(response.status, 400); }
  response = await site.request('/missing-path'); assert.equal(response.status, 404); assert.match(response.headers.get('x-request-id'), uuid);
  response = await site.request(path, { session }); assert.equal((await response.json()).events.length, 0);
});

test('actual telemetry endpoints enforce per-user creation and client-event rate caps', async t => {
  const site = await app(t), a = site.sessions['telemetry-a'], b = site.sessions['telemetry-b'];
  let workflowId;
  for (let i = 0; i < 20; i++) workflowId = await site.workflow(a);
  let response = await site.request('/api/workflows', { method: 'POST', body: {}, session: a });
  assert.equal(response.status, 429); assert.equal((await response.json()).code, 'TELEMETRY_RATE_LIMITED');
  await site.workflow(b);
  for (let i = 0; i < 6; i++) { response = await site.request(`/api/workflows/${workflowId}/events`, { method: 'POST', session: a, body: { events: Array(10).fill({ event: 'review.confirm', outcome: 'success', clientActiveMs: 0 }) } }); assert.equal(response.status, 201); }
  response = await site.request(`/api/workflows/${workflowId}/events`, { method: 'POST', session: a, body: { events: [{ event: 'review.confirm', outcome: 'success' }] } });
  assert.equal(response.status, 429); assert.equal((await response.json()).code, 'TELEMETRY_RATE_LIMITED');
  response = await site.request(`/api/workflows/${workflowId}/events?limit=10`, { session: a }); const first = await response.json();
  assert.equal(first.events.length, 10); assert.ok(first.nextBeforeId);
  response = await site.request(`/api/workflows/${workflowId}/events?limit=10&beforeId=${first.nextBeforeId}`, { session: a });
  assert.ok((await response.json()).events.every(event => event.id < first.nextBeforeId));
});

test('actual PDF and workbook requests record only fixed backend outcomes and measured time', async t => {
  const site = await app(t), session = site.sessions['telemetry-a'];
  const workflowId = await site.workflow(session);
  for (const [path, filename, type, eventName] of [
    ['/api/document', 'text.pdf', 'application/pdf', 'request.pdf_parse'],
    ['/api/workbook', 'case.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'request.workbook_parse'],
  ]) {
    const response = await fetch(site.url + path, { method: 'POST', headers: { Origin: site.origin, ...site.headers(session), 'X-Workflow-Id': workflowId, 'Content-Type': type, 'X-Document-Consent': 'synthetic-or-deidentified' }, body: await readFile(new URL('fixtures/' + filename, import.meta.url)) });
    assert.equal(response.status, 200);
    const requestId = response.headers.get('x-request-id');
    const page = await (await site.request(`/api/workflows/${workflowId}/events`, { session })).json();
    const event = page.events.find(row => row.requestId === requestId);
    assert.equal(event.event, eventName); assert.equal(event.httpStatus, 200); assert.ok(event.serverElapsedMs >= 0);
    assert.equal(JSON.stringify(page).includes(filename), false); assert.equal(JSON.stringify(page).includes('Example Property'), false);
  }
  const failed = await site.request('/api/extract', { method: 'POST', session, body: { text: 'not sent to a provider', consent: true }, extra: { 'X-Workflow-Id': workflowId } });
  assert.equal(failed.status, 503);
  const page = await (await site.request(`/api/workflows/${workflowId}/events`, { session })).json();
  const event = page.events.find(row => row.requestId === failed.headers.get('x-request-id'));
  assert.equal(event.event, 'request.extract'); assert.equal(event.outcome, 'failure'); assert.equal(event.errorCode, 'LIVE_DISABLED');
});

test('an actually aborted request records one cancelled backend event without creating a case', async t => {
  const site = await app(t), session = site.sessions['telemetry-a'];
  const workflowId = await site.workflow(session);
  await new Promise(resolve => {
    const request = http.request(site.url + '/api/cases', { method: 'POST', headers: { Origin: site.origin, ...site.headers(session), 'Content-Type': 'application/json', 'X-Workflow-Id': workflowId, 'Transfer-Encoding': 'chunked' } });
    request.on('error', () => {}); request.once('close', resolve);
    request.flushHeaders(); request.write('{"title":"incomplete real request');
    setTimeout(() => request.destroy(), 80);
  });
  let events = [];
  const deadline = Date.now() + 2000;
  do {
    events = (await (await site.request(`/api/workflows/${workflowId}/events`, { session })).json()).events;
    if (events.length) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'request.case_create'); assert.equal(events[0].httpStatus, 499);
  assert.equal(events[0].errorCode, 'REQUEST_CANCELLED'); assert.equal(events[0].outcome, 'failure');
  const cases = await (await site.request('/api/cases', { session })).json(); assert.equal(cases.cases.length, 0);
  const recheck = await (await site.request(`/api/workflows/${workflowId}/events`, { session })).json(); assert.equal(recheck.events.length, 1);
});

test('workflow creation requires an explicit JSON object and succeeds when the client sends the documented contract', async t => {
  const site = await app(t), session = site.sessions['telemetry-a'];
  // This is the exact request shape currently used by PR4 7b74b227's ensureWorkflow:
  // authenticated POST with CSRF, but no JSON media type or body.
  let response = await site.request('/api/workflows', { method: 'POST', session });
  assert.equal(response.status, 415);
  assert.equal((await response.json()).code, 'UNSUPPORTED_MEDIA_TYPE');
  response = await site.request('/api/workflows', { method: 'POST', session, body: '', extra: { 'Content-Type': 'application/json' } });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_JSON');
  response = await site.request('/api/workflows', { method: 'POST', session, body: {} });
  assert.equal(response.status, 201);
  assert.match((await response.json()).workflowId, uuid);
});
