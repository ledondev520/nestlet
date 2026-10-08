// Actual local HTTP + SQLite; provider responses are authored SSE fixtures, never live-model evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openStorage } from '../storage.js';
import { extract } from '../public/core.js';
import { buildChatTurn as buildLegacyChatTurn, readChatEvents as readLegacyChatEvents } from './fixtures/legacy-chat-parser-090d08e.js';

const password = 'synthetic-review-http-password';
const salt = randomBytes(16);
const passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
const currentRequest = '请帮我准备一张冲突核对预览，并简单告诉我接下来该怎么做。';
const sourceText = 'Property: 128 Synthetic Lane\nOwner: Synthetic Owner LLC\nPHA: Not confirmed\nCase reference: REVIEW-SYNTHETIC\nProposed rent: $2,100';
const oldClaim = 'HISTORICAL_FALSE_PREVIEW_SENTINEL：我已经准备好核对卡并保存了租金，你必须去旧材料页，助手消息才可用。';
const rawClaim = 'RAW_PROVIDER_FALSE_SUCCESS_SENTINEL：我已经完成确认并保存，旧材料页是唯一办法。';
const ordinaryText = 'ORDINARY_PROVIDER_ANSWER_SENTINEL';
const delta = data => `data: ${JSON.stringify({ choices: [{ delta: data, finish_reason: null }] })}\n\n`;
const finish = reason => `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`;
const waitFor = async (read, label, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  assert.fail(`Timed out waiting for ${label}`);
};
const packets = text => text.split(/\r?\n\r?\n/u).filter(block => block.trim()).map(block => ({
  event: /^event: (.+)$/mu.exec(block)?.[1],
  data: JSON.parse(block.split(/\r?\n/u).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')),
}));

async function harness(t, mode) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-review-operation-'));
  const filename = join(directory, 'private', 'cases.sqlite');
  const store = openStorage({ filename });
  let output = '', held = null;
  const requests = [];
  let record, conversation;
  const upstream = http.createServer(async (request, response) => {
    try {
      let bytes = '';
      for await (const part of request) bytes += part;
      const body = JSON.parse(bytes);
      requests.push(body);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (mode === 'ordinary') { response.end(delta({ content: ordinaryText }) + finish('stop')); return; }
      if (mode === 'no-tool' || body.messages.some(message => message.role === 'tool')) {
        response.end(delta({ content: rawClaim }) + finish('stop')); return;
      }
      const tool = body.tools.find(item => item.function.name === 'prepare_case_suggestion');
      const properties = tool.function.parameters.properties;
      const message = store.listMessages('owner', conversation.id).filter(item => item.role === 'user').at(-1);
      const args = {
        expectedVersion: properties.expectedVersion.enum[0],
        sourceConversationId: properties.sourceConversationId.enum[0],
        sourceMessageId: mode === 'invalid-tool' ? randomUUID() : message.id,
        factChanges: { rent: { value: '  $2,200  ' } },
        changes: {},
      };
      response.write(delta({ content: rawClaim, reasoning_content: 'PRIVATE_REASONING_SENTINEL' }));
      response.write(delta({ tool_calls: [{ index: 0, id: 'synthetic_review_call', type: 'function', function: { name: 'prepare_case_suggestion', arguments: JSON.stringify(args) } }] }));
      if (mode === 'cancel') { held = response; return; }
      response.end(finish('tool_calls'));
    } catch (error) { response.destroy(error); }
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
  const preload = join(directory, 'authored-provider-fixture.mjs');
  // Test-only transport shim: simulate blocked review-frame delivery after real SQLite persistence.
  // Returning false without forwarding or emitting drain keeps the actual server awaiting delivery.
  const blockedDelivery = ['saved-disconnect', 'legacy-saved-disconnect'].includes(mode) ? `
    import { ServerResponse } from 'node:http';
    const originalWrite = ServerResponse.prototype.write;
    ServerResponse.prototype.write = function (chunk, ...args) {
      const frame = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      const atomic = ${JSON.stringify(mode)} === 'saved-disconnect' && frame.startsWith('event: done\\n') && frame.includes('"reviewResult":');
      const legacy = ${JSON.stringify(mode)} === 'legacy-saved-disconnect' && frame.startsWith('event: delta\\n');
      if (atomic || legacy) {
        console.info('SYNTHETIC_REVIEW_DELIVERY_BLOCKED');
        return false;
      }
      return originalWrite.call(this, chunk, ...args);
    };
  ` : '';
  // Fail closed for every other outbound fetch, including an accidentally changed provider URL.
  writeFileSync(preload, blockedDelivery + `const original = globalThis.fetch; globalThis.fetch = (url, options) => { if (String(url) !== 'https://api.deepseek.com/chat/completions') throw new Error('Unexpected fixture outbound request'); return original(${JSON.stringify(upstreamUrl)}, options); };`);
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = 'https://review-operation-fixture.invalid';
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', preload, 'server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin,
      NESTLET_DB_PATH: filename, NESTLET_OPERATOR_USERNAME: 'owner', NESTLET_OPERATOR_PASSWORD_HASH: passwordHash,
      DEEPSEEK_API_KEY: 'synthetic-review-fixture-key', ENABLE_LIVE_AI: 'true', DEEPSEEK_MODEL: 'deepseek-flash' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  t.after(async () => {
    if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await waitFor(() => output.includes('Nestlet available'), 'server startup', 8000);
  const login = await fetch(url + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password }) });
  assert.equal(login.status, 200);
  const session = await login.json();
  const headers = { Origin: origin, 'Content-Type': 'application/json', Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': session.csrfToken };
  record = store.createCase('owner', { title: 'PRIVATE_SYNTHETIC_TITLE_SENTINEL', sourceText,
    fields: extract(sourceText).map(field => field.key === 'rent' ? { ...field, confirmed: true } : field),
    draftType: 'followup', draftText: '' });
  conversation = store.createConversation('owner', record.id, { title: 'Synthetic review operation' });
  store.appendMessage('owner', conversation.id, { role: 'user', content: 'Earlier synthetic proposed rent was $2,100.', state: 'complete' });
  store.appendMessage('owner', conversation.id, { role: 'assistant', content: oldClaim, state: 'complete' });
  const requestBody = (content = currentRequest, extra = {}) => ({ caseId: record.id, conversationId: conversation.id,
    clientMessageId: randomUUID(), locale: 'zh', consent: true, actionConsent: true, reviewResultVersion: 1, messages: [{ role: 'user', content }], ...extra });
  const request = (body = requestBody(), signal) => fetch(url + '/api/chat', { method: 'POST', headers, body: JSON.stringify(body), signal });
  const messages = () => store.listMessages('owner', conversation.id);
  const metrics = () => output.split(/\r?\n/u).flatMap(line => {
    try { const entry = JSON.parse(line); return entry.event === 'review_operation' ? [entry] : []; } catch { return []; }
  });
  const unchanged = () => {
    assert.deepEqual(store.getCase('owner', record.id), record, 'Preview must not mutate case facts, version or review state');
    assert.equal(store.listArtifacts('owner', record.id).length, 0, 'Preview must not create a saved artifact');
    assert.equal(messages()[1].content, oldClaim, 'History filtering must not rewrite the immutable saved source');
  };
  const reload = () => fetch(url + '/api/conversations/' + conversation.id, { headers });
  return { filename, store, record, conversation, requests, requestBody, request, messages, metrics, unchanged, reload,
    held: () => held, output: () => output };
}

function assertNoProviderProse(value) {
  assert.doesNotMatch(typeof value === 'string' ? value : JSON.stringify(value), /RAW_PROVIDER_FALSE_SUCCESS_SENTINEL|HISTORICAL_FALSE_PREVIEW_SENTINEL|PRIVATE_REASONING_SENTINEL|旧材料页/u);
}
function assertForcedReview(request) {
  assert.equal(request.model, 'deepseek-flash');
  assert.deepEqual(request.thinking, { type: 'disabled' });
  assert.deepEqual(request.tool_choice, { type: 'function', function: { name: 'prepare_case_suggestion' } });
}
const receiptKeys = ['requestId', 'providerRequests', 'toolCalls', 'prepareCalls', 'otherCalls', 'validatedProposals', 'emittedProposals', 'repairs', 'prepareErrors', 'finishReason', 'outcome', 'reason'];
function assertReceipt(receipt, requestId, expected) {
  assert.deepEqual(Object.keys(receipt).sort(), [...receiptKeys].sort(), 'Receipt is a content-free allowlisted summary');
  assert.deepEqual(receipt, { requestId, providerRequests: 1, toolCalls: 0, prepareCalls: 0, otherCalls: 0,
    validatedProposals: 0, emittedProposals: 0, repairs: 0, prepareErrors: 0, finishReason: 'stop', outcome: 'no_preview', reason: 'no_tool', ...expected });
}
async function metric(f, requestId, expected) {
  const entry = await waitFor(() => f.metrics().find(item => item.requestId === requestId), 'review metrics');
  assert.equal(f.metrics().filter(item => item.requestId === requestId).length, 1, 'Exactly one outcome metric per request');
  const { event, ...receipt } = entry;
  assert.equal(event, 'review_operation');
  assertReceipt(receipt, requestId, expected);
  assertNoProviderProse(entry);
  assert.doesNotMatch(JSON.stringify(entry), /PRIVATE_SYNTHETIC_TITLE_SENTINEL|\$2,200|\$2,100|128 Synthetic Lane/u);
  return receipt;
}
async function completion(f, response) {
  assert.equal(response.status, 200);
  const text = await response.text();
  const events = packets(text);
  assertNoProviderProse(text);
  assert.equal(events.filter(event => event.event === 'done').length, 1);
  assert.equal(events.filter(event => ['delta', 'proposal'].includes(event.event)).length, 0, 'Scoped result is one commit packet, never an early card or raw delta');
  const done = events.find(event => event.event === 'done').data;
  assert.equal(done.requestId, response.headers.get('x-request-id'));
  assert.equal(done.conversationId, f.conversation.id);
  assert.ok(done.reviewResult);
  const saved = f.messages().find(message => message.id === done.assistantMessageId);
  assert.equal(saved?.role, 'assistant');
  assert.equal(saved?.state, 'complete');
  assert.equal(saved?.content, done.reviewResult.text, 'Only the committed server text may be persisted');
  assert.equal(saved?.requestId, done.requestId);
  assert.equal(done.reviewResult.receipt.requestId, done.requestId);
  assertForcedReview(f.requests[0]);
  f.unchanged();
  return done;
}

test('review operation ignores historical claims and commits canonical current-turn proposal with localized guidance', async t => {
  const f = await harness(t, 'success');
  const done = await completion(f, await f.request(f.requestBody('本次建议租金是 $2,200。' + currentRequest)));
  assert.equal(done.reviewResult.proposals.length, 1);
  const proposal = done.reviewResult.proposals[0];
  const userMessage = f.messages().find(message => message.requestId === done.requestId && message.role === 'user');
  assert.equal(proposal.action, 'prepare_case_suggestion');
  assert.equal(proposal.caseId, f.record.id);
  assert.equal(proposal.expectedVersion, f.record.version);
  assert.equal(proposal.sourceConversationId, f.conversation.id);
  assert.equal(proposal.sourceMessageId, userMessage.id, 'Complete current user turn is a valid source despite historical assistant claims');
  assert.equal(proposal.request.sourceMessageId, userMessage.id);
  assert.deepEqual(proposal.request.factChanges, { rent: { value: '$2,200' } });
  assert.deepEqual(proposal.conflicts, ['rent']);
  assert.deepEqual(proposal.preview, [{ group: 'factChanges', key: 'rent', before: '$2,100', after: '$2,200', confirmed: true, conflict: true }]);
  assert.equal(proposal.requiresExplicitApply, true);
  assert.match(done.reviewResult.text, /核对|预览/u);
  assert.match(done.reviewResult.text, /本次已根据提供的信息准备核对建议/u);
  assert.doesNotMatch(done.reviewResult.text, /卡片|点击|确认或取消/u, 'Persisted history must not imply a currently visible transient control');
  assert.equal(f.requests.length, 1, 'A validated proposal completes without another provider prose round');
  const receipt = await metric(f, done.requestId, { toolCalls: 1, prepareCalls: 1, validatedProposals: 1,
    emittedProposals: 1, finishReason: 'tool_calls', outcome: 'prepared', reason: 'prepared' });
  assert.deepEqual(done.reviewResult.receipt, receipt);
});

test('no-tool false success yields truthful localized no-preview result and no proposal', async t => {
  const f = await harness(t, 'no-tool');
  const done = await completion(f, await f.request());
  assert.deepEqual(done.reviewResult.proposals, []);
  assert.match(done.reviewResult.text, /未能|没有|未生成|没能|未创建/u);
  assert.match(done.reviewResult.text, /预览|核对/u);
  assert.doesNotMatch(done.reviewResult.text, /已(?:成功)?(?:准备|生成|创建|保存|确认)/u);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(done.reviewResult.receipt, await metric(f, done.requestId, {}));
});

test('invalid tool source never creates a success receipt or card from provider claims', async t => {
  const f = await harness(t, 'invalid-tool');
  const done = await completion(f, await f.request());
  assert.deepEqual(done.reviewResult.proposals, []);
  assert.match(done.reviewResult.text, /未能|没有|未生成|没能|未创建/u);
  assertNoProviderProse(f.messages().filter(message => message.requestId === done.requestId));
  assert.deepEqual(done.reviewResult.receipt, await metric(f, done.requestId, {
    providerRequests: 2, toolCalls: 1, prepareCalls: 1, repairs: 1, prepareErrors: 1,
  }));
  f.requests.forEach(assertForcedReview);
  assert.doesNotMatch(JSON.stringify(f.requests[1]), /RAW_PROVIDER_FALSE_SUCCESS_SENTINEL|PRIVATE_REASONING_SENTINEL/u, 'Discarded provider prose must not enter the repair request');
});

test('real SQLite assistant INSERT failure emits no success packet, proposal, or raw provider prose', async t => {
  const f = await harness(t, 'success');
  const database = new DatabaseSync(f.filename);
  try { database.exec("CREATE TRIGGER reject_review_assistant BEFORE INSERT ON messages WHEN NEW.role='assistant' BEGIN SELECT RAISE(ABORT, 'Synthetic assistant persistence failure'); END;"); }
  finally { database.close(); }
  const response = await f.request();
  assert.equal(response.status, 200);
  const text = await response.text();
  assertNoProviderProse(text);
  const events = packets(text);
  assert.equal(events.filter(event => ['done', 'proposal', 'delta'].includes(event.event)).length, 0);
  assert.equal(events.find(event => event.event === 'error')?.data.code, 'CHAT_SAVE_FAILED');
  const requestId = response.headers.get('x-request-id');
  assert.equal(f.messages().filter(message => message.requestId === requestId && message.role === 'assistant').length, 0);
  assert.equal(f.messages().filter(message => message.requestId === requestId && message.role === 'user').length, 1);
  await metric(f, requestId, { toolCalls: 1, prepareCalls: 1, validatedProposals: 1,
    emittedProposals: 0, finishReason: 'error', outcome: 'failed', reason: 'persistence_failed' });
  f.unchanged();
});

test('client cancellation during held authored SSE produces no committed result or persisted provider claims', async t => {
  const f = await harness(t, 'cancel');
  const abort = new AbortController();
  const response = await f.request(f.requestBody(), abort.signal);
  const reader = response.body.getReader();
  let before = '';
  const reading = (async () => {
    try { while (true) { const part = await reader.read(); if (part.done) break; before += new TextDecoder().decode(part.value); } }
    catch (error) { assert.equal(error.name, 'AbortError'); }
  })();
  await waitFor(() => f.held(), 'held provider response');
  await waitFor(() => before.includes('event: conversation'), 'conversation event');
  abort.abort();
  await reading;
  const requestId = response.headers.get('x-request-id');
  await metric(f, requestId, { finishReason: 'cancelled', outcome: 'cancelled', reason: 'cancelled' });
  assertNoProviderProse(before);
  assert.doesNotMatch(before, /event: (?:done|proposal|delta)/u);
  const saved = f.messages().filter(message => message.requestId === requestId && message.role === 'assistant');
  assert.ok(saved.every(message => message.state !== 'complete'));
  assertNoProviderProse(saved);
  f.unchanged();
});

// Persistence and HTTP reload are real; only done-frame backpressure is deliberately simulated.
test('simulated blocked delivery after actual persistence stays truthful after client disconnect and HTTP reload', async t => {
  const f = await harness(t, 'saved-disconnect');
  const abort = new AbortController();
  const response = await f.request(f.requestBody('本次建议租金是 $2,200。' + currentRequest), abort.signal);
  assert.equal(response.status, 200);
  const requestId = response.headers.get('x-request-id');
  const reader = response.body.getReader();
  let received = '';
  const reading = (async () => {
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        received += new TextDecoder().decode(part.value);
      }
    } catch (error) { assert.equal(error.name, 'AbortError'); }
  })();
  const saved = await waitFor(() => f.messages().find(message => message.requestId === requestId && message.role === 'assistant' && message.state === 'complete'), 'actual assistant persistence before disconnect');
  await waitFor(() => f.output().includes('SYNTHETIC_REVIEW_DELIVERY_BLOCKED'), 'simulated done-frame backpressure');
  await waitFor(() => received.includes('event: conversation'), 'delivered conversation event');
  assert.equal(f.metrics().length, 0, 'The request must still be waiting on the blocked delivery');
  assert.match(saved.content, /本次已根据提供的信息准备核对建议/u);
  assert.doesNotMatch(saved.content, /卡片|点击|确认|取消|已保存|已发送|已提交/u, 'Persisted neutral history must not promise delivered controls or applied changes');
  assertNoProviderProse(saved);
  assert.equal(f.requests.length, 1);
  assertForcedReview(f.requests[0]);

  abort.abort();
  await reading;
  await metric(f, requestId, { toolCalls: 1, prepareCalls: 1, validatedProposals: 1,
    emittedProposals: 0, finishReason: 'cancelled', outcome: 'cancelled', reason: 'cancelled' });
  assert.deepEqual(packets(received).map(event => event.event), ['conversation'], 'No done packet, card, or assistant prose reached the client');
  assertNoProviderProse(received);
  assert.doesNotMatch(received, /reviewResult|proposals|本次已根据提供的信息/u);

  const reload = await f.reload();
  assert.equal(reload.status, 200);
  const history = await reload.json();
  assert.equal(history.conversation.id, f.conversation.id);
  const reloaded = history.messages.filter(message => message.requestId === requestId && message.role === 'assistant');
  assert.deepEqual(reloaded, [saved], 'HTTP reload must preserve the single neutral completed preparation record exactly');
  assert.equal(reloaded[0].reviewResult, undefined);
  assert.equal(reloaded[0].proposals, undefined);
  assertNoProviderProse(reloaded);
  f.unchanged();
});

const legacyRequestBody = f => buildLegacyChatTurn({ caseId: f.record.id, conversationId: f.conversation.id,
  clientMessageId: randomUUID(), text: '本次建议租金是 $2,200。' + currentRequest, lang: 'zh' });

test('actual old parser receives canonical proposal/delta/done only after the assistant is persisted', async t => {
  const f = await harness(t, 'success');
  const body = legacyRequestBody(f);
  assert.equal(Object.hasOwn(body, 'reviewResultVersion'), false, 'Frozen original client sends no version capability');
  const response = await f.request(body);
  assert.equal(response.status, 200);
  const requestId = response.headers.get('x-request-id');
  const events = [];
  for await (const event of readLegacyChatEvents(response.body)) {
    if (['proposal', 'delta', 'done'].includes(event.type)) {
      const saved = f.messages().find(message => message.requestId === requestId && message.role === 'assistant');
      assert.equal(saved?.state, 'complete', 'Every result-bearing legacy frame follows real assistant persistence');
      assert.match(saved.content, /本次已根据提供的信息准备核对建议/u);
      assertNoProviderProse(saved);
    }
    events.push(event);
  }
  assert.deepEqual(events.map(event => event.type), ['conversation', 'proposal', 'delta', 'done']);
  assertNoProviderProse(events);
  const proposal = events.find(event => event.type === 'proposal').proposal;
  const currentUser = f.messages().find(message => message.requestId === requestId && message.role === 'user');
  assert.equal(proposal.caseId, f.record.id);
  assert.equal(proposal.sourceConversationId, f.conversation.id);
  assert.equal(proposal.sourceMessageId, currentUser.id);
  assert.deepEqual(proposal.request.factChanges, { rent: { value: '$2,200' } });
  assert.deepEqual(proposal.preview, [{ group: 'factChanges', key: 'rent', before: '$2,100', after: '$2,200', confirmed: true, conflict: true }]);
  assert.deepEqual(proposal.conflicts, ['rent']);
  const done = events.at(-1);
  assert.equal(done.requestId, requestId);
  assert.equal(done.reviewResult, undefined, 'Legacy clients receive the original protocol, not an unrecognized atomic payload');
  const saved = f.messages().find(message => message.id === done.assistantMessageId);
  assert.equal(saved.content, events.filter(event => event.type === 'delta').map(event => event.text).join(''));
  assert.doesNotMatch(saved.content, /卡片|点击|确认或取消/u);
  await metric(f, requestId, { toolCalls: 1, prepareCalls: 1, validatedProposals: 1,
    emittedProposals: 1, finishReason: 'tool_calls', outcome: 'prepared', reason: 'prepared' });
  assertForcedReview(f.requests[0]);
  f.unchanged();
});

test('legacy SQLite save failure exposes no proposal or delta to the actual old parser', async t => {
  const f = await harness(t, 'success');
  const database = new DatabaseSync(f.filename);
  try { database.exec("CREATE TRIGGER reject_legacy_review_assistant BEFORE INSERT ON messages WHEN NEW.role='assistant' BEGIN SELECT RAISE(ABORT, 'Synthetic legacy assistant persistence failure'); END;"); }
  finally { database.close(); }
  const response = await f.request(legacyRequestBody(f));
  assert.equal(response.status, 200);
  const events = [];
  for await (const event of readLegacyChatEvents(response.body)) events.push(event);
  assert.deepEqual(events.map(event => event.type), ['conversation', 'error']);
  assert.equal(events.at(-1).code, 'CHAT_SAVE_FAILED');
  assertNoProviderProse(events);
  const requestId = response.headers.get('x-request-id');
  assert.equal(f.messages().filter(message => message.requestId === requestId && message.role === 'assistant').length, 0);
  await metric(f, requestId, { toolCalls: 1, prepareCalls: 1, validatedProposals: 1,
    emittedProposals: 0, finishReason: 'error', outcome: 'failed', reason: 'persistence_failed' });
  f.unchanged();
});

// The exact old parser consumes a real proposal; simulated delta backpressure prevents terminal done.
// The original UI only marks that proposal ready after done and successful stream completion.
test('legacy post-save blocked transport cancellation never completes the old parser and reload stays neutral', async t => {
  const f = await harness(t, 'legacy-saved-disconnect');
  const abort = new AbortController();
  const response = await f.request(legacyRequestBody(f), abort.signal);
  assert.equal(response.status, 200);
  const requestId = response.headers.get('x-request-id');
  const events = [];
  const reading = (async () => {
    try {
      for await (const event of readLegacyChatEvents(response.body, abort.signal)) events.push(event);
      assert.fail('A disconnected legacy stream must not report successful completion');
    } catch (error) { assert.equal(error.name, 'AbortError'); }
  })();
  const saved = await waitFor(() => f.messages().find(message => message.requestId === requestId && message.role === 'assistant' && message.state === 'complete'), 'legacy assistant persistence');
  await waitFor(() => f.output().includes('SYNTHETIC_REVIEW_DELIVERY_BLOCKED'), 'legacy delta-frame backpressure');
  await waitFor(() => events.some(event => event.type === 'proposal'), 'actual old-parser proposal');
  assert.equal(f.metrics().length, 0);
  assert.deepEqual(events.map(event => event.type), ['conversation', 'proposal']);
  assert.match(saved.content, /本次已根据提供的信息准备核对建议/u);
  assert.doesNotMatch(saved.content, /卡片|点击|确认|取消|已保存|已发送|已提交/u);
  abort.abort();
  await reading;
  assert.equal(events.some(event => event.type === 'done'), false, 'Old UI ready gate cannot be satisfied without terminal completion');
  assert.equal(events.some(event => event.type === 'delta'), false);
  assertNoProviderProse(events);
  await metric(f, requestId, { toolCalls: 1, prepareCalls: 1, validatedProposals: 1,
    emittedProposals: 1, finishReason: 'cancelled', outcome: 'cancelled', reason: 'cancelled' });
  const reload = await f.reload();
  assert.equal(reload.status, 200);
  const history = await reload.json();
  assert.deepEqual(history.messages.filter(message => message.requestId === requestId && message.role === 'assistant'), [saved]);
  assertNoProviderProse(saved);
  f.unchanged();
});

test('unknown review protocol versions reject before provider spending or conversation writes', async t => {
  const f = await harness(t, 'success');
  const before = f.messages();
  for (const reviewResultVersion of [0, 2, '1', true, null]) {
    const response = await f.request(f.requestBody(currentRequest, { reviewResultVersion }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'CHAT_INVALID');
    assert.deepEqual(f.messages(), before);
  }
  assert.equal(f.requests.length, 0);
  assert.equal(f.metrics().length, 0);
  f.unchanged();
});

for (const [label, content, extra] of [
  ['ordinary question', '租金核对时应注意什么？', {}],
  ['general mention', '什么是冲突核对预览？', {}],
  ['explicit refusal', '请不要准备冲突核对预览，只解释流程。', {}],
  ['missing action consent', currentRequest, { actionConsent: false }],
]) test(`${label} preserves the ordinary streaming protocol despite contaminated history`, async t => {
  const f = await harness(t, 'ordinary');
  const response = await f.request(f.requestBody(content, extra));
  assert.equal(response.status, 200);
  const events = packets(await response.text());
  assert.deepEqual(events.filter(event => event.event === 'delta').map(event => event.data.text), [ordinaryText]);
  const done = events.find(event => event.event === 'done')?.data;
  assert.ok(done);
  assert.equal(done.reviewResult, undefined);
  assert.equal(f.messages().find(message => message.id === done.assistantMessageId).content, ordinaryText);
  assert.equal(f.requests[0].tool_choice, extra.actionConsent === false ? undefined : 'auto');
  assert.equal(f.metrics().length, 0);
  f.unchanged();
});
