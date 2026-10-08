// Synthetic provider protocol and disposable SQLite; no live-model acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStorage} from '../storage.js';
import {isDirectReviewRequest,reviewHistoryText,newReviewReceipt,reviewReceiptSnapshot} from '../review-operation.js';
import {validateChatRequest,conversationHistory,createConversationToolSession,openLibraryChatStream} from '../chat.js';
import {conversationActionContext,loadConversationAction} from '../conversation-action-contract.js';
const actualRequest='继续这个虚构测试事项。之前核对的拟申请租金是2100美元，我又看到一个尚未核实的2200美元说法。请帮我准备一张冲突核对预览，并简单告诉我接下来该怎么做。先保留原来的2100美元，不要改动已经完成的文书。';
const pollution='Preview generated ok: true requiresExplicitApply: true confirm: false factChanges: rent. OLD_PROTOCOL_SENTINEL';
const packet=(delta,finish_reason)=>`data: ${JSON.stringify({choices:[{delta,finish_reason}]})}\n\n`;
const response=(delta,finish)=>new Response(packet(delta,null)+packet({},finish)+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
async function collect(stream){const events=[];for await(const event of stream)events.push(event);return events;}
function fixture(t,text=actualRequest) {
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-review-operation-')),store=openStorage({filename:join(dir,'db.sqlite')});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const record=store.createCase('owner',{title:'Synthetic review',sourceText:'',fields:[],draftType:'followup',draftText:''});
 const conversation=store.createConversation('owner',record.id,{});
 const oldUser=store.appendMessage('owner',conversation.id,{role:'user',state:'complete',content:'User evidence factChanges is a literal label; requested rent $2100.'});
 const old=store.appendMessage('owner',conversation.id,{role:'assistant',state:'complete',content:pollution});
 const user=store.appendMessage('owner',conversation.id,{role:'user',state:'complete',content:text});
 const input=validateChatRequest({locale:'zh',consent:true,actionConsent:true,caseId:record.id,conversationId:conversation.id,clientMessageId:randomUUID(),messages:[{role:'user',content:text}]});
 input.messages=[...conversationHistory([oldUser,old],text.length,{reviewOperation:input.reviewOperation}),...input.messages];
 input.actionContext=conversationActionContext(store,'owner',record,conversation.id,{reviewOperation:input.reviewOperation});
 const library=createConversationToolSession({storage:store,userId:'owner',record,conversationId:conversation.id,reviewOperation:input.reviewOperation});
 const receipt=newReviewReceipt(randomUUID());
 const args={expectedVersion:record.version,sourceConversationId:conversation.id,sourceMessageId:user.id,factChanges:{rent:{value:'$2200'}}};
 return {store,record,conversation,oldUser,old,user,input,library,receipt,args};
}
const run=(f,fetchImpl,signal)=>openLibraryChatStream({apiKey:'synthetic-only',input:f.input,record:f.record,library:f.library,requestId:f.receipt.requestId,reviewReceipt:f.receipt,fetchImpl,signal});

test('review command recognition is current, direct and conservative; mixed/general/quoted/negative stays ordinary',()=>{
 for(const text of [actualRequest,'请准备一张核对预览。','Please prepare a conflict review preview. Keep the current rent unchanged.','Create a fact review card.','请帮我准备一张核对预览，先预览、不要保存。','请帮我准备一张核对预览。先预览、不要保存。','Prepare a review card. Do not save.','能帮我准备一张冲突核对预览吗？','Could you prepare a review card?','The current rent is USD 2,100.50. I saw an unverified rent of $2,200.75. Could you prepare a conflict review preview?','当前拟申请租金是$2,100.50。能帮我准备一张冲突核对预览吗？','物业地址：128 Example Lane。业主：Synthetic Property LLC。收件人邮箱：recipient@example.invalid。请帮我准备一张核对预览。','Property address: 128 Example Lane. Owner: Synthetic Property LLC. Contact: recipient@example.invalid. Could you prepare a review card?'])assert.equal(isDirectReviewRequest(text),true,text);
 for(const text of ['你好','请解释冲突核对预览是什么','请帮我准备一张核对预览，并分析这份合同。','不要准备一张核对预览。','“请帮我准备一张核对预览”是例句。','Please explain how review cards work.','Can you prepare a conflict review preview?','Prepare a review card and draft a letter.','Do not prepare a review preview.','What does "prepare a review preview" mean?','请准备一张核对预览，为什么租金不同？','请帮我准备一张核对预览，并总结之前所有邮件。','请帮我准备一张核对预览，同时列出还缺哪些材料。','Prepare a review card and summarize the conversation.','请帮我准备一张核对预览，不过我只是举个例子。','总结之前的邮件。请帮我准备一张核对预览。','请帮我准备一张核对预览。另列一份材料清单。','Could you explain how to prepare a review card?','Can this app prepare a review card?','能帮我解释如何准备核对预览吗？','Could you prepare a review card and summarize the conversation?','Owner: John and summarize the conversation. Prepare a review card.','业主：张三，请总结之前邮件。请帮我准备一张核对预览。'])assert.equal(isDirectReviewRequest(text),false,text);
 const body={locale:'zh',consent:true,caseId:randomUUID(),conversationId:randomUUID(),clientMessageId:randomUUID(),messages:[{role:'user',content:actualRequest}]};
 assert.equal(validateChatRequest({...body,actionConsent:false}).reviewOperation,false);
 assert.equal(validateChatRequest({...body,actionConsent:true}).reviewOperation,true);
});

test('projection covers history and catalogue, preserves user facts, storage and canonical draft bytes',t=>{
 const f=fixture(t);
 assert.ok(!JSON.stringify(f.input.messages).includes('OLD_PROTOCOL_SENTINEL'));
 assert.ok(!JSON.stringify(f.input.actionContext).includes('OLD_PROTOCOL_SENTINEL'));
 assert.ok(f.input.messages.some(message=>message.content===f.oldUser.content));
 assert.equal(reviewHistoryText(f.oldUser),f.oldUser.content);
 assert.equal(reviewHistoryText({role:'assistant',content:'Dear recipient,\nA substantive English letter.'}),'Dear recipient,\nA substantive English letter.');
 assert.ok(JSON.stringify(conversationHistory([f.old])).includes('OLD_PROTOCOL_SENTINEL'));
 assert.ok(JSON.stringify(conversationActionContext(f.store,'owner',f.record,f.conversation.id)).includes('OLD_PROTOCOL_SENTINEL'));
 const draft=loadConversationAction(f.store,'owner',f.record,{action:'prepare_answer_draft',expectedVersion:f.record.version,sourceConversationId:f.conversation.id,sourceMessageId:f.old.id,kind:'followup'});
 assert.ok(draft.content.endsWith(f.old.content));
 assert.equal(f.store.listMessages('owner',f.conversation.id).find(m=>m.id===f.old.id).content,pollution);
});

test('no-tool false success never becomes a delta or proposal; named non-thinking tool contract is sent',async t=>{
 const f=fixture(t);let requests=0;
 const events=await collect(await run(f,async(_url,options)=>{
  requests++;const body=JSON.parse(options.body);
  assert.deepEqual(body.tool_choice,{type:'function',function:{name:'prepare_case_suggestion'}});
  assert.deepEqual(body.thinking,{type:'disabled'});assert.deepEqual(body.tools.map(tool=>tool.function.name),['prepare_case_suggestion']);
  assert.ok(!JSON.stringify(body.messages).includes('OLD_PROTOCOL_SENTINEL'));
  return response({content:'预览已生成 ok: true 我已经修改租金。'},'stop');
 }));
 assert.equal(requests,1);assert.equal(events.length,1);assert.equal(events[0].type,'review-result');
 assert.deepEqual(events[0].proposals,[]);assert.match(events[0].text,/没有生成/);assert.doesNotMatch(events[0].text,/ok:|修改租金/);
 assert.equal(f.receipt.toolCalls,0);assert.equal(f.receipt.reason,'no_tool');assert.equal(f.store.getCase('owner',f.record.id).version,f.record.version);
});

test('pre-tool narration is discarded; accepted proposal remains exact and success uses no followup provider round',async t=>{
 const f=fixture(t);let requests=0;
 const events=await collect(await run(f,async()=>{
  requests++;return response({content:pollution,tool_calls:[{index:0,id:'prepare1',type:'function',function:{name:'prepare_case_suggestion',arguments:JSON.stringify(f.args)}}]},'tool_calls');
 }));
 assert.equal(requests,1);assert.deepEqual(events[0].proposals,[loadConversationAction(f.store,'owner',f.record,{action:'prepare_case_suggestion',...f.args})]);
 assert.doesNotMatch(events[0].text,/ok:|factChanges|OLD_PROTOCOL/);assert.match(events[0].text,/本次已根据提供的信息准备核对建议/);assert.doesNotMatch(events[0].text,/卡片|点击|确认或取消/);
 assert.equal(f.receipt.validatedProposals,1);assert.equal(f.receipt.emittedProposals,0);assert.equal(f.receipt.prepareCalls,1);
 assert.equal(f.store.getCase('owner',f.record.id).version,f.record.version);assert.equal(f.store.listArtifacts('owner',f.record.id).length,0);
});

test('invalid args repair is bounded and no successful prose escapes on exhaustion',async t=>{
 const f=fixture(t);let requests=0;
 const events=await collect(await run(f,async(_url,options)=>{
  requests++;const body=JSON.parse(options.body);
  if(requests>1){assert.equal(body.messages.at(-2).content,null);assert.equal(JSON.parse(body.messages.at(-1).content).ok,false);}
  return response({content:pollution,tool_calls:[{index:0,id:'bad'+requests,type:'function',function:{name:'prepare_case_suggestion',arguments:JSON.stringify({...f.args,factChanges:{rent:'invalid'}})}}]},'tool_calls');
 }));
 assert.equal(requests,3);assert.equal(f.receipt.repairs,2);assert.equal(f.receipt.prepareErrors,3);assert.equal(f.receipt.reason,'budget_exhausted');
 assert.deepEqual(events[0].proposals,[]);assert.match(events[0].text,/没有生成/);
});

test('ordinary chat keeps auto tools and unchanged genuine streaming',async t=>{
 const f=fixture(t,'普通问题');
 const events=await collect(await run(f,async(_url,options)=>{assert.equal(JSON.parse(options.body).tool_choice,'auto');return response({content:'A substantive ordinary answer remains unchanged.'},'stop');}));
 assert.equal(events[0].type,'delta');assert.equal(events[0].text,'A substantive ordinary answer remains unchanged.');assert.equal(events.at(-1).type,'done');
});

test('receipt snapshot has only request-correlated content-free allowlisted counters',()=>{
 const receipt=newReviewReceipt(randomUUID());
 assert.deepEqual(reviewReceiptSnapshot({...receipt,arguments:'PRIVATE',content:'PRIVATE',credential:'PRIVATE'}),receipt);
 assert.throws(()=>reviewReceiptSnapshot({...receipt,outcome:'invented'}));
 assert.throws(()=>reviewReceiptSnapshot({...receipt,toolCalls:999}));
});

test('provider rejection does not fall back to free prose or spend another request',async t=>{
 const f=fixture(t);let requests=0;
 await assert.rejects(async()=>collect(await run(f,async()=>{requests++;return new Response('{}',{status:400,headers:{'content-type':'application/json'}});})),{code:'CHAT_PROVIDER_FAILED'});
 assert.equal(requests,1);assert.equal(f.receipt.reason,'provider_error');assert.equal(f.receipt.validatedProposals,0);assert.equal(f.receipt.emittedProposals,0);
 assert.equal(f.store.getCase('owner',f.record.id).version,f.record.version);
});

test('representative labelled and decimal evidence remains verbatim data in the scoped provider request',async t=>{
 const evidence='Property address: 128 Example Lane. Owner: Synthetic Property LLC. Contact: recipient@example.invalid. The current rent is USD 2,100.50. I saw an unverified rent of $2,200.75. Could you prepare a review card?';
 const f=fixture(t,evidence);assert.equal(f.input.reviewOperation,true);
 await collect(await run(f,async(_url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.messages.at(-1).content,evidence);
  return response({content:'Untrusted no-tool claim'},'stop');
 }));
 assert.equal(f.store.listMessages('owner',f.conversation.id).find(message=>message.id===f.user.id).content,evidence);
});
