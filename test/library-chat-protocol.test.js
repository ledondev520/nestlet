// Isolated protocol evidence: real HTTP streams + SQLite reads, authored provider fixtures.
// This suite does NOT call DeepSeek or establish live-provider acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID,scryptSync} from 'node:crypto';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {openStorage} from '../storage.js';
import {createLibraryToolSession} from '../agent-library-tools.js';
import {validateChatRequest,parseLibraryProviderStream,openLibraryChatStream,librarySourceEvent,libraryCitationGuard,libraryActivityEvent} from '../chat.js';
const password='public-retrieval-protocol-test',salt=randomBytes(16),hash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
const payload=(title='Synthetic Johnny case')=>({title,sourceText:'Public synthetic source: the inspection date is not confirmed.',fields:[],draftType:'followup',draftText:'',extractionMode:'manual',namesVerified:false});
function fixture(t){const directory=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-library-protocol-')),filename=join(directory,'private','case.sqlite');const storage=openStorage({filename});const alice=storage.createTrialUser({username:'protocol-alice',passwordHash:hash}),bob=storage.createTrialUser({username:'protocol-bob',passwordHash:hash});const record=storage.createCase(alice.id,payload());storage.createCase(bob.id,payload('Synthetic Johnny FOREIGN RECORD'));const cleanup=()=>{storage.close();rmSync(directory,{recursive:true,force:true});};if(t)t.after(cleanup);return{storage,alice,bob,record,directory,filename,cleanup};}
const chunk=choice=>`data: ${JSON.stringify({choices:[choice]})}\n\n`;
const finish=reason=>chunk({delta:{},finish_reason:reason})+'data: [DONE]\n\n';
const tool=(id,name,args)=>chunk({delta:{role:'assistant',reasoning_content:'HIDDEN FIXTURE REASONING',tool_calls:[{index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:null})+finish('tool_calls');
const answer=text=>chunk({delta:{role:'assistant',content:text},finish_reason:null})+finish('stop');
async function provider(handler){const requests=[];const server=http.createServer(async(req,res)=>{try{let body='';for await(const bytes of req)body+=bytes;const parsed=JSON.parse(body);requests.push(parsed);const output=await handler(parsed,requests.length,req,res);if(output!==undefined){res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(output);}}catch{res.writeHead(500);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;return{requests,url,fetchImpl:(_url,options)=>fetch(url,options),close:()=>new Promise(resolve=>server.close(resolve))};}
async function collect(stream){const events=[];for await(const event of stream)events.push(event);return events;}
const input=record=>validateChatRequest({caseId:record.id,locale:'en',consent:true,libraryConsent:true,libraryPermissionVersion:1,messages:[{role:'user',content:'Find my saved Johnny case and explain what is known.'}]});

test('opt-in is strict and omitted consent preserves the ordinary request contract',()=>{
  assert.equal(validateChatRequest({locale:'en',consent:true,messages:[{role:'user',content:'Ordinary chat'}]}).libraryConsent,false);
  for(const libraryConsent of ['true',1,null,{}])assert.throws(()=>validateChatRequest({locale:'en',consent:true,libraryConsent,messages:[{role:'user',content:'Question'}]}),{code:'CHAT_INVALID'});
});
test('real HTTP tool rounds search/read only the authenticated SQLite owner and emit durable verified references',async t=>{
  const f=fixture(t),requestId=randomUUID(),library=createLibraryToolSession({storage:f.storage,userId:f.alice.id,libraryConsent:true,currentCaseId:f.record.id});
  const upstream=await provider((body,round)=>{
    assert.equal(body.model,'deepseek-flash');assert.equal(body.stream,true);assert.deepEqual(body.thinking,{type:'disabled'});
    assert.doesNotMatch(JSON.stringify(body),/HIDDEN FIXTURE REASONING|FOREIGN RECORD/);
    if(round===1)return tool('lookup','search_library',{kind:'case',query:'Johnny',clientId:null,caseId:null});
    if(round===2){const result=JSON.parse(body.messages.at(-1).content);assert.equal(result.results.length,1);assert.equal(result.results[0].id,f.record.id);return tool('read','read_library',{kind:'case',id:f.record.id,offset:0});}
    assert.match(body.messages.at(-1).content,/inspection date is not confirmed/);
    return chunk({delta:{content:'The saved record is limited '}})+chunk({delta:{content:'['}})+chunk({delta:{content:'S1'}})+chunk({delta:{content:'].'}})+finish('stop');
  });t.after(upstream.close);
  const events=await collect(await openLibraryChatStream({authorizeLibrary:()=>{},apiKey:'public-protocol-fixture-only',input:input(f.record),record:f.record,library,requestId,fetchImpl:upstream.fetchImpl}));
  assert.equal(upstream.requests.length,3);assert.equal(library.getStats().calls,2);
  assert.deepEqual(events.filter(event=>event.type==='activity').map(({type,...activity})=>activity),[{phase:'searching',state:'started'},{phase:'searching',state:'completed',count:1},{phase:'reading',state:'started'},{phase:'reading',state:'completed',count:1}]);
  const sources=events.filter(event=>event.type==='sources');assert.equal(sources.length,1);assert.equal(sources[0].requestId,requestId);assert.equal(sources[0].items[0].retrievalState,'read');assert.equal(sources[0].items[0].id,f.record.id);
  const content=events.filter(event=>event.type==='delta').map(event=>event.text).join('')+sources[0].appendix;
  assert.match(content,/\[S1\]/);assert.match(content,new RegExp(requestId));assert.doesNotMatch(content,/HIDDEN FIXTURE REASONING|FOREIGN RECORD/);
  const conversation=f.storage.createConversation(f.alice.id,f.record.id,{});f.storage.appendMessage(f.alice.id,conversation.id,{role:'user',content:'Authored protocol question',state:'complete',requestId,clientMessageId:randomUUID()});
  f.storage.appendMessage(f.alice.id,conversation.id,{role:'assistant',content,state:'complete',requestId});
  assert.equal(f.storage.listMessages(f.alice.id,conversation.id).at(-1).content,content);assert.equal(events.at(-1).type,'done');
});
test('sensitive records produce sanitized tool errors and no private excerpt in a subsequent request',async t=>{
  const f=fixture(t);f.storage.createCase(f.alice.id,payload('Johnny SSN: 123-45-6789'));
  const library=createLibraryToolSession({storage:f.storage,userId:f.alice.id,libraryConsent:true});
  const upstream=await provider((body,round)=>{assert.doesNotMatch(JSON.stringify(body),/123-45-6789/);if(round===1)return tool('sensitive','search_library',{kind:'case',query:'Johnny',clientId:null,caseId:null});assert.equal(JSON.parse(body.messages.at(-1).content).error.code,'LIBRARY_SENSITIVE_DATA');return answer('The requested records could not be safely retrieved.');});t.after(upstream.close);
  const events=await collect(await openLibraryChatStream({authorizeLibrary:()=>{},apiKey:'public-fixture',input:input(f.record),record:f.record,library,requestId:randomUUID(),fetchImpl:upstream.fetchImpl}));
  assert.ok(events.some(event=>event.type==='activity'&&event.code==='LIBRARY_SENSITIVE_DATA'));assert.equal(events.some(event=>event.type==='sources'),false);
});
test('tool rounds stop at three and the fourth provider request disables further tools',async t=>{
  const f=fixture(t),library=createLibraryToolSession({storage:f.storage,userId:f.alice.id,libraryConsent:true});
  const upstream=await provider((body,round)=>{if(round<4)return tool('lookup'+round,'search_library',{kind:'case',query:'Johnny',clientId:null,caseId:null});assert.equal(body.tool_choice,'none');return answer('Available records were checked within the fixed limit [S1].');});t.after(upstream.close);
  await collect(await openLibraryChatStream({authorizeLibrary:()=>{},apiKey:'public-fixture',input:input(f.record),record:f.record,library,requestId:randomUUID(),fetchImpl:upstream.fetchImpl}));assert.equal(upstream.requests.length,4);assert.equal(library.getStats().rounds,3);
});
test('invented or split source labels never pass the citation guard; activities reject arbitrary payloads',()=>{
  const guard=libraryCitationGuard({getSources:()=>[{sourceId:'S1'}]});assert.equal(guard.push('Evidence ['),'Evidence ');assert.equal(guard.push('S1'), '');assert.equal(guard.push(']'), '[S1]');assert.equal(guard.finish(),'');
  const invalid=libraryCitationGuard({getSources:()=>[]});assert.equal(invalid.push('['),'');assert.equal(invalid.push('S999'),'');assert.throws(()=>invalid.push(']'),{code:'LIBRARY_UNVERIFIED_CITATION'});
  assert.deepEqual(libraryActivityEvent({phase:'reading',state:'completed',count:1,query:'not forwarded'}),{phase:'reading',state:'completed',count:1});assert.throws(()=>libraryActivityEvent({phase:'arbitrary SQL',state:'started'}),{code:'LIBRARY_UNAVAILABLE'});
});
test('stream parser rejects hidden role packets, oversized arguments, extra calls and truncated tool streams',async()=>{
  async function* bytes(text){yield text;}
  await assert.rejects(()=>collect(parseLibraryProviderStream(bytes(chunk({delta:{role:'system',content:'Never forward'}})+finish('stop')))),{code:'CHAT_UNSUPPORTED_OUTPUT'});
  await assert.rejects(()=>collect(parseLibraryProviderStream(bytes(tool('big','search_library',{query:'x'.repeat(4097)})))),{code:'LIBRARY_TOOL_LIMIT'});
  await assert.rejects(()=>collect(parseLibraryProviderStream(bytes(chunk({delta:{tool_calls:[{index:2,id:'third',type:'function',function:{name:'read_library',arguments:'{}'}}]}})+finish('tool_calls')))),{code:'CHAT_UNSUPPORTED_OUTPUT'});
  await assert.rejects(()=>collect(parseLibraryProviderStream(bytes(chunk({delta:{tool_calls:[{index:0,id:'pending',type:'function',function:{name:'read_library',arguments:'{}'}}]}})))),{code:'CHAT_INCOMPLETE'});
});
test('missing permission and cancellation cannot start or continue provider work',async t=>{
  const f=fixture(t);let called=0;
  await assert.rejects(()=>openLibraryChatStream({authorizeLibrary:()=>{},apiKey:'fixture',input:{...input(f.record),libraryConsent:false},library:createLibraryToolSession({storage:f.storage,userId:f.alice.id}),requestId:randomUUID(),fetchImpl:()=>{called++;}}),{code:'LIBRARY_CONSENT_REQUIRED'});assert.equal(called,0);
  const abort=new AbortController();abort.abort();await assert.rejects(()=>openLibraryChatStream({authorizeLibrary:()=>{},apiKey:'fixture',input:input(f.record),library:createLibraryToolSession({storage:f.storage,userId:f.alice.id,libraryConsent:true,signal:abort.signal}),signal:abort.signal,requestId:randomUUID(),fetchImpl:()=>{called++;}}),{code:'LIBRARY_ABORTED'});assert.equal(called,0);
});

test('cancelling after an actual tool read prevents another provider request',async t=>{
  const f=fixture(t),abort=new AbortController(),library=createLibraryToolSession({storage:f.storage,userId:f.alice.id,libraryConsent:true,signal:abort.signal});
  const upstream=await provider(()=>tool('lookup','search_library',{kind:'case',query:'Johnny',clientId:null,caseId:null}));t.after(upstream.close);
  const events=await openLibraryChatStream({authorizeLibrary:()=>{},apiKey:'fixture',input:input(f.record),record:f.record,signal:abort.signal,library,requestId:randomUUID(),fetchImpl:upstream.fetchImpl});
  await assert.rejects(async()=>{for await(const event of events)if(event.type==='activity'&&event.state==='completed')abort.abort();},{code:'LIBRARY_ABORTED'});
  assert.equal(upstream.requests.length,1);assert.equal(library.getStats().calls,1);
});

test('actual chat HTTP integration persists the server appendix exactly once and keeps consent-off streaming unchanged',async()=>{
  const f=fixture();let child,upstream;
  try{
    const own=f.storage.createCase('owner',payload('Johnny owner fixture')),conversation=f.storage.createConversation('owner',own.id,{});
    upstream=await provider((body,_round,_req,res)=>{
      if(body.stream===false){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'deepseek-flash',choices:[{message:{content:'Saved case search'},finish_reason:'stop'}]}));return;}
      assert.match(body.messages[0].content,/Official-source reference context:/);
      assert.match(body.messages[0].content,/"id":"oha"/);
      assert.match(body.messages[0].content,/https:\/\/www\.oakha\.org/);
      assert.match(body.messages[0].content,/"acceptanceStatus":"unconfirmed"/);
      if(!body.tools)return answer('Ordinary authored protocol response.');
      const toolResults=body.messages.filter(message=>message.role==='tool');
      if(!toolResults.length)return tool('owner_lookup','search_library',{kind:'case',query:'Johnny',clientId:null,caseId:null});
      assert.doesNotMatch(JSON.stringify(toolResults),/FOREIGN RECORD/);
      const current=body.messages.filter(message=>message.role==='user').at(-1).content;
      if(current==='Make length failure')return chunk({delta:{content:'Partial fixture with a checked source [S1].'}})+finish('length');
      if(current==='Disconnect fixture'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(chunk({delta:{content:'Partial fixture before disconnect [S1].'}}));return;}
      return answer('A matching saved case was found [S1].');
    });
    // This test-only preload redirects the fixed provider URL to our local protocol fixture.
    // The product has no provider-URL setting, fallback, or fake-answer path.
    const preload=join(f.directory,'protocol-fetch.mjs');writeFileSync(preload,`const original=globalThis.fetch;globalThis.fetch=(url,options)=>original(String(url)==='https://api.deepseek.com/chat/completions'?${JSON.stringify(upstream.url)}:url,options);`);
    const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
    const url=`http://127.0.0.1:${port}`,origin='https://library-protocol.invalid';
    child=spawn(process.execPath,['--import',preload,'server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:origin,NESTLET_DB_PATH:f.filename,NESTLET_ASSET_ROOT:join(f.directory,'assets'),NESTLET_OPERATOR_PASSWORD_HASH:hash,NESTLET_OPERATOR_USERNAME:'owner',DEEPSEEK_API_KEY:'public-protocol-fixture-not-a-provider-key',ENABLE_LIVE_AI:'true',DEEPSEEK_MODEL:'deepseek-flash'},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Local protocol app did not start')),10000);child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('Local app exited'));});child.stdout.on('data',data=>{if(data.toString().includes('Nestlet available')){clearTimeout(timer);resolve();}});});
    const login=await fetch(url+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0],session=await login.json();
    const headers={Origin:origin,Cookie:cookie,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'};
    const status=await(await fetch(url+'/api/status',{headers})).json();assert.equal(status.libraryRetrievalEnabled,true);
    const permission=await(await fetch(url+'/api/library-permission',{headers})).json();
    const granted=await fetch(url+'/api/library-permission',{method:'PUT',headers,body:JSON.stringify({decision:'allow',expectedVersion:permission.version,provider:permission.provider,policyVersion:permission.policyVersion,category:permission.category})});
    assert.equal(granted.status,200);const grant=await granted.json();
    const send=(libraryConsent,content=libraryConsent?'Find the saved Johnny case.':'An ordinary next question.',clientMessageId=randomUUID())=>fetch(url+'/api/chat',{method:'POST',headers,body:JSON.stringify({locale:'en',consent:true,libraryConsent,...(libraryConsent?{libraryPermissionVersion:grant.version}:{}),guidanceAgency:'oha',caseId:own.id,conversationId:conversation.id,clientMessageId,messages:[{role:'user',content}]})});
    const response=await send(true);assert.equal(response.status,200);assert.equal(response.headers.get('x-library-retrieval'),'enabled');const text=await response.text();
    const frames=text.trim().split(/\n\n/u).map(frame=>({event:frame.match(/^event: (.+)$/mu)?.[1],data:JSON.parse(frame.match(/^data: (.+)$/mu)[1])}));
    const sourceFrames=frames.filter(frame=>frame.event==='sources');assert.equal(sourceFrames.length,1);const source=sourceFrames[0].data;
    const done=frames.find(frame=>frame.event==='done').data;assert.equal(done.requestId,source.requestId);
    const expected=frames.filter(frame=>frame.event==='delta').map(frame=>frame.data.text).join('')+source.appendix;
    const saved=f.storage.listMessages('owner',conversation.id).at(-1);assert.equal(saved.id,done.assistantMessageId);assert.equal(saved.state,'complete');assert.equal(saved.content,expected);assert.equal(saved.content.split('Server-recorded sources').length-1,1);
    const plain=await send(false);assert.equal(plain.status,200);assert.equal(plain.headers.get('x-library-retrieval'),null);const ordinary=await plain.text();assert.doesNotMatch(ordinary,/event: (?:sources|activity)/);assert.match(ordinary,/Ordinary authored protocol response/);
    assert.equal(upstream.requests.filter(body=>body.stream).length,3);
    assert.equal(upstream.requests.filter(body=>body.stream===false).length,1);
    const failedResponse=await send(true,'Make length failure');const failedText=await failedResponse.text();
    const failedFrames=failedText.trim().split(/\n\n/u).map(frame=>({event:frame.match(/^event: (.+)$/mu)?.[1],data:JSON.parse(frame.match(/^data: (.+)$/mu)[1])}));
    const failedSource=failedFrames.find(frame=>frame.event==='sources').data,failedEvent=failedFrames.find(frame=>frame.event==='error').data;
    assert.equal(failedSource.requestId,failedEvent.requestId);assert.equal(failedEvent.code,'CHAT_INCOMPLETE');assert.equal(failedFrames.filter(frame=>frame.event==='sources').length,1);
    const failedSaved=f.storage.listMessages('owner',conversation.id).at(-1);assert.equal(failedSaved.state,'failed');assert.equal(failedSaved.content,failedFrames.filter(frame=>frame.event==='delta').map(frame=>frame.data.text).join('')+failedSource.appendix);
    const disconnect=await send(true,'Disconnect fixture');const interruptedRequestId=disconnect.headers.get('x-request-id'),reader=disconnect.body.getReader();let received='';
    while(!received.includes('Partial fixture before disconnect')){const next=await reader.read();assert.equal(next.done,false);received+=new TextDecoder().decode(next.value);}
    await reader.cancel();let interrupted;
    for(let attempt=0;attempt<200;attempt++){interrupted=f.storage.listMessages('owner',conversation.id).find(message=>message.role==='assistant'&&message.requestId===interruptedRequestId);if(interrupted)break;await new Promise(resolve=>setTimeout(resolve,10));}
    assert.ok(interrupted);assert.equal(interrupted.state,'interrupted');assert.match(interrupted.content,/Partial fixture before disconnect/);assert.equal(interrupted.content.split('Server-recorded sources').length-1,1);assert.match(interrupted.content,new RegExp(interruptedRequestId));
    const afterCancel=await send(false);assert.equal(afterCancel.status,200);await afterCancel.text();assert.equal(upstream.requests.filter(body=>body.stream).length,8);
    const database=new DatabaseSync(f.filename);
    try{
      database.exec("CREATE TRIGGER reject_protocol_assistant BEFORE INSERT ON messages WHEN NEW.role='assistant' BEGIN SELECT RAISE(ABORT,'public fixture save failure'); END;");
      const duplicateId=randomUUID(),beforeProvider=upstream.requests.length;
      const saveFailure=await send(true,'Save failure fixture',duplicateId),saveFailureText=await saveFailure.text();
      assert.match(saveFailureText,/CHAT_SAVE_FAILED/);assert.doesNotMatch(saveFailureText,/event: done/);assert.equal(saveFailureText.split('event: sources').length-1,1);
      const failedRequest=saveFailure.headers.get('x-request-id');assert.equal(f.storage.listMessages('owner',conversation.id).filter(message=>message.requestId===failedRequest).length,1);
      assert.equal(upstream.requests.length,beforeProvider+2);
      const duplicate=await send(true,'Save failure fixture',duplicateId);assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).code,'CHAT_TURN_EXISTS');assert.equal(upstream.requests.length,beforeProvider+2);
    }finally{database.exec('DROP TRIGGER reject_protocol_assistant');database.close();}

  }finally{
    if(child&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});if(upstream)await upstream.close();f.cleanup();
  }
});

test('tool preamble text cannot turn an empty final provider round into a completed answer',async t=>{
  const f=fixture(t),library=createLibraryToolSession({storage:f.storage,userId:f.alice.id,libraryConsent:true,currentCaseId:f.record.id});
  const upstream=await provider((body,round)=>{
    assert.doesNotMatch(body.messages[0].content,/You have no tools/);
    if(round===1)return chunk({delta:{content:'I will check the record.'}})+tool('read_case','read_library',{kind:'case',id:f.record.id,offset:0});
    return finish('stop');
  });t.after(upstream.close);
  await assert.rejects(()=>openLibraryChatStream({authorizeLibrary:()=>{},apiKey:'fixture',input:input(f.record),record:f.record,library,requestId:randomUUID(),fetchImpl:upstream.fetchImpl}).then(collect),{code:'CHAT_INCOMPLETE'});
});
test('durable source text retains truncation, stale-version and sanitized-character scope qualifiers',()=>{
  const requestId=randomUUID();const result=librarySourceEvent({getSources:()=>[{sourceId:'S1',kind:'artifact',id:randomUUID(),version:2,title:'Authored synthetic long title '.repeat(8),titleTruncated:true,retrievalState:'read',status:'final',isStale:true,needsRegeneration:true,sourceCaseVersion:3,currentCaseVersion:4,truncated:true,excerpts:[{offset:6000,endOffset:12000,textLength:15000,offsetBasis:'sanitized-extracted-text-characters'}]}]},requestId);
  for(const expected of ['partial=true','stale=true','regenerate=true','source-case-v3','current-case-v4','sanitized-chars 6000:12000/15000','title shortened'])assert.ok(result.appendix.includes(expected),expected);
  assert.ok(result.appendix.length<=16000);
});
