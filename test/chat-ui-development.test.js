// Development-only DOM scheduling diagnostics with controlled HTTP/stream responses.
// NOT real browser, real provider, actual persistence, pixels, or strict E2E acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, deferred } from './ui-harness.js';
const uid = '11111111-1111-4111-8111-111111111111';
const cid = '22222222-2222-4222-8222-222222222222';
const tid = '33333333-3333-4333-8333-333333333333';
const wid = '44444444-4444-4444-8444-444444444444';
const status = () => ({ authenticated: true, authConfigured: true, userId: uid, role: 'trial', username: 'development-only', csrfToken: 'development-only-csrf', caseStorageEnabled: true, liveEnabled: true });
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const baseCase = body => ({ ...body, id: cid, version: 1, createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z' });
const standard = (url, options) => {
  if (url === '/api/cases' && !options?.method) return response({ cases: [] });
  if (url.startsWith('/api/clients?')) return response({ clients: [] });
  if (url === '/api/workflows') return response({ workflowId: wid }, 201);
  if (url.endsWith('/events')) return response({ accepted: 1 }, 201);
  if (url === `/api/conversations/${tid}`) return response({ conversation: { id: tid, caseId: cid }, messages: [] });
  throw new Error(`Unhandled development-only URL: ${url}`);
};
async function flushUntil(app, predicate) {
  for (let i = 0; i < 40 && !predicate(); i++) await app.flush();
  assert.ok(predicate(), 'Expected controlled DOM transition did not occur');
}
function setupCase(url, options) {
  if (url === '/api/cases' && options?.method === 'POST') return response({ case: baseCase(JSON.parse(options.body)) }, 201, { 'X-Workflow-Id': wid, 'X-Request-Id': '66666666-6666-4666-8666-666666666666', 'X-Telemetry-Status': 'active' });
  if (url === `/api/cases/${cid}/conversations`) return response({ conversation: { id: tid, caseId: cid, title: 'Development fixture' } }, 201);
}
const streamResponse = bytes => new Response(bytes, { headers: { 'Content-Type': 'text/event-stream' } });
const doneStream = text => `event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {"assistantMessageId":"55555555-5555-4555-8555-555555555555"}\n\n`;

test('development DOM: source material and chat composer remain separate and persistent chat sends only the latest user turn', async t => {
  let submitted;
  const app = await openApp({ status: status(), fetchHandler: async (url, options) => {
    if (url === '/api/chat') { submitted = JSON.parse(options.body); return streamResponse(doneStream('DEVELOPMENT_STREAM_FIXTURE')); }
    return setupCase(url, options) || standard(url, options);
  } }); t.after(app.close);
  app.type('material-input', 'Property: 128 Example Lane\nOwner: Example LLC');
  app.type('input', 'Explain the next step without replacing source material.');
  app.click('chat-send');
  await flushUntil(app, () => submitted && !app.document.getElementById('chat-stop'));
  assert.equal(app.get('material-input').value, 'Property: 128 Example Lane\nOwner: Example LLC');
  assert.equal(app.get('input').value, '');
  const create = app.requests.find(item => item.url === '/api/cases' && item.options?.method === 'POST');
  assert.equal(JSON.parse(create.options.body).sourceText, app.get('material-input').value);
  assert.equal(submitted.caseId, cid); assert.equal(submitted.conversationId, tid);
  assert.equal(app.requests.find(item => item.url === '/api/chat').options.headers['X-Workflow-Id'], wid);
  assert.ok(!app.requests.some(item => item.url === '/api/workflows'), 'Returned workflow should be adopted without redundant creation');
  assert.match(submitted.clientMessageId, /^[\da-f-]{36}$/);
  assert.deepEqual(submitted.messages, [{ role: 'user', content: 'Explain the next step without replacing source material.' }]);
});

for (const failedStage of ['case', 'conversation']) test(`development DOM: failed ${failedStage} creation prevents any chat request and preserves input`, async t => {
  const app = await openApp({ status: status(), fetchHandler: async (url, options) => {
    if ((failedStage === 'case' && url === '/api/cases' && options?.method === 'POST') || (failedStage === 'conversation' && url.endsWith('/conversations'))) return response({ code: 'CASE_STORAGE_UNAVAILABLE' }, 503);
    return setupCase(url, options) || standard(url, options);
  } }); t.after(app.close);
  app.type('material-input', 'SYNTHETIC_SOURCE_SENTINEL'); app.type('input', 'Unsaved chat question.'); app.click('chat-send');
  await flushUntil(app, () => app.document.querySelector('#chat-thread .error') && !app.document.getElementById('chat-stop'));
  assert.ok(!app.requests.some(item => item.url === '/api/chat'));
  assert.equal(app.get('material-input').value, 'SYNTHETIC_SOURCE_SENTINEL');
  assert.equal(app.get('input').value, 'Unsaved chat question.');
});

test('development DOM: reset during case creation ignores late metadata and never starts a conversation or stream', async t => {
  const pending = deferred(); let requestBody;
  const app = await openApp({ status: status(), fetchHandler: async (url, options) => {
    if (url === '/api/cases' && options?.method === 'POST') { requestBody = JSON.parse(options.body); return pending.promise; }
    return standard(url, options);
  } }); t.after(app.close);
  app.type('material-input', 'Old synthetic source'); app.type('input', 'Old pending question'); app.click('chat-send');
  await flushUntil(app, () => Boolean(requestBody));
  app.click('reset');
  pending.resolve(response({ case: baseCase(requestBody) }, 201));
  for (let i = 0; i < 5; i++) await app.flush();
  assert.equal(app.get('material-input').value, ''); assert.equal(app.get('input').value, '');
  assert.ok(!app.requests.some(item => item.url === '/api/chat' || item.url.endsWith('/conversations')));
  assert.ok(!app.document.getElementById('chat-thread'));
});

for (const action of ['reset', 'logout']) test(`development DOM: ${action} invalidates an in-flight reader and discards late stream frames`, async t => {
  let streamController; const currentStatus = status();
  const app = await openApp({ status: currentStatus, fetchHandler: async (url, options) => {
    if (url === '/api/chat') return streamResponse(new ReadableStream({ start(controller) { streamController = controller; } }));
    if (url === '/api/logout') { currentStatus.authenticated = false; currentStatus.userId = null; return response({ authenticated: false }); }
    return setupCase(url, options) || standard(url, options);
  } }); t.after(app.close);
  app.type('input', 'Pending question'); app.click('chat-send');
  await flushUntil(app, () => Boolean(streamController));
  if (action === 'logout') app.click('settings');
  app.click(action);
  streamController.enqueue(new TextEncoder().encode(doneStream('LATE_PRIVATE_ANSWER_SENTINEL'))); streamController.close();
  for (let i = 0; i < 8; i++) await app.flush();
  assert.doesNotMatch(app.document.body.textContent, /LATE_PRIVATE_ANSWER_SENTINEL/);
  assert.ok(!app.document.getElementById('chat-thread'));
  assert.equal(app.get('input').value, '');
  assert.ok(!app.requests.some(item => item.url === `/api/conversations/${tid}`));
});

test('development DOM: image decode completed after reset cannot restore attachment bytes or previews', async t => {
  const bitmap = deferred(); let decodeStarted = false, closed = false;
  const app = await openApp({ status: status(), bitmapHandler: () => { decodeStarted = true; return bitmap.promise; }, fetchHandler: async (url, options) => standard(url, options) }); t.after(app.close);
  const file = new Blob(['DEVELOPMENT_IMAGE_BYTES_NOT_A_REAL_PNG'], { type: 'image/png' });
  const input = app.get('image-file'); Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  await flushUntil(app, () => decodeStarted); app.click('reset');
  bitmap.resolve({ width: 100, height: 100, close() { closed = true; } });
  for (let i = 0; i < 5; i++) await app.flush();
  assert.equal(closed, true); assert.ok(!app.document.querySelector('.chat-chip')); assert.ok(!app.document.getElementById('chat-thread'));
});

test('development DOM: temporary expiry and same-user refresh preserve case association while a different identity clears the workspace', async t => {
  const customerId = '77777777-7777-4777-8777-777777777777';
  const currentStatus = status(); let saved;
  const record = { ...baseCase({ title: 'Associated case', sourceText: 'Original case material', draftText: '', draftType: 'followup', fields: [], extractionMode: 'manual', namesVerified: false, clientId: customerId }) };
  const app = await openApp({ status: currentStatus, fetchHandler: async (url, options) => {
    if (url === '/api/cases' && (!options?.method || options.method === 'GET')) return response({ cases: [{ id: cid, title: record.title, version: 1, clientId: customerId }] });
    if (url === `/api/cases/${cid}` && options?.method === 'PUT') { saved = JSON.parse(options.body); return response({ case: { ...record, ...saved, version: 2 } }); }
    if (url === `/api/cases/${cid}`) return response({ case: record });
    if (url.endsWith('/conversations')) return response({ conversations: [] });
    if (url.endsWith('/artifacts')) return response({ artifacts: [] });
    if (url.includes('/readiness?')) return response({ ready: false, missing: [] });
    return standard(url, options);
  } }); t.after(app.close);
  app.select('saved-case', cid); app.click('open-case');
  await flushUntil(app, () => app.get('material-input').value === 'Original case material');
  app.type('material-input', 'Unsaved material after opening associated case');
  app.click('settings');
  currentStatus.authenticated = false; currentStatus.userId = null; currentStatus.csrfToken = '';
  app.click('refresh-status'); for (let i = 0; i < 5; i++) await app.flush();
  assert.equal(app.get('material-input').value, 'Unsaved material after opening associated case');
  Object.assign(currentStatus, status()); app.click('refresh-status'); for (let i = 0; i < 5; i++) await app.flush();
  app.click('save-case'); await flushUntil(app, () => Boolean(saved));
  assert.equal(saved.clientId, customerId);
  assert.equal(saved.sourceText, 'Unsaved material after opening associated case');
  currentStatus.userId = '88888888-8888-4888-8888-888888888888'; app.click('refresh-status');
  for (let i = 0; i < 5; i++) await app.flush();
  assert.equal(app.get('material-input').value, ''); assert.equal(app.get('input').value, '');
  assert.ok(!app.document.querySelector('.customer-linked'));
});
