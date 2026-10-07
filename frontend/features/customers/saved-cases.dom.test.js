// Controlled-response development DOM tests. Real persistence/re-login checks
// live separately in saved-archive.http-dom.test.js; neither is browser evidence.
import { after, before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { savedCasePage } from './saved-cases-model.js';
import { assetSearchPath } from './assets-model.js';
let vite, dom, React, createRoot, SavedCases, CustomerWorkspace, root, container;
const unassigned = { id: '11111111-1111-4111-8111-111111111111', title: 'Synthetic unassigned intake', clientId: null, updatedAt: '2026-10-07T10:00:00Z' };
const linked = { id: '22222222-2222-4222-8222-222222222222', title: 'Synthetic linked case', clientId: '33333333-3333-4333-8333-333333333333', updatedAt: '2026-10-06T10:00:00Z' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const content = () => container.textContent;
const button = name => [...container.querySelectorAll('button')].find(element => element.textContent === name || element.getAttribute('aria-label') === name);
const tick = async () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
async function click(element) { assert.ok(element); await React.act(async () => element.click()); await tick(); }
async function search(value) { await React.act(async () => { const input = container.querySelector('input'); Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function render(api, props = {}, Component = SavedCases) { await React.act(async () => root.render(React.createElement(Component, { api, lang: 'en', ...props }))); await tick(); }
function apiFor(handler = () => ({ cases: [unassigned, linked] })) { const calls = []; return { calls, get: async (path, options) => { calls.push({ path, ...options }); return handler(path); } }; }
before(async () => {
  dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/next/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'Node', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; React = await import('react'); ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)), server: { middlewareMode: true, hmr: false, watch: null, ws: false }, appType: 'custom' });
  ({ SavedCases } = await vite.ssrLoadModule('/features/customers/saved-cases.jsx')); ({ CustomerWorkspace } = await vite.ssrLoadModule('/features/customers/workspace.jsx'));
});
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await React.act(async () => root.unmount()); container.remove(); });
after(async () => { await vite?.close(); dom?.window.close(); });

test('fresh customer page reads all own cases even with no customer records and opens through the existing callback', async () => {
  const opened = [];
  const api = apiFor(path => path === '/api/cases' ? { cases: [unassigned] } : { clients: [] });
  await render(api, { onOpenCase: id => { opened.push(id); return false; } }, CustomerWorkspace);
  assert.ok(api.calls.some(call => call.path === '/api/cases')); assert.match(content(), /Synthetic unassigned intake/); assert.match(content(), /No customer records yet/);
  await click(button('Open saved case: Synthetic unassigned intake'));
  assert.deepEqual(opened, [unassigned.id]); assert.match(content(), /Synthetic unassigned intake/);
});

test('all/unassigned/recent views use literal local search and ten-record pagination without inventing query endpoints', async () => {
  const records = Array.from({ length: 23 }, (_, index) => ({ ...unassigned, id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`, title: `Synthetic ${index} %_`, updatedAt: new Date(Date.UTC(2026, 9, 7, 0, index)).toISOString(), clientId: index % 2 ? linked.clientId : null }));
  const api = apiFor(() => ({ cases: records })); await render(api, { onOpenCase() {} });
  assert.equal(container.querySelectorAll('li').length, 10); assert.match(content(), /Page 1 of 3/);
  await click(button('Next cases page')); assert.match(content(), /Page 2 of 3/);
  await click(button('Unassigned')); assert.equal(container.querySelectorAll('li').length, 10); assert.match(content(), /Page 1 of 2/);
  await search('22 %_'); assert.match(content(), /Synthetic 22 %_/); assert.equal(container.querySelectorAll('li').length, 1);
  await search(''); await click(button('Latest 10')); assert.equal(container.querySelectorAll('li').length, 10); assert.equal(button('Next cases page'), undefined);
  assert.deepEqual(api.calls.map(call => call.path), ['/api/cases']);
});

test('account-key remount discards a late old-account directory and does not navigate automatically', async () => {
  const old = deferred(), opened = [];
  const api = apiFor(() => old.promise); await render(api, { key: 'account-a', onOpenCase: id => opened.push(id) });
  await render(apiFor(() => ({ cases: [] })), { key: 'account-b', onOpenCase: id => opened.push(id) });
  assert.equal(api.calls[0].signal.aborted, true); await React.act(async () => old.resolve({ cases: [unassigned] }));
  assert.match(content(), /No saved cases yet/); assert.doesNotMatch(content(), /Synthetic unassigned intake/); assert.deepEqual(opened, []);
});

test('re-entering the cached page refreshes saved cases and an obsolete refresh cannot replace current data', async () => {
  const stale = deferred(); let count = 0;
  const api = apiFor(() => ++count === 1 ? stale.promise : { cases: [linked] });
  await render(api, { active: false }); await render(api, { active: true });
  await React.act(async () => stale.resolve({ cases: [unassigned] }));
  assert.match(content(), /Synthetic linked case/); assert.doesNotMatch(content(), /Synthetic unassigned intake/);
});

test('errors are explicit, bilingual and retryable; empty lists are not substituted for failures', async () => {
  let failed = true; const api = apiFor(() => failed ? Promise.reject({ code: 'NETWORK_ERROR' }) : { cases: [] });
  await render(api); assert.match(content(), /Saved cases could not be loaded/); assert.doesNotMatch(content(), /No saved cases yet/);
  await render(api, { lang: 'zh' }); assert.match(content(), /暂时无法加载已保存事项/);
  failed = false; await click(button('重新加载事项目录')); assert.match(content(), /还没有已保存的事项/);
});

test('global originals entry omits absent clientId and displays unassigned saved files without customer selection', async () => {
  const asset = { id: unassigned.id, originalFilename: 'Synthetic standalone.txt', mimeType: 'text/plain', sizeBytes: 20, previewKind: 'text', textStatus: 'ready', caseId: null, clientId: null, createdAt: unassigned.updatedAt };
  const api = apiFor(path => path === '/api/cases' ? { cases: [] } : path.startsWith('/api/assets?') ? { assets: [asset], total: 1 } : { clients: [] });
  await render(api, {}, CustomerWorkspace);
  const details = container.querySelector('details'); assert.match(details.textContent, /All originals, including unassigned/);
  await React.act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); }); await tick();
  const request = api.calls.find(call => call.path.startsWith('/api/assets?'));
  assert.ok(request); assert.equal(new URL(request.path, 'http://test').searchParams.has('clientId'), false);
  assert.match(content(), /Synthetic standalone.txt/); assert.match(content(), /No customer or case linked/);
});

test('pagination clamps after records shrink, search normalizes Unicode and global asset queries never stringify null', () => {
  const records = [{ ...unassigned, title: 'Élodie 100%_' }, linked];
  assert.equal(savedCasePage(records, { query: 'e\u0301LODIE 100%_', page: 10 }).records[0].id, unassigned.id);
  assert.equal(savedCasePage(records, { page: 10 }).page, 0);
  for (const clientId of [undefined, null, '']) assert.equal(new URL(assetSearchPath({ clientId }), 'http://test').searchParams.has('clientId'), false);
});
