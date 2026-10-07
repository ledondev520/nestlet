// Real local HTTP + Node SQLite. Synthetic records only; no live provider/browser claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { openStorage } from '../../storage.js';
import { createJourneyTelemetry } from './journey-telemetry.js';

async function start(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nestlet-react-journey-'));
  const filename = join(directory, 'case.sqlite'), password = 'synthetic-journey-test-password', salt = randomBytes(16);
  const hash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
  const storage = openStorage({ filename });
  try { storage.createTrialUser({ username: 'journey-user', passwordHash: hash }); } finally { storage.close(); }
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`, origin = 'https://journey-acceptance.invalid';
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('../../', import.meta.url), env: { ...process.env,
    HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin, NESTLET_DB_PATH: filename,
    NESTLET_OPERATOR_PASSWORD_HASH: hash, DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', value => output += value); child.stderr.on('data', value => output += value);
  t.after(async () => { if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); }); await rm(directory, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output || 'Server timeout')), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Startup exited ${code}`)); });
    child.stdout.on('data', value => { if (value.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); } });
  });
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'journey-user', password }) });
  assert.equal(login.status, 200);
  const session = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0], calls = [];
  const fetchAuthenticated = (path, options = {}) => fetch(base + path, { ...options, headers: { Origin: origin, Cookie: cookie, ...options.headers } });
  const telemetry = createJourneyTelemetry({ getSession: () => session, documentTarget: null, windowTarget: null,
    fetchImpl: (path, options) => { calls.push({ path, options }); return fetchAuthenticated(path, options); } });
  telemetry.connect();
  t.after(() => telemetry.dispose());
  return { telemetry, calls, session, fetchAuthenticated, password };
}

test('React observer writes exact v1 action durations through real authenticated HTTP and correlates a real save', async t => {
  const site = await start(t), j = site.telemetry, workspaceKey = randomUUID();
  j.setScope({ workspaceKey }); j.visit('intake'); j.activateStep('input.paste');
  j.beginAction('input.paste').finish(); await j.flush();
  const action = j.beginAction('case.save');
  assert.match(action.headers['X-Workflow-Id'], /^[0-9a-f-]{36}$/u);
  const response = await site.fetchAuthenticated('/api/cases', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-CSRF-Token': site.session.csrfToken, ...action.headers
  }, body: JSON.stringify({ title: 'PRIVATE_SYNTHETIC_TITLE', sourceText: 'PRIVATE_SYNTHETIC_SOURCE', fields: [], draftType: 'followup', draftText: '' }) });
  const record = (await response.json()).case; assert.equal(response.status, 201);
  action.finish({ ok: response.ok, httpStatus: response.status, headers: response.headers });
  j.setScope({ workspaceKey, caseId: record.id }); await j.flush();
  const workflowId = action.headers['X-Workflow-Id'];
  const read = await site.fetchAuthenticated(`/api/workflows/${workflowId}/events`); assert.equal(read.status, 200);
  const events = (await read.json()).events;
  const saved = events.find(event => event.source === 'client' && event.event === 'case.save');
  assert.equal(saved.requestId, response.headers.get('X-Request-Id'));
  assert.equal(saved.caseId, record.id); assert.equal(saved.userId, site.session.userId);
  assert.equal(saved.outcome, 'success'); assert.ok(Number.isInteger(saved.clientWaitMs)); assert.ok(saved.clientWaitMs >= 0);
  assert.equal(saved.serverElapsedMs, null); assert.equal(saved.httpStatus, null);
  assert.equal(events.filter(event => event.source === 'server' && event.requestId === saved.requestId).length, 1);
  for (const secret of ['PRIVATE_SYNTHETIC_TITLE', 'PRIVATE_SYNTHETIC_SOURCE', 'PRIVATE_SYNTHETIC_DRAFT', site.password, site.session.csrfToken, 'journey-user']) {
    assert.equal(JSON.stringify(events).includes(secret), false);
    assert.equal(site.calls.some(call => call.options.body.includes(secret)), false);
  }
  assert.ok(site.calls.every(call => call.options.credentials === 'same-origin'));
});

test('real logout invalidation makes telemetry stop after one 401 without retry or private-body replay', async t => {
  const site = await start(t), j = site.telemetry;
  j.beginAction('input.paste').finish(); await j.flush();
  const logout = await site.fetchAuthenticated('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': site.session.csrfToken }, body: '{}' });
  assert.equal(logout.status, 200);
  // The observer intentionally sees stale UI identity while the real cookie is already invalid.
  j.beginAction('draft.edit').finish(); await j.flush();
  const count = site.calls.length;
  for (let i = 0; i < 4; i++) { j.beginAction('draft.edit').finish(); await j.flush(); }
  assert.equal(site.calls.length, count); assert.equal(site.calls.filter(call => call.path.endsWith('/events')).length, 2);
  assert.ok(site.calls.every(call => /^\/api\/workflows(?:\/[0-9a-f-]{36}\/(?:events|bind))?$/u.test(call.path)));
  assert.ok(site.calls.every(call => !call.options.body.includes('password') && !call.options.body.includes('draftText')));
});


test('a successful deletion is still observed when post-action case binding returns actual 404', async t => {
  const site = await start(t), j = site.telemetry;
  const created = await site.fetchAuthenticated('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': site.session.csrfToken }, body: JSON.stringify({ title: 'Synthetic deletion', sourceText: '', fields: [], draftType: 'followup', draftText: '' }) });
  assert.equal(created.status, 201); const record = (await created.json()).case;
  j.beginAction('input.paste').finish(); await j.flush();
  j.setScope({ caseId: record.id });
  const action = j.beginAction('case.delete');
  const deleted = await site.fetchAuthenticated(`/api/cases/${record.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': site.session.csrfToken, ...action.headers }, body: JSON.stringify({ expectedVersion: record.version }) });
  assert.equal(deleted.status, 200); await deleted.json();
  action.finish({ ok: true, httpStatus: deleted.status, headers: deleted.headers }); await j.flush();
  const result = await site.fetchAuthenticated(`/api/workflows/${action.headers['X-Workflow-Id']}/events`); assert.equal(result.status, 200);
  const event = (await result.json()).events.find(value => value.source === 'client' && value.event === 'case.delete');
  assert.ok(event); assert.equal(event.outcome, 'success'); assert.equal(event.requestId, deleted.headers.get('X-Request-Id'));
});
