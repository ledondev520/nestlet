// React/jsdom diagnostics with controlled API responses. Not real-browser acceptance.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { prepareChatOriginal } from './original-retention.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const makeImage = (name = 'Synthetic chat.png') => ({ id: randomUUID(), mimeType: 'image/png', originalFilename: name, originalFile: new File([png], name, { type: 'image/png' }) });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 1));
let dom, vite, React, createRoot, ChatOriginalRetention;
const globals = new Map();
before(async () => {
  dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/next/' });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  React = await import('react'); ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error' });
  ({ ChatOriginalRetention } = await vite.ssrLoadModule('/features/chat/original-retention.jsx'));
});
after(async () => { await vite?.close(); dom?.window.close(); for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
async function mount(context, overrides = {}) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), busy = [];
  let props = { api: null, userId: randomUUID(), authenticated: true, caseId: randomUUID(), images: [makeImage()], lang: 'en', onBusyChange: value => busy.push(value), ...overrides };
  const render = async next => { props = { ...props, ...next }; await React.act(async () => { root.render(React.createElement(ChatOriginalRetention, props)); await tick(); }); };
  const flush = async () => { await React.act(async () => { await tick(); }); };
  const wait = async predicate => { for (let i = 0; i < 100; i++) { await flush(); if (predicate()) return; } assert.ok(predicate(), host.textContent); };
  const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text);
  const click = async node => { assert.ok(node, 'Expected button'); await React.act(async () => { node.click(); await tick(); }); };
  const close = async () => { await React.act(async () => root.unmount()); host.remove(); };
  context.after(close); await render(); return { host, root, busy, render, flush, wait, button, click, props: () => props };
}
async function saved(image, caseId) {
  const original = await prepareChatOriginal(image); const { file, ...metadata } = original;
  return { ...metadata, id: randomUUID(), caseId, previewKind: 'image' };
}

test('only explicit selected image is saved; duplicate clicks are blocked and success waits for validation', async context => {
  const images = [makeImage('Selected.png'), makeImage('Leave transient.png')], caseId = randomUUID(), pending = deferred(), calls = [];
  const asset = await saved(images[0], caseId);
  const api = { get: async () => ({ assets: [], total: 0 }), upload: async (...args) => { calls.push(args); return pending.promise; } };
  const app = await mount(context, { images, caseId, api }); assert.equal(calls.length, 0);
  const first = app.button('Save this original');
  await React.act(async () => { first.click(); first.click(); await tick(); });
  await app.wait(() => calls.length === 1);
  assert.doesNotMatch(app.host.textContent, /Original saved to/); assert.equal(app.host.querySelectorAll('a').length, 0);
  assert.equal(calls[0][1], images[0].originalFile); assert.deepEqual(app.busy, [true]);
  await React.act(async () => pending.resolve({ asset })); await app.flush();
  assert.match(app.host.textContent, /Original saved to this case/); assert.equal(calls.length, 1);
  assert.ok(app.button('Save this original'), 'Unselected image remains unsaved');
  assert.deepEqual(app.busy, [true, false]);
  assert.deepEqual([...app.host.querySelectorAll('a')].map(a => a.getAttribute('href')), [`/api/assets/${asset.id}/preview`, `/api/assets/${asset.id}/download`]);
});

test('an ambiguous failed response only checks status and adopts an actually saved matching asset', async context => {
  const image = makeImage(), caseId = randomUUID(), asset = await saved(image, caseId); let writes = 0, reads = 0;
  const api = { get: async () => ({ assets: ++reads > 1 ? [asset] : [], total: reads > 1 ? 1 : 0 }), upload: async () => { writes++; throw Object.assign(new Error(), { code: 'NETWORK_ERROR' }); } };
  const app = await mount(context, { images: [image], caseId, api });
  await app.click(app.button('Save this original')); await app.wait(() => Boolean(app.button('Check saved status')));
  assert.match(app.host.textContent, /server may have saved/); assert.doesNotMatch(app.host.textContent, /Original saved to/);
  await app.click(app.button('Check saved status')); await app.wait(() => app.host.textContent.includes('Original saved to'));
  assert.equal(writes, 1); assert.equal(reads, 2);
});

test('uncertain save with no matching copy remains uncertain and never retries POST', async context => {
  let writes = 0;
  const api = { get: async () => ({ assets: [], total: 0 }), upload: async () => { writes++; throw Object.assign(new Error(), { code: 'NETWORK_ERROR' }); } };
  const app = await mount(context, { api });
  await app.click(app.button('Save this original')); await app.wait(() => Boolean(app.button('Check saved status')));
  await app.click(app.button('Check saved status')); await app.wait(() => app.host.textContent.includes('No confirmed copy'));
  await app.click(app.button('Check saved status')); await app.wait(() => Boolean(app.button('Check saved status')));
  assert.equal(writes, 1); assert.doesNotMatch(app.host.textContent, /Original saved to/);
});

test('definite rejection can be retried explicitly and does not claim a save', async context => {
  const image = makeImage(), caseId = randomUUID(), asset = await saved(image, caseId); let writes = 0;
  const api = { get: async () => ({ assets: [], total: 0 }), upload: async () => { if (++writes === 1) throw Object.assign(new Error(), { code: 'ASSET_QUOTA_EXCEEDED', status: 409 }); return { asset }; } };
  const app = await mount(context, { images: [image], caseId, api });
  await app.click(app.button('Save this original')); await app.wait(() => Boolean(app.button('Retry saving')));
  assert.match(app.host.textContent, /storage is full/); assert.doesNotMatch(app.host.textContent, /Original saved to/);
  await app.click(app.button('Retry saving')); await app.wait(() => app.host.textContent.includes('Original saved to')); assert.equal(writes, 2);
});

test('cancel after POST is uncertain; an existing matching original never triggers a POST', async context => {
  let writes = 0;
  const api = { get: async () => ({ assets: [], total: 0 }), upload: async (path, file, { signal }) => { writes++; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })); } };
  const app = await mount(context, { api }); await app.click(app.button('Save this original')); await app.wait(() => writes === 1);
  await app.click(app.button('Stop waiting')); await app.wait(() => Boolean(app.button('Check saved status')));
  assert.match(app.host.textContent, /server may have saved/); assert.deepEqual(app.busy, [true, false]);
  const image = makeImage(), caseId = randomUUID(), asset = await saved(image, caseId);
  const second = await mount(context, { images: [image], caseId, api: { get: async () => ({ assets: [asset], total: 1 }), upload: async () => { throw new Error('Must not duplicate'); } } });
  await second.click(second.button('Save this original')); await second.wait(() => second.host.textContent.includes('Original saved to')); assert.equal(writes, 1);
});

test('same-workspace case creation is adopted once, while case/account switches discard late results', async context => {
  const image = makeImage(), caseId = randomUUID(), asset = await saved(image, caseId); const paths = []; let ensureCount = 0;
  const api = { get: async path => { paths.push(path); return { assets: [], total: 0 }; }, upload: async path => { paths.push(path); return { asset }; } };
  const binding = deferred();
  const app = await mount(context, { api, images: [image], caseId: null, ensureCase: async () => { ensureCount++; return binding.promise; } });
  await app.click(app.button('Save this original')); await app.wait(() => ensureCount === 1);
  await app.render({ caseId }); await React.act(async () => binding.resolve({ caseId, userId: app.props().userId }));
  await app.wait(() => app.host.textContent.includes('Original saved to'));
  assert.equal(ensureCount, 1); assert.ok(paths.every(path => path.includes(`caseId=${caseId}`)));
  for (const change of [{ caseId: randomUUID() }, { userId: randomUUID() }, { authenticated: false }]) {
    const pending = deferred(), oldCase = randomUUID(), nextImage = makeImage(), oldAsset = await saved(nextImage, oldCase); let wrote = false;
    const other = await mount(context, { images: [nextImage], caseId: oldCase, api: { get: async () => ({ assets: [], total: 0 }), upload: async () => { wrote = true; return pending.promise; } } });
    await other.click(other.button('Save this original')); await other.wait(() => wrote); await other.render(change);
    await React.act(async () => pending.resolve({ asset: oldAsset })); await other.flush();
    assert.doesNotMatch(other.host.textContent, /Original saved to/); assert.equal(other.host.querySelectorAll('a').length, 0);
    assert.equal(other.busy.at(-1), false);
  }
});

test('leaving an unsaved case during case creation prevents any original upload', async context => {
  const pending = deferred(); let writes = 0;
  const app = await mount(context, { caseId: null, ensureCase: () => pending.promise, api: { get: async () => ({ assets: [], total: 0 }), upload: async () => { writes++; } } });
  await app.click(app.button('Save this original'));
  await app.render({ caseId: randomUUID() });
  await React.act(async () => pending.resolve({ caseId: randomUUID(), userId: app.props().userId })); await app.flush();
  assert.equal(writes, 0); assert.doesNotMatch(app.host.textContent, /Original saved to/);
});
