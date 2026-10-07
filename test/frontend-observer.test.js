// Development diagnostic tier: controlled transport and React/JSDOM integration.
// Synthetic values only; these checks are not real-browser or live-provider acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { transformWithOxc } from 'vite';
import React, { act } from 'react';
import { createApiClient, ApiError } from '../frontend/lib/api.js';
import { draftVault } from '../frontend/lib/draft-vault.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const workflowId = '22222222-2222-4222-8222-222222222222';
const nextWorkflowId = '33333333-3333-4333-8333-333333333333';
const responseHeaders = new Headers({ 'X-Workflow-Id': workflowId, 'X-Request-Id': '44444444-4444-4444-8444-444444444444', 'X-Telemetry-Status': 'active' });
const response = (body, status = 200, headers = responseHeaders) => ({ ok: status >= 200 && status < 300, status, headers, json: async () => body });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };

function clientFixture({ fetchImpl = async () => response({ saved: true }), actionHeaders = {}, onUnauthorized = () => {}, getCsrfToken = () => 'synthetic-current-csrf' } = {}) {
  const starts = [], finishes = [], requests = [];
  const api = createApiClient({
    fetchImpl: async (...args) => { requests.push(args); return fetchImpl(...args); }, getCsrfToken, onUnauthorized,
    getJourney: () => ({ beginAction: (...args) => { starts.push(args); return { headers: actionHeaders, finish: detail => finishes.push(detail) }; } })
  });
  return { api, starts, finishes, requests };
}

test('observer automatically classifies parser uploads and case writes without receiving business content', async () => {
  const f = clientFixture();
  const signal = new AbortController().signal;
  const file = new Blob(['Synthetic document bytes'], { type: 'application/pdf' });
  await f.api.upload('/api/document?filename=SYNTHETIC_PRIVATE_FILENAME', file, { contentType: 'application/pdf', documentConsent: true, signal });
  await f.api.upload('/api/workbook', file, { contentType: 'application/vnd.ms-excel', documentConsent: true, signal });
  await f.api.post('/api/cases', { input: 'SYNTHETIC_PRIVATE_CASE_CONTENT' }, { signal });
  await f.api.put(`/api/cases/${caseId}?search=SYNTHETIC_PRIVATE_QUERY`, { expectedVersion: 1 }, { signal });
  await f.api.delete(`/api/cases/${caseId}`, { expectedVersion: 2 }, { signal });
  assert.deepEqual(f.starts, ['input.file', 'input.file', 'case.save', 'case.save', 'case.delete'].map(event => [event, { signal }]));
  assert.equal(f.finishes.length, 5);
  for (const detail of f.finishes) assert.deepEqual(detail, { ok: true, httpStatus: 200, headers: responseHeaders });
  assert.doesNotMatch(JSON.stringify(f.starts) + JSON.stringify(f.finishes), /SYNTHETIC_PRIVATE_/);
  assert.equal(f.requests[0][1].body, file);
  assert.equal(f.requests[0][1].headers['X-Document-Consent'], 'synthetic-or-deidentified');
});

test('background GETs are silent, explicit case reads opt in, and feature-owned actions can opt out', async () => {
  const f = clientFixture();
  await f.api.get(`/api/cases/${caseId}`);
  await f.api.get(`/api/cases/${caseId}`, { telemetry: false });
  await f.api.get('/api/clients?search=SYNTHETIC_PRIVATE_QUERY', { telemetry: true });
  await f.api.post('/api/cases', {}, { telemetry: false });
  await f.api.put(`/api/cases/${caseId}`, {}, { telemetry: false });
  await f.api.delete(`/api/cases/${caseId}`, {}, { telemetry: false });
  await f.api.upload('/api/document', new Blob(['synthetic']), { contentType: 'application/pdf', telemetry: false });
  for (const path of ['/api/login', '/api/register', '/api/logout', '/api/chat', '/api/extract', '/api/settings', '/api/workflows', '/api/assets', `/api/cases/${caseId}/document-context`]) await f.api.post(path, {}, { telemetry: true });
  assert.equal(f.starts.length, 0);
  assert.equal(f.finishes.length, 0);
  await f.api.get(`/api/cases/${caseId}`, { telemetry: true });
  assert.deepEqual(f.starts, [['case.open', { signal: undefined }]]);
  assert.equal(f.finishes.length, 1);
});

test('only a bounded workflow header is accepted; observer headers cannot replace CSRF or business headers', async () => {
  const f = clientFixture({ actionHeaders: {
    'X-Workflow-Id': workflowId, 'X-CSRF-Token': 'synthetic-observer-override', Authorization: 'synthetic-observer-override',
    'Content-Type': 'text/plain', Accept: 'text/html', 'X-Arbitrary-Metadata': 'SYNTHETIC_PRIVATE_CONTENT'
  } });
  await f.api.post('/api/cases', {});
  assert.deepEqual(f.requests[0][1].headers, {
    Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': 'synthetic-current-csrf', 'X-Workflow-Id': workflowId
  });
  assert.equal(f.requests[0][1].credentials, 'same-origin');
  for (const invalid of [undefined, null, 42, {}, 'synthetic-private-text', `${workflowId}\r\nX-Injected: true`, workflowId.repeat(2)]) {
    const rejected = clientFixture({ actionHeaders: { 'X-Workflow-Id': invalid } });
    await rejected.api.post('/api/cases', {});
    assert.equal(rejected.requests[0][1].headers['X-Workflow-Id'], undefined);
    assert.equal(rejected.finishes.length, 1);
  }
});

test('an observation finishes only after JSON consumption and keeps response correlation metadata', async () => {
  const parsed = deferred();
  const body = { saved: true, input: 'SYNTHETIC_PRIVATE_CONTENT' };
  const f = clientFixture({ fetchImpl: async () => ({ ...response(null, 201), json: () => parsed.promise }) });
  const request = f.api.post('/api/cases', { input: 'SYNTHETIC_PRIVATE_CONTENT' });
  await settle();
  assert.equal(f.starts.length, 1);
  assert.equal(f.finishes.length, 0, 'Response headers alone must not complete the action');
  parsed.resolve(body);
  assert.equal(await request, body);
  assert.deepEqual(f.finishes, [{ ok: true, httpStatus: 201, headers: responseHeaders }]);
});

test('an abort during JSON consumption is a cancellation, never a successful observation', async () => {
  const parsed = deferred(), controller = new AbortController();
  const f = clientFixture({ fetchImpl: async () => ({ ...response(null, 201), json: () => parsed.promise }) });
  const request = f.api.post('/api/cases', {}, { signal: controller.signal });
  await settle();
  controller.abort('SYNTHETIC_PRIVATE_REASON');
  parsed.resolve({ saved: true });
  await assert.rejects(request, { name: 'AbortError' });
  assert.deepEqual(f.finishes, [{ ok: false, cancelled: true, httpStatus: 201, headers: responseHeaders }]);
});

test('invalid JSON and aborted JSON retain status and headers without leaking parse errors', async () => {
  for (const aborted of [false, true]) {
    const controller = new AbortController();
    const f = clientFixture({ fetchImpl: async () => ({ ...response(null, 502), json: async () => {
      if (aborted) controller.abort();
      throw new SyntaxError('SYNTHETIC_PRIVATE_RESPONSE');
    } }) });
    await assert.rejects(f.api.post('/api/cases', {}, { signal: controller.signal }), aborted ? { name: 'AbortError' } : { code: 'INVALID_RESPONSE', status: 502 });
    assert.deepEqual(f.finishes, [{ ok: false, cancelled: aborted, httpStatus: 502, headers: responseHeaders }]);
  }
});

test('business errors retain stable code/status/details while observations receive no body or server prose', async () => {
  const details = { expectedVersion: 2 };
  const f = clientFixture({ fetchImpl: async () => response({ code: 'CASE_CONFLICT', error: 'SYNTHETIC_PRIVATE_SERVER_PROSE', details }, 409) });
  await assert.rejects(f.api.put(`/api/cases/${caseId}`, {}), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, 'CASE_CONFLICT');
    assert.equal(error.code, 'CASE_CONFLICT');
    assert.equal(error.status, 409);
    assert.equal(error.details, details);
    return true;
  });
  assert.deepEqual(f.finishes, [{ ok: false, httpStatus: 409, headers: responseHeaders }]);
});

test('network failures and transport aborts finish once without changing public error behavior', async () => {
  for (const aborted of [false, true]) {
    const failure = aborted ? new DOMException('Synthetic cancellation', 'AbortError') : new TypeError('SYNTHETIC_PRIVATE_NETWORK_DETAIL');
    const f = clientFixture({ fetchImpl: async () => { throw failure; } });
    await assert.rejects(f.api.post('/api/cases', {}), error => {
      if (aborted) assert.equal(error, failure);
      else { assert.ok(error instanceof ApiError); assert.equal(error.code, 'NETWORK_ERROR'); assert.equal(error.status, 0); }
      return true;
    });
    assert.deepEqual(f.finishes, [{ ok: false, cancelled: aborted }]);
  }
});

test('observer getter/start/header/finish failures cannot change successful or failed business results', async () => {
  const fail = () => { throw new Error('Synthetic observer failure'); };
  const brokenObservers = [
    fail,
    () => ({ beginAction: fail }),
    () => ({ beginAction: () => ({ get headers() { return fail(); }, finish: fail }) }),
    () => ({ beginAction: () => ({ headers: {}, finish: fail }) })
  ];
  for (const getJourney of brokenObservers) {
    let calls = 0;
    const body = { saved: true };
    const api = createApiClient({ getJourney, fetchImpl: async () => { calls++; return response(body, calls === 1 ? 201 : 409); } });
    assert.equal(await api.post('/api/cases', {}), body);
    await assert.rejects(api.post('/api/cases', {}), { code: 'REQUEST_FAILED', status: 409 });
    assert.equal(calls, 2, 'An observer failure must not retry business requests');
  }
});

test('an observed old-account 401 cannot expire the new account; current-account 401 still expires once', async () => {
  const parsed = deferred();
  let token = 'synthetic-old-token', expired = 0;
  const f = clientFixture({ getCsrfToken: () => token, onUnauthorized: () => expired++, fetchImpl: async () => ({ ...response(null, 401), json: () => parsed.promise }) });
  const stale = f.api.get(`/api/cases/${caseId}`, { telemetry: true });
  token = 'synthetic-new-token';
  parsed.resolve({ code: 'AUTH_REQUIRED' });
  await assert.rejects(stale, { code: 'AUTH_REQUIRED', status: 401 });
  assert.equal(expired, 0);
  assert.deepEqual(f.finishes, [{ ok: false, httpStatus: 401, headers: responseHeaders }]);
  await assert.rejects(f.api.get(`/api/cases/${caseId}`, { telemetry: true }), { code: 'AUTH_REQUIRED' });
  assert.equal(expired, 1);
  await assert.rejects(f.api.post('/api/login', {}), { code: 'AUTH_REQUIRED' });
  assert.equal(expired, 1);
});

// Compile the real provider as in frontend-session.test.js; no product test seam.
const source = await readFile(new URL('../frontend/lib/session.jsx', import.meta.url), 'utf8');
const compiled = await transformWithOxc(source, 'session.jsx', { jsx: { runtime: 'automatic' } });
const generated = new URL(`../frontend/lib/.observer-session-test-${randomUUID()}.mjs`, import.meta.url);
await writeFile(generated, compiled.code);
let SessionProvider, useSession;
try { ({ SessionProvider, useSession } = await import(generated.href)); }
finally { await unlink(generated); }

async function mountSession(context, handler) {
  draftVault.clear();
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://nestlet.invalid/next/', pretendToBeVisual: true });
  const saved = new Map(), lifecycleListeners = new Map();
  for (const [target, type] of [[dom.window.document, 'visibilitychange'], [dom.window, 'pagehide']]) {
    const active = new Set(), add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    lifecycleListeners.set(type, active);
    target.addEventListener = (event, listener, options) => { if (event === type) active.add(listener); return add(event, listener, options); };
    target.removeEventListener = (event, listener, options) => { if (event === type) active.delete(listener); return remove(event, listener, options); };
  }
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, fetch: handler, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  let value, closed = false;
  const journeys = new Set();
  function Probe() { value = useSession(); journeys.add(value.journey); return React.createElement('p', null, value.status.userId || 'signed out'); }
  const close = async () => {
    if (closed) return;
    closed = true;
    await act(async () => root.unmount());
    dom.window.close(); draftVault.clear();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
  context.after(close);
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(SessionProvider, null, React.createElement(Probe)))));
  return { get session() { return value; }, journeys, lifecycleListeners, dom, close };
}

const account = (userId = 'synthetic-first-user', csrfToken = 'synthetic-first-token') => ({ authenticated: true, userId, csrfToken });
const eventCalls = calls => calls.filter(call => call.path.endsWith('/events'));
const events = calls => eventCalls(calls).flatMap(call => JSON.parse(call.options.body).events);
const sessionResponse = (body, status = 200) => response(body, status, new Headers());

test('React StrictMode owns one live observer, emits no mount/read events, and disposes its listeners', async context => {
  const calls = [];
  const app = await mountSession(context, async (path, options) => {
    calls.push({ path, options });
    return sessionResponse(path === '/api/status' ? account() : path === '/api/workflows' ? { workflowId } : { saved: true });
  });
  assert.equal(calls.filter(call => call.path === '/api/status').length, 2, 'StrictMode exercises effect cleanup/reconnect');
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(app.session.status.userId, 'synthetic-first-user');
  assert.equal(app.journeys.size, 1);
  for (const active of app.lifecycleListeners.values()) assert.equal(active.size, 1);
  await app.session.api.get(`/api/cases/${caseId}`);
  await app.session.journey.flush();
  assert.equal(calls.filter(call => call.path === '/api/workflows').length, 0);
  await app.session.api.post('/api/cases', {});
  await app.session.journey.flush();
  assert.equal(calls.filter(call => call.path === '/api/workflows').length, 1);
  assert.deepEqual(events(calls).map(event => [event.event, event.outcome]), [['case.save', 'success']]);
  assert.equal(app.dom.window.localStorage.length, 0);
  assert.equal(app.dom.window.sessionStorage.length, 0);
  await app.close();
  for (const active of app.lifecycleListeners.values()) assert.equal(active.size, 0);
});

test('session telemetry creation is never awaited by a business request and telemetry auth failure cannot expire the account', async context => {
  const creation = deferred(), calls = [];
  context.after(() => creation.resolve(sessionResponse({ code: 'AUTH_REQUIRED' }, 401)));
  const app = await mountSession(context, async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/status') return sessionResponse(account());
    if (path === '/api/workflows') return creation.promise;
    return sessionResponse({ saved: true });
  });
  let complete = false;
  const business = app.session.api.post('/api/cases', {}).then(value => { complete = true; return value; });
  await settle();
  assert.equal(complete, true, 'The business response completes while telemetry creation is still unresolved');
  assert.deepEqual(await business, { saved: true });
  creation.resolve(sessionResponse({ code: 'AUTH_REQUIRED' }, 401));
  await app.session.journey.flush();
  assert.equal(app.session.status.authenticated, true);
  assert.equal(app.session.status.csrfToken, 'synthetic-first-token');
  await app.session.api.post('/api/cases', {});
  await app.session.journey.flush();
  assert.equal(calls.filter(call => call.path === '/api/workflows').length, 1);
  assert.equal(events(calls).length, 0);
  assert.equal(calls.filter(call => call.path === '/api/cases').length, 2);
});

test('identity changes discard queued observations and late old-account 401 cannot disable the new journey', async context => {
  let current = account();
  const oldBody = deferred(), calls = [];
  const app = await mountSession(context, async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/status') return sessionResponse(current);
    if (path === '/api/login') { current = account('synthetic-next-user', 'synthetic-next-token'); return sessionResponse(current); }
    if (path === '/api/workflows') return sessionResponse({ workflowId: options.headers['X-CSRF-Token'] === 'synthetic-first-token' ? workflowId : nextWorkflowId });
    if (path === `/api/cases/${caseId}`) return { ...sessionResponse(null, 401), json: () => oldBody.promise };
    return sessionResponse({ saved: true });
  });
  const observer = app.session.journey;
  await app.session.api.post('/api/cases', {});
  const old = app.session.api.get(`/api/cases/${caseId}`, { telemetry: true });
  await settle();
  await act(async () => app.session.login({ username: 'synthetic-next-user', password: 'synthetic-test-only' }));
  assert.equal(app.session.journey, observer, 'Account changes reset the existing session-owned observer');
  await app.session.api.post('/api/cases', {});
  await app.session.journey.flush();
  await act(async () => { oldBody.resolve({ code: 'AUTH_REQUIRED' }); await assert.rejects(old, { code: 'AUTH_REQUIRED' }); });
  await app.session.api.post('/api/cases', {});
  await app.session.journey.flush();
  assert.equal(app.session.status.userId, 'synthetic-next-user');
  assert.equal(app.session.status.authenticated, true);
  assert.equal(calls.filter(call => call.path === '/api/workflows').length, 2);
  assert.deepEqual(events(calls).map(event => [event.event, event.outcome]), [['case.save', 'success'], ['case.save', 'success']]);
  for (const call of eventCalls(calls)) {
    assert.equal(call.path, `/api/workflows/${nextWorkflowId}/events`);
    assert.equal(call.options.headers['X-CSRF-Token'], 'synthetic-next-token');
  }
});

test('failed explicit logout resets queued/in-flight observation and stays disabled until identity changes', async context => {
  let current = account();
  const calls = [], pendingSave = deferred();
  let holdSave = false;
  const app = await mountSession(context, async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/status') return sessionResponse(current);
    if (path === '/api/logout') throw new TypeError('Synthetic offline diagnostic');
    if (path === '/api/login') { current = account('synthetic-first-user', 'synthetic-rotated-token'); return sessionResponse(current); }
    if (path === '/api/workflows') return sessionResponse({ workflowId: current.csrfToken === 'synthetic-first-token' ? workflowId : nextWorkflowId });
    if (path === '/api/cases' && holdSave) return pendingSave.promise;
    return sessionResponse({ saved: true });
  });
  await app.session.api.post('/api/cases', {});
  holdSave = true;
  const staleSave = app.session.api.post('/api/cases', {});
  await act(async () => assert.rejects(app.session.logout(), { code: 'NETWORK_ERROR' }));
  pendingSave.resolve(sessionResponse({ saved: true }));
  await staleSave;
  holdSave = false;
  await act(async () => app.session.refresh());
  await app.session.api.post('/api/cases', {});
  await app.session.journey.flush();
  assert.equal(calls.filter(call => call.path === '/api/workflows').length, 1);
  assert.equal(events(calls).length, 0);
  await act(async () => app.session.login({ username: 'synthetic-first-user', password: 'synthetic-test-only' }));
  await app.session.api.post('/api/cases', {});
  await app.session.journey.flush();
  assert.equal(calls.filter(call => call.path === '/api/workflows').length, 2);
  assert.deepEqual(events(calls).map(event => [event.event, event.outcome]), [['case.save', 'success']]);
  assert.equal(eventCalls(calls)[0].options.headers['X-CSRF-Token'], 'synthetic-rotated-token');
});
