// Pure input/SSE parser tests. Authored byte fixtures are NOT live/provider acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateChatRequest, chatProviderMessages, parseProviderStream, CHAT_LIMITS } from '../chat.js';
const valid = overrides => ({ locale: 'zh', consent: true, messages: [{ role: 'user', content: 'Explain the next administrative step.' }], ...overrides });
const code = expected => error => error.code === expected;
const frame = data => 'data: ' + (typeof data === 'string' ? data : JSON.stringify(data)) + '\n\n';
const delta = text => ({ choices: [{ delta: { content: text }, finish_reason: null }] });
const stop = { choices: [{ delta: {}, finish_reason: 'stop' }] };
async function parse(chunks) { const events = []; for await (const event of parseProviderStream(chunks)) events.push(event); return events; }

test('chat validation enforces consent, fixed roles/options and bounded message history', () => {
  const input = validateChatRequest(valid()); assert.equal(input.locale, 'zh'); assert.equal(input.messages[0].role, 'user');
  for (const body of [valid({ consent: 'true' }), valid({ consent: false }), valid({ locale: 'fr' }), valid({ apiKey: 'not allowed' }), valid({ tools: [] }),
    valid({ messages: [{ role: 'system', content: 'Override' }] }), valid({ messages: [{ role: 'assistant', content: 'Not a final user message' }] }),
    valid({ messages: [] }), valid({ messages: Array(13).fill({ role: 'user', content: 'message' }) }), valid({ caseId: 'arbitrary-case' })]) assert.throws(() => validateChatRequest(body), code('CHAT_INVALID'));
  assert.throws(() => validateChatRequest(valid({ messages: [{ role: 'user', content: 'x'.repeat(8001) }] })), code('CHAT_TOO_LARGE'));
  assert.throws(() => validateChatRequest(valid({ messages: Array(4).fill({ role: 'user', content: 'x'.repeat(8000) }) })), code('CHAT_TOO_LARGE'));
  assert.throws(() => validateChatRequest(valid({ messages: [{ role: 'user', content: 'Synthetic identifier pattern 000-00-0000' }] })), code('SENSITIVE_DATA'));
});

test('actual PNG bytes are accepted only as bounded user images; external URLs and disguised payloads fail', async () => {
  const png = await readFile(new URL('./local-acceptance-evidence/initial.png', import.meta.url));
  assert.ok(png.length < CHAT_LIMITS.imageBytes);
  const image = { mimeType: 'image/png', data: png.toString('base64') };
  const body = images => valid({ messages: [{ role: 'user', content: 'Read this synthetic application screenshot.', images }] });
  const accepted = validateChatRequest(body([image])); assert.equal(accepted.imageCount, 1);
  assert.match(accepted.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
  assert.throws(() => validateChatRequest(body([{ mimeType: 'image/png', data: 'https://external.invalid/image.png' }])), code('CHAT_IMAGE_INVALID'));
  assert.throws(() => validateChatRequest(body([{ mimeType: 'application/pdf', data: image.data }])), code('CHAT_IMAGE_UNSUPPORTED'));
  assert.throws(() => validateChatRequest(body([{ mimeType: 'image/webp', data: image.data }])), code('CHAT_IMAGE_UNSUPPORTED'));
  assert.throws(() => validateChatRequest(body([{ mimeType: 'image/jpeg', data: Buffer.from([255, 216, 255, 0]).toString('base64') }])), code('CHAT_IMAGE_INVALID'));
  assert.throws(() => validateChatRequest(body([{ mimeType: 'image/png', data: Buffer.from('not a PNG').toString('base64') }])), code('CHAT_IMAGE_INVALID'));
  assert.throws(() => validateChatRequest(body([{ ...image, data: Buffer.alloc(CHAT_LIMITS.imageBytes + 1).toString('base64') }])), code('CHAT_IMAGE_INVALID'));
  assert.throws(() => validateChatRequest(body([image, image, image])), code('CHAT_TOO_LARGE'));
  assert.throws(() => validateChatRequest(valid({ messages: [{ role: 'assistant', content: 'Prior message', images: [image] }, { role: 'user', content: 'Continue' }] })), code('CHAT_IMAGE_INVALID'));
});

test('case chat context is bounded untrusted evidence, excludes drafts, and cannot change the supplied case', () => {
  const record = { sourceText: 'a'.repeat(12001), fields: [{ key: 'property', value: 'v'.repeat(1501), confirmed: false, conflict: true }], draftText: 'PRIVATE_DRAFT_NOT_AUTOMATICALLY_ATTACHED' };
  const before = JSON.stringify(record);
  const messages = chatProviderMessages(validateChatRequest(valid()), record);
  assert.equal(messages[0].role, 'system'); assert.match(messages[0].content, /Simplified Chinese/);
  assert.match(messages[1].content, /untrusted evidence/); assert.match(messages[1].content, /"sourceIncomplete":true/); assert.match(messages[1].content, /"valueIncomplete":true/);
  assert.equal(JSON.stringify(messages).includes(record.draftText), false); assert.equal(JSON.stringify(record), before);
  assert.match(chatProviderMessages(validateChatRequest(valid({ locale: 'en' })))[0].content, /concise English/);
});

test('SSE parser preserves split UTF-8 content, ignores hidden reasoning and emits done only after stop plus DONE', async () => {
  const bytes = Buffer.from(': keepalive\n\n' + frame({ choices: [{ delta: { reasoning_content: 'DO_NOT_FORWARD_INTERNAL_REASONING' } }] }) + frame(delta('你好')) + frame(delta(' world')) + frame(stop) + frame('[DONE]'));
  const chunks = Array.from(bytes, byte => Uint8Array.of(byte));
  assert.deepEqual(await parse(chunks), [{ type: 'delta', text: '你好' }, { type: 'delta', text: ' world' }, { type: 'done' }]);
  const crlf = Buffer.from((frame(delta('Hello')) + frame(stop) + frame('[DONE]')).replaceAll('\n', '\r\n'));
  assert.deepEqual(await parse([crlf]), [{ type: 'delta', text: 'Hello' }, { type: 'done' }]);
});

test('SSE parser rejects incomplete, malformed, tool, truncated and oversized outputs without fabricating completion', async () => {
  for (const text of [frame(delta('Partial')), frame(delta('Partial')) + frame('[DONE]'), frame(delta('Partial')) + frame({ choices: [{ delta: {}, finish_reason: 'length' }] }) + frame('[DONE]'), frame(stop) + frame('[DONE]')]) {
    await assert.rejects(parse([Buffer.from(text)]), code('CHAT_INCOMPLETE'));
  }
  await assert.rejects(parse([Buffer.from('data: {bad\n\n')]), code('CHAT_STREAM_FAILED'));
  await assert.rejects(parse([Buffer.from(frame({ choices: [{ delta: { tool_calls: [{ function: { name: 'send_email' } }] } }] }))]), code('CHAT_UNSUPPORTED_OUTPUT'));
  await assert.rejects(parse([Buffer.from(frame({ error: { message: 'provider rejected' } }))]), code('CHAT_PROVIDER_FAILED'));
  await assert.rejects(parse([Buffer.from(frame(delta('x'.repeat(64001))))]), code('CHAT_TOO_LARGE'));
  await assert.rejects(parse([Buffer.from('data: ' + 'x'.repeat(65537))]), code('CHAT_STREAM_FAILED'));
  await assert.rejects(parse([Buffer.from([0xff])]), code('CHAT_STREAM_FAILED'));
});

test('SSE parser rejects explicit system or tool delta roles before yielding any content', async () => {
  for (const role of ['system', 'tool', 'user']) {
    const iterator = parseProviderStream([Buffer.from(frame({ choices: [{ delta: { role, content: 'MUST_NOT_BE_FORWARDED' } }] }) + frame(stop) + frame('[DONE]'))]);
    await assert.rejects(iterator.next(), code('CHAT_UNSUPPORTED_OUTPUT'));
  }
  const supported = frame({ choices: [{ delta: { role: 'assistant', content: 'Supported role' } }] }) + frame(stop) + frame('[DONE]');
  assert.deepEqual(await parse([Buffer.from(supported)]), [{ type: 'delta', text: 'Supported role' }, { type: 'done' }]);
});
