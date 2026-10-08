import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readInboxContext,readInboxRail,readinessReasonLabel} from '../frontend/lib/inbox-read-model.js';
test('Inbox readiness uses saved kind and localized questions; artifact historical state remains explicit',async()=>{
 const paths=[];const api={get:async path=>{paths.push(path);if(path==='/api/cases/case-a')return{case:{id:'case-a',version:3,fields:[],draftType:'status-summary'}};if(path.includes('/readiness?'))return{ready:false,missing:[{key:'senderName',question:'Who is sending?'}]};if(path.endsWith('/artifacts'))return{artifacts:[{id:'artifact-a',caseId:'case-a',isStale:true,status:'final'}]};return{assets:[]};}};
 const result=await readInboxContext(api,'case-a','en');assert.ok(paths.includes('/api/cases/case-a/readiness?kind=status-summary&locale=en'));assert.equal(result.readiness.missing[0].question,'Who is sending?');assert.equal(result.artifacts[0].isStale,true);
});
test('Inbox fails closed on mismatched case, malformed readiness and cross-case artifacts',async()=>{
 for(const defect of ['case','readiness','artifact']){const api={get:async path=>{if(path==='/api/cases/a')return{case:{id:defect==='case'?'b':'a',version:1,fields:[],draftType:'followup'}};if(path.includes('/readiness?'))return defect==='readiness'?{summary:'not a contract'}:{ready:true,missing:[]};if(path.endsWith('/artifacts'))return{artifacts:defect==='artifact'?[{id:'x',caseId:'b'}]:[]};return{assets:[]};}};await assert.rejects(readInboxContext(api,'a','zh'),/INVALID_RESPONSE/);}
});
test('Inbox rail explicitly requests complete bounded customer metadata and rejects malformed rows',async()=>{
 const paths=[];const api={get:async path=>{paths.push(path);return path==='/api/cases'?{cases:[]}:{clients:[]};}};assert.deepEqual(await readInboxRail(api),{cases:[],clients:[]});assert.ok(paths.includes('/api/clients?limit=100'));await assert.rejects(readInboxRail({get:async()=>({cases:[{}],clients:[]})}),/INVALID_RESPONSE/);
});

test('Inbox adapters consume actual authenticated HTTP contracts without writes during reads',async t=>{
 const {startBrowserFixture}=await import('./helpers/browser-fixture.mjs');
 const {createApiClient}=await import('../frontend/lib/api.js');
 const fixture=await startBrowserFixture({legacyUsers:['synthetic-inbox-reader']});t.after(()=>fixture.stop());
 const response=await fetch(fixture.origin+'/api/login',{method:'POST',headers:{Origin:fixture.origin,'Content-Type':'application/json'},body:JSON.stringify({username:'synthetic-inbox-reader',password:'Case26'})});assert.equal(response.status,200);const session=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0],calls=[];
 const api=createApiClient({getCsrfToken:()=>session.csrfToken,fetchImpl:(path,options={})=>{calls.push({path,method:options.method||'GET'});return fetch(fixture.origin+path,{...options,headers:{...options.headers,Cookie:cookie,Origin:fixture.origin}});}});
 const {case:record}=await api.post('/api/cases',{title:'Synthetic Inbox contract',sourceText:'',fields:[],draftType:'missing-documents',draftText:''});calls.length=0;
 const context=await readInboxContext(api,record.id,'en');assert.equal(context.record.id,record.id);assert.equal(typeof context.readiness.ready,'boolean');assert.deepEqual(context.artifacts,[]);assert.deepEqual(context.assets,[]);
 const rail=await readInboxRail(api);assert.ok(rail.cases.some(item=>item.id===record.id));assert.ok(calls.every(call=>call.method==='GET'));
});

test('compact readiness preserves bilingual risk reasons and falls back for unknown reasons',()=>{
 assert.equal(readinessReasonLabel('conflict','en'),'Conflict');assert.equal(readinessReasonLabel('conflict','zh'),'有冲突');assert.equal(readinessReasonLabel('english_review','en'),'English review');assert.equal(readinessReasonLabel('unconfirmed','en'),'Needs confirmation');assert.equal(readinessReasonLabel('missing','zh'),'待补充');assert.equal(readinessReasonLabel('future_reason','en'),null);
});
