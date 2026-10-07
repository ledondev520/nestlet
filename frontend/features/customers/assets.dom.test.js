// Incremental original-materials development DOM coverage with controlled API
// doubles. It is separate from real HTTP/storage, browser/CSP and release proof.
import { after, before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { assetPath, assetSearchPath, assetsError, sizeLabel, unavailableAssets } from './assets-model.js';
import { originalCopy } from './assets-copy.js';

const clientId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const asset = { id: '33333333-3333-4333-8333-333333333333', originalFilename: 'Synthetic original.pdf', mimeType: 'application/pdf', sizeBytes: 1536, createdAt: '2026-10-07T09:00:00Z', clientId, caseId, previewKind: 'pdf', textStatus: 'ready', textTruncated: false, warnings: [] };
const other = { ...asset, id: '44444444-4444-4444-8444-444444444444', originalFilename: 'Other original.txt', mimeType: 'text/plain', previewKind: 'text' };
const records = [{ id: caseId, title: 'Synthetic case' }];
const page = (assets = [], total = assets.length) => ({ assets, total, offset: 0, limit: 50, searchMode: 'literal-substring' });
let vite, dom, React, createRoot, OriginalMaterials, CustomerWorkspace, container, root;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const content = () => container.textContent;
const button = name => [...container.querySelectorAll('button')].find(element => element.textContent === name || element.getAttribute('aria-label') === name);
const input = name => { const label = [...container.querySelectorAll('label')].find(element => element.textContent === name); return label && document.getElementById(label.htmlFor); };
async function tick(ms = 15) { await React.act(async () => { await sleep(ms); }); }
async function click(target) { assert.ok(target); await React.act(async () => target.click()); await tick(); }
async function change(target, value) {
  assert.ok(target);
  await React.act(async () => {
    const prototype = target.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(target, value);
    target.dispatchEvent(new dom.window.Event(target.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
function apiFor(handler = () => page()) {
  const calls = [];
  return { calls, get: async (path, options) => { calls.push({ path, ...options }); return handler(path, options); } };
}
async function render(api, props = {}) {
  await React.act(async () => root.render(React.createElement(OriginalMaterials, { api, clientId, cases: records, lang: 'en', ...props })));
  await tick();
}
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/next/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'Node', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import('react'); ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)), server: { middlewareMode: true, hmr: false, watch: null, ws: false }, appType: 'custom' });
  ({ OriginalMaterials } = await vite.ssrLoadModule('/features/customers/original-materials.jsx'));
  ({ CustomerWorkspace } = await vite.ssrLoadModule('/features/customers/workspace.jsx'));
});
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await React.act(async () => root.unmount()); container.remove(); });
after(async () => { await vite?.close(); dom?.window.close(); });

test('lists real response metadata and constructs only authenticated same-origin resource links', async () => {
  const api = apiFor(() => page([asset])); await render(api);
  assert.match(content(), /Synthetic original.pdf/); assert.match(content(), /1.5 KB/); assert.match(content(), /Synthetic case/); assert.match(content(), /Searchable text/);
  const links = [...container.querySelectorAll('a')];
  assert.deepEqual(links.map(link => link.getAttribute('href')), [`/api/assets/${asset.id}/preview`, `/api/assets/${asset.id}/download`]);
  assert.equal(links[0].target, '_blank'); assert.equal(links[0].rel, 'noopener noreferrer'); assert.equal(links[1].hasAttribute('download'), true);
  const query = new URL(api.calls[0].path, 'http://test').searchParams;
  assert.equal(query.get('clientId'), clientId); assert.equal(query.get('limit'), '50'); assert.equal(query.get('offset'), '0');
});

test('literal search encodes wildcards, aborts obsolete reads and ignores late results', async () => {
  const slow = deferred(), fast = deferred();
  const api = apiFor(path => {
    const q = new URL(path, 'http://test').searchParams.get('q');
    if (q === 'Johnny %_') return slow.promise;
    if (q === 'Jane') return fast.promise;
    return page();
  });
  await render(api); await change(input('Search original materials'), 'Johnny %_'); await tick(200);
  const first = api.calls.at(-1); assert.match(first.path, /Johnny\+%25_/);
  await change(input('Search original materials'), 'Jane'); await tick(200); assert.equal(first.signal.aborted, true);
  await React.act(async () => fast.resolve(page([other])));
  await React.act(async () => slow.resolve(page([asset])));
  assert.match(content(), /Other original.txt/); assert.doesNotMatch(content(), /Synthetic original.pdf/);
});

test('case filters and page navigation preserve scope and reset offset for a new query', async () => {
  const many = Array.from({ length: 50 }, (_, index) => ({ ...asset, id: `${String(index).padStart(8, '0')}-5555-4555-8555-555555555555`, originalFilename: `Synthetic ${index}.pdf` }));
  const api = apiFor(path => Number(new URL(path, 'http://test').searchParams.get('offset')) ? page([other], 51) : page(many, 51));
  await render(api); await change(input('Filter by case'), caseId); await tick();
  await click(button('Next materials page'));
  let query = new URL(api.calls.at(-1).path, 'http://test').searchParams;
  assert.equal(query.get('offset'), '50'); assert.equal(query.get('clientId'), clientId); assert.equal(query.get('caseId'), caseId);
  assert.match(content(), /Page 2 · 1 shown, 51 total/); assert.equal(button('Next materials page').disabled, true);
  await change(input('Search original materials'), 'keyword'); await tick(200);
  query = new URL(api.calls.at(-1).path, 'http://test').searchParams; assert.equal(query.get('offset'), '0'); assert.equal(query.get('caseId'), caseId);
});

test('old-server 404 is unavailable, not a successful empty directory, in either language', async () => {
  const api = apiFor(() => Promise.reject({ status: 404, code: 'INVALID_RESPONSE' }));
  await render(api); assert.match(content(), /Original materials are not available yet/); assert.match(content(), /still use the case and saved-document/); assert.doesNotMatch(content(), /No saved originals yet/);
  await render(api, { lang: 'zh' }); assert.match(content(), /原始资料功能尚未就绪/); assert.doesNotMatch(content(), /Original materials are not available yet/);
});

test('foreign or missing scope is distinguished from unsupported API; errors preserve retry', async () => {
  let fail = true;
  const api = apiFor(() => fail ? Promise.reject({ status: 404, code: 'CLIENT_NOT_FOUND' }) : page());
  await render(api); assert.match(content(), /not available to this account/); assert.doesNotMatch(content(), /does not yet support/);
  fail = false; await click(button('Reload original materials')); assert.match(content(), /No saved originals yet/);
});

test('preview text is escaped, verifies asset identity, and restores its trigger focus on close', async () => {
  const malicious = '<img src=x onerror=alert(1)>\nSynthetic extracted text.';
  const api = apiFor(path => path.endsWith('/text') ? { asset, text: malicious } : page([asset]));
  await render(api); const trigger = button('Text preview: Synthetic original.pdf'); await click(trigger);
  assert.equal(container.querySelector('pre').textContent, malicious); assert.equal(container.querySelector('img'), null);
  await click(button('Close text preview')); assert.equal(container.querySelector('pre'), null); assert.equal(document.activeElement, trigger);
});

test('closing or changing a preview discards late text responses', async () => {
  const slow = deferred();
  const api = apiFor(path => path === `/api/assets/${asset.id}/text` ? slow.promise : path.endsWith('/text') ? { asset: other, text: 'Current text only' } : page([asset, other]));
  await render(api); await click(button('Text preview: Synthetic original.pdf'));
  const first = api.calls.at(-1); await click(button('Text preview: Other original.txt')); assert.equal(first.signal.aborted, true);
  await React.act(async () => slow.resolve({ asset, text: 'Obsolete private text' }));
  assert.match(content(), /Current text only/); assert.doesNotMatch(content(), /Obsolete private text/);
});

test('a customer/account-key remount clears old filters and late private data', async () => {
  const slow = deferred(); const oldApi = apiFor(() => slow.promise);
  await render(oldApi, { key: 'account-a-customer-a' });
  await change(input('Search original materials'), 'private'); await tick(200);
  const api = apiFor(() => page()); await render(api, { key: 'account-b-customer-b', clientId: caseId });
  await React.act(async () => slow.resolve(page([asset])));
  assert.equal(input('Search original materials').value, ''); assert.doesNotMatch(content(), /Synthetic original.pdf/); assert.match(content(), /No saved originals yet/);
});

test('images without OCR remain previewable/downloadable without claiming searchable text', async () => {
  const image = { ...asset, previewKind: 'image', mimeType: 'image/png', originalFilename: 'Synthetic image.png', textStatus: 'unavailable', warnings: ['Original image stored. OCR is unavailable.'] };
  const api = apiFor(() => page([image])); await render(api);
  assert.match(content(), /No searchable text/); assert.match(content(), /OCR is unavailable/); assert.equal(button('Text preview: Synthetic image.png'), undefined);
  assert.equal(container.querySelectorAll('a').length, 2);
});

test('invalid resource paths, broken metadata and wrong text IDs never render unsafe links or text', async () => {
  assert.equal(assetPath('../foreign', 'download'), null); assert.equal(assetPath('https://foreign.invalid', 'preview'), null);
  const api = apiFor(() => page([{ ...asset, id: '../foreign' }])); await render(api);
  assert.match(content(), /could not be loaded/); assert.equal(container.querySelector('a'), null);
  const goodApi = apiFor(path => path.endsWith('/text') ? { asset: other, text: 'Wrong asset content' } : page([asset]));
  await render(goodApi); await click(button('Text preview: Synthetic original.pdf'));
  assert.match(content(), /Extracted text could not be read/); assert.doesNotMatch(content(), /Wrong asset content/);
});

test('helpers retain literal Unicode queries, safe byte labels, and known unavailable/error distinctions', () => {
  const query = new URL(assetSearchPath({ clientId, q: 'Élodie %_', caseId, offset: 50 }), 'http://test').searchParams;
  assert.equal(query.get('q'), 'Élodie %_'); assert.equal(sizeLabel(0, 'en'), '0 B'); assert.equal(sizeLabel(1024, 'en'), '1 KB');
  assert.equal(unavailableAssets({ status: 404, code: 'CASE_NOT_FOUND' }), false); assert.equal(unavailableAssets({ status: 404, code: 'INVALID_RESPONSE' }), true);
  assert.equal(assetsError({ status: 401 }, originalCopy('en')), 'Your session has expired. Sign in again to view originals.');
});

test('hidden cached customer pages do not navigate on late creation and refresh originals on return', async () => {
  const write = deferred(), opened = [];
  const client = { id: clientId, displayName: 'Synthetic customer', version: 1, updatedAt: asset.createdAt };
  let assetReads = 0;
  const api = {
    get: async path => {
      if (path.startsWith('/api/clients?')) return { clients: [client] };
      if (path.endsWith('/cases')) return { cases: [] };
      if (path.endsWith('/artifacts')) return { artifacts: [] };
      if (path.startsWith('/api/assets?')) { assetReads++; return page(); }
      return { client };
    },
    post: async () => write.promise
  };
  const renderWorkspace = async active => {
    await React.act(async () => root.render(React.createElement(CustomerWorkspace, { api, lang: 'en', active, onOpenCase: id => opened.push(id) })));
    await tick();
  };
  await renderWorkspace(true);
  await click([...container.querySelectorAll('button')].find(element => element.textContent.includes('Synthetic customer')));
  await click(button('New case')); await change(input('Case title'), 'Synthetic pending case');
  await React.act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await renderWorkspace(false);
  await React.act(async () => write.resolve({ case: { id: caseId, title: 'Synthetic pending case' } }));
  assert.deepEqual(opened, []);
  const before = assetReads;
  await renderWorkspace(true); await tick();
  assert.ok(assetReads > before); assert.match(content(), /Case created/); assert.deepEqual(opened, []);
});

test('returning to a cached customer page preserves an unsaved rename draft', async () => {
  const client = { id: clientId, displayName: 'Synthetic customer', version: 1, updatedAt: asset.createdAt };
  const api = { get: async path => path.startsWith('/api/clients?') ? { clients: [client] } : path.endsWith('/cases') ? { cases: [] } : path.endsWith('/artifacts') ? { artifacts: [] } : path.startsWith('/api/assets?') ? page() : { client } };
  const show = async active => { await React.act(async () => root.render(React.createElement(CustomerWorkspace, { api, lang: 'en', active }))); await tick(); };
  await show(true); await click([...container.querySelectorAll('button')].find(element => element.textContent.includes('Synthetic customer')));
  await click(button('Rename')); await change(input('Customer label'), 'Unfinished rename draft');
  await show(false); await show(true);
  assert.equal(input('Customer label').value, 'Unfinished rename draft');
});
