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

test('Chinese recent-case guidance and totals keep the complete information on separate lines', async () => {
  await render(apiFor(), { lang: 'zh' });
  await click(button('最近十项'));
  const hint = [...container.querySelectorAll('p')].find(item => item.textContent.startsWith('显示搜索结果中最近更新的10项。'));
  assert.equal(hint?.textContent, '显示搜索结果中最近更新的10项。\n其余记录请选「全部事项」查看。');
  assert.ok(hint.classList.contains('whitespace-pre-line'));
  const totals = container.querySelector('p[role="status"]');
  assert.equal(totals.textContent, '本页 2 项\n当前范围 2 项\n账号共 2 项');
  assert.ok(totals.classList.contains('whitespace-pre-line'));
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
  failed = false; await click(button('刷新列表')); assert.match(content(), /暂无事项/);
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


test('existing case management exposes assignment and explicit deletion scope without writing on open', async () => {
  const api = apiFor(path => path === '/api/cases' ? {cases:[unassigned]} : path.startsWith('/api/clients') ? {clients:[]} : {case:{...unassigned,version:1,sourceText:'',fields:[],draftType:'followup',draftText:''}});
  await render(api);
  await click(button('Manage case: Synthetic unassigned intake'));
  assert.match(content(), /Customer/);
  assert.match(content(), /Saved original files remain/);
  assert.ok(button('Save changes'));
  assert.ok(button('Delete case'));
});

test('case edits preserve canonical content and version; a conflict stops retries until reloaded', async () => {
  const customerId=linked.clientId,writes=[];
  let conflict=true;
  const canonical={...unassigned,version:7,sourceText:'Keep this source',fields:[{key:'property',value:'Synthetic property',confirmed:true,source:'Synthetic source',conflict:false}],draftType:'followup',draftText:'Keep this draft',documentContext:{senderName:{value:'Synthetic sender',confirmed:true}},caseIssues:[{id:'keep'}]};
  const api=apiFor(path=>path==='/api/cases'?{cases:[canonical]}:path.startsWith('/api/clients')?{clients:[{id:customerId,displayName:'Synthetic customer'}]}:{case:canonical});
  api.put=async(path,body)=>{writes.push({path,body});if(conflict)throw {code:'CASE_CONFLICT',status:409};return {case:{...canonical,...body,version:8}};};
  await render(api);await click(button(`Manage case: ${canonical.title}`));
  const select=container.querySelector('select');await React.act(async()=>{select.value=customerId;select.dispatchEvent(new Event('change',{bubbles:true}));});
  await React.act(async()=>{button('Save changes').click();button('Save changes').click();});await tick();
  assert.equal(writes.length,1);assert.equal(writes[0].body.expectedVersion,7);assert.equal(writes[0].body.clientId,customerId);
  assert.equal(writes[0].body.sourceText,canonical.sourceText);assert.deepEqual(writes[0].body.fields,canonical.fields);assert.equal(writes[0].body.draftText,canonical.draftText);
  assert.equal(Object.hasOwn(writes[0].body,'documentContext'),false);assert.equal(Object.hasOwn(writes[0].body,'caseIssues'),false);
  assert.match(content(),/changed elsewhere/);assert.equal(button('Save changes').disabled,true);
  conflict=false;await click(button('Reload case'));assert.equal(button('Save changes').disabled,false);
});

test('delete requires a separate confirmation, uses the reviewed version and locks repeated clicks', async () => {
 const canonical={...unassigned,version:3},gate=deferred(),deleted=[];
 const api=apiFor(path=>path==='/api/cases'?{cases:[canonical]}:path.startsWith('/api/clients')?{clients:[]}:{case:canonical});
 api.delete=async(path,body)=>{deleted.push({path,body});return gate.promise;};
 await render(api);await click(button(`Manage case: ${canonical.title}`));
 await click(button('Delete case'));assert.equal(deleted.length,0);
 await React.act(async()=>{button('Confirm deletion').click();button('Confirm deletion').click();});
 assert.deepEqual(deleted,[{path:`/api/cases/${canonical.id}`,body:{expectedVersion:3}}]);
 await React.act(async()=>gate.resolve({deleted:true}));await tick();assert.match(content(),/Case deleted/);
});
