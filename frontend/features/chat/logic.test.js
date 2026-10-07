import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CHAT_BOUNDS, buildChatTurn, newCasePayload, normalizeMessages, restoredMessages, validateImageFile, imageDimensions, readChatEvents } from './logic.js';
import { chatCopy, chatErrorText } from './copy.js';
const ids=()=>({caseId:randomUUID(),conversationId:randomUUID(),clientMessageId:randomUUID()});
const event=(name,data)=>`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const stream=parts=>new ReadableStream({start(controller){for(const part of parts)controller.enqueue(typeof part==='string'?new TextEncoder().encode(part):part);controller.close();}});
const collect=async body=>{const result=[];for await(const item of readChatEvents(body))result.push(item);return result;};

test('chat starts with a genuinely empty saved case and never injects source facts',()=>{
  assert.deepEqual(newCasePayload('New case'),{title:'New case',sourceText:'',fields:[],draftType:'followup',draftText:'',extractionMode:'manual',namesVerified:false,clientId:null});
});
test('persistent payload contains one new user turn, fixed consent and IDs, not browser history or previews',()=>{
  const identity=ids();const payload=buildChatTurn({...identity,text:'A new question',lang:'en',images:[{mimeType:'image/png',data:'YWJjZA==',preview:'blob:local',id:'local'}]});
  assert.deepEqual(payload,{...identity,locale:'en',consent:true,messages:[{role:'user',content:'A new question',images:[{mimeType:'image/png',data:'YWJjZA=='}]}]});
  assert.throws(()=>buildChatTurn({...identity,conversationId:null,text:'Question'}),{code:'CHAT_INVALID'});
  assert.throws(()=>buildChatTurn({...identity,text:''}),{code:'CHAT_EMPTY'});
  assert.throws(()=>buildChatTurn({...identity,text:'x'.repeat(8001)}),{code:'CHAT_TOO_LARGE'});
  assert.throws(()=>buildChatTurn({...identity,text:'Q',images:Array(3).fill({mimeType:'image/png',data:'YWJjZA=='})}),{code:'CHAT_TOO_LARGE'});
});
test('real PNG header dimensions are checked before browser decoding, with explicit format and byte limits',()=>{
  const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=','base64'));
  assert.deepEqual(imageDimensions(png,'image/png'),{width:1,height:1});
  validateImageFile({type:'image/png',size:png.length});
  const oversized=png.slice();new DataView(oversized.buffer).setUint32(16,8193);
  assert.throws(()=>imageDimensions(oversized,'image/png'),{code:'CHAT_IMAGE_INVALID'});
  assert.throws(()=>imageDimensions(new Uint8Array([255,216,255,0]),'image/jpeg'),{code:'CHAT_IMAGE_INVALID'});
  assert.throws(()=>validateImageFile({type:'image/webp',size:10}),{code:'CHAT_IMAGE_INVALID'});
  assert.throws(()=>validateImageFile({type:'image/png',size:CHAT_BOUNDS.imageBytes+1}),{code:'CHAT_IMAGE_INVALID'});
});
test('restored history preserves truthful incomplete states and only image-presence metadata',()=>{
  const userId=randomUUID(),assistantId=randomUUID(),requestId=randomUUID(),clientMessageId=randomUUID();
  const rows=[{id:userId,role:'user',content:'Q',state:'complete',requestId,clientMessageId,imageMetadata:[{mimeType:'image/png',byteCount:100,retained:false}]},{id:assistantId,role:'assistant',content:'Partial answer',state:'interrupted',requestId}];
  const restored=normalizeMessages(rows);assert.equal(restored[1].state,'interrupted');assert.equal(restored[0].imageMetadata[0].retained,false);assert.equal('images' in restored[0],false);
  assert.throws(()=>normalizeMessages([{...rows[0],role:'system'}]),{code:'INVALID_RESPONSE'});
  const local={id:randomUUID(),role:'assistant',content:'Partial answer',state:'interrupted',streaming:true};
  assert.equal(restoredMessages(rows,{clientMessageId},local).length,2);
  const raced=restoredMessages(rows.slice(0,1),{clientMessageId},local);assert.equal(raced.length,2);assert.equal(raced[1].localOnly,true);assert.equal(raced[1].streaming,false);
  assert.equal(restoredMessages([],{clientMessageId},local),null);
});
test('SSE fixture parsing is incremental and handles split UTF-8 without fabricating completion',async()=>{
  const completion={requestId:randomUUID(),assistantMessageId:randomUUID()};
  const bytes=new TextEncoder().encode(': keep-alive\n\n'+event('delta',{text:'真实 text'})+event('done',completion));
  const parsed=await collect(stream([...bytes].map(byte=>new Uint8Array([byte]))));
  assert.deepEqual(parsed,[{type:'delta',text:'真实 text'},{...completion,type:'done'}]);
});
test('SSE fixtures reject missing completion, invalid IDs, malformed data, excessive output, and cancelled readers',async()=>{
  await assert.rejects(()=>collect(stream([event('delta',{text:'Partial'})])),{code:'CHAT_INCOMPLETE'});
  await assert.rejects(()=>collect(stream([event('done',{requestId:'not-id',assistantMessageId:randomUUID()})])),{code:'CHAT_STREAM_FAILED'});
  await assert.rejects(()=>collect(stream(['event: delta\ndata: broken\n\n'])),{code:'CHAT_STREAM_FAILED'});
  await assert.rejects(()=>collect(stream([event('delta',{text:'x'.repeat(64001)})])),{code:'CHAT_TOO_LARGE'});
  const abort=new AbortController();let cancelled=false;const body=new ReadableStream({cancel(){cancelled=true;}});
  const iterator=readChatEvents(body,abort.signal);const next=iterator.next();abort.abort();await assert.rejects(next,{name:'AbortError'});assert.equal(cancelled,true);
});
test('SSE errors retain preceding deltas and never count as a done response',async()=>{
  const parsed=await collect(stream([event('delta',{text:'Received partial'}),event('error',{code:'CHAT_SAVE_FAILED'})]));
  assert.deepEqual(parsed,[{type:'delta',text:'Received partial'},{type:'error',code:'CHAT_SAVE_FAILED'}]);
});
test('Chinese and English copy have matching keys and unknown exceptions never become displayed prose',()=>{
  assert.deepEqual(Object.keys(chatCopy.zh).sort(),Object.keys(chatCopy.en).sort());
  assert.equal(/[\u4e00-\u9fff]/u.test(Object.values(chatCopy.en).join(' ')),false);
  assert.equal(chatErrorText({code:'CHAT_SAVE_FAILED',message:'private stack'},'en'),chatCopy.en.saveError);
  assert.equal(chatErrorText({code:'UNRECOGNIZED',message:'private stack'},'en'),chatCopy.en.generic);
});
