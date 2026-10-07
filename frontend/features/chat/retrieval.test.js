// Protocol fixtures are development evidence, not provider or browser acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildChatTurn, readChatEvents } from './logic.js';
import { normalizeLibraryActivity, normalizeLibrarySources, LIBRARY_CODES } from './retrieval.js';
import { chatCopy, chatErrorText, libraryActivityText } from './copy.js';
const source = () => ({sourceId:'S1',kind:'artifact',id:randomUUID(),version:2,title:'Synthetic review draft',titleTruncated:false,retrievalState:'read',status:'draft',isStale:true,truncated:true,sourceCaseVersion:1,currentCaseVersion:2,excerpts:[{offset:0,endOffset:10,textLength:100,offsetBasis:'sanitized-extracted-text-characters'}]});
const sources = () => ({requestId:randomUUID(),items:[source()],appendix:'\n\nSources\n[S1] Synthetic review draft; excerpt 0–10 of 100.'});
const frame = (name,value) => `event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
const stream = text => new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(text));c.close();}});
const collect = async text => {const rows=[];for await(const row of readChatEvents(stream(text)))rows.push(row);return rows;};
test('retrieval consent is optional, boolean-only and snapshotted explicitly; ordinary legacy payload is unchanged',()=>{
  const turn={caseId:randomUUID(),conversationId:randomUUID(),clientMessageId:randomUUID(),text:'Find my saved synthetic record'};
  assert.equal('libraryConsent' in buildChatTurn(turn),false);
  assert.equal('libraryConsent' in buildChatTurn({...turn,libraryConsent:false}),false);
  assert.equal(buildChatTurn({...turn,libraryConsent:true}).libraryConsent,true);
  for(const value of ['true',1,null,{}])assert.throws(()=>buildChatTurn({...turn,libraryConsent:value}),{code:'CHAT_INVALID'});
});
test('activity permits only fixed enums and bounded counts, strips prose/arguments/reasoning, and localizes all codes',()=>{
  assert.deepEqual(normalizeLibraryActivity({phase:'searching',state:'completed',count:0,message:'PRIVATE NOTE',reasoning:'RAW REASONING',arguments:{query:'private'}}),{phase:'searching',state:'completed',count:0});
  for(const value of [{phase:'thinking',state:'started'},{phase:'reading',state:'success'},{phase:'reading',state:'completed',count:9},{phase:'reading',state:'error',code:'LEAK PROSE'}])assert.throws(()=>normalizeLibraryActivity(value),{code:'CHAT_STREAM_FAILED'});
  for(const phase of ['searching','reading','retrieving'])for(const state of ['started','completed','error'])for(const lang of ['zh','en'])assert.notEqual(libraryActivityText({phase,state},lang),chatCopy[lang].libraryRequestError);
  for(const code of LIBRARY_CODES)for(const lang of ['zh','en'])assert.notEqual(chatErrorText({code,message:'private'},lang),chatCopy[lang].generic);
});
test('sources allow only bounded reference metadata and never retain URLs, snippets or hidden prompts',()=>{
  const value=sources();Object.assign(value.items[0],{url:'javascript:alert(1)',snippet:'PRIVATE SOURCE TEXT',systemPrompt:'SYSTEM',reasoning:'RAW'});
  const cleaned=normalizeLibrarySources({...value,reasoning:'RAW'});
  assert.equal(cleaned.items[0].truncated,true);
  assert.throws(()=>normalizeLibrarySources({...sources(),unexpected:'x'.repeat(64001)}),{code:'CHAT_STREAM_FAILED'});
  assert.equal('url' in cleaned.items[0],false);assert.equal('snippet' in cleaned.items[0],false);assert.equal('reasoning' in cleaned,false);
  assert.deepEqual(Object.keys(cleaned).sort(),['appendix','items','requestId']);
  for(const change of [{sourceId:'S49'},{truncated:'yes'},{version:0},{title:'x'.repeat(161)},{title:'bad\nheading'},{retrievalState:'verified'},{excerpts:[{offset:10,endOffset:0,textLength:100,offsetBasis:'raw'}]},{caseId:'not-uuid'}])assert.throws(()=>normalizeLibrarySources({...sources(),items:[{...source(),...change}]}),{code:'CHAT_STREAM_FAILED'});
  assert.throws(()=>normalizeLibrarySources({...sources(),appendix:'x'.repeat(16001)}),{code:'CHAT_STREAM_FAILED'});
});
test('SSE exposes one source appendix before matching completion and counts it in the total output limit',async()=>{
  const refs=sources(),done={requestId:refs.requestId,assistantMessageId:randomUUID()};
  const text=frame('activity',{phase:'searching',state:'completed',count:1})+frame('delta',{text:'Answer [S1]'})+frame('sources',refs)+frame('done',done);
  const rows=await collect(text);assert.deepEqual(rows.map(row=>row.type),['activity','delta','sources','done']);
  assert.equal(rows.filter(row=>row.type==='sources').map(row=>row.appendix).join(''),refs.appendix);
  await assert.rejects(()=>collect(frame('sources',refs)+frame('sources',refs)+frame('done',done)),{code:'CHAT_STREAM_FAILED'});
  await assert.rejects(()=>collect(frame('sources',refs)+frame('done',{...done,requestId:randomUUID()})),{code:'CHAT_STREAM_FAILED'});
  await assert.rejects(()=>collect(frame('delta',{text:'x'.repeat(64000)})+frame('sources',refs)+frame('done',done)),{code:'CHAT_TOO_LARGE'});
});
