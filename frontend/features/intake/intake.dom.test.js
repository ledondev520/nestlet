// Actual React/official shadcn DOM with controlled APIs. No browser/CSP or paid-provider claim.
import { after, before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { caseWork, extract, recoverySnapshot } from './logic.js';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444', workspaceKey = '55555555-5555-4555-8555-555555555555';
const status = { authenticated: true, userId, liveEnabled: true, pdfEnabled: true, workbookEnabled: true };
const blank = (extra = {}) => ({ ...caseWork(), id: A, version: 1, title: 'Synthetic case', ...extra });
const asset = (extra = {}) => ({ id: C, originalFilename: 'Synthetic.txt', version: 1, caseId: null, clientId: null, mimeType: 'text/plain', textStatus: 'ready', textTruncated: false, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let vite, dom, React, createRoot, IntakeWorkspace, DraftWorkspaceProvider, draftVault, host, root;
const text = () => host.textContent;
const button = label => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === label || element.getAttribute('aria-label') === label);
const labeled = label => { const element = [...host.querySelectorAll('label')].find(item => item.textContent === label); return element && document.getElementById(element.htmlFor); };
const field = key => host.querySelector(`[id$="-${key}"]`);
async function tick() { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
async function click(element) { assert.ok(element, 'Requested button exists'); await React.act(async () => element.click()); await tick(); }
async function change(element, value) {
  assert.ok(element, 'Requested input exists');
  await React.act(async () => { const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
async function choose(files) { await React.act(async () => { const input = host.querySelector('input[type=file]'); Object.defineProperty(input, 'files', { value: files, configurable: true }); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); }
function apiFor(handler = () => undefined) {
  const calls = [];
  async function request(method, path, body, options = {}) {
    calls.push({ method, path, body, ...options }); const result = handler(calls.at(-1)); if (result !== undefined) return result;
    if (path.startsWith('/api/assets?')) return { assets: [] };
    if (path === '/api/cases/' + A) return { case: blank() };
    if (path === '/api/cases/' + B) return { case: blank({ id: B, title: 'Second synthetic case' }) };
    if (path === '/api/assets' && method === 'UPLOAD') return { asset: asset() };
    if (path === '/api/assets/' + C + '/text') return { asset: asset(), text: 'Property: Synthetic Lane' };
    if (path === '/api/assets/' + C && method === 'PATCH') return { asset: asset({ caseId: body.caseId, version: 2 }) };
    if (path === '/api/cases' && method === 'POST') return { case: blank({ ...body }) };
    throw new Error('Unexpected request: ' + method + ' ' + path);
  }
  return { calls, get: (path, options) => request('GET', path, undefined, options), post: (path, body, options) => request('POST', path, body, options), put: (path, body, options) => request('PUT', path, body, options), patch: (path, body, options) => request('PATCH', path, body, options), upload: (path, body, options) => request('UPLOAD', path, body, options) };
}
async function render(api, props = {}, provider = false) {
  let component = React.createElement(IntakeWorkspace, { api, status, lang: 'en', ...props });
  if (provider) component = React.createElement(DraftWorkspaceProvider, { userId, workspaceKey }, component);
  if (provider === 'strict') component = React.createElement(React.StrictMode, null, component);
  await React.act(async () => root.render(component)); await tick();
}
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fixture.invalid/next/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'HTMLInputElement', 'HTMLTextAreaElement', 'Node', 'MutationObserver', 'Event', 'MouseEvent']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import('react'); ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true }, appType: 'custom' });
  ({ IntakeWorkspace } = await vite.ssrLoadModule('/features/intake/workspace.jsx'));
  ({ DraftWorkspaceProvider } = await vite.ssrLoadModule('/lib/suspended-draft.jsx'));
  ({ draftVault } = await vite.ssrLoadModule('/lib/draft-vault.js'));
});
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); draftVault.clear(); });
afterEach(async () => { await React.act(async () => root.unmount()); host.remove(); });
after(async () => { await vite?.close(); dom?.window.close(); });

test('empty bilingual intake uses official shadcn primitives and has no fabricated content', async () => {
  const api = apiFor(); await render(api); assert.equal(api.calls.length, 0); assert.equal(labeled('Case source text').value, ''); assert.match(text(), /0 \/ 5 Reviewed/); assert.equal(host.querySelectorAll('[data-slot=checkbox]').length, 6); assert.ok(host.querySelector('[data-slot=card]')); assert.doesNotMatch(text(), /128 Example|DEMO-104/);
  await render(api, { lang: 'zh' }); assert.match(text(), /让每个事实，都有出处/); assert.match(text(), /保存到私有档案并处理/);
});
test('private TXT save is explicit, appends stored text, preserves reviewed evidence, and never calls AI', async () => {
  const api = apiFor(({ method, path }) => method === 'UPLOAD' ? { asset: asset({ caseId: A }) } : path === '/api/cases/' + A ? { case: blank({ sourceText: 'Earlier text', fields: extract('Owner: Reviewed owner').map(field => ({ ...field, confirmed: true })) }) } : undefined);
  await render(api, { caseId: A }); await choose([new File(['Property: Synthetic Lane'], 'Synthetic.txt', { type: 'text/plain' })]); assert.equal(api.calls.filter(call => call.method === 'UPLOAD').length, 0);
  await click(button('Save privately and process')); const upload = api.calls.find(call => call.method === 'UPLOAD'); assert.equal(upload.path, '/api/assets?caseId=' + A); assert.equal(upload.assetConsent, true); assert.equal(upload.contentType, 'text/plain'); assert.equal(upload.filename, 'Synthetic.txt'); assert.equal(labeled('Case source text').value, 'Earlier text\n\nProperty: Synthetic Lane'); assert.equal(field('owner').value, 'Reviewed owner'); assert.equal(host.querySelector('[id$="-owner-confirm"]').getAttribute('data-state'), 'checked'); assert.equal(api.calls.filter(call => call.path === '/api/extract').length, 0); assert.equal(window.localStorage.length, 0);
});
test('CSV uses real UTF-8 original bytes after private save instead of tab-normalized search index', async () => {
  const api = apiFor(); await render(api); await choose([new File(['property,owner,pha,caseReference,rent\nSynthetic Lane,Example LLC,,REF,$2100'], 'Synthetic.csv', { type: 'text/csv' })]); await click(button('Save privately and process'));
  assert.match(labeled('Case source text').value, /Property: Synthetic Lane/); assert.equal(api.calls.filter(call => call.path.endsWith('/text')).length, 0); assert.match(text(), /Original saved/);
});
test('saved image and scanned PDF honestly show unavailable OCR without changing source', async () => {
  for (const name of ['Synthetic.png', 'Synthetic.pdf']) {
    const api = apiFor(({ method }) => method === 'UPLOAD' ? { asset: asset({ originalFilename: name, textStatus: 'unavailable' }) } : undefined);
    await render(api); await choose([new File(['synthetic fixture bytes'], name)]); await click(button('Save privately and process')); assert.match(text(), /no usable text/); assert.equal(labeled('Case source text').value, ''); assert.equal(api.calls.filter(call => call.path.endsWith('/text')).length, 0);
  }
});
test('saved truncated text is visible but never silently appended', async () => {
  const api = apiFor(({ method, path }) => method === 'UPLOAD' ? { asset: asset({ textTruncated: true }) } : path.endsWith('/text') ? { asset: asset({ textTruncated: true }), text: 'Incomplete' } : undefined);
  await render(api); await choose([new File(['large original fixture'], 'Synthetic.txt')]); await click(button('Save privately and process')); assert.match(text(), /indexed text is truncated/); assert.equal(labeled('Case source text').value, ''); assert.ok(host.querySelector('a[href$="/download"]'));
});
test('Excel requires actual selected-row mapping and rejects blocked cells before adding source', async () => {
  const workbook = { sheets: [{ name: 'Synthetic sheet', hidden: false, rows: [['Property', 'Owner', 'Rent'], ['Synthetic Lane', 'Example LLC', '$2100']], blockedCells: [{ row: 1, column: 1, reason: 'formula' }], truncated: false }] };
  const api = apiFor(({ path }) => path === '/api/workbook' ? workbook : undefined); await render(api); await choose([new File(['not a real workbook; parser double only'], 'Synthetic.xlsx')]); await click(button('Save privately and process'));
  assert.match(text(), /Choose one worksheet and row/); assert.equal(labeled('Case source text').value, ''); const propertyMap = labeled('Property address · Mapped column'); assert.equal([...propertyMap.options].find(option => option.value === '1').disabled, true); await change(propertyMap, '0'); await change(labeled('Proposed rent · Mapped column'), '2'); await click(button('Append this row and review facts')); assert.equal(field('property').value, 'Synthetic Lane'); assert.equal(host.querySelector('[id$="-property-source"]').value, 'Synthetic sheet!A2: Synthetic Lane'); assert.equal(field('rent').value, '$2100'); assert.equal(api.calls.find(call => call.path === '/api/workbook').documentConsent, true);
});
test('AI is separately consented, resets consent on changed text, and failure never runs manual fallback', async () => {
  const api = apiFor(({ path }) => path === '/api/extract' ? Promise.reject({ code: 'PROVIDER_ERROR', status: 502 }) : undefined); await render(api); await change(labeled('Case source text'), 'Property: Synthetic Lane'); assert.equal(button('Extract with AI').disabled, true); await click(host.querySelector('[id$="-ai-consent"]')); assert.equal(button('Extract with AI').disabled, false); await change(labeled('Case source text'), 'Property: Other synthetic lane'); assert.equal(button('Extract with AI').disabled, true); await click(host.querySelector('[id$="-ai-consent"]')); await click(button('Extract with AI')); assert.match(text(), /no substitute results/); assert.equal(field('property').value, ''); assert.deepEqual(api.calls.find(call => call.path === '/api/extract').body, { text: 'Property: Other synthetic lane', consent: true });
});
test('manual extraction preserves differing reviewed fields as explicit conflicts and requires resolution', async () => {
  const api = apiFor(({ path }) => path === '/api/cases/' + A ? { case: blank({ fields: extract('Property: Previous synthetic lane').map(item => ({ ...item, confirmed: true })) }) } : undefined);
  await render(api, { caseId: A }); await change(labeled('Case source text'), 'Property: New synthetic lane'); await click(button('Organize explicit labels')); assert.equal(field('property').value, 'Previous synthetic lane'); assert.match(text(), /Conflicting evidence/); assert.match(host.querySelector('[id$="-property-source"]').value, /New synthetic lane/); await click(button('Keep the entered value and confirm this conflict is resolved')); assert.equal(host.querySelector('[id$="-property-confirm"]').getAttribute('data-state'), 'checked');
});
test('new-case save is whitelisted, deduplicated, links originals, and binds the local workspace', async () => {
  const write = deferred(), bound = []; const api = apiFor(({ method, path }) => method === 'POST' && path === '/api/cases' ? write.promise : undefined);
  await render(api, { onCaseChange: value => bound.push(value) }); await change(labeled('Case name'), 'New synthetic case'); await change(labeled('Case source text'), 'Unsaved source'); await React.act(async () => { button('Save case').click(); button('Save case').click(); }); assert.equal(api.calls.filter(call => call.method === 'POST').length, 1);
  const payload = api.calls.find(call => call.method === 'POST').body; assert.deepEqual(Object.keys(payload).sort(), ['title', 'sourceText', 'fields', 'draftType', 'draftText', 'extractionMode', 'namesVerified', 'clientId'].sort());
  await React.act(async () => write.resolve({ case: blank({ ...payload }) })); await tick(); assert.deepEqual(bound, [A]); assert.equal(labeled('Case source text').value, 'Unsaved source'); assert.match(text(), /Case saved/);
});
test('409 preserves local edits, reads latest explicitly, merges remote untouched facts, and saves version 2', async () => {
  let reads = 0, writes = 0; const initial = blank({ sourceText: 'Base source', clientId: C, documentContext: { senderName: { value: 'Preserved' } }, caseIssues: [{ question: 'Keep' }] });
  const remote = { ...initial, version: 2, fields: extract('Owner: Changed elsewhere') };
  const api = apiFor(({ method, path, body }) => { if (method === 'PUT') { if (++writes === 1) return Promise.reject({ code: 'CASE_CONFLICT', status: 409 }); return { case: { ...remote, ...body, version: 3 } }; } if (path === '/api/cases/' + A) return { case: ++reads > 1 ? remote : initial }; });
  await render(api, { caseId: A }); await change(labeled('Case source text'), 'My preserved source'); await click(button('Save case')); assert.equal(labeled('Case source text').value, 'My preserved source'); assert.equal(button('Save case').disabled, true); await click(button('Read latest to compare')); assert.equal(labeled('Case source text').value, 'My preserved source'); await click(button('Reconcile and review')); assert.equal(field('owner').value, 'Changed elsewhere'); await click(button('Save case')); const requests = api.calls.filter(call => call.method === 'PUT'); assert.deepEqual(requests.map(call => call.body.expectedVersion), [1, 2]); assert.equal(requests[1].body.clientId, C); assert.ok(!('documentContext' in requests[1].body)); assert.ok(!('caseIssues' in requests[1].body));
});
test('active reentry refreshes canonical values without replacing unsaved local source', async () => {
  let record = blank(); const api = apiFor(({ path }) => path === '/api/cases/' + A ? { case: record } : undefined); await render(api, { caseId: A }); await change(labeled('Case source text'), 'My edit'); await render(api, { caseId: A, active: false }); record = { ...record, sourceText: 'Remote source', version: 2 }; await render(api, { caseId: A, active: true }); assert.equal(labeled('Case source text').value, 'My edit'); assert.match(text(), /saved version changed/);
});
test('late old-case AI response is ignored and old scope is aborted', async () => {
  const extraction = deferred(); const api = apiFor(({ path }) => path === '/api/extract' ? extraction.promise : undefined); await render(api, { caseId: A }); await change(labeled('Case source text'), 'Property: Old synthetic lane'); await click(host.querySelector('[id$="-ai-consent"]')); await click(button('Extract with AI')); const request = api.calls.find(call => call.path === '/api/extract'); await render(api, { caseId: B }); assert.equal(request.signal.aborted, true); await React.act(async () => extraction.resolve({ fields: extract('Property: Old synthetic lane') })); assert.equal(labeled('Case name').value, 'Second synthetic case'); assert.equal(field('property').value, '');
});
test('import handoff adopts exactly once only for matching account and case', async () => {
  const api = apiFor(), handled = [], file = new File(['Source'], 'Forwarded.txt'); const props = { onImportHandled: value => handled.push(value) }; await render(api, { ...props, importRequest: { id: 'foreign', userId: 'foreign', caseId: null, files: [file] } }); assert.doesNotMatch(text(), /Forwarded.txt/); await render(api, { ...props, importRequest: { id: 'right', userId, caseId: null, files: [file] } }); await render(api, { ...props, importRequest: { id: 'right', userId, caseId: null, files: [file] } }); assert.deepEqual(handled, ['right']); assert.equal([...host.querySelectorAll('p')].filter(element => element.textContent === 'Forwarded.txt').length, 1); assert.equal(api.calls.length, 0);
});
test('same-user recovery preserves local text and requires reconciliation when server version changed', async () => {
  draftVault.verifyUser(userId); const previous = blank({ version: 1 }); const snapshot = recoverySnapshot({ ...caseWork(previous), sourceText: 'Recovered local source' }, previous, A); assert.equal(draftVault.write({ userId, workspaceKey, feature: 'intake' }, snapshot), true); draftVault.suspend(userId); draftVault.verifyUser(userId);
  const api = apiFor(({ path }) => path === '/api/cases/' + A ? { case: blank({ sourceText: 'New server source', version: 2 }) } : undefined); await render(api, { caseId: A }, true); assert.equal(labeled('Case source text').value, 'Recovered local source'); assert.match(text(), /Recovered unsaved text edits/); assert.equal(button('Save case').disabled, true); await click(button('Reconcile and review')); assert.equal(labeled('Case source text').value, 'Recovered local source\n\nNew server source'); assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0);
});
test('saving a new case associates confirmed originals without uploading bytes again', async () => {
  const bound = [], api = apiFor(); await render(api, { onCaseChange: value => bound.push(value) }); await choose([new File(['Property: Synthetic Lane'], 'Synthetic.txt')]); await click(button('Save privately and process')); await click(button('Save case')); const association = api.calls.find(call => call.method === 'PATCH'); assert.deepEqual(association.body, { caseId: A, expectedVersion: 1 }); assert.equal(api.calls.filter(call => call.method === 'UPLOAD').length, 1); assert.deepEqual(bound, [A]); assert.equal(button('Link to saved case'), undefined);
});
test('retrying post-save parsing does not duplicate the already-saved original', async () => {
  let reads = 0; const api = apiFor(({ path }) => path.endsWith('/text') ? ++reads === 1 ? Promise.reject({ code: 'NETWORK_ERROR' }) : { asset: asset(), text: 'Property: Recovered parser text' } : undefined);
  await render(api); await choose([new File(['Synthetic source'], 'Synthetic.txt')]); await click(button('Save privately and process')); assert.match(text(), /Original saved, but text was not added/); await click(button('Save privately and process')); assert.equal(api.calls.filter(call => call.method === 'UPLOAD').length, 1); assert.equal(labeled('Case source text').value, 'Property: Recovered parser text');
});
test('failed original upload shows no false saved confirmation and no extraction', async () => {
  const api = apiFor(({ method }) => method === 'UPLOAD' ? Promise.reject({ code: 'PDF_ENCRYPTED', status: 422 }) : undefined); await render(api); await choose([new File(['Encrypted fixture'], 'Synthetic.pdf')]); await click(button('Save privately and process')); assert.match(text(), /Encrypted PDFs are unsupported/); assert.doesNotMatch(text(), /Original saved/); assert.equal(host.querySelector('a[href$="/download"]'), null); assert.equal(api.calls.filter(call => call.path === '/api/extract').length, 0);
});
test('account remount aborts late upload and cannot leak its source or saved originals', async () => {
  const upload = deferred(), oldApi = apiFor(({ method }) => method === 'UPLOAD' ? upload.promise : undefined); await render(oldApi, { key: 'old' }); await choose([new File(['Old source'], 'Old.txt')]); await click(button('Save privately and process')); const oldRequest = oldApi.calls.find(call => call.method === 'UPLOAD'); await render(apiFor(), { key: 'new', status: { ...status, userId: B } }); assert.equal(oldRequest.signal.aborted, true); await React.act(async () => upload.resolve({ asset: asset({ originalFilename: 'Old.txt' }) })); assert.doesNotMatch(text(), /Old.txt/); assert.equal(labeled('Case source text').value, ''); assert.equal(oldApi.calls.filter(call => call.path.endsWith('/text')).length, 0);
});
test('same-account current-tab cache keeps only text edits and clears after full save', async () => {
  draftVault.verifyUser(userId); const api = apiFor(); await render(api, {}, true); await change(labeled('Case source text'), 'Unsaved synthetic source'); await choose([new File(['Binary never cached'], 'NotUploaded.txt')]); const cached = draftVault.read({ userId, workspaceKey, feature: 'intake' }); assert.equal(cached.sourceText, 'Unsaved synthetic source'); assert.equal(JSON.stringify(cached).includes('NotUploaded.txt'), false); assert.ok(!('draftText' in cached)); await click(button('Remove: NotUploaded.txt')); await click(button('Save case')); assert.equal(draftVault.read({ userId, workspaceKey, feature: 'intake' }), null);
});
test('source bounds are explicit and source edits do not silently shorten pasted content', async () => {
  await render(apiFor()); const oversized = 'Synthetic '.repeat(5100); await change(labeled('Case source text'), oversized); assert.equal(labeled('Case source text').value, oversized); assert.equal(button('Save case').disabled, true); assert.equal(button('Organize explicit labels').disabled, true); assert.match(text(), /never silently truncated/);
});
test('another page’s first-save binding retains already-entered intake work and client association', async () => {
  const api = apiFor(({ path }) => path === '/api/cases/' + A ? { case: blank({ clientId: C }) } : undefined);
  await render(api); await change(labeled('Case source text'), 'Property: Local intake before chat save'); await click(button('Organize explicit labels')); await render(api, { caseId: A }); assert.equal(labeled('Case source text').value, 'Property: Local intake before chat save'); assert.equal(field('property').value, 'Local intake before chat save'); assert.equal(button('Save case').disabled, false);
});
test('StrictMode replay retains recovered source and unassociated original IDs', async () => {
  draftVault.verifyUser(userId); const cached = recoverySnapshot({ ...caseWork(), sourceText: 'Recovered synthetic source' }, null, null, [asset()]); assert.equal(draftVault.write({ userId, workspaceKey, feature: 'intake' }, cached), true);
  const api = apiFor(({ method, path }) => method === 'GET' && path === '/api/assets/' + C ? { asset: asset() } : undefined); await render(api, {}, 'strict'); assert.equal(labeled('Case source text').value, 'Recovered synthetic source'); assert.ok(host.querySelector(`a[href="/api/assets/${C}/download"]`)); assert.ok(draftVault.read({ userId, workspaceKey, feature: 'intake' }).assetIds.includes(C));
});
test('legacy edited draft is never cleared by an unsupported partial save', async () => {
  const previous = blank({ sourceText: 'Property: Synthetic Lane', fields: extract('Property: Synthetic Lane').map(item => ({ ...item, confirmed: true })), draftText: 'Previous carefully edited English draft' });
  const api = apiFor(({ path }) => path === '/api/cases/' + A ? { case: previous } : undefined); await render(api, { caseId: A }); await change(field('property'), 'Changed synthetic lane'); await click(button('Save case')); assert.match(text(), /prior draft must be archived/); assert.equal(api.calls.filter(call => ['PUT', 'POST'].includes(call.method)).length, 0); assert.equal(field('property').value, 'Changed synthetic lane');
});
test('new handoff merges with existing unprocessed files rather than replacing them', async () => {
  const api = apiFor(); await render(api); await choose([new File(['First'], 'First.txt')]); await render(api, { importRequest: { id: 'second', userId, caseId: null, files: [new File(['Second'], 'Second.txt')] } }); assert.match(text(), /First.txt/); assert.match(text(), /Second.txt/); assert.equal(api.calls.length, 0);
});
test('failed initial canonical read stays retryable and cannot overwrite a case from an empty buffer', async () => {
  const api = apiFor(({ path }) => path === '/api/cases/' + A ? Promise.reject({ code: 'NETWORK_ERROR' }) : undefined); await render(api, { caseId: A }); assert.match(text(), /Cannot connect/); assert.equal(button('Save case').disabled, true); assert.equal(labeled('Case source text').disabled, true); assert.ok(button('Read again'));
});
