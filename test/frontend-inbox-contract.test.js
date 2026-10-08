import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readInboxContext,readInboxRail} from '../frontend/lib/inbox-read-model.js';
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
