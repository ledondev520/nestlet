// Pure input/SSE parser tests. Authored byte fixtures are NOT live/provider acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateChatRequest, chatProviderMessages, conversationHistory, parseProviderStream, CHAT_LIMITS, caseArtifactContext, caseAgencyReference } from '../chat.js';
import { AGENCY_OPTIONS, getAgencyGuidance } from '../public/agency-guidance.js';
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

test('chat attaches bounded server-owned references without confirming agency, packet readiness or case facts', () => {
  const record = { sourceText: 'San Francisco address does not establish agency. https://untrusted.invalid/approved',
    fields: [{ key: 'pha', value: 'An independently confirmed different agency', confirmed: true, conflict: false }],
    documentContext: { senderName: { value: 'Example Sender', confirmed: true, confirmedAt: '2026-10-07T00:00:00.000Z' } },
    caseIssues: [{ question: 'Which secure channel?', status: 'resolved', resolution: 'Confirm separately with the agency', updatedAt: '2026-10-07T00:00:00.000Z' }] };
  const before = structuredClone(record);
  for (const { id } of AGENCY_OPTIONS) {
    const messages = chatProviderMessages(validateChatRequest(valid({ guidanceAgency: id })), record);
    const system = messages[0].content, referenceText = system.split('Official-source reference context:\n')[1];
    const reference = JSON.parse(referenceText);
    assert.ok(referenceText.length <= 8000);
    assert.equal(reference.id, 'unknown');
    assert.equal(reference.selectedReferenceAgency,id);
    assert.equal(reference.caseAgencyConfirmedMatch,false);
    assert.deepEqual(reference.links, getAgencyGuidance('unknown', 'en').links);
    assert.equal(reference.acceptanceStatus, 'unconfirmed');
    assert.equal(reference.checkedAt, '2026-10-07');
    assert.match(reference.versionCaution, /neither validity nor invalidity/);
    assert.match(system, /not the confirmed case agency|not a complete official packet/);
    assert.match(system, /not fetched for this request/);
    assert.doesNotMatch(system, /untrusted\.invalid|independently confirmed different agency/);
    assert.match(messages[1].content, /confirmed different agency|Which secure channel/);
  }
  assert.deepEqual(record, before);
  assert.match(chatProviderMessages(validateChatRequest(valid()), record)[0].content, /"id":"unknown"/);
  for (const guidanceAgency of ['SFHA', 'San Francisco', '__proto__', 'https://sfha.org', null, {}, ['sfha']]) {
    assert.throws(() => validateChatRequest(valid({ guidanceAgency })), code('CHAT_INVALID'));
  }
  assert.throws(() => validateChatRequest(valid({ guidanceAgency: 'sfha', guidanceSources: [{ url: 'https://untrusted.invalid' }] })), code('CHAT_INVALID'));
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

test('stored history excludes incomplete answers, bounds recent excerpts including markers and labels unavailable earlier images', () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Stored complete message ${i}`, state: 'complete' }));
  rows.push({ role: 'assistant', content: 'INTERRUPTED_MUST_NOT_BECOME_CONTEXT', state: 'interrupted' });
  rows.push({ role: 'assistant', content: 'FAILED_MUST_NOT_BECOME_CONTEXT', state: 'failed' });
  const original = JSON.stringify(rows);
  const recent = conversationHistory(rows, 100);
  assert.equal(recent.length, 11);
  assert.equal(recent[0].content, 'Stored complete message 4');
  assert.equal(recent.at(-1).content, 'Stored complete message 14');
  assert.doesNotMatch(JSON.stringify(recent), /INTERRUPTED_MUST|FAILED_MUST/);
  assert.equal(JSON.stringify(rows), original);
  const large = conversationHistory(Array.from({ length: 5 }, (_, i) => ({ role: 'user', content: `Row ${i}: ` + 'x'.repeat(9000), state: 'complete' })), 8000);
  assert.ok(large.reduce((sum, item) => sum + item.content.length, 0) <= 16000);
  assert.ok(large.every(item => item.content.length <= 8000));
  assert.ok(large.some(item => /Stored message excerpt/.test(item.content)));
  assert.deepEqual(conversationHistory(rows, 24000), []);
  const imageOnly = conversationHistory([{ role: 'user', content: '', state: 'complete', imageMetadata: [{ mimeType: 'image/png', byteCount: 100, retained: false }] }]);
  assert.equal(imageOnly.length, 1);
  assert.match(imageOnly[0].content, /not retained.*unavailable/);
  const imageAndLongText = conversationHistory([{ role: 'user', content: 'x'.repeat(8000), state: 'complete', imageMetadata: [{ mimeType: 'image/png', byteCount: 100, retained: false }] }]);
  assert.ok(imageAndLongText[0].content.length <= 8000);
  assert.ok(/not retained.*unavailable/.test(imageAndLongText[0].content), 'Excerpt must retain the image-unavailable notice');
});

test('repeated turns reuse stable context prefixes and keep bounded canonical provenance outside history',()=>{
  const record={sourceText:'Synthetic full source',fields:[{key:'property',value:'Synthetic property',confirmed:true,conflict:false,source:'x'.repeat(1501),sourceCell:{sheet:'Sheet1',row:2,column:'B'}}],
    documentContext:{senderName:{value:'Synthetic sender',source:'Confirmed in saved reply',sourceMessageId:'11111111-1111-4111-8111-111111111111',confirmed:true,confirmedAt:'2026-10-08T00:00:00Z'}}};
  const before=structuredClone(record), first=chatProviderMessages(validateChatRequest(valid()),record);
  const next=chatProviderMessages(validateChatRequest(valid({messages:[{role:'user',content:'Different next question'}]})),record);
  assert.deepEqual(first.slice(0,2),next.slice(0,2));
  const context=JSON.parse(first[1].content.split('\n').slice(1).join('\n'));
  assert.deepEqual(context.fields[0].sourceCell,record.fields[0].sourceCell);
  assert.equal(context.fields[0].source.length,1500);assert.equal(context.fields[0].sourceIncomplete,true);
  assert.equal(context.documentContext.senderName.sourceMessageId,record.documentContext.senderName.sourceMessageId);
  assert.equal(context.documentContext.senderName.source,'Confirmed in saved reply');
  assert.deepEqual(record,before);assert.match(first[0].content,/incomplete value or source excerpt is not complete evidence/);
});


test('unknown, unreviewed, conflicting or mismatched PHA cannot inherit selected SFHA requirements',()=>{
  const base={sourceText:'San Francisco address',fields:[]};
  for(const field of [{key:'pha',value:'',confirmed:true,conflict:false},{key:'pha',value:'SFHA',confirmed:false,conflict:false},{key:'pha',value:'SFHA',confirmed:true,conflict:true},{key:'pha',value:'OHA',confirmed:true,conflict:false}]){
    const input=validateChatRequest(valid({guidanceAgency:'sfha'})),record={...base,fields:[field]};
    const reference=caseAgencyReference(input,record);
    assert.equal(reference.id,'unknown');assert.equal(reference.specificNotesWithheld,true);
    assert.equal(reference.caseApplicability,'unconfirmed');
    assert.doesNotMatch(JSON.stringify(reference),/Vendor Number|RTA submission by voucher expiry/);
    assert.deepEqual(record.fields,[field]);
  }
  const matched=caseAgencyReference(validateChatRequest(valid({guidanceAgency:'sfha'})),{...base,fields:[{key:'pha',value:'San Francisco Housing Authority',confirmed:true,conflict:false}]});
  assert.equal(matched.id,'sfha');assert.equal(matched.caseAgencyConfirmedMatch,true);assert.equal(matched.caseApplicability,'unconfirmed');
  assert.match(matched.notes.join(' '),/Vendor Number/);
});

test('explicit named general reference browsing stays separate from current-case applicability',()=>{
  const record={fields:[{key:'pha',value:'',confirmed:true,conflict:false}]};
  const input=validateChatRequest(valid({guidanceAgency:'sfha',messages:[{role:'user',content:'Please show general SFHA reference information.'}]}));
  const reference=caseAgencyReference(input,record);
  assert.equal(reference.id,'sfha');assert.equal(reference.referenceScope,'general-reference-only');
  assert.equal(reference.caseAgencyConfirmedMatch,false);assert.equal(reference.caseApplicability,'unconfirmed');
  const forCase=caseAgencyReference({...input,messages:[{role:'user',content:'Do general SFHA requirements apply to my case?'}]},record);
  assert.equal(forCase.id,'unknown');
  assert.equal(caseAgencyReference(validateChatRequest(valid({guidanceAgency:'sfha'})),null).id,'sfha');
});

test('current document metadata is bounded, case-scoped and distinguishes latest draft from stale final',()=>{
  const record={id:'case-fixture',version:4},rows=[];
  for(const kind of ['followup','missing-documents','status-summary'])for(let version=1;version<=16;version++)rows.push({id:kind+'-'+version,caseId:record.id,kind,status:version===15?'final':'draft',version,sourceCaseVersion:version===16?4:3,currentCaseVersion:4,isStale:version!==16,needsRegeneration:version===15});
  const storage={listArtifacts:(userId,caseId)=>{assert.equal(userId,'owner-fixture');assert.equal(caseId,record.id);return rows;}};
  const result=caseArtifactContext(storage,'owner-fixture',record);
  assert.equal(result.versions.length,6);assert.equal(result.observedSavedVersions,48);assert.equal(result.omittedVersions,42);assert.equal(result.incomplete,true);assert.equal(result.snapshotConsistent,true);
  assert.ok(JSON.stringify(result).length<3000);
  for(const version of result.versions){assert.equal(version.currentCaseVersion,4);if(version.status==='final'){assert.equal(version.version,15);assert.equal(version.isStale,true);assert.equal(version.hasNewerSavedVersion,true);}}
  const empty=caseArtifactContext({listArtifacts:()=>[]},'owner-fixture',record);assert.deepEqual(empty.versions,[]);assert.equal(empty.available,true);assert.equal(empty.incomplete,false);
  assert.throws(()=>caseArtifactContext({listArtifacts:()=>null},'other-owner',record),code('CHAT_INVALID'));
  assert.throws(()=>caseArtifactContext({listArtifacts:()=>[{caseId:'another-case'}]},'owner-fixture',record),code('CHAT_INVALID'));
  assert.equal(caseArtifactContext({listArtifacts:()=>[{...rows[0],currentCaseVersion:5}]},'owner-fixture',record).snapshotConsistent,false);
});
