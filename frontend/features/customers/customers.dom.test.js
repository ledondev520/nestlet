// Development DOM tests: controlled API doubles verify rendering and race safety.
// These are not real HTTP, paid-provider, browser/CSP, or deployment acceptance.
import { after, before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const rootPath = fileURLToPath(new URL('../../', import.meta.url));
const a = { id: '11111111-1111-4111-8111-111111111111', displayName: 'Synthetic Johnny', version: 1, updatedAt: '2026-10-07T09:00:00Z' };
const b = { id: '22222222-2222-4222-8222-222222222222', displayName: 'Synthetic Jane', version: 1, updatedAt: '2026-10-07T09:01:00Z' };
const caseA = { id: '33333333-3333-4333-8333-333333333333', clientId: a.id, title: 'Synthetic linked case', version: 1, updatedAt: a.updatedAt };
let vite, dom, React, createRoot, CustomerWorkspace, container, root;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = () => container.textContent;
const buttons = () => [...container.querySelectorAll('button')];
const button = label => buttons().find(item => item.textContent.trim() === label || item.getAttribute('aria-label') === label);
async function tick(ms = 15) { await React.act(async () => { await sleep(ms); }); }
async function click(target) { assert.ok(target, 'Requested button exists'); await React.act(async () => { target.click(); }); await tick(); }
async function change(input, value) {
  assert.ok(input, 'Requested input exists');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function submit(form) { assert.ok(form); await React.act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); }); await tick(); }
const input = label => { const element = [...container.querySelectorAll('label')].find(item => item.textContent === label); return element && container.querySelector(`[id="${element.htmlFor}"]`); };
function apiFor(handler = () => undefined) {
  const calls = [];
  async function request(method, path, body, options = {}) {
    calls.push({ method, path, body, signal: options.signal });
    const handled = handler({ method, path, body, signal: options.signal });
    if (handled !== undefined) return handled;
    if (path.startsWith('/api/clients?')) return { clients: [a, b] };
    if (path.endsWith('/cases')) return { cases: [] };
    if (path.endsWith('/artifacts')) return { artifacts: [] };
    if (path === `/api/clients/${a.id}`) return { client: a };
    if (path === `/api/clients/${b.id}`) return { client: b };
    throw new Error(`Unexpected request: ${method} ${path}`);
  }
  return { calls, get: (path, options) => request('GET', path, undefined, options), post: (path, body, options) => request('POST', path, body, options), put: (path, body, options) => request('PUT', path, body, options) };
}
async function render(api, props = {}) {
  await React.act(async () => { root.render(React.createElement(CustomerWorkspace, { api, lang: 'en', ...props })); });
  await tick();
}
async function select(client) { await click(buttons().find(item => item.textContent.includes(client.displayName))); }

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/next/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'Node', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ root: rootPath, configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)), server: { middlewareMode: true, hmr: false, watch: null, ws: false }, appType: 'custom' });
  ({ CustomerWorkspace } = await vite.ssrLoadModule('/features/customers/workspace.jsx'));
});
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await React.act(async () => root.unmount()); container.remove(); });
after(async () => { await vite?.close(); dom?.window.close(); });

test('starts empty without invented customers and provides complete English/Chinese states', async () => {
  const api = apiFor(() => ({ clients: [] }));
  await render(api);
  assert.match(text(), /No customer records yet/);
  assert.doesNotMatch(text(), /Johnny|Jane|Mock|sample customer/);
  await render(api, { lang: 'zh' });
  assert.match(text(), /还没有客户记录/);
  assert.match(text(), /仅当前账户可见/);
});

test('search encodes literal wildcard names, cancels reads and ignores out-of-order responses', async () => {
  const slow = deferred(), fast = deferred();
  const api = apiFor(({ path }) => {
    if (path.startsWith('/api/clients?')) {
      const search = new URL(path, 'http://test').searchParams.get('search');
      if (search === 'Johnny %_') return slow.promise;
      if (search === 'Jane') return fast.promise;
      return { clients: [] };
    }
  });
  await render(api);
  await change(input('Search customers'), 'Johnny %_'); await tick(200);
  const first = api.calls.at(-1); assert.match(first.path, /Johnny\+%25_/);
  await change(input('Search customers'), 'Jane'); await tick(200);
  assert.equal(first.signal.aborted, true);
  await React.act(async () => fast.resolve({ clients: [b] }));
  assert.match(text(), /Synthetic Jane/);
  await React.act(async () => slow.resolve({ clients: [a] }));
  assert.doesNotMatch(text(), /Synthetic Johnny/);
});

test('selection cancels old details and cannot show a late customer’s cases or artifacts', async () => {
  const oldCases = deferred(), oldArtifacts = deferred();
  const api = apiFor(({ path }) => {
    if (path === `/api/clients/${a.id}/cases`) return oldCases.promise;
    if (path === `/api/clients/${a.id}/artifacts`) return oldArtifacts.promise;
  });
  await render(api); await select(a); await select(b);
  assert.equal(api.calls.find(call => call.path === `/api/clients/${a.id}/cases`).signal.aborted, true);
  await React.act(async () => { oldCases.resolve({ cases: [caseA] }); oldArtifacts.resolve({ artifacts: [{ id: 'old-doc', title: 'Old selected document' }] }); });
  assert.doesNotMatch(text(), /Synthetic linked case|Old selected document/);
  assert.match(container.querySelector('section').textContent, /Synthetic Jane/);
});

test('shows linked cases and immutable artifact versions with stale labels and correct navigation', async () => {
  const opened = [];
  const api = apiFor(({ path }) => {
    if (path.endsWith('/cases')) return { cases: [caseA] };
    if (path.endsWith('/artifacts')) return { artifacts: [{ id: 'doc-a', caseId: caseA.id, title: 'Saved synthetic letter', kind: 'followup', version: 2, status: 'final', sourceCaseVersion: 1, isStale: true, createdAt: a.updatedAt }] };
  });
  await render(api, { onOpenCase: id => opened.push(id) }); await select(a);
  assert.match(text(), /Saved synthetic letter/); assert.match(text(), /Version 2/); assert.match(text(), /Historical version/);
  assert.match(text(), /do not automatically become verified legal names/);
  await click(button('Open case: Synthetic linked case'));
  await click(button('Open document’s case: Saved synthetic letter'));
  assert.deepEqual(opened, [caseA.id, caseA.id]);
});

test('customer creation trims the label, suppresses duplicate submissions and selects the saved ID', async () => {
  const write = deferred();
  const api = apiFor(({ method }) => { if (method === 'POST') return write.promise; });
  await render(api); await click(button('New customer')); await change(input('Customer label'), '  New synthetic customer  ');
  const form = container.querySelector('form');
  await React.act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 1);
  assert.deepEqual(api.calls.find(call => call.method === 'POST').body, { displayName: 'New synthetic customer' });
  await React.act(async () => write.resolve({ client: a })); await tick();
  assert.ok(api.calls.some(call => call.path === `/api/clients/${a.id}`));
});

test('customer creation does not override a newer selection or search', async () => {
  const write = deferred();
  const api = apiFor(({ method }) => method === 'POST' ? write.promise : undefined);
  await render(api); await click(button('New customer')); await change(input('Customer label'), 'New synthetic customer'); await submit(container.querySelector('form'));
  await select(b); await change(input('Search customers'), 'Jane');
  await React.act(async () => write.resolve({ client: a })); await tick(200);
  assert.equal(input('Search customers').value, 'Jane');
  assert.match(container.querySelector('section').textContent, /Synthetic Jane/);
});

test('rename conflicts retain input, require an explicit reload, then use the latest version', async () => {
  let writes = 0, reads = 0;
  const api = apiFor(({ method, path, body }) => {
    if (path === `/api/clients/${a.id}` && method === 'GET') return { client: ++reads > 1 ? { ...a, displayName: 'Updated elsewhere', version: 2 } : a };
    if (method === 'PUT') {
      writes++;
      if (writes === 1) return Promise.reject({ code: 'CLIENT_CONFLICT', status: 409 });
      return { client: { ...a, displayName: body.displayName, version: 3 } };
    }
  });
  await render(api); await select(a); await click(button('Rename')); await change(input('Customer label'), 'My preserved edit'); await submit(container.querySelector('form'));
  assert.equal(input('Customer label').value, 'My preserved edit'); assert.equal(button('Save name').disabled, true);
  await click(button('Load latest name'));
  assert.match(text(), /Currently saved label: Updated elsewhere/); assert.equal(input('Customer label').value, 'My preserved edit');
  await submit(container.querySelector('form'));
  assert.deepEqual(api.calls.filter(call => call.method === 'PUT').map(call => call.body.expectedVersion), [1, 2]);
  assert.match(container.querySelector('section').textContent, /My preserved edit/);
});

test('new cases use only the empty scoped payload and a late create cannot navigate after selection changes', async () => {
  const write = deferred(), opened = [];
  const api = apiFor(({ method }) => method === 'POST' ? write.promise : undefined);
  await render(api, { onOpenCase: id => opened.push(id) }); await select(a); await click(button('New case'));
  await change(input('Case title'), '  New synthetic work  '); await submit(container.querySelector('form'));
  const request = api.calls.find(call => call.method === 'POST');
  assert.equal(request.path, '/api/cases');
  assert.deepEqual(request.body, { title: 'New synthetic work', sourceText: '', fields: [], draftType: 'followup', draftText: '', clientId: a.id });
  await select(b); assert.equal(request.signal.aborted, true);
  await React.act(async () => write.resolve({ case: caseA })); assert.deepEqual(opened, []);
});

test('account-key remount ignores previous account reads and writes', async () => {
  const write = deferred(), oldRead = deferred(), opened = [];
  const oldApi = apiFor(({ method, path }) => {
    if (method === 'POST') return write.promise;
    if (path === `/api/clients/${a.id}/artifacts`) return oldRead.promise;
  });
  await render(oldApi, { key: 'account-a', onOpenCase: id => opened.push(id) }); await select(a); await click(button('New case'));
  await change(input('Case title'), 'Old account case'); await submit(container.querySelector('form'));
  const newApi = apiFor(() => ({ clients: [] }));
  await render(newApi, { key: 'account-b', onOpenCase: id => opened.push(id) });
  await React.act(async () => { write.resolve({ case: caseA }); oldRead.resolve({ artifacts: [{ id: 'foreign-doc', title: 'Previous account document' }] }); });
  assert.deepEqual(opened, []); assert.doesNotMatch(text(), /Old account case|Previous account document|Synthetic Johnny/);
  assert.match(text(), /No customer records yet/);
});

test('one directory failure is visible and retry succeeds without hiding independently loaded cases', async () => {
  let artifactsReads = 0;
  const api = apiFor(({ path }) => {
    if (path.endsWith('/cases')) return { cases: [caseA] };
    if (path.endsWith('/artifacts')) return ++artifactsReads === 1 ? Promise.reject({ code: 'NETWORK_ERROR' }) : { artifacts: [] };
  });
  await render(api); await select(a);
  assert.match(text(), /Synthetic linked case/); assert.match(text(), /Cannot connect right now/);
  await click(button('Retry'));
  assert.match(text(), /No saved documents yet/); assert.doesNotMatch(text(), /Cannot connect right now/);
});

test('inline form validation changes language without changing input and cancel restores keyboard focus', async () => {
  const api = apiFor();
  await render(api); await click(button('New customer')); await change(input('Customer label'), '   '); await submit(container.querySelector('form'));
  assert.match(text(), /Enter a customer label of 1–120 characters/);
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 0);
  await render(api, { lang: 'zh' });
  assert.match(text(), /请输入 1–120 个字符的客户称呼/); assert.doesNotMatch(text(), /Enter a customer label/);
  assert.equal(input('客户称呼').value, '   ');
  await click(button('取消')); assert.equal(document.activeElement, button('新建客户'));
});

test('malformed server directories fail visibly instead of crashing or fabricating records', async () => {
  const api = apiFor(() => ({ clients: {} }));
  await render(api);
  assert.match(text(), /The request could not be completed/); assert.doesNotMatch(text(), /No customer records yet/);
});

test('successful case creation opens exactly its saved ID and reloads the complete directory', async () => {
  const opened = [];
  let caseReads = 0;
  const api = apiFor(({ method, path }) => {
    if (method === 'POST') return { case: caseA };
    if (path.endsWith('/cases')) { caseReads++; return { cases: [caseA] }; }
  });
  await render(api, { onOpenCase: id => opened.push(id) }); await select(a); await click(button('New case'));
  await change(input('Case title'), 'Synthetic linked case'); await submit(container.querySelector('form')); await tick();
  assert.deepEqual(opened, [caseA.id]); assert.ok(caseReads >= 2);
  assert.match(text(), /Case created/);
  await render(api, { lang: 'zh', onOpenCase: id => opened.push(id) });
  assert.match(text(), /事项已创建/); assert.doesNotMatch(text(), /Case created/);
});

test('a late rename cannot overwrite a newer selected customer', async () => {
  const write = deferred();
  const api = apiFor(({ method }) => method === 'PUT' ? write.promise : undefined);
  await render(api); await select(a); await click(button('Rename')); await change(input('Customer label'), 'Late renamed customer'); await submit(container.querySelector('form'));
  await select(b);
  await React.act(async () => write.resolve({ client: { ...a, displayName: 'Late renamed customer', version: 2 } }));
  assert.match(container.querySelector('section').textContent, /Synthetic Jane/); assert.doesNotMatch(text(), /Late renamed customer/);
});

test('untrusted customer labels are rendered as text, never executable markup', async () => {
  const label = '<img src=x onerror=alert(1)>';
  const api = apiFor(({ path }) => path.startsWith('/api/clients?') ? { clients: [{ ...a, displayName: label }] } : undefined);
  await render(api);
  assert.match(text(), /<img src=x onerror=alert\(1\)>/);
  assert.equal(container.querySelector('img'), null);
});
