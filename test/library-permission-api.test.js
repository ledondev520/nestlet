// Actual local HTTP/SQLite with authored provider SSE. Never calls a live model.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStorage } from '../storage.js';
import { createLibraryToolSession } from '../agent-library-tools.js';
import { createConversationToolSession, openLibraryChatStream, validateChatRequest } from '../chat.js';
import { LIBRARY_PERMISSION_SCOPE } from '../library-consent-storage.js';
const password='synthetic-consent-test',salt=randomBytes(16),hash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
const change=(state,decision)=>({decision,expectedVersion:state.version,provider:state.provider,policyVersion:state.policyVersion,category:state.category});
const chunk=delta=>`data: ${JSON.stringify({choices:[{delta,finish_reason:null}]})}\n\n`;
const finish='data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
const chat=(libraryPermissionVersion, content='Synthetic question',extra={})=>({locale:'en',consent:true,messages:[{role:'user',content}],...(libraryPermissionVersion===undefined?{}:{libraryConsent:true,libraryPermissionVersion}),...extra});
async function harness(t) {
 const directory=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-consent-http-')),filename=join(directory,'private','records.sqlite');
 const store=openStorage({filename});
 const bob=store.createTrialUser({username:'consent-bob',passwordHash:hash});
 const requests=[],pending=new Map();
 const upstream=http.createServer(async(req,res)=>{
  let bytes='';for await(const part of req)bytes+=part;
  const body=JSON.parse(bytes);requests.push(body);
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const content=body.messages.filter(item=>item.role==='user').at(-1).content;
  if(content==='Read then hold' && !body.messages.some(message=>message.role==='tool')) {
    res.end(chunk({tool_calls:[{index:0,id:'search_fixture',type:'function',function:{name:'search_library',arguments:JSON.stringify({kind:'case',query:'Synthetic read',clientId:null,caseId:null})}}]})+'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n');return;
  }
  if(content.startsWith('Hold')||content==='Read then hold'){pending.set(content,res);res.write(chunk({content:'Waiting synthetic response'}));return;}
  res.end(chunk({content:'Synthetic ordinary answer'})+finish);
 });
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const upstreamUrl=`http://127.0.0.1:${upstream.address().port}`;
 const preload=join(directory,'fetch-fixture.mjs');
 writeFileSync(preload,`const original=globalThis.fetch;globalThis.fetch=(url,options)=>original(String(url)==='https://api.deepseek.com/chat/completions'?${JSON.stringify(upstreamUrl)}:url,options);`);
 const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const url=`http://127.0.0.1:${port}`,origin='https://permission-fixture.invalid';
 const child=spawn(process.execPath,['--import',preload,'server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:origin,NESTLET_DB_PATH:filename,NESTLET_OPERATOR_PASSWORD_HASH:hash,NESTLET_OPERATOR_USERNAME:'owner',DEEPSEEK_API_KEY:'synthetic-key-not-real',ENABLE_LIVE_AI:'true',DEEPSEEK_MODEL:'deepseek-flash'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));store.close();rmSync(directory,{recursive:true,force:true});});
 let log='';child.stderr.on('data',b=>log+=b);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup '+log)),8000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Exited '+log));});child.stdout.on('data',data=>{if(data.toString().includes('Nestlet available')){clearTimeout(timer);resolve();}});});
 const sessions={};
 for(const username of ['owner','consent-bob']){
  const response=await fetch(url+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(response.status,200);
  const session=await response.json();sessions[username]={Origin:origin,'Content-Type':'application/json',Cookie:response.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrfToken};
 }
 const request=(path,{method='GET',body,who='owner',headers={}}={})=>fetch(url+path,{method,headers:{...sessions[who],...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const get=async(who='owner')=>(await request('/api/library-permission',{who})).json();
 const put=(state,decision,who='owner')=>request('/api/library-permission',{method:'PUT',body:change(state,decision),who});
 return{store,bob,request,get,put,requests,pending};
}
test('permission HTTP validates authentication, exact input, origin, CSRF and optimistic account-bound writes',async t=>{
 const f=await harness(t),state=await f.get();assert.equal(state.decision,'unset');assert.equal(state.version,0);
 for(const [options,status,code] of [
  [{headers:{Cookie:''}},401,'AUTH_REQUIRED'],
  [{headers:{Origin:'https://other.invalid'}},403,'ORIGIN_REJECTED'],
  [{method:'PUT',body:change(state,'allow'),headers:{Origin:''}},403,'ORIGIN_REJECTED'],
  [{method:'PUT',body:change(state,'allow'),headers:{'X-CSRF-Token':''}},403,'CSRF_REJECTED'],
  [{method:'PUT',body:{...change(state,'allow'),userId:f.bob.id}},400,'LIBRARY_PERMISSION_INVALID'],
  [{method:'PUT',body:{...change(state,'allow'),provider:{...state.provider,endpoint:'https://different.invalid'}}},409,'LIBRARY_PERMISSION_CONFLICT'],
  [{method:'PUT',body:{...change(state,'allow'),decision:true}},400,'LIBRARY_PERMISSION_INVALID'],
 ]){const r=await f.request('/api/library-permission',options);assert.equal(r.status,status);assert.equal((await r.json()).code,code);}
 const responses=await Promise.all([f.put(state,'allow'),f.put(state,'deny')]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const current=await f.get();assert.equal(current.version,1);assert.equal((await f.get('consent-bob')).decision,'unset');
 const declined=await(await f.put(current,'deny')).json();assert.equal(declined.decision,'deny');assert.equal((await f.get()).decision,'deny');
 assert.equal(f.requests.length,0);
});
test('old checkbox payloads, missing grants, denied grants and stale revisions cannot reach the provider',async t=>{
 const f=await harness(t);
 for(const body of [chat(undefined,'old',{libraryConsent:true}),chat(0),chat(1),chat(1,'action-wrapper',{actionConsent:false})]){
  const response=await f.request('/api/chat',{method:'POST',body});assert.equal(response.status,403);assert.equal((await response.json()).code,'LIBRARY_CONSENT_REQUIRED');
 }
 let state=await(await f.put(await f.get(),'allow')).json();
 let response=await f.request('/api/chat',{method:'POST',body:chat(state.version)});assert.equal(response.status,200);await response.text();assert.equal(f.requests.length,1);
 const old=state.version;state=await(await f.put(state,'deny')).json();
 response=await f.request('/api/chat',{method:'POST',body:chat(old)});assert.equal(response.status,403);
 state=await(await f.put(state,'allow')).json();
 response=await f.request('/api/chat',{method:'POST',body:chat(old)});assert.equal(response.status,409);assert.equal((await response.json()).code,'LIBRARY_PERMISSION_CONFLICT');
 response=await f.request('/api/chat',{method:'POST',body:chat(state.version),who:'consent-bob'});assert.equal(response.status,403);
 response=await f.request('/api/chat',{method:'POST',body:chat(undefined)});assert.equal(response.status,200);await response.text();assert.equal(f.requests.length,2);assert.equal(f.requests[1].tools,undefined);
});
test('revocation immediately aborts in-flight requests only for that account, preventing late completion',async t=>{
 const f=await harness(t);
 const owner=await(await f.put(await f.get(),'allow')).json(),bob=await(await f.put(await f.get('consent-bob'),'allow','consent-bob')).json();
 const ownResponse=await f.request('/api/chat',{method:'POST',body:chat(owner.version,'Hold owner')});
 const otherResponse=await f.request('/api/chat',{method:'POST',body:chat(bob.version,'Hold bob'),who:'consent-bob'});
 const ownText=ownResponse.text(),otherText=otherResponse.text();
 const denied=await f.put(owner,'deny');assert.equal(denied.status,200);
 const result=await Promise.race([ownText,new Promise((_,reject)=>setTimeout(()=>reject(Error('Revoked stream did not stop')),2000))]);
 assert.match(result,/LIBRARY_PERMISSION_REVOKED/);assert.doesNotMatch(result,/event: done/);
 f.pending.get('Hold bob').end(chunk({content:' Other account completes'})+finish);
 assert.match(await otherText,/event: done/);
 assert.equal(f.requests.length,2);assert.equal((await f.get('consent-bob')).decision,'allow');
});
test('revocation after a tool read is checked before follow-up transmission; boolean alone cannot authorize stream',async t=>{
 const f=await harness(t),record=f.store.createCase('owner',{title:'Synthetic read',sourceText:'SYNTHETIC_RETRIEVED_SECRET',fields:[],draftType:'followup',draftText:''});
 const grant=await(await f.put(await f.get(),'allow')).json();
 const input=validateChatRequest(chat(grant.version,'Read',{caseId:record.id}));
 const library=createLibraryToolSession({storage:f.store,userId:'owner',libraryConsent:true,currentCaseId:record.id});
 let sends=0;
 const fetchImpl=async()=>{sends++;return new Response(chunk({tool_calls:[{index:0,id:'read_fixture',type:'function',function:{name:'read_library',arguments:JSON.stringify({kind:'case',id:record.id,offset:0})}}]})+'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});};
 await assert.rejects(()=>openLibraryChatStream({apiKey:'fixture',input,library,requestId:randomUUID(),fetchImpl}),{code:'LIBRARY_CONSENT_REQUIRED'});assert.equal(sends,0);
 const stream=await openLibraryChatStream({apiKey:'fixture',input,library,requestId:randomUUID(),fetchImpl,authorizeLibrary:()=>f.store.libraryPermissions.assertAllowed('owner',grant.version)});
 await assert.rejects(async()=>{for await(const event of stream)if(event.type==='activity'&&event.state==='completed')f.store.libraryPermissions.set('owner',change(grant,'deny'));},{code:'LIBRARY_CONSENT_REQUIRED'});
 assert.equal(sends,1);assert.equal(library.getStats().calls,1);
});

test('read-only action wrapper cannot smuggle retrieval tools past disabled library authorization',async t=>{
 const f=await harness(t),record=f.store.createCase('owner',{title:'Synthetic wrapper',sourceText:'Synthetic',fields:[],draftType:'followup',draftText:''});
 const conversation=f.store.createConversation('owner',record.id,{});
 f.store.appendMessage('owner',conversation.id,{role:'user',content:'Synthetic source',state:'complete'});
 const retrieval=createLibraryToolSession({storage:f.store,userId:'owner',libraryConsent:true,currentCaseId:record.id});
 const library=createConversationToolSession({storage:f.store,userId:'owner',record,conversationId:conversation.id,library:retrieval});
 const input=validateChatRequest(chat(undefined,'Wrapper',{caseId:record.id,conversationId:conversation.id,clientMessageId:randomUUID(),actionConsent:true}));
 let calls=0;
 await assert.rejects(()=>openLibraryChatStream({apiKey:'fixture',input,record,library,requestId:randomUUID(),fetchImpl:()=>{calls++;}}),{code:'LIBRARY_CONSENT_REQUIRED'});
 assert.equal(calls,0);
});

test('cross-tab logout aborts that originating session; credential rotation aborts a silent provider stream',async t=>{
 const f=await harness(t);
 const owner=await(await f.put(await f.get(),'allow')).json();
 const response=await f.request('/api/chat',{method:'POST',body:chat(owner.version,'Hold logout')});
 const finished=response.text();
 assert.equal((await f.request('/api/logout',{method:'POST',body:{}})).status,200);
 assert.match(await finished,/LIBRARY_PERMISSION_REVOKED/);
 const bob=await(await f.put(await f.get('consent-bob'),'allow','consent-bob')).json();
 const rotated=await f.request('/api/chat',{method:'POST',body:chat(bob.version,'Hold reset'),who:'consent-bob'});
 const stopped=rotated.text();
 const nextHash=`scrypt$${Buffer.alloc(16,3).toString('base64url')}$${Buffer.alloc(32,4).toString('base64url')}`;
 f.store.upsertTrialUser({username:'consent-bob',passwordHash:nextHash});
 const result=await Promise.race([stopped,new Promise((_,reject)=>setTimeout(()=>reject(Error('Session revoke did not stop silent stream')),2000))]);
 assert.match(result,/LIBRARY_PERMISSION_REVOKED/);assert.doesNotMatch(result,/event: done/);assert.equal(f.requests.length,2);
});

for(const revoke of ['permission','logout'])test(`read then ${revoke} sends no late sources, proposal or completion`,async t=>{
 const f=await harness(t);f.store.createCase('owner',{title:'Synthetic read PRIVATE_TITLE_SENTINEL',sourceText:'Synthetic evidence',fields:[],draftType:'followup',draftText:''});
 const permission=await(await f.put(await f.get(),'allow')).json();
 const response=await f.request('/api/chat',{method:'POST',body:chat(permission.version,'Read then hold')});
 const reader=response.body.getReader();let before='';
 while(!before.includes('Waiting synthetic response')){const result=await reader.read();assert.equal(result.done,false);before+=new TextDecoder().decode(result.value);}
 assert.match(before,/event: activity/);assert.doesNotMatch(before,/event: sources/);
 if(revoke==='permission')assert.equal((await f.put(permission,'deny')).status,200);
 else assert.equal((await f.request('/api/logout',{method:'POST',body:{}})).status,200);
 let after='';while(true){const result=await reader.read();if(result.done)break;after+=new TextDecoder().decode(result.value);}
 assert.match(after,/LIBRARY_PERMISSION_REVOKED/);assert.doesNotMatch(after,/event: (?:sources|proposal|done)/);
 assert.doesNotMatch(after,/PRIVATE_TITLE_SENTINEL|Server-recorded sources/);assert.equal(f.requests.length,2);
});
