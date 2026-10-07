// Controlled DOM/transport observations; not real-browser/provider acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CLIENT_EVENTS, validateClientBatch } from '../../telemetry.js';
import { createJourneyTelemetry, classifyJourneyRequest, JOURNEY_ACTIONS, JOURNEY_LIMITS } from './journey-telemetry.js';
const workflow = '11111111-1111-4111-8111-111111111111';
const otherWorkflow = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const workspaceKey = '44444444-4444-4444-8444-444444444444';
const caseId = '55555555-5555-4555-8555-555555555555';
const response = (body, status = 201, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function fixture(t, handler) {
  const dom = new JSDOM('', { url: 'https://nestlet.invalid/next/', pretendToBeVisual: true });
  let time = 0, online = true, session = { authenticated: true, userId: 'synthetic-user', csrfToken: 'public-test-token' }, timerId = 0;
  const timers = new Map(), calls = [];
  const telemetry = createJourneyTelemetry({
    getSession: () => session, now: () => time, documentTarget: dom.window.document, windowTarget: dom.window, isOnline: () => online,
    setTimer: (callback, delay) => { timers.set(++timerId, { callback, at: time + delay }); return timerId; }, clearTimer: id => timers.delete(id),
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      return handler ? handler(path, options, calls) : response(path === '/api/workflows' ? { workflowId: workflow } : { accepted: 1 });
    }
  });
  telemetry.connect();
  t.after(() => { telemetry.dispose(); dom.window.close(); });
  return {
    telemetry, calls, timers, dom,
    set session(value) { session = value; }, set online(value) { online = value; },
    advance(ms) { time += ms; },
    visible(value) { Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, value: value ? 'visible' : 'hidden' }); dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')); },
    events() { return calls.filter(call => call.path.endsWith('/events')).flatMap(call => JSON.parse(call.options.body).events); }
  };
}

test('client allowlist is exactly the existing server contract; routes discard queries and exclude unsupported actions', () => {
  assert.deepEqual(JOURNEY_ACTIONS, CLIENT_EVENTS);
  assert.equal(classifyJourneyRequest('/api/document', 'POST'), 'input.file');
  assert.equal(classifyJourneyRequest('/api/workbook?filename=PRIVATE', 'POST'), 'input.file');
  assert.equal(classifyJourneyRequest('/api/cases', 'POST'), 'case.save');
  assert.equal(classifyJourneyRequest(`/api/cases/${caseId}`, 'GET'), 'case.open');
  assert.equal(classifyJourneyRequest(`/api/cases/${caseId}?customer=PRIVATE`, 'PUT'), 'case.save');
  assert.equal(classifyJourneyRequest(`/api/cases/${caseId}`, 'DELETE'), 'case.delete');
  for (const path of ['/api/clients?search=PRIVATE', '/api/assets?name=PRIVATE', '/api/settings', '/api/login', '/api/chat', '/api/extract', '/api/workflows', '/api/cases', '/api/cases/private-name', '/api/../outside', 'https://evil.invalid/api/document']) assert.equal(classifyJourneyRequest(path), null);
});

test('visits/step activation emit nothing; actual action measures visible dwell separately from wait', async t => {
  const f = fixture(t), j = f.telemetry;
  j.setScope({ workspaceKey }); j.visit('intake'); j.activateStep('input.paste');
  f.advance(100); f.visible(false); f.advance(5000); f.visible(true); f.advance(250);
  assert.equal(f.calls.length, 0);
  const action = j.beginAction('input.paste'); f.advance(70); action.finish(); action.finish();
  await j.flush();
  assert.deepEqual(f.events(), [{ event: 'input.paste', outcome: 'success', clientActiveMs: 350, clientWaitMs: 70 }]);
  assert.equal(f.dom.window.localStorage.length, 0); assert.equal(f.dom.window.sessionStorage.length, 0);
});

test('inactive actions get zero dwell and a wait never inflates later active dwell', async t => {
  const f = fixture(t), j = f.telemetry;
  j.activateStep('case.save'); f.advance(30);
  const first = j.beginAction('case.save'); f.advance(500); first.finish();
  f.advance(20); const second = j.beginAction('case.save'); second.finish();
  const read = j.beginAction('case.open'); f.advance(10); read.finish();
  await j.flush();
  assert.deepEqual(f.events().map(event => [event.clientActiveMs, event.clientWaitMs]), [[30, 500], [20, 0], [0, 10]]);
});

test('unknown actions and untrusted error text never become event metadata', async t => {
  const f = fixture(t), j = f.telemetry;
  j.beginAction('page.chat.visit').finish(); j.beginAction('PRIVATE_CUSTOMER').finish();
  j.beginAction('case.save').finish({ ok: false, errorCode: 'PRIVATE_DOCUMENT_CONTENT', filename: 'PRIVATE_FILE', message: 'PRIVATE_PASSWORD' });
  await j.flush();
  const events = f.events(); assert.equal(events.length, 1);
  assert.equal(events[0].errorCode, 'UNKNOWN_CLIENT_ERROR');
  assert.equal(JSON.stringify(events).includes('PRIVATE_'), false);
  assert.deepEqual(Object.keys(events[0]).sort(), ['clientActiveMs', 'clientWaitMs', 'errorCode', 'event', 'outcome']);
  validateClientBatch({ events });
});

test('correlation requires exact current sent/returned workflow, active status and valid UUID', async t => {
  const f = fixture(t), j = f.telemetry;
  j.beginAction('input.paste').finish(); await j.flush();
  for (const [returned, status, id] of [[workflow, 'active', requestId], [otherWorkflow, 'active', requestId], [workflow, 'unavailable', requestId], [workflow, 'active', 'PRIVATE_TEXT']]) {
    const action = j.beginAction('case.open'); assert.equal(action.headers['X-Workflow-Id'], workflow);
    action.finish({ headers: new Headers({ 'X-Workflow-Id': returned, 'X-Telemetry-Status': status, 'X-Request-Id': id }) });
  }
  await j.flush();
  assert.deepEqual(f.events().slice(1).map(event => event.requestId), [requestId, undefined, undefined, undefined]);
});

test('abort records one fixed cancellation and removes listener; navigation drops stale observations', async t => {
  const f = fixture(t), j = f.telemetry;
  j.visit('intake'); const controller = new AbortController();
  const aborted = j.beginAction('input.file', { signal: controller.signal }); f.advance(55); controller.abort('PRIVATE_REASON'); aborted.finish();
  const stale = j.beginAction('case.open'); j.visit('documents'); stale.finish();
  await j.flush();
  assert.equal(f.events().length, 1);
  assert.equal(f.events()[0].errorCode, 'CLIENT_CANCELLED'); assert.equal(f.events()[0].clientWaitMs, 55);
  assert.equal(JSON.stringify(f.events()).includes('PRIVATE_REASON'), false);
});

test('logout drops queued actions and old completion, and late old creation cannot overwrite a new identity', async t => {
  let release;
  const f = fixture(t, (path, options, calls) => path === '/api/workflows' && calls.length === 1 ? new Promise(resolve => { release = resolve; }) : response(path === '/api/workflows' ? { workflowId: otherWorkflow } : { accepted: 1 }));
  const j = f.telemetry, old = j.beginAction('case.save'); old.finish(); j.reset();
  f.session = { authenticated: true, userId: 'new-user', csrfToken: 'new-public-test-token' }; j.syncIdentity();
  const current = j.beginAction('case.save'); current.finish();
  release(response({ workflowId: workflow })); await j.flush();
  assert.equal(f.events().length, 1);
  assert.equal(f.calls.filter(call => call.path.endsWith('/events'))[0].path, `/api/workflows/${otherWorkflow}/events`);
  assert.equal(f.calls.filter(call => call.path.endsWith('/events'))[0].options.headers['X-CSRF-Token'], 'new-public-test-token');
});

test('same-session reset stays disabled even if explicit logout request fails', async t => {
  const f = fixture(t), j = f.telemetry;
  j.beginAction('case.save').finish(); await settle(); j.reset();
  const count = f.calls.length; j.beginAction('case.save').finish(); await j.flush();
  assert.equal(f.calls.length, count); assert.equal(f.events().length, 0);
});

test('telemetry auth loss is swallowed, disables repeated attempts and never retries business requests', async t => {
  const f = fixture(t, path => response(path === '/api/workflows' ? { workflowId: workflow } : { code: 'AUTH_REQUIRED', error: 'PRIVATE_RESPONSE' }, path === '/api/workflows' ? 201 : 401));
  const j = f.telemetry; j.beginAction('case.save').finish(); await j.flush();
  const count = f.calls.length;
  for (let i = 0; i < 5; i++) { j.beginAction('case.save').finish(); await j.flush(); }
  assert.equal(f.calls.length, count); assert.equal(count, 2);
  assert.equal(f.dom.window.localStorage.length, 0); assert.equal(f.dom.window.sessionStorage.length, 0);
});

test('business auth loss drops observation before telemetry writes, regardless of stale visible UI', async t => {
  const f = fixture(t), j = f.telemetry;
  const action = j.beginAction('case.open'); action.finish({ ok: false, httpStatus: 401 });
  await j.flush(); j.beginAction('case.open').finish(); await j.flush();
  assert.equal(f.events().length, 0);
});

test('queue, batch and rolling rate are bounded; offline actions are dropped without persistence', async t => {
  const f = fixture(t), j = f.telemetry;
  for (let i = 0; i < 100; i++) j.beginAction('input.paste').finish();
  await j.flush(); assert.equal(f.events().length, JOURNEY_LIMITS.queue);
  for (let i = 0; i < 40; i++) { j.beginAction('input.paste').finish(); if (i % 10 === 9) await j.flush(); }
  await j.flush(); assert.equal(f.events().length, JOURNEY_LIMITS.perMinute);
  assert.ok(f.calls.filter(call => call.path.endsWith('/events')).every(call => JSON.parse(call.options.body).events.length <= JOURNEY_LIMITS.batch));
  f.advance(61000); f.online = false;
  for (let i = 0; i < 30; i++) j.beginAction('input.paste').finish();
  await j.flush(); f.online = true; await j.flush(); assert.equal(f.events().length, JOURNEY_LIMITS.perMinute);
});

test('stale offline queue is discarded and scope changes never transfer events to another case', async t => {
  const f = fixture(t), j = f.telemetry;
  j.setScope({ workspaceKey, caseId }); j.beginAction('case.save').finish(); await settle();
  f.advance(JOURNEY_LIMITS.queueAgeMs + 1); await j.flush(); assert.equal(f.events().length, 0);
  j.beginAction('case.save').finish(); j.setScope({ workspaceKey: otherWorkflow, caseId: null }); await j.flush();
  assert.equal(f.events().length, 0);
});

test('first-save case binding reuses workflow and visibility/pagehide use same-origin keepalive with CSRF', async t => {
  const f = fixture(t), j = f.telemetry;
  j.setScope({ workspaceKey }); j.beginAction('case.save').finish(); await j.flush();
  j.setScope({ workspaceKey, caseId }); j.beginAction('input.paste').finish(); await j.flush();
  assert.equal(f.calls.filter(call => call.path === '/api/workflows').length, 1);
  assert.deepEqual(JSON.parse(f.calls.find(call => call.path.endsWith('/bind')).options.body), { caseId });
  j.beginAction('input.paste').finish(); f.dom.window.dispatchEvent(new f.dom.window.Event('pagehide')); await settle();
  const last = f.calls.at(-1);
  assert.equal(last.options.keepalive, true); assert.equal(last.options.credentials, 'same-origin');
  assert.equal(last.options.headers['X-CSRF-Token'], 'public-test-token');
  assert.equal(last.options.body.includes('public-test-token'), false);
});

test('failed telemetry network does not reject flush and duration clamps preserve server limits', async t => {
  const f = fixture(t, () => { throw new TypeError('PRIVATE_NETWORK_STACK'); });
  const j = f.telemetry; j.beginAction('case.save').finish(); await j.flush();
  assert.equal(f.calls.length, 1);
  j.beginAction('case.save').finish(); await j.flush(); assert.equal(f.calls.length, 1);
  const other = fixture(t); other.telemetry.activateStep('draft.edit'); other.advance(90000000);
  const action = other.telemetry.beginAction('draft.edit'); other.advance(400000); action.finish(); await other.telemetry.flush();
  assert.equal(other.events()[0].clientActiveMs, 86400000); assert.equal(other.events()[0].clientWaitMs, 300000);
});

test('StrictMode-style connect/dispose/connect drops stale work and installs lifecycle listeners once', async t => {
  const f = fixture(t), j = f.telemetry;
  const stale = j.beginAction('case.save'); j.dispose();
  j.connect(); j.connect(); j.activateStep('input.paste'); f.advance(50); f.visible(false); f.advance(1000); f.visible(true); f.advance(20);
  stale.finish(); j.beginAction('input.paste').finish(); await j.flush();
  assert.equal(f.events().length, 1); assert.equal(f.events()[0].clientActiveMs, 70);
  j.dispose(); const count = f.calls.length;
  f.visible(false); f.dom.window.dispatchEvent(new f.dom.window.Event('pagehide')); j.beginAction('case.save').finish(); await j.flush();
  assert.equal(f.calls.length, count);
});

test('a wait in an old step cannot suppress a newly active step dwell', async t => {
  const f = fixture(t), j = f.telemetry;
  j.activateStep('case.save'); const save = j.beginAction('case.save');
  j.activateStep('review.confirm'); f.advance(150);
  const confirm = j.beginAction('review.confirm'); confirm.finish(); save.finish(); await j.flush();
  assert.equal(f.events().find(event => event.event === 'review.confirm').clientActiveMs, 150);
});

test('workflow JSON consumption remains timeout-abortable and pending action references are bounded', async t => {
  let aborted = 0;
  const f = fixture(t, (path, options) => ({ ok: true, json: () => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted++; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  }) }));
  const j = f.telemetry;
  const pending = [];
  for (let i = 0; i < 25; i++) pending.push(j.beginAction('case.save'));
  await settle();
  assert.equal(f.calls.length, 1);
  const timeout = [...f.timers.values()].find(timer => timer.at === JOURNEY_LIMITS.timeoutMs);
  assert.ok(timeout); timeout.callback(); await settle();
  assert.equal(aborted, 1);
  for (const action of pending) action.finish(); await j.flush();
  assert.equal(f.events().length, 0); assert.equal(f.calls.length, 1);
});

test('no more than twenty unfinished action observers are admitted at once', async t => {
  const f = fixture(t), j = f.telemetry;
  const pending = Array.from({ length: 25 }, () => j.beginAction('case.save'));
  for (const action of pending) action.finish(); await j.flush();
  assert.equal(f.events().length, 20);
  j.beginAction('case.save').finish(); await j.flush(); assert.equal(f.events().length, 21);
});
