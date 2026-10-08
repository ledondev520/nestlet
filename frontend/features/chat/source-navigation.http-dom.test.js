// Real authentication, reads, ownership, SQLite, originals and App navigation.
// Source envelopes/SSE are controlled fixtures; no provider or real-browser claim.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { startBrowserFixture } from '../../../test/helpers/browser-fixture.mjs';
import { createApiClient } from '../../lib/api.js';
import { newCasePayload } from './logic.js';
import { inspectSource, sourceCase, sourceFromEnvelope } from './source-navigation.js';

const realFetch = globalThis.fetch;
const globals = new Map();
let fixture, dom, vite, React, createRoot, ChatSourceNavigation, ChatLookup, App, SessionProvider, root, host, owner, other;
const source = (kind, record, sourceId = 'S1') => ({ sourceId, kind, id: record.id, version: record.version,
  title: record.title || record.displayName || record.originalFilename, titleTruncated: false, retrievalState: 'metadata',
  ...(record.caseId ? { caseId: record.caseId } : {}), ...(record.clientId ? { clientId: record.clientId } : {}) });
const envelope = items => ({ requestId: randomUUID(), items });
const setGlobal = (key, value) => { if (!globals.has(key)) globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
const delay = () => new Promise(resolve => setTimeout(resolve, 10));
async function session(username) {
  const response = await realFetch(fixture.origin + '/api/login', { method: 'POST', headers: { Origin: fixture.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'Case26' }) });
  assert.equal(response.status, 200);
  const status = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0], calls = [];
  const transport = async (path, options = {}) => {
    const result = await realFetch(fixture.origin + path, { ...options, headers: { ...options.headers, Origin: fixture.origin, Cookie: cookie } });
    calls.push({ path, method: options.method || 'GET', status: result.status }); return result;
  };
  return { ...status, cookie, calls, transport, api: createApiClient({ fetchImpl: transport, getCsrfToken: () => status.csrfToken }) };
}
before(async () => {
  fixture = await startBrowserFixture({ legacyUsers: ['synthetic-source-owner', 'synthetic-source-other'] });
  owner = await session('synthetic-source-owner'); other = await session('synthetic-source-other');
  dom = new JSDOM('<!doctype html><body></body>', { url: fixture.origin, pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'Event', 'MouseEvent']) setGlobal(key, dom.window[key]);
  setGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window)); setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  React = await import('react'); ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error' });
  ({ ChatSourceNavigation } = await vite.ssrLoadModule('/features/chat/source-navigation.jsx'));
  ({ ChatLookup } = await vite.ssrLoadModule('/features/chat/lookup.jsx'));
  ({ default: App } = await vite.ssrLoadModule('/App.jsx')); ({ SessionProvider } = await vite.ssrLoadModule('/lib/session.jsx'));
});
after(async () => {
  if (root) await React.act(async () => root.unmount()); await vite?.close(); dom?.window.close(); await fixture?.stop();
  for (const [key, value] of globals) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
});
async function render(element) {
  if (root) { await React.act(async () => root.unmount()); host.remove(); }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await React.act(async () => root.render(element));
}
const flush = () => React.act(delay);
async function wait(predicate, label = 'Expected UI state') {
  for (const end = Date.now() + 6000; !predicate();) { if (Date.now() > end) throw new Error(`${label}: ${host.textContent}`); await flush(); }
}
const visible = node => !node.closest('[hidden]');
const button = (label, scope = host) => [...scope.querySelectorAll('button')].find(node => visible(node) && (node.textContent.trim() === label || node.getAttribute('aria-label') === label));
async function click(node) { assert.ok(node, 'Expected control'); assert.equal(node.disabled, false); await React.act(async () => node.click()); await flush(); }
async function fill(node, value) {
  assert.ok(node); await React.act(async () => { const proto = node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value); node.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); await flush();
}
const input = label => { const node = [...host.querySelectorAll('label')].find(node => visible(node) && node.textContent === label); return node && document.getElementById(node.htmlFor); };
const mountSources = props => render(React.createElement(ChatSourceNavigation, { api: owner.api, userId: owner.userId, caseId: null, lang: 'en', ...props }));
const createCase = async (title, clientId = null) => (await owner.api.post('/api/cases', { ...newCasePayload(title), clientId })).case;
const gate = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: () => resolve(), reached: false }; };

test('real HTTP source reads require exact envelope membership/version and account ownership; customer choices stay explicit', async () => {
  const client = (await owner.api.post('/api/clients', { displayName: 'Synthetic source customer' })).client;
  const a = await createCase('Synthetic same title', client.id), b = await createCase('Synthetic same title', client.id);
  const sources = envelope([source('client', client)]), opened = [];
  await mountSources({ sources, onOpenSourceCase: value => { opened.push(value); return true; } });
  assert.equal(opened.length, 0); await click(button('Choose a customer case'));
  await wait(() => host.textContent.includes(a.id) && host.textContent.includes(b.id));
  assert.equal(opened.length, 0, 'Inspection must not adopt the first matching case');
  await click(button(`Open case: ${b.title} · ${b.id}`)); await wait(() => opened.length === 1);
  assert.equal(opened[0].targetCaseId, b.id); assert.equal(opened[0].caseId, null);
  assert.throws(() => sourceFromEnvelope(sources, 'S2'));
  const before = owner.calls.length;
  await assert.rejects(inspectSource(owner.api, envelope([{ ...source('case', a), id: 'javascript:alert(1)' }]), 'S1'));
  assert.equal(owner.calls.length, before, 'Malformed IDs fail before network access');
  await assert.rejects(inspectSource(other.api, envelope([source('case', a)]), 'S1'), { status: 404 });
  const current = await owner.api.get(`/api/cases/${a.id}`);
  await owner.api.put(`/api/cases/${a.id}`, { ...newCasePayload('Synthetic changed title'), clientId: client.id, expectedVersion: current.case.version });
  await assert.rejects(inspectSource(owner.api, envelope([source('case', a)]), 'S1'), { code: 'SOURCE_CHANGED' });
  await assert.rejects(sourceCase(owner.api, { source: source('client', client), cases: [a] }, a.id), { code: 'SOURCE_CHANGED' });
  await assert.rejects(inspectSource(owner.api, envelope([source('case', { ...a, id: randomUUID() })]), 'S1'), { status: 404 });
});

test('verified originals reuse private URLs and exact bytes; saved documents render only as text and preserve stale warnings', async () => {
  const record = await createCase('Synthetic original case');
  const bytes = new TextEncoder().encode('Synthetic source original <img src=x onerror=alert(1)>');
  const asset = (await owner.api.upload(`/api/assets?caseId=${record.id}`, bytes, { contentType: 'text/plain', filename: 'Synthetic original.txt', assetConsent: true })).asset;
  const sources = envelope([{ ...source('asset', asset), url: 'https://untrusted.invalid/private' }]);
  await mountSources({ sources }); await click(button('Inspect source')); await wait(() => host.querySelector('a[href]'));
  const links = [...host.querySelectorAll('a')];
  assert.deepEqual(links.map(node => node.getAttribute('href')), [`/api/assets/${asset.id}/preview`, `/api/assets/${asset.id}/download`]);
  assert.equal(links[0].target, '_blank'); assert.equal(links[0].rel, 'noopener noreferrer');
  for (const link of links) {
    const response = await owner.transport(link.getAttribute('href')); assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    assert.equal((await other.transport(link.getAttribute('href'))).status, 404);
  }
  const artifact = (await owner.api.post(`/api/cases/${record.id}/artifacts`, { kind: 'followup', status: 'draft', title: 'Synthetic saved draft', content: '<img src=x onerror=alert(1)>\nSynthetic text', expectedCaseVersion: record.version })).artifact;
  await owner.api.put(`/api/cases/${record.id}`, { ...newCasePayload(record.title), sourceText: 'Changed material', expectedVersion: record.version });
  await mountSources({ sources: envelope([source('artifact', artifact)]), onOpenSourceCase: () => true });
  await click(button('Inspect source')); await wait(() => host.querySelector('pre'));
  assert.equal(host.querySelector('pre').textContent, artifact.content); assert.equal(host.querySelector('img'), null);
  assert.match(host.textContent, /Historical version; review again/); assert.ok(button('Open case documents'));
  assert.equal(owner.calls.some(call => call.path === '/api/chat' || call.path === '/api/extract'), false);
  const moved = await createCase('Synthetic asset new case');
  await owner.api.patch(`/api/assets/${asset.id}`, { caseId: moved.id, expectedVersion: asset.version });
  await mountSources({ sources }); await click(button('Inspect source'));
  await wait(() => host.textContent.includes('source version or case association changed'));
  assert.equal(host.querySelector('a[href]'), null, 'Moved originals cannot retain stale source links');
});

test('cancellation, repeated clicks, inactive view and account/case changes suppress delayed source navigation; 403 remains visible', async () => {
  const record = await createCase('Synthetic delayed source'), sources = envelope([source('case', record)]);
  let held = gate(), reads = 0, opened = 0, claims = 0, releases = 0;
  const api = { get: async (...args) => { reads++; const response = await owner.api.get(...args); held.reached = true; await held.promise; return response; } };
  const props = { api, sources, userId: owner.userId, caseId: null, lang: 'en', onOpenSourceCase: () => { opened++; return true; }, claimOperation: () => ++claims, releaseOperation: () => releases++ };
  await mountSources(props);
  await React.act(async () => { button('Open case').click(); button('Open case').click(); }); await wait(() => held.reached);
  assert.equal(reads, 1); await click(button('Cancel source action')); await React.act(async () => held.resolve()); await flush(); assert.equal(opened, 0); assert.equal(releases, 1);
  for (const changed of [{ active: false }, { caseId: randomUUID() }, { userId: other.userId }, { disabled: true }]) {
    held = gate(); await React.act(async () => root.render(React.createElement(ChatSourceNavigation, props)));
    await click(button('Open case')); await wait(() => held.reached);
    await React.act(async () => root.render(React.createElement(ChatSourceNavigation, { ...props, ...changed })));
    await React.act(async () => held.resolve()); await flush(); assert.equal(opened, 0);
  }
  // Controlled transport error is explicitly distinct from the real 404 above.
  await mountSources({ sources, api: { get: async () => { throw { status: 403, message: 'Do not render server prose' }; } }, onOpenSourceCase: () => { opened++; } });
  await click(button('Open case')); await wait(() => host.textContent.includes('unavailable to this account'));
  assert.doesNotMatch(host.textContent, /Do not render server prose/); assert.equal(opened, 0);
  await mountSources({ sources: envelope([source('case', { ...record, id: randomUUID() })]), onOpenSourceCase: () => { opened++; } });
  await click(button('Open case')); await wait(() => host.textContent.includes('unavailable to this account'));
  assert.equal(opened, 0, 'A real 404 never changes the selected case');
  await mountSources({ sources, lang: 'zh', onOpenSourceCase: () => true }); assert.ok(button('打开案例'));
  assert.match(host.textContent, /本次引用来源/);
});

test('actual App source selection keeps unsaved chat/material/document edits on decline and changes the visible case only after approval', { timeout: 30000 }, async () => {
  const first = await createCase('Synthetic active source case'), second = await createCase('Synthetic selected source case');
  const document = (await owner.api.post(`/api/cases/${first.id}/artifacts`, { kind: 'followup', status: 'draft', title: 'Synthetic editable draft', content: 'Synthetic saved document.', expectedCaseVersion: first.version })).artifact;
  const sources = envelope([source('case', second), source('artifact', document, 'S2')]);
  let streamGate = null, chatRequests = 0;
  setGlobal('fetch', async (path, options = {}) => {
    if (path === '/api/chat') {
      chatRequests++;
      const frame = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
      const chunks = frame('delta', { text: `Found case ${second.id}. https://untrusted.invalid is plain text.` }) + frame('sources', { ...sources, appendix: '\n[S1] Synthetic source fixture.' });
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode(chunks));
        const end = () => { controller.enqueue(new TextEncoder().encode(frame('done', { requestId: sources.requestId, assistantMessageId: randomUUID() }))); controller.close(); };
        if (streamGate) { streamGate.reached = true; streamGate.promise.then(end); } else end();
      } }), { headers: { 'Content-Type': 'text/event-stream', 'X-Library-Retrieval': 'enabled' } });
    }
    const response = await owner.transport(path, options);
    if (path === '/api/status') return new Response(JSON.stringify({ ...await response.json(), liveEnabled: true, libraryRetrievalEnabled: true }), { headers: { 'Content-Type': 'application/json' } });
    return response;
  });
  dom.window.history.replaceState({}, '', fixture.origin + '/#chat');
  const { draftVault } = await vite.ssrLoadModule('/lib/draft-vault.js');
  draftVault.verifyUser(owner.userId); draftVault.write({ userId: owner.userId, workspaceKey: 'active', feature: 'workspace' }, { caseId: first.id, view: 'chat', workspaceKey: randomUUID() });
  let confirmations = 0, approve = false; dom.window.confirm = () => { confirmations++; return approve; };
  await render(React.createElement(SessionProvider, null, React.createElement(App)));
  await wait(() => button('Switch interface to English')); await click(button('Switch interface to English'));
  await wait(() => host.querySelector('.chat-toolbar [data-slot="card-title"]')?.textContent==='Conversation' && !button('New conversation').disabled);
  const nav = label => click(button(label, host.querySelector('nav[aria-label="Workspace navigation"]')));
  await nav('Documents'); await wait(() => host.querySelector(`[data-artifact-id="${document.id}"]`));
  await wait(() => input('English document body')?.value === document.content || !button('Open', host.querySelector(`[data-artifact-id="${document.id}"]`)).disabled);
  if (input('English document body')?.value !== document.content) await click(button('Open', host.querySelector(`[data-artifact-id="${document.id}"]`)));
  await wait(() => input('English document body')?.value === document.content);
  await fill(input('English document body'), 'Unsaved synthetic document edit');
  await nav('Materials & facts'); await wait(() => input('Case source text')); await fill(input('Case source text'), 'Unsaved synthetic materials');
  await nav('Conversation'); await fill(host.querySelector('.chat-input'), 'Find the other synthetic case');
  const permission=await owner.api.get('/api/library-permission');
  await owner.api.put('/api/library-permission',{decision:'allow',expectedVersion:permission.version,provider:permission.provider,policyVersion:permission.policyVersion,category:permission.category});
  streamGate = gate(); await click(button('Send')); await wait(() => streamGate.reached && host.querySelector('[data-source-id="S1"]'));
  assert.equal(button('Open case', host.querySelector('[data-source-id="S1"]')).disabled, true, 'Navigation is disabled until the stream finishes');
  await React.act(async () => streamGate.resolve()); await wait(() => !button('Open case', host.querySelector('[data-source-id="S1"]')).disabled);
  await fill(host.querySelector('.chat-input'), 'Unsent next question');
  await click(button('Inspect source', host.querySelector('[data-source-id="S2"]')));
  await wait(() => host.querySelector('[data-source-id="S2"] pre'));
  assert.equal(host.querySelector('[data-source-id="S2"] pre').textContent, document.content);
  const proseLink = host.querySelector('a[href="https://untrusted.invalid"]');
  assert.equal(proseLink?.getAttribute('rel'), 'noopener noreferrer', 'Markdown web links are isolated external links, never source-navigation actions');
  assert.equal(proseLink?.getAttribute('target'), '_blank');
  await click(button('Open case documents', host.querySelector('[data-source-id="S2"]')));
  await wait(() => window.location.hash === '#intake');
  assert.equal(input('Case source text').value, 'Unsaved synthetic materials', 'Same-case document continuation finishes pending material first');
  await nav('Documents'); assert.equal(input('English document body').value, 'Unsaved synthetic document edit');
  await nav('Conversation');
  const caseReads = owner.calls.filter(call => call.path === `/api/cases/${second.id}`).length;
  await click(button('Open case', host.querySelector('[data-source-id="S1"]'))); await wait(() => host.textContent.includes('Your unsaved work was kept'));
  assert.equal(confirmations, 1); assert.equal(host.querySelector('.chat-input').value, 'Unsent next question');
  assert.equal((await owner.api.get('/api/conversations/'+host.querySelector('.chat-toolbar select').value)).conversation.caseId,first.id);
  assert.ok(owner.calls.filter(call => call.path === `/api/cases/${second.id}`).length > caseReads, 'Fresh API validation precedes navigation');
  await nav('Materials & facts'); assert.equal(input('Case source text').value, 'Unsaved synthetic materials');
  await nav('Documents'); assert.equal(input('English document body').value, 'Unsaved synthetic document edit');
  await nav('Conversation'); approve = true; await click(button('Open case', host.querySelector('[data-source-id="S1"]')));
  await wait(() => host.querySelector('.chat-toolbar [data-slot="card-title"]')?.textContent==='Conversation' && !host.querySelector('.chat-toolbar select').value);
  assert.equal(confirmations, 2); assert.equal(host.querySelector('.chat-input').value, '');
  await nav('Materials & facts'); await wait(() => input('Case name')?.value === second.title); assert.equal(input('Case source text').value, '');
  assert.equal((await owner.api.get(`/api/cases/${first.id}`)).case.sourceText, '', 'Navigation never saves or mutates facts');
  assert.equal((await owner.api.get(`/api/artifacts/${document.id}`)).artifact.content, document.content, 'Navigation never overwrites the saved draft');
  assert.equal(chatRequests, 1, 'One controlled SSE fixture; no provider request');
  assert.equal(owner.calls.some(call => call.path === '/api/chat' || call.path === '/api/extract'), false);
});


test('read-only lookup handles exact customer/case results, empty search and cancelled delayed reads without creating records', async () => {
  const client = (await owner.api.post('/api/clients', { displayName: 'Synthetic unique lookup' })).client;
  const record = await createCase('Synthetic unique lookup case', client.id);
  const callsStart = owner.calls.length, opened = [];
  const props = { api: owner.api, userId: owner.userId, caseId: null, lang: 'en', active: true, disabled: false, onOpenSourceCase: value => opened.push(value) };
  await render(React.createElement(ChatLookup, props));
  await fill(input('Customer name or case title'), 'Synthetic unique lookup');
  await click(button('Find saved records'));
  await wait(() => host.querySelectorAll('[data-source-id]').length === 2);
  assert.equal(opened.length, 0);
  await click(button('Choose a customer case'));
  await wait(() => button(`Open case: ${record.title} · ${record.id}`));
  await click(button(`Open case: ${record.title} · ${record.id}`));
  await wait(() => opened.length === 1); assert.equal(opened[0].targetCaseId, record.id);
  await fill(input('Customer name or case title'), 'No such synthetic lookup');
  await click(button('Find saved records')); await wait(() => host.textContent.includes('No matching saved'));
  assert.equal(owner.calls.slice(callsStart).every(call => call.method === 'GET'), true);
  const held = gate();
  const api = { get: async (...args) => { const value = await owner.api.get(...args); held.reached = true; await held.promise; return value; } };
  await render(React.createElement(ChatLookup, { ...props, api }));
  await fill(input('Customer name or case title'), 'Synthetic unique lookup');
  await click(button('Find saved records')); await wait(() => held.reached);
  await click(button('Cancel lookup')); await React.act(async () => held.resolve()); await flush();
  assert.equal(host.querySelector('[data-source-id]'), null);
  assert.equal(button('Find saved records').disabled, false);
});

test('empty actual App finds and selects an existing case without provider configuration or creating a lookup-only case', async () => {
  const client = (await owner.api.post('/api/clients', { displayName: 'Synthetic App lookup' })).client;
  const record = await createCase('Synthetic App exact selected case', client.id);
  const { draftVault } = await vite.ssrLoadModule('/lib/draft-vault.js');
  draftVault.clear();
  setGlobal('fetch', owner.transport);
  dom.window.history.replaceState({}, '', fixture.origin + '/#chat');
  await render(React.createElement(SessionProvider, null, React.createElement(App)));
  await wait(() => input('Customer name or case title') || button('Switch interface to English'));
  if (!input('Customer name or case title')) await click(button('Switch interface to English'));
  await wait(() => input('Customer name or case title') && !button('New conversation').disabled);
  const callsStart = owner.calls.length;
  await fill(input('Customer name or case title'), 'Synthetic App lookup');
  await click(button('Find saved records')); await wait(() => button('Choose a customer case'));
  await click(button('Choose a customer case')); await wait(() => button(`Open case: ${record.title} · ${record.id}`));
  await click(button(`Open case: ${record.title} · ${record.id}`));
  await wait(() => owner.calls.slice(callsStart).some(call=>call.path===`/api/cases/${record.id}/conversations`) && !button('New conversation',host.querySelector('.chat-toolbar')).disabled);
  assert.equal(owner.calls.slice(callsStart).some(call => call.method !== 'GET' && ['/api/cases', '/api/chat', '/api/extract'].includes(call.path)), false);
  await click(button('Materials & facts', host.querySelector('nav[aria-label="Workspace navigation"]')));
  await wait(() => input('Case name')?.value === record.title);
  assert.equal(input('Case source text').value, '');
});
