// Synthetic contract and real disposable SQLite tests. No provider calls or model-success claims.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {FIELDS} from '../public/core.js';
import {openStorage} from '../storage.js';
import {loadConversationAction,validateConversationAction,conversationActionContext,conversationActionTools} from '../conversation-action-contract.js';
import {createConversationToolSession,validateChatRequest,chatProviderMessages} from '../chat.js';
const base={title:'Synthetic case',sourceText:'',fields:[],draftType:'followup',draftText:''};
function fixture(t){
  const directory=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-actions-')),filename=join(directory,'db.sqlite');
  const store=openStorage({filename}),record=store.createCase('owner',base),conversation=store.createConversation('owner',record.id,{});
  const message=store.appendMessage('owner',conversation.id,{role:'assistant',content:'Synthetic English answer for human review.',state:'complete'});
  const request={action:'prepare_answer_draft',expectedVersion:record.version,sourceConversationId:conversation.id,sourceMessageId:message.id,kind:'followup'};
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return{directory,filename,store,record,conversation,message,request};
}
const code=expected=>error=>error.code===expected;
test('preparation and cancel write nothing; drafts reread complete same-case source and remain unreviewed',t=>{
  const{store,record,request,message}=fixture(t);
  const proposal=loadConversationAction(store,'owner',record,request);
  assert.match(proposal.content,/UNREVIEWED/);assert.match(proposal.content,new RegExp(message.content));
  assert.equal(proposal.requiresExplicitApply,true);assert.deepEqual(store.listArtifacts('owner',record.id),[]);
  const artifact=store.createConversationAnswerDraft('owner',record.id,request);
  assert.equal(artifact.status,'draft');assert.equal(artifact.sourceMessageId,message.id);assert.equal(store.getCase('owner',record.id).version,1);
  assert.equal(store.createConversationAnswerDraft('owner',record.id,request).id,artifact.id);
});
test('unknown owner, confirm, status, source text and issue resolution fields are rejected',t=>{
  const{request}=fixture(t);
  for(const key of ['owner','userId','confirm','status','content','resolved','source']) assert.throws(()=>validateConversationAction({...request,[key]:true}),code('CONVERSATION_ACTION_INVALID'));
  assert.throws(()=>validateConversationAction({...request,action:'finalize'}),code('CONVERSATION_ACTION_INVALID'));
});
test('source mismatch, incomplete and local-only IDs cannot execute; stale version does not write',t=>{
  const{store,record,request,conversation}=fixture(t);
  const other=store.createCase('owner',{...base,title:'Other synthetic case'});
  assert.throws(()=>store.createConversationAnswerDraft('owner',other.id,request),code('CONVERSATION_ACTION_SOURCE_NOT_FOUND'));
  for(const state of ['interrupted','failed']){
    const source=store.appendMessage('owner',conversation.id,{role:'assistant',content:'Partial',state});
    assert.throws(()=>store.createConversationAnswerDraft('owner',record.id,{...request,sourceMessageId:source.id}),code('CONVERSATION_ACTION_SOURCE_INCOMPLETE'));
  }
  assert.throws(()=>store.createConversationAnswerDraft('owner',record.id,{...request,sourceMessageId:randomUUID()}),code('CONVERSATION_ACTION_SOURCE_NOT_FOUND'));
  store.updateCase('owner',record.id,{...base,title:'New title'},1);
  assert.throws(()=>store.createConversationAnswerDraft('owner',record.id,request),code('CASE_CONFLICT'));assert.equal(store.listArtifacts('owner',record.id).length,0);
});
test('fact previews retain confirmed facts, flag conflicts and derive provenance from saved messages',t=>{
  const{store,record,request}=fixture(t);
  const updated=store.updateCase('owner',record.id,{...base,fields:FIELDS.map(key=>({key,value:key==='property'?'Synthetic home':'',source:'Human review',confirmed:key==='property',conflict:false})),documentContext:{senderName:{value:'Synthetic sender',source:'Human review',confirmed:true,confirmedAt:'2026-01-01T00:00:00.000Z'}}},1);
  const {kind,...source}=request;
  const suggestion={...source,action:'prepare_case_suggestion',expectedVersion:updated.version,factChanges:{property:{value:'Conflicting home'},rent:{value:'$2,000'}},changes:{senderName:{value:'Synthetic sender'},recipientName:{value:'Synthetic recipient'}}};
  const result=loadConversationAction(store,'owner',updated,suggestion);
  assert.deepEqual(result.conflicts,['property']);assert.equal(result.confirm,false);assert.equal(result.factChanges.property,undefined);assert.equal(result.changes.senderName,undefined);
  assert.match(result.factChanges.rent.source,new RegExp(request.sourceMessageId));assert.equal(result.changes.recipientName.sourceMessageId,request.sourceMessageId);
  assert.equal(store.getCase('owner',record.id).version,updated.version);
  assert.throws(()=>validateConversationAction({...suggestion,factChanges:{rent:{value:'1',confirmed:true}}}),code('CONVERSATION_ACTION_INVALID'));
});
test('prepare tools are opt-in, bounded and read-only with no library consent expansion',t=>{
  const{store,record,conversation,request}=fixture(t);
  const tools=createConversationToolSession({storage:store,userId:'owner',record,conversationId:conversation.id});
  assert.deepEqual(tools.tools.map(tool=>tool.function.name),['prepare_case_suggestion','prepare_answer_draft']);
  const{action,...args}=request;
  const result=tools.executeRound([{id:'prepare1',type:'function',function:{name:action,arguments:JSON.stringify(args)}}]);
  assert.equal(result.proposals.length,1);assert.equal(store.listArtifacts('owner',record.id).length,0);
  const invalid=tools.executeRound([{id:'read1',type:'function',function:{name:'read_library',arguments:'{}'}}]);assert.equal(JSON.parse(invalid.messages[0].content).ok,false);
  assert.throws(()=>validateChatRequest({locale:'en',consent:true,actionConsent:true,messages:[{role:'user',content:'Synthetic request'}]}),code('CHAT_INVALID'));
});
test('simultaneous processes and a lost response converge on one durable draft; restart preserves source',async t=>{
  const{filename,store,record,request}=fixture(t);
  const script=`import {openStorage} from './storage.js';const s=openStorage({filename:process.env.ACTION_DB});const a=s.createConversationAnswerDraft('owner',process.env.ACTION_CASE,JSON.parse(process.env.ACTION_INPUT));console.log(a.id);s.close();`;
  const run=()=>new Promise((resolve,reject)=>{let output='',error='';const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../',import.meta.url),env:{...process.env,ACTION_DB:filename,ACTION_CASE:record.id,ACTION_INPUT:JSON.stringify(request)},stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>error+=x);child.on('error',reject);child.on('exit',status=>status===0?resolve(output.trim()):reject(new Error(error)));});
  const ids=await Promise.all([run(),run(),run(),run()]);assert.equal(new Set(ids).size,1);assert.equal(store.listArtifacts('owner',record.id).length,1);
  const reopened=openStorage({filename});t.after(()=>reopened.close());const artifact=reopened.getArtifact('owner',ids[0]);assert.equal(artifact.status,'draft');assert.equal(artifact.sourceMessageId,request.sourceMessageId);assert.equal(reopened.createConversationAnswerDraft('owner',record.id,request).id,ids[0]);
});

test('mixed read/prepare rounds share aggregate budgets and cannot cross conversation scope',async t=>{
  const {createLibraryToolSession,LIBRARY_AGENT_LIMITS}=await import('../agent-library-tools.js');
  const{store,record,conversation,request}=fixture(t);
  const library=createLibraryToolSession({storage:store,userId:'owner',libraryConsent:true,currentCaseId:record.id});
  const session=createConversationToolSession({storage:store,userId:'owner',record,conversationId:conversation.id,library});
  const call=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
  const{action,...args}=request;
  const mixed=session.executeRound([call('read','read_library',{kind:'case',id:record.id,offset:0}),call('prepare',action,args)]);
  assert.equal(mixed.messages.length,2);assert.equal(mixed.proposals.length,1);assert.equal(session.getSources().length,1);assert.equal(session.getStats().calls,2);
  const other=store.createConversation('owner',record.id,{});
  const invalid=session.executeRound([call('other',action,{...args,sourceConversationId:other.id})]);assert.equal(invalid.proposals.length,0);
  session.executeRound([call('again',action,args)]);
  assert.throws(()=>session.executeRound([call('exhausted',action,args)]),code('LIBRARY_TOOL_LIMIT'));
  assert.ok(session.getStats().resultChars<=LIBRARY_AGENT_LIMITS.resultChars);
  const large=store.appendMessage('owner',conversation.id,{role:'assistant',state:'complete',content:'Synthetic '.repeat(3000)});
  const bounded=createConversationToolSession({storage:store,userId:'owner',record,conversationId:conversation.id});
  const refused=bounded.executeRound([call('large',action,{...args,sourceMessageId:large.id})]);assert.equal(refused.proposals.length,0);assert.equal(JSON.parse(refused.messages[0].content).error.code,'LIBRARY_RESULT_LIMIT');assert.ok(bounded.getStats().resultChars<LIBRARY_AGENT_LIMITS.resultChars);
  assert.equal(store.listArtifacts('owner',record.id).length,0);
});
test('authored provider protocol emits a tentative proposal then done without any case write',async t=>{
  const {openLibraryChatStream}=await import('../chat.js');
  const{store,record,conversation,request}=fixture(t);
  const library=createConversationToolSession({storage:store,userId:'owner',record,conversationId:conversation.id});
  const input=validateChatRequest({caseId:record.id,conversationId:conversation.id,clientMessageId:randomUUID(),locale:'en',consent:true,actionConsent:true,messages:[{role:'user',content:'Prepare the earlier answer as a draft.'}]});
  input.actionContext={caseId:record.id,expectedVersion:record.version,conversationId:conversation.id,messages:[{id:request.sourceMessageId,role:'assistant'}]};
  const{action,...args}=request;let calls=0;
  const packet=choice=>`data: ${JSON.stringify({choices:[choice]})}\n\n`;
  const fetchImpl=async(_url,options)=>{
    calls++;const body=JSON.parse(options.body);assert.deepEqual(body.tools.map(tool=>tool.function.name),['prepare_case_suggestion','prepare_answer_draft']);
    const delta=calls===1?{tool_calls:[{index:0,id:'prepare',type:'function',function:{name:action,arguments:JSON.stringify(args)}}]}:{content:'A draft preview is ready for explicit review.'};
    return new Response(packet({delta})+packet({delta:{},finish_reason:calls===1?'tool_calls':'stop'})+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  };
  const events=[];for await(const event of await openLibraryChatStream({apiKey:'synthetic-protocol-only',input,record,library,requestId:randomUUID(),fetchImpl}))events.push(event);
  assert.equal(calls,2);assert.equal(events.filter(event=>event.type==='proposal').length,1);assert.equal(events.at(-1).type,'done');assert.equal(store.listArtifacts('owner',record.id).length,0);
});
test('legacy source-linked draft POST storage path now atomically reuses exact source and body',t=>{
  const{store,record,request}=fixture(t);
  const payload={kind:'followup',status:'draft',content:'Synthetic manually edited answer',sourceMessageId:request.sourceMessageId,expectedCaseVersion:record.version};
  const first=store.createArtifact('owner',record.id,payload),second=store.createArtifact('owner',record.id,payload);
  assert.equal(first.id,second.id);assert.equal(second.sourceConversationId,request.sourceConversationId);
  assert.notEqual(store.createArtifact('owner',record.id,{...payload,content:'A changed synthetic answer'}).id,first.id);
});

test('prepare then read exhaustion returns a bounded tool error without committing a citation',async t=>{
  const {createLibraryToolSession,LIBRARY_AGENT_LIMITS}=await import('../agent-library-tools.js');
  const{store,record,conversation,request}=fixture(t);
  const updated=store.updateCase('owner',record.id,{...base,sourceText:'Synthetic evidence. '.repeat(600)},record.version);
  const message=store.appendMessage('owner',conversation.id,{role:'assistant',content:'x'.repeat(9500),state:'complete'});
  const library=createLibraryToolSession({storage:store,userId:'owner',libraryConsent:true,currentCaseId:record.id});
  const session=createConversationToolSession({storage:store,userId:'owner',record:updated,conversationId:conversation.id,library});
  const call=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
  const{action,...args}=request;args.expectedVersion=updated.version;args.sourceMessageId=message.id;
  assert.equal(session.executeRound([call('prepare1',action,args)]).proposals.length,1);
  assert.equal(session.executeRound([call('prepare2',action,args)]).proposals.length,1);
  const result=session.executeRound([call('read','read_library',{kind:'case',id:record.id,offset:0})]);
  assert.equal(JSON.parse(result.messages[0].content).error.code,'LIBRARY_RESULT_LIMIT');
  assert.ok(session.getStats().resultChars<=LIBRARY_AGENT_LIMITS.resultChars);
  assert.deepEqual(session.getSources(),[]);assert.equal(store.listArtifacts('owner',record.id).length,0);
});

test('a prepare before read in the same batch precharges read bytes and preserves result order',async t=>{
  const {createLibraryToolSession,LIBRARY_AGENT_LIMITS}=await import('../agent-library-tools.js');
  const{store,record,conversation,request}=fixture(t);
  const updated=store.updateCase('owner',record.id,{...base,sourceText:'Synthetic evidence. '.repeat(600)},record.version);
  const message=store.appendMessage('owner',conversation.id,{role:'assistant',content:'x'.repeat(9500),state:'complete'});
  const library=createLibraryToolSession({storage:store,userId:'owner',libraryConsent:true,currentCaseId:record.id});
  const session=createConversationToolSession({storage:store,userId:'owner',record:updated,conversationId:conversation.id,library});
  const call=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
  const{action,...args}=request;args.expectedVersion=updated.version;args.sourceMessageId=message.id;
  assert.equal(session.executeRound([call('first',action,args)]).proposals.length,1);
  const mixed=session.executeRound([call('prepare',action,args),call('read','read_library',{kind:'case',id:record.id,offset:0})]);
  assert.deepEqual(mixed.messages.map(row=>row.tool_call_id),['prepare','read']);
  assert.equal(JSON.parse(mixed.messages[0].content).error.code,'LIBRARY_RESULT_LIMIT');assert.equal(JSON.parse(mixed.messages[1].content).ok,true);
  assert.equal(mixed.proposals.length,0);assert.equal(session.getSources().length,1);assert.ok(session.getStats().resultChars<=LIBRARY_AGENT_LIMITS.resultChars);
});
test('last round reserves error room for later calls within the same batch',t=>{
  const{store,record,conversation,request}=fixture(t);
  const session=createConversationToolSession({storage:store,userId:'owner',record,conversationId:conversation.id});
  const call=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
  for(let round=0;round<2;round++)session.executeRound([call('a'+round,'unknown',{}),call('b'+round,'unknown',{})]);
  const{action,...args}=request;
  const big=store.appendMessage('owner',conversation.id,{role:'assistant',state:'complete',content:'x'.repeat(22500)});
  const result=session.executeRound([call('near-limit',action,{...args,sourceMessageId:big.id}),call('after','unknown',{})]);
  assert.equal(result.messages.length,2);assert.ok(session.getStats().resultChars<=24000);assert.equal(JSON.parse(result.messages[1].content).ok,false);
});


test('source catalogue maps older eligible answers, persisted draft versions and bounded previews without cross-scope leakage',t=>{
  const {store,record,conversation,message,request}=fixture(t);
  const artifact=store.createConversationAnswerDraft('owner',record.id,request);
  const edited=store.createArtifact('owner',record.id,{kind:'followup',title:artifact.title,status:'draft',content:'Edited synthetic English draft.',sourceMessageId:message.id,expectedCaseVersion:record.version});
  const user=store.appendMessage('owner',conversation.id,{role:'user',state:'complete',content:'Prepare the earlier complete English letter.'});
  const bilingual=store.appendMessage('owner',conversation.id,{role:'assistant',state:'complete',content:'以下是信件。Dear recipient, synthetic draft.'});
  const interrupted=store.appendMessage('owner',conversation.id,{role:'assistant',state:'interrupted',content:'Partial English letter'});
  for(let i=0;i<12;i++)store.appendMessage('owner',conversation.id,{role:'user',state:'complete',content:'Later synthetic request '+i});
  const context=conversationActionContext(store,'owner',record,conversation.id);
  const source=context.messages.find(row=>row.id===message.id);
  assert.equal(source.answerDraftEligible,true);assert.equal(source.contentPreview,message.content);
  assert.deepEqual(source.savedArtifacts.map(row=>row.version).sort(),[1,2]);
  assert.ok(source.savedArtifacts.some(row=>row.id===artifact.id));assert.ok(source.savedArtifacts.some(row=>row.id===edited.id));
  assert.equal(context.sourceCatalogueIncomplete,true);
  assert.ok(!context.messages.some(row=>row.id===interrupted.id));
  const tools=conversationActionTools(context),draft=tools.find(tool=>tool.function.name==='prepare_answer_draft');
  assert.deepEqual(draft.function.parameters.properties.sourceMessageId.enum,[message.id]);
  assert.deepEqual(draft.function.parameters.properties.sourceConversationId.enum,[conversation.id]);
  assert.ok(!draft.function.parameters.properties.sourceMessageId.enum.includes(user.id));
  assert.ok(!draft.function.parameters.properties.sourceMessageId.enum.includes(bilingual.id));
  assert.ok(context.messages.length<=20);
  assert.equal(source.savedArtifacts[0].isStale,false);
  const updated=store.updateCase('owner',record.id,{...base,title:'Updated synthetic facts'},record.version);
  const stale=conversationActionContext(store,'owner',updated,conversation.id).messages.find(row=>row.id===message.id);
  assert.ok(stale.savedArtifacts.every(row=>row.isStale && row.sourceCaseVersion===record.version));
  const other=store.createCase('owner',{...base,title:'Other'});
  assert.throws(()=>conversationActionContext(store,'owner',other,conversation.id),code('CONVERSATION_ACTION_SOURCE_NOT_FOUND'));
  assert.throws(()=>conversationActionContext(store,'different-owner',record,conversation.id));
});

test('wrong user source returns recoverable eligible IDs and never substitutes or writes; retry retains exact provenance',t=>{
  const {store,record,conversation,message,request}=fixture(t);
  const user=store.appendMessage('owner',conversation.id,{role:'user',state:'complete',content:'Make a draft of the earlier letter.'});
  const bilingual=store.appendMessage('owner',conversation.id,{role:'assistant',state:'complete',content:'中文 prefaced English letter.'});
  const session=createConversationToolSession({storage:store,userId:'owner',record,conversationId:conversation.id});
  const {action,...args}=request;
  const call=(id,sourceMessageId)=>({id,type:'function',function:{name:action,arguments:JSON.stringify({...args,sourceMessageId})}});
  const bad=session.executeRound([call('bad',user.id)]),error=JSON.parse(bad.messages[0].content);
  assert.equal(error.ok,false);assert.deepEqual(error.error.eligibleSourceMessageIds,[message.id]);assert.deepEqual(bad.proposals,[]);
  assert.equal(store.listArtifacts('owner',record.id).length,0);
  const mixed=session.executeRound([call('bilingual',bilingual.id)]);
  assert.equal(JSON.parse(mixed.messages[0].content).error.code,'DOCUMENT_ENGLISH_REQUIRED');
  const retried=session.executeRound([call('retry',message.id)]);
  assert.equal(retried.proposals[0].sourceMessageId,message.id);assert.match(retried.proposals[0].content,new RegExp(message.content));
  assert.equal(store.listArtifacts('owner',record.id).length,0);
});

test('no complete English assistant answer means no answer draft tool, not a made-up source',t=>{
  const {store,record}=fixture(t),conversation=store.createConversation('owner',record.id,{});
  store.appendMessage('owner',conversation.id,{role:'user',state:'complete',content:'Create an English draft.'});
  store.appendMessage('owner',conversation.id,{role:'assistant',state:'interrupted',content:'Dear recipient,'});
  const context=conversationActionContext(store,'owner',record,conversation.id);
  assert.deepEqual(conversationActionTools(context).map(tool=>tool.function.name),['prepare_case_suggestion']);
});

test('provider receives grounded source mapping and truthful, English-only draft instructions',async t=>{
  const {openLibraryChatStream}=await import('../chat.js');
  const {store,record,conversation,message,request}=fixture(t);
  store.createConversationAnswerDraft('owner',record.id,request);
  const user=store.appendMessage('owner',conversation.id,{role:'user',state:'complete',content:'Prepare the previous English letter.'});
  const library=createConversationToolSession({storage:store,userId:'owner',record,conversationId:conversation.id});
  const input={actionConsent:true,locale:'zh',messages:[{role:'user',content:user.content}],actionContext:conversationActionContext(store,'owner',record,conversation.id)};
  let called=0;
  const fetchImpl=async(_url,options)=>{
    called++;const body=JSON.parse(options.body),system=body.messages[0].content;
    assert.match(system,/entire response English/);assert.match(system,/Never ask the end user to supply internal message IDs/);
    assert.match(system,/preview exists only after a prepare tool returns ok:true/);
    assert.match(system,/savedArtifacts/);assert.match(system,new RegExp(message.content));
    const draft=body.tools.find(tool=>tool.function.name==='prepare_answer_draft');
    assert.deepEqual(draft.function.parameters.properties.sourceMessageId.enum,[message.id]);
    return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Please review the saved draft.'}}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  };
  const events=[];for await(const event of await openLibraryChatStream({apiKey:'synthetic-only',input,record,library,requestId:randomUUID(),fetchImpl}))events.push(event);
  assert.equal(called,1);assert.equal(events.filter(event=>event.type==='proposal').length,0);
  assert.equal(store.listArtifacts('owner',record.id).length,1);
});

// Historical assistant prose must remain data; current action-enabled instructions describe
// only the implemented targeted human-review path, without changing the chat history.
test('action-enabled prompt prefers supported in-chat human review over historical editor guidance', async t => {
  const {openLibraryChatStream} = await import('../chat.js');
  const {store, record, conversation} = fixture(t);
  const history = [
    {role:'assistant', content:'Open the materials editor to resolve every conflict.'},
    {role:'user', content:'Can I review this here?'}
  ];
  const input = {actionConsent:true, locale:'en', messages:history, actionContext:conversationActionContext(store,'owner',record,conversation.id)};
  const library = createConversationToolSession({storage:store,userId:'owner',record,conversationId:conversation.id});
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body), system = body.messages[0].content;
    assert.match(system, /prefer the existing in-chat review controls/);
    assert.match(system, /Follow the requested document type and language/);
    assert.match(system, /do not add an unsolicited document draft to a review question/);
    assert.match(system, /Never invent the sender’s role, representation or authority/);
    assert.match(system, /without exposing internal API paths or field identifiers/);
    assert.match(system, /Once the answer is complete and saved/);
    assert.match(system, /single detail.*change to/);
    assert.match(system, /supports conflicting values.*never choose it for them/);
    assert.match(system, /Only a fresh human answer targeted to that displayed review/);
    assert.match(system, /Do not promise that arbitrary free-text replies or multi-field corrections are automatically applied/);
    assert.match(system, /Do not claim a review card exists without a successful preview, or a save succeeded without a persisted result/);
    assert.match(system, /materials editor remains an optional manual route/);
    assert.match(system, /Earlier assistant messages may describe outdated UI/);
    assert.deepEqual(body.messages.slice(-2), history);
    return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Please check the proposed values.'}}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  };
  const events = [];
  for await (const event of await openLibraryChatStream({apiKey:'synthetic-only',input,record,library,requestId:randomUUID(),fetchImpl})) events.push(event);
  assert.equal(calls, 1);
  assert.equal(events.filter(event=>event.type==='proposal').length, 0);
  assert.equal(store.getCase('owner',record.id).version, record.version);
  assert.doesNotMatch(chatProviderMessages({...input,actionConsent:false},record)[0].content, /existing in-chat review controls/);
});
