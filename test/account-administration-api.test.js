// Actual loopback HTTP, SQLite, sessions, hashes and asset bytes. No mail or model provider is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { openStorage } from '../storage.js';
import { openAssetVault, parseAsset } from '../private-assets.js';
import { digest } from '../email-auth-domain.js';
const password='synthetic-admin-http-password';
const salt=randomBytes(16),passwordHash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
async function fixture(t) {
  const directory=await mkdtemp(join(await realpath(tmpdir()),'nestlet-admin-http-')),filename=join(directory,'records.sqlite'),assetsDirectory=join(directory,'assets');
  const storage=openStorage({filename}),vault=openAssetVault({directory:assetsDirectory}),users={};
  for(const name of ['one','two']) {
    const email=`synthetic-admin-${name}@example.test`,action=storage.emailAuth.createAction({kind:'register',email,passwordHash});
    storage.emailAuth.markAccepted(action.tokenHash);storage.emailAuth.verify(action.tokenHash);users[name]=storage.emailAuth.findByEmail(email);
  }
  users.legacy=storage.createTrialUser({username:'synthetic-unbound',passwordHash});
  const records={},assets={},clients={},conversations={},artifacts={},workflows={};
  for(const [name,id] of [['owner','owner'],['one',users.one.id],['two',users.two.id]]) {
    clients[name]=storage.createClient(id,{displayName:`Synthetic ${name} customer`});
    records[name]=storage.createCase(id,{title:`Synthetic ${name} case`,sourceText:`Synthetic ${name} text`,fields:[],draftType:'followup',draftText:'',clientId:clients[name].id});
    conversations[name]=storage.createConversation(id,records[name].id,{title:'Synthetic conversation'});
    workflows[name]=storage.telemetryCreateWorkflow(id);
    artifacts[name]=storage.createArtifact(id,records[name].id,{kind:'followup',status:'draft',content:`Synthetic ${name} artifact`,expectedCaseVersion:records[name].version});
    const bytes=Buffer.from(`Synthetic ${name} original`),metadata=await parseAsset(bytes,{originalFilename:`synthetic-${name}.txt`,mimeType:'text/plain'});
    assets[name]=storage.createAsset(id,metadata,{caseId:records[name].id,clientId:clients[name].id},assetId=>vault.write(assetId,bytes));
  }
  storage.close();
  let child,origin,output='';
  const stop=async()=>{if(child?.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});};
  t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});
  async function start(){
    const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));origin=`http://127.0.0.1:${port}`;
    child=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,LANG:'C.UTF-8',HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:'',NESTLET_DB_PATH:filename,NESTLET_ASSETS_PATH:assetsDirectory,NESTLET_OPERATOR_PASSWORD_HASH:passwordHash,NESTLET_OPERATOR_USERNAME:'synthetic-owner-alias',ENABLE_LIVE_AI:'false',DEEPSEEK_API_KEY:'',DEEPSEEK_MODEL:'deepseek-flash'},stdio:['ignore','pipe','pipe']});
    child.stderr.on('data',data=>output+=data);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timeout: '+output)),8000);child.once('exit',code=>{clearTimeout(timer);reject(new Error('Startup failed: '+code+' '+output));});child.stdout.on('data',data=>{output+=data;if(output.includes('Nestlet available')){clearTimeout(timer);resolve();}});});
  }
  const request=(path,{method='GET',body,session,headers={}}={})=>fetch(origin+path,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const json=async(path,options,expected=200)=>{const response=await request(path,options);const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return body;};
  const login=async identity=>{const response=await request('/api/login',{method:'POST',body:{[identity.includes('@')?'email':'username']:identity,password}});assert.equal(response.status,200);return {...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};};
  const withStorage=fn=>{const storage=openStorage({filename});try{return fn(storage);}finally{storage.close();}};
  await start();return {request,json,login,withStorage,users,records,assets,clients,conversations,artifacts,workflows,restart:async()=>{await stop();output='';await start();},get output(){return output;}};
}

test('real API enforces owner authority, CSRF/origin, immutable owner, strict versioned payload and no registration self-promotion',async t=>{
  const f=await fixture(t),owner=await f.login('synthetic-owner-alias'),ordinary=await f.login(f.users.one.email),target=f.users.one.id,path=`/api/admin/accounts/${target}/administrator`;
  assert.equal(owner.userId,'owner');assert.equal(owner.canManageAccounts,true);assert.equal(ordinary.canManageAccounts,false);
  for(const endpoint of ['/api/admin/accounts','/api/admin/account-audit','/api/admin/diagnostics'])assert.equal((await f.request(endpoint)).status,401);
  for(const endpoint of ['/api/admin/accounts','/api/admin/account-audit','/api/admin/diagnostics'])assert.equal((await f.request(endpoint,{session:ordinary})).status,403);
  assert.equal((await f.request(path,{method:'PUT',session:ordinary,body:{administrator:true,expectedVersion:0}})).status,403);
  for(const headers of [{'X-CSRF-Token':''},{'X-CSRF-Token':'x'.repeat(43)},{Origin:''},{Origin:'https://untrusted.invalid'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await f.request(path,{method:'PUT',session:owner,body:{administrator:true,expectedVersion:0},headers})).status,403);
  assert.equal((await f.json('/api/admin/accounts/owner/administrator',{method:'PUT',session:owner,body:{administrator:false,expectedVersion:0}},403)).code,'OWNER_IMMUTABLE');
  for(const body of [{administrator:'true',expectedVersion:0},{administrator:true,expectedVersion:0,role:'owner'},{administrator:true,expectedVersion:0,userId:'owner'},{administrator:true,expectedVersion:-1},{}])await f.json(path,{method:'PUT',session:owner,body},400);
  await f.json(path+'?role=owner',{method:'PUT',session:owner,body:{administrator:true,expectedVersion:0}},400);
  await f.json(path,{method:'POST',session:owner,body:{administrator:true,expectedVersion:0}},405);
  await f.json(`/api/admin/accounts/${f.users.legacy.id}/administrator`,{method:'PUT',session:owner,body:{administrator:true,expectedVersion:0}},409);
  for(const extra of [{role:'owner'},{administrator:true},{capabilities:{administrator:true}}]) {
    const body=await f.json('/api/register',{method:'POST',body:{email:'synthetic-new@example.test',password,passwordConfirmation:password,...extra}},400);assert.equal(body.code,'REGISTRATION_INVALID');
  }
  for(const query of ['?limit=0','?limit=101','?before=-1','?limit=1&limit=2','?target=owner'])await f.json('/api/admin/account-audit'+query,{session:owner},400);
  const roster=await f.json('/api/admin/accounts',{session:owner});assert.equal(roster.accounts.length,4);assert.doesNotMatch(JSON.stringify(roster),/scrypt\$|passwordHash|sourceText|Synthetic .* case/);
  assert.equal((await f.json('/api/admin/account-audit',{session:owner})).events.length,0);
});

test('same cookies observe grant/revoke immediately; admin only sees bounded diagnostics and own case/customer/conversation/original bytes',async t=>{
  const f=await fixture(t),owner=await f.login('owner'),admin=await f.login(f.users.one.email),other=await f.login(f.users.two.email),path=`/api/admin/accounts/${f.users.one.id}/administrator`;
  const responses=await Promise.all([0,1].map(()=>f.json(path,{method:'PUT',session:owner,body:{administrator:true,expectedVersion:0}})));
  assert.deepEqual(responses.map(result=>result.changed).sort(),[false,true]);
  const status=await f.json('/api/status',{session:admin});assert.equal(status.role,'trial');assert.equal(status.userId,f.users.one.id);assert.equal(status.email,f.users.one.email);assert.equal(status.administrator,true);assert.equal(status.canViewDiagnostics,true);assert.equal(status.canManageSettings,false);assert.equal(status.canManageAccounts,false);assert.equal(Object.hasOwn(status,'emailDelivery'),false);
  const diagnostics=await f.json('/api/admin/diagnostics',{session:admin});assert.deepEqual(Object.keys(diagnostics).sort(),['activeRequests','liveEnabled','model','pdfEnabled','uptimeSeconds','workbookEnabled']);assert.ok(Number.isInteger(diagnostics.uptimeSeconds));assert.equal(diagnostics.liveEnabled,false);
  for(const endpoint of ['/api/admin/accounts','/api/admin/account-audit','/api/admin/telemetry','/api/settings'])await f.json(endpoint,{session:admin},403);
  await f.json('/api/settings',{method:'POST',session:admin,body:{enableLive:false}},403);
  await f.json(`/api/admin/accounts/${f.users.two.id}/administrator`,{method:'PUT',session:admin,body:{administrator:true,expectedVersion:0}},403);
  for(const who of ['owner','two'])for(const endpoint of [`/api/cases/${f.records[who].id}`,`/api/clients/${f.clients[who].id}`,`/api/conversations/${f.conversations[who].id}`,`/api/assets/${f.assets[who].id}`,`/api/assets/${f.assets[who].id}/text`,`/api/assets/${f.assets[who].id}/download`,`/api/assets/${f.assets[who].id}/preview`,`/api/artifacts/${f.artifacts[who].id}`,`/api/artifacts/${f.artifacts[who].id}/download`,`/api/workflows/${f.workflows[who].workflowId}/events`])assert.equal((await f.request(endpoint,{session:admin})).status,404,endpoint);
  for(const who of ['owner','two']) {
    const record=f.records[who],client=f.clients[who],asset=f.assets[who];
    await f.json(`/api/cases/${record.id}`,{method:'PUT',session:admin,body:{title:'Forbidden overwrite',sourceText:'Synthetic attack',fields:[],draftType:'followup',draftText:'',expectedVersion:record.version}},404);
    await f.json(`/api/cases/${record.id}`,{method:'DELETE',session:admin,body:{expectedVersion:record.version}},404);
    await f.json(`/api/clients/${client.id}`,{method:'PUT',session:admin,body:{displayName:'Forbidden rename',expectedVersion:client.version}},404);
    await f.json(`/api/assets/${asset.id}`,{method:'PATCH',session:admin,body:{caseId:f.records.one.id,expectedVersion:asset.version}},404);
    await f.json(`/api/cases/${record.id}/document-context`,{method:'PATCH',session:admin,body:{changes:{},expectedVersion:record.version,confirm:false}},404);
    await f.json(`/api/cases/${record.id}/conversations`,{method:'POST',session:admin,body:{title:'Forbidden conversation'}},404);
    await f.json(`/api/cases/${record.id}/artifacts`,{method:'POST',session:admin,body:{kind:'followup',status:'draft',content:'Forbidden artifact',expectedCaseVersion:record.version}},404);
    f.withStorage(storage=>{const id=who==='owner'?'owner':f.users[who].id;assert.equal(storage.getCase(id,record.id).title,record.title);assert.equal(storage.getClient(id,client.id).displayName,client.displayName);assert.equal(storage.getAsset(id,asset.id).caseId,record.id);assert.equal(storage.listConversations(id,record.id).length,1);assert.equal(storage.listArtifacts(id,record.id).length,1);});
  }
  assert.equal((await f.json(`/api/cases/${f.records.one.id}`,{session:admin})).case.id,f.records.one.id);
  const download=await f.request(`/api/assets/${f.assets.one.id}/download`,{session:admin});assert.equal(download.status,200);assert.equal(await download.text(),'Synthetic one original');
  assert.equal((await f.json('/api/cases',{session:admin})).cases.length,1);
  assert.equal((await f.json('/api/admin/account-audit',{session:owner})).events.length,1);
  await f.json(path,{method:'PUT',session:owner,body:{administrator:false,expectedVersion:1}});
  await f.json('/api/admin/diagnostics',{session:admin},403);assert.equal((await f.json('/api/status',{session:admin})).administrator,false);
  await f.json(path,{method:'PUT',session:owner,body:{administrator:true,expectedVersion:0}},409);
  assert.equal((await f.json('/api/admin/account-audit',{session:owner})).events.length,2);
  assert.equal((await f.json('/api/status',{session:other})).administrator,false);
});

test('capabilities persist through restart; real password-reset endpoint keeps identity/cases and revokes all existing admin cookies',async t=>{
  const f=await fixture(t),owner=await f.login('owner'),admin=await f.login(f.users.one.email),target=f.users.one.id;
  await f.json(`/api/admin/accounts/${target}/administrator`,{method:'PUT',session:owner,body:{administrator:true,expectedVersion:0}});
  await f.restart();await f.json('/api/admin/diagnostics',{session:admin},200);
  const restored=await f.login(f.users.one.email);assert.equal(restored.administrator,true);assert.equal(restored.userId,target);
  const reset=f.withStorage(storage=>{const action=storage.emailAuth.createAction({kind:'reset',email:f.users.one.email,userId:target,credentialFingerprint:digest(passwordHash)});storage.emailAuth.markAccepted(action.tokenHash);return action;});
  const next='synthetic-http-new-password';await f.json('/api/auth/password/reset',{method:'POST',body:{token:reset.token,password:next,passwordConfirmation:next}});
  await f.json('/api/admin/diagnostics',{session:restored},401);
  const login=await f.json('/api/login',{method:'POST',body:{email:f.users.one.email,password:next}});assert.equal(login.userId,target);assert.equal(login.role,'trial');assert.equal(login.administrator,true);
  f.withStorage(storage=>{assert.equal(storage.getCase(target,f.records.one.id).id,f.records.one.id);assert.equal(storage.getUserById('owner').passwordHash,null);assert.equal(storage.emailAuth.identity(target).email,f.users.one.email);});
  assert.doesNotMatch(f.output,new RegExp(reset.token));assert.equal(f.output.includes(passwordHash),false);assert.equal(f.output.includes(f.users.one.email),false);
});
