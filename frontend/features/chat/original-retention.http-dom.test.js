// Actual local HTTP server, SQLite and private-file bytes, with React/jsdom.
// Synthetic fixtures only. This is not real-browser, provider or production evidence.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import jpeg from 'jpeg-js';
import { startBrowserFixture } from '../../../test/helpers/browser-fixture.mjs';
import { createApiClient } from '../../lib/api.js';
import { newCasePayload } from './logic.js';
const nativeFetch = globalThis.fetch;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const jpg = jpeg.encode({ data: Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]), width: 2, height: 1 }, 80).data;
const images = [
  { id: randomUUID(), mimeType: 'image/png', originalFilename: 'Synthetic chat original 中文.png', originalFile: new File([png], 'Synthetic chat original 中文.png', { type: 'image/png' }) },
  { id: randomUUID(), mimeType: 'image/jpeg', originalFilename: 'Synthetic second original.jpg', originalFile: new File([jpg], 'Synthetic second original.jpg', { type: 'image/jpeg' }) }
];
let fixture, dom, vite, React, createRoot, ChatOriginalRetention, root, host;
const globals = new Map();
before(async () => {
  fixture = await startBrowserFixture({ legacyUsers: ['chat-original-a', 'chat-original-b'] });
  dom = new JSDOM('<!doctype html><body></body>', { url: fixture.origin + '/next/' });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  React = await import('react'); ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error' });
  ({ ChatOriginalRetention } = await vite.ssrLoadModule('/features/chat/original-retention.jsx'));
});
after(async () => {
  if (root) await React.act(async () => root.unmount()); await vite?.close(); dom?.window.close(); await fixture?.stop();
  for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});
async function session(username) {
  const login = await nativeFetch(fixture.origin + '/api/login', { method: 'POST', headers: { Origin: fixture.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'Case26' }) });
  assert.equal(login.status, 200); const status = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0], calls = [];
  let dropNextUpload = false;
  const fetchImpl = async (path, options = {}) => {
    calls.push({ path, method: options.method || 'GET' });
    const response = await nativeFetch(fixture.origin + path, { ...options, headers: { ...options.headers, Origin: fixture.origin, Cookie: cookie } });
    if (dropNextUpload && options.method === 'POST' && path.startsWith('/api/assets')) { dropNextUpload = false; await response.arrayBuffer(); throw new TypeError('Synthetic lost response after real server commit'); }
    return response;
  };
  return { ...status, api: createApiClient({ fetchImpl, getCsrfToken: () => status.csrfToken }), fetch: fetchImpl, calls, dropResponse: () => { dropNextUpload = true; } };
}
async function mount(props) {
  if (root) { await React.act(async () => root.unmount()); host.remove(); }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await React.act(async () => root.render(React.createElement(ChatOriginalRetention, { authenticated: true, images, lang: 'en', ...props })));
}
const button = name => [...host.querySelectorAll('button')].find(element => element.textContent === name);
async function waitFor(predicate) {
  for (let i = 0; i < 150; i++) { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); if (predicate()) return; }
  assert.ok(predicate(), host.textContent);
}
async function click(name) { const element = button(name); assert.ok(element, `Expected ${name}`); await React.act(async () => element.click()); }
const uploads = client => client.calls.filter(call => call.method === 'POST' && call.path.startsWith('/api/assets')).length;

test('selected chat originals persist byte-exactly, recover ambiguous saves, remain searchable after restart, and stay isolated per user', async () => {
  let owner = await session('chat-original-a');
  const record = (await owner.api.post('/api/cases', newCasePayload('Synthetic chat originals case'))).case;
  await mount({ api: owner.api, userId: owner.userId, caseId: record.id });
  assert.equal(uploads(owner), 0); assert.equal((await owner.api.get(`/api/assets?caseId=${record.id}`)).total, 0);
  await click('Save this original'); await waitFor(() => host.textContent.includes('Original saved to'));
  let stored = await owner.api.get(`/api/assets?caseId=${record.id}`);
  assert.equal(stored.total, 1); assert.equal(stored.assets[0].originalFilename, images[0].originalFilename);
  assert.equal(stored.assets[0].textStatus, 'unavailable'); assert.equal(uploads(owner), 1);
  const pngAsset = stored.assets[0];
  const pngDownload = await owner.fetch(`/api/assets/${pngAsset.id}/download`);
  assert.equal(pngDownload.status, 200); assert.deepEqual(Buffer.from(await pngDownload.arrayBuffer()), png);
  assert.ok(host.querySelector(`a[href="/api/assets/${pngAsset.id}/download"]`));

  owner.dropResponse(); await click('Save this original'); await waitFor(() => Boolean(button('Check saved status')));
  assert.match(host.textContent, /server may have saved/); assert.equal(uploads(owner), 2);
  await click('Check saved status'); await waitFor(() => !button('Check saved status'));
  assert.equal(uploads(owner), 2, 'Reconciliation does not repeat the committed POST');
  stored = await owner.api.get(`/api/assets?caseId=${record.id}`); assert.equal(stored.total, 2);
  const jpgAsset = stored.assets.find(asset => asset.mimeType === 'image/jpeg'); assert.ok(jpgAsset);
  assert.deepEqual(Buffer.from(await (await owner.fetch(`/api/assets/${jpgAsset.id}/download`)).arrayBuffer()), jpg);
  assert.equal(owner.calls.some(call => call.path === '/api/chat' || call.path === '/api/extract'), false);

  await React.act(async () => root.unmount()); root = null; host.remove();
  await fixture.restart(); owner = await session('chat-original-a');
  const found = await owner.api.get(`/api/assets?caseId=${record.id}&q=${encodeURIComponent('chat original 中文')}`);
  assert.equal(found.total, 1); assert.equal(found.assets[0].id, pngAsset.id); assert.equal(found.assets[0].caseId, record.id);
  assert.deepEqual(Buffer.from(await (await owner.fetch(`/api/assets/${pngAsset.id}/preview`)).arrayBuffer()), png);
  await mount({ api: owner.api, userId: owner.userId, caseId: record.id, images: [images[0]] });
  await click('Save this original'); await waitFor(() => host.textContent.includes('Original saved to'));
  assert.equal(uploads(owner), 0, 'Reattached exact original discovers the existing same-case copy');

  const other = await session('chat-original-b');
  assert.equal((await other.api.get('/api/assets?q=Synthetic')).total, 0);
  for (const path of [`/api/cases/${record.id}`, `/api/assets?caseId=${record.id}`, `/api/assets/${pngAsset.id}`, `/api/assets/${pngAsset.id}/download`, `/api/assets/${jpgAsset.id}/preview`])
    assert.equal((await other.fetch(path)).status, 404);
  const crossCase = await other.fetch(`/api/assets?caseId=${record.id}`, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Asset-Filename': 'Synthetic.png', 'X-Asset-Consent': 'persist-private', 'X-CSRF-Token': other.csrfToken }, body: png });
  assert.equal(crossCase.status, 404); assert.equal((await other.api.get('/api/assets')).total, 0);
});
