import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStorage} from '../storage.js';
import {loadConversationAction} from '../conversation-action-contract.js';
import {newReviewReceipt,reviewResultText} from '../review-operation.js';
import {readChatEvents} from '../frontend/features/chat/logic.js';
const frame=(type,value)=>`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`;
const stream=parts=>new ReadableStream({start(controller){for(const part of parts)controller.enqueue(new TextEncoder().encode(part));controller.close();}});
const consume=async(body,signal,events=[])=>{for await(const event of readChatEvents(body,signal))events.push(event);return events;};
function fixture(t){
 const directory=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-review-frame-')),store=openStorage({filename:join(directory,'db.sqlite')});
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 const record=store.createCase('owner',{title:'Synthetic',sourceText:'',fields:[],draftType:'followup',draftText:''}),conversation=store.createConversation('owner',record.id,{});
 const user=store.appendMessage('owner',conversation.id,{role:'user',state:'complete',content:'Synthetic proposed rent $2200'});
 const proposal=loadConversationAction(store,'owner',record,{action:'prepare_case_suggestion',expectedVersion:record.version,sourceConversationId:conversation.id,sourceMessageId:user.id,factChanges:{rent:{value:'$2200'}}});
 const requestId=randomUUID(),assistantMessageId=randomUUID();
 const receipt={...newReviewReceipt(requestId),providerRequests:1,toolCalls:1,prepareCalls:1,validatedProposals:1,emittedProposals:1,finishReason:'tool_calls',outcome:'prepared',reason:'prepared'};
 const done={requestId,conversationId:conversation.id,assistantMessageId,reviewResult:{text:reviewResultText([proposal]),proposals:[proposal],receipt}};
 return{done,proposal,start:frame('conversation',{conversationId:conversation.id,userMessageId:user.id})};
}

test('complete saved review envelope expands validated proposal/text/done without modifying canonical request',async t=>{
 const f=fixture(t),events=await consume(stream([f.start,frame('done',f.done)]));
 assert.deepEqual(events.map(event=>event.type),['conversation','proposal','delta','done']);
 assert.deepEqual(events[1].proposal.request,f.proposal.request);assert.equal(events[1].proposal.sourceMessageId,f.proposal.sourceMessageId);
 assert.equal(events[2].text,f.done.reviewResult.text);assert.equal(events[3].assistantMessageId,f.done.assistantMessageId);
});

test('partial frame, cancellation and persistence error expose no review text or card',async t=>{
 const f=fixture(t),events=[];
 await assert.rejects(()=>consume(stream([f.start,frame('done',f.done).slice(0,-4)]),undefined,events),{code:'CHAT_INCOMPLETE'});
 assert.deepEqual(events.map(event=>event.type),['conversation']);
 const aborted=new AbortController();aborted.abort();const cancelled=[];
 await assert.rejects(()=>consume(stream([f.start,frame('done',f.done)]),aborted.signal,cancelled),{name:'AbortError'});assert.deepEqual(cancelled,[]);
 const failed=await consume(stream([f.start,frame('error',{code:'CHAT_SAVE_FAILED',requestId:f.done.requestId})]));
 assert.deepEqual(failed.map(event=>event.type),['conversation','error']);
});

test('entire envelope validates before first card including later bad scope, receipt and arbitrary success prose',async t=>{
 const f=fixture(t);
 for(const mutate of [
  d=>{d.reviewResult.proposals.push({...f.proposal,sourceConversationId:randomUUID()});d.reviewResult.receipt.validatedProposals=2;d.reviewResult.receipt.emittedProposals=2;},
  d=>{d.reviewResult.receipt.requestId=randomUUID();},
  d=>{d.conversationId=randomUUID();},
  d=>{d.reviewResult.text='A preview was generated and facts were saved.';},
  d=>{d.reviewResult.receipt.arguments='Never accepted metadata';},
  d=>{d.reviewResult.proposals=[];d.reviewResult.receipt.validatedProposals=0;d.reviewResult.receipt.emittedProposals=0;d.reviewResult.receipt.outcome='no_preview';}
 ]){
  const done=structuredClone(f.done);mutate(done);const events=[];
  await assert.rejects(()=>consume(stream([f.start,frame('done',done)]),undefined,events),{code:'CHAT_STREAM_FAILED'});
  assert.deepEqual(events.map(event=>event.type),['conversation']);
 }
 const events=[];await assert.rejects(()=>consume(stream([f.start,frame('delta',{text:'Legacy prose'}),frame('done',f.done)]),undefined,events),{code:'CHAT_STREAM_FAILED'});
 assert.ok(!events.some(event=>event.type==='proposal'));
});

test('grounded no-preview envelope stays concise and has no extra card; ordinary streaming unchanged',async t=>{
 const f=fixture(t),done=structuredClone(f.done);
 done.reviewResult={text:reviewResultText([]),proposals:[],receipt:{...newReviewReceipt(done.requestId),providerRequests:1,finishReason:'stop',outcome:'no_preview',reason:'no_tool'}};
 const events=await consume(stream([f.start,frame('done',done)]));assert.deepEqual(events.map(event=>event.type),['conversation','delta','done']);assert.match(events[1].text,/没有生成/);
 const ordinary={requestId:done.requestId,assistantMessageId:done.assistantMessageId,conversationId:done.conversationId};
 const normal=await consume(stream([f.start,frame('delta',{text:'A substantive answer.'}),frame('done',ordinary)]));assert.equal(normal[1].text,'A substantive answer.');
});
