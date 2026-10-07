// Actual SQLite/HTTP processes and authored synthetic documents. No provider/network doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,scryptSync,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {openStorage} from '../storage.js';
import {extract} from '../public/core.js';
const password='public-legacy-draft-test-only',salt=randomBytes(16);
const passwordHash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
const source='Property: 128 Example Lane\nOwner: Example LLC\nPHA: Example Authority\nCase reference: SYNTHETIC-ARCHIVE\nProposed rent: $2,100';
const oldText='Subject: Authored synthetic working draft\n\nPlease retain this exact operator edit.\n';
const payload=(extra={})=>({title:'Synthetic archival case',sourceText:source,fields:extract(source).map(field=>({...field,confirmed:true})),draftType:'followup',draftText:oldText,extractionMode:'manual',namesVerified:false,...extra});
function fixture(t){
  const directory=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-legacy-preserve-')),filename=join(directory,'private','cases.sqlite');
  const store=openStorage({filename});const alice=store.createTrialUser({username:'archive-alice',passwordHash}),bob=store.createTrialUser({username:'archive-bob',passwordHash});
  const close=()=>{store.close();rmSync(directory,{recursive:true,force:true});};if(t)t.after(close);
  return{store,filename,alice,bob,close};
}
const code=expected=>error=>error.code===expected;

test('generic clear archives exact old text and prior provenance in the same versioned update',t=>{
  const{store,alice}=fixture(t);const original=store.createCase(alice.id,payload());
  const result=store.updateCase(alice.id,original.id,payload({draftText:''}),1,{returnEffects:true});
  assert.equal(result.case.version,2);assert.equal(result.case.draftText,'');assert.equal(result.archivedLegacyDraft,true);assert.equal(result.legacyDraftInvalidated,true);
  const archived=store.getArtifact(alice.id,result.archivedArtifactId);assert.equal(archived.content,oldText);assert.equal(archived.status,'draft');assert.equal(archived.sourceCaseVersion,1);assert.deepEqual(archived.provenance.fields,original.fields);
  assert.equal(store.listArtifacts(alice.id,original.id).length,1);
});
test('source/fact review changes invalidate a carried-forward old draft without requiring its stale review gate',t=>{
  const{store,alice}=fixture(t);const original=store.createCase(alice.id,payload());
  const fields=original.fields.map(field=>field.key==='property'?{...field,value:'130 Example Lane',confirmed:false,edited:true}:field);
  const updated=store.updateCase(alice.id,original.id,payload({fields,sourceText:source+'\nNew synthetic material'}),1);
  assert.equal(updated.draftText,'');assert.equal(updated.fields.find(field=>field.key==='property').confirmed,false);
  assert.equal(store.getArtifact(alice.id,store.listArtifacts(alice.id,original.id)[0].id).content,oldText);
});
test('a distinct valid replacement is retained while metadata-only edits do not archive unchanged text',t=>{
  const{store,alice}=fixture(t);const original=store.createCase(alice.id,payload());
  const client=store.createClient(alice.id,{displayName:'Synthetic customer'});
  const renamed=store.updateCase(alice.id,original.id,payload({title:'New friendly label',clientId:client.id}),1,{returnEffects:true});
  assert.equal(renamed.archivedLegacyDraft,false);assert.equal(renamed.archivedArtifactId,null);assert.equal(renamed.case.draftText,oldText);assert.equal(store.listArtifacts(alice.id,original.id).length,0);
  const replacement='Subject: Updated authored draft\n\nPlease retain the replacement too.';
  const revised=store.updateCase(alice.id,original.id,payload({draftText:replacement,sourceText:source+'\nReviewed new source'}),2,{returnEffects:true});
  assert.equal(revised.case.draftText,replacement);assert.equal(revised.archivedLegacyDraft,true);assert.equal(revised.legacyDraftInvalidated,false);
  assert.equal(store.getArtifact(alice.id,revised.archivedArtifactId).content,oldText);
});
test('foreign identities and stale versions cannot archive or alter another case',t=>{
  const{store,alice,bob}=fixture(t);const original=store.createCase(alice.id,payload());
  assert.equal(store.updateCase(bob.id,original.id,payload({draftText:''}),1,{returnEffects:true}),null);
  store.updateCase(alice.id,original.id,payload({title:'Changed title only'}),1);
  assert.throws(()=>store.updateCase(alice.id,original.id,payload({draftText:''}),1),code('CASE_CONFLICT'));
  assert.equal(store.listArtifacts(alice.id,original.id).length,0);assert.equal(store.getCase(alice.id,original.id).draftText,oldText);
});
test('real SQLite archive insertion and later update failures both roll back all changes',t=>{
  const{store,filename,alice}=fixture(t);const original=store.createCase(alice.id,payload());const db=new DatabaseSync(filename);t.after(()=>db.close());
  db.exec("CREATE TRIGGER reject_archive BEFORE INSERT ON artifacts BEGIN SELECT RAISE(ABORT,'authored test archive failure'); END;");
  assert.throws(()=>store.updateCase(alice.id,original.id,payload({draftText:''}),1));
  assert.deepEqual(store.getCase(alice.id,original.id),original);assert.deepEqual(store.listArtifacts(alice.id,original.id),[]);
  db.exec("DROP TRIGGER reject_archive; CREATE TRIGGER reject_case_update BEFORE UPDATE ON cases BEGIN SELECT RAISE(ABORT,'authored test update failure'); END;");
  assert.throws(()=>store.updateCase(alice.id,original.id,payload({draftText:''}),1));
  assert.deepEqual(store.getCase(alice.id,original.id),original);assert.deepEqual(store.listArtifacts(alice.id,original.id),[]);
  db.exec('DROP TRIGGER reject_case_update');
  const updated=store.updateCase(alice.id,original.id,payload({draftText:''}),1);assert.equal(updated.version,2);assert.equal(store.listArtifacts(alice.id,original.id).length,1);
});
test('capacity and late association validation failures preserve both the prior case and artifact collection',t=>{
  const{store,alice,bob}=fixture(t);const original=store.createCase(alice.id,payload());const foreign=store.createClient(bob.id,{displayName:'Other customer'});
  assert.throws(()=>store.updateCase(alice.id,original.id,payload({draftText:'',clientId:foreign.id}),1),code('CLIENT_NOT_FOUND'));
  assert.deepEqual(store.getCase(alice.id,original.id),original);assert.equal(store.listArtifacts(alice.id,original.id).length,0);
  for(let index=0;index<50;index++)store.createArtifact(alice.id,original.id,{kind:'followup',status:'draft',content:`Authored synthetic version ${index}`,expectedCaseVersion:1});
  assert.throws(()=>store.updateCase(alice.id,original.id,payload({draftText:''}),1),code('CAPACITY_REACHED'));
  assert.deepEqual(store.getCase(alice.id,original.id),original);assert.equal(store.listArtifacts(alice.id,original.id).length,50);
});
test('malformed replacement text is rejected without archiving or clearing existing work',t=>{
  const{store,alice}=fixture(t);const original=store.createCase(alice.id,payload());
  for(const draftText of [null,{},false])assert.throws(()=>store.updateCase(alice.id,original.id,payload({draftText}),1),code('CASE_INVALID'));
  assert.throws(()=>store.updateCase(alice.id,original.id,payload({draftText:'x'.repeat(50001)}),1),code('CASE_TOO_LARGE'));
  assert.deepEqual(store.getCase(alice.id,original.id),original);assert.equal(store.listArtifacts(alice.id,original.id).length,0);
});
test('two actual writer processes racing one expectedVersion produce one archive and one conflict',async t=>{
  const{store,filename,alice}=fixture(t);const original=store.createCase(alice.id,payload());
  const sourceCode=`import{openStorage}from${JSON.stringify(new URL('../storage.js',import.meta.url).href)};const store=openStorage({filename:process.env.TEST_DB});process.send('ready');process.once('message',()=>{try{const result=store.updateCase(process.env.TEST_USER,process.env.TEST_CASE,JSON.parse(process.env.TEST_PAYLOAD),1);process.send({version:result.version});}catch(error){process.send({code:error.code});}finally{store.close();process.disconnect();}});`;
  const children=[0,1].map(()=>spawn(process.execPath,['--input-type=module','-e',sourceCode],{env:{...process.env,TEST_DB:filename,TEST_USER:alice.id,TEST_CASE:original.id,TEST_PAYLOAD:JSON.stringify(payload({draftText:''}))},stdio:['ignore','ignore','ignore','ipc']}));
  t.after(()=>children.forEach(child=>{if(child.exitCode===null)child.kill();}));
  await Promise.all(children.map(child=>new Promise((resolve,reject)=>{child.once('message',value=>value==='ready'?resolve():reject(Error('Unexpected child readiness')));child.once('error',reject);})));
  const results=children.map(child=>new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);}));children.forEach(child=>child.send('start'));
  const completed=await Promise.all(results);assert.equal(completed.filter(result=>result.version===2).length,1);assert.equal(completed.filter(result=>result.code==='CASE_CONFLICT').length,1);
  assert.equal(store.listArtifacts(alice.id,original.id).length,1);assert.equal(store.getCase(alice.id,original.id).draftText,'');
});

test('actual authenticated generic PUT returns archive metadata and keeps optimistic/user isolation guards',async()=>{
  const f=fixture();let child;
  try{
    const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
    const url=`http://127.0.0.1:${port}`,origin='https://nestlet-legacy-archive.invalid';
    child=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:origin,NESTLET_DB_PATH:f.filename,NESTLET_OPERATOR_PASSWORD_HASH:passwordHash,NESTLET_OPERATOR_USERNAME:'owner',DEEPSEEK_API_KEY:'',ENABLE_LIVE_AI:'false',DEEPSEEK_MODEL:'deepseek-flash'},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Actual local server did not start')),10000);child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('Actual local server exited'));});child.stdout.on('data',data=>{if(data.toString().includes('Nestlet available')){clearTimeout(timer);resolve();}});});
    let cookie='',csrf='';
    const request=async(path,method='GET',body,extra={})=>fetch(url+path,{method,headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const login=await request('/api/login','POST',{password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrfToken;
    const created=await request('/api/cases','POST',payload());assert.equal(created.status,201);const original=(await created.json()).case;
    const response=await request(`/api/cases/${original.id}`,'PUT',{...payload({sourceText:source+'\nAdditional real HTTP synthetic fixture'}),expectedVersion:1});
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.case.version,2);assert.equal(result.case.draftText,'');assert.equal(result.archivedLegacyDraft,true);assert.equal(result.legacyDraftInvalidated,true);assert.ok(result.archivedArtifactId);
    const artifactResponse=await request(`/api/artifacts/${result.archivedArtifactId}`);assert.equal(artifactResponse.status,200);const archived=(await artifactResponse.json()).artifact;assert.equal(archived.content,oldText);assert.equal(archived.sourceCaseVersion,1);
    const stale=await request(`/api/cases/${original.id}`,'PUT',{...payload({draftText:''}),expectedVersion:1});assert.equal(stale.status,409);assert.equal((await stale.json()).code,'CASE_CONFLICT');
    const foreign=f.store.createCase(f.alice.id,payload());const denied=await request(`/api/cases/${foreign.id}`,'PUT',{...payload({draftText:''}),expectedVersion:1});assert.equal(denied.status,404);assert.equal(f.store.listArtifacts(f.alice.id,foreign.id).length,0);
    const csrfDenied=await request(`/api/cases/${original.id}`,'PUT',{...payload({draftText:''}),expectedVersion:2},{'X-CSRF-Token':'wrong'});assert.equal(csrfDenied.status,403);
    assert.equal(f.store.listArtifacts('owner',original.id).length,1);assert.equal(f.store.getCase('owner',original.id).version,2);
  }finally{
    if(child&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});f.close();
  }
});
