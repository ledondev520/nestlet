// Actual current server/auth/SQLite, synthetic accounts only. No model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startBrowserFixture } from './helpers/browser-fixture.mjs';

test('a newly signed-in cookie with stale tab CSRF is recoverable without changing the saved conversation',async t=>{
 const app=await startBrowserFixture({legacyUsers:['synthetic-resume-user']});t.after(()=>app.stop());
 const login=async cookie=>{
  const response=await fetch(app.origin+'/api/login',{method:'POST',headers:{Origin:app.origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({username:'synthetic-resume-user',password:'Case26'})});
  assert.equal(response.status,200);return{...(await response.json()),cookie:response.headers.get('set-cookie').split(';')[0]};
 };
 const first=await login();
 const write=async(session,path,body,csrf=session.csrfToken)=>fetch(app.origin+path,{method:'POST',headers:{Origin:app.origin,Cookie:session.cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)});
 const created=await write(first,'/api/cases',{title:'Synthetic existing resume case',sourceText:'',fields:[],draftType:'followup',draftText:'',extractionMode:'manual',namesVerified:false,clientId:null});assert.equal(created.status,201);const {case:record}=await created.json();
 const threadResponse=await write(first,`/api/cases/${record.id}/conversations`,{title:'Synthetic saved conversation'});assert.equal(threadResponse.status,201);const {conversation}=await threadResponse.json();
 const current=await login(first.cookie);assert.equal(current.userId,first.userId);assert.notEqual(current.csrfToken,first.csrfToken);
 const body={caseId:record.id,conversationId:conversation.id,clientMessageId:randomUUID(),locale:'en',consent:true,actionConsent:true,reviewResultVersion:1,messages:[{role:'user',content:'Continue this synthetic saved conversation'}]};
 const rejected=await write(current,'/api/chat',body,first.csrfToken);assert.equal(rejected.status,403);assert.equal((await rejected.json()).code,'CSRF_REJECTED');
 const status=await (await fetch(app.origin+'/api/status',{headers:{Cookie:current.cookie}})).json();assert.equal(status.authenticated,true);assert.equal(status.userId,first.userId);assert.equal(status.csrfToken,current.csrfToken);
 const permitted=await write(current,'/api/chat',body,status.csrfToken);assert.equal(permitted.status,503);assert.equal((await permitted.json()).code,'LIVE_DISABLED','Fresh session passes auth, fixture still forbids real model calls');
 const history=await (await fetch(app.origin+`/api/conversations/${conversation.id}`,{headers:{Cookie:current.cookie}})).json();assert.equal(history.conversation.id,conversation.id);assert.deepEqual(history.messages,[]);
 const saved=await (await fetch(app.origin+`/api/cases/${record.id}`,{headers:{Cookie:current.cookie}})).json();assert.deepEqual(saved.case,record);
});
