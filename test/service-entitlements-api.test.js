// Actual loopback HTTP, SQLite, sessions, hashes and asset bytes. No mail or model provider is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
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
  const preload=join(directory,'no-provider.mjs');await writeFile(preload,"globalThis.fetch=async()=>{throw new Error('Provider calls forbidden in service HTTP tests');};");
  let child,origin,output='';
  const stop=async()=>{if(child?.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});};
  t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});
  async function start(){
    const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));origin=`http://127.0.0.1:${port}`;
    child=spawn(process.execPath,['--import',preload,'server.js'],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,LANG:'C.UTF-8',HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:'',NESTLET_DB_PATH:filename,NESTLET_ASSETS_PATH:assetsDirectory,NESTLET_OPERATOR_PASSWORD_HASH:passwordHash,NESTLET_OPERATOR_USERNAME:'synthetic-owner-alias',ENABLE_LIVE_AI:'true',DEEPSEEK_API_KEY:'synthetic-not-real',DEEPSEEK_MODEL:'deepseek-flash'},stdio:['ignore','pipe','pipe']});
    child.stderr.on('data',data=>output+=data);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timeout: '+output)),8000);child.once('exit',code=>{clearTimeout(timer);reject(new Error('Startup failed: '+code+' '+output));});child.stdout.on('data',data=>{output+=data;if(output.includes('Nestlet available')){clearTimeout(timer);resolve();}});});
  }
  const request=(path,{method='GET',body,session,headers={}}={})=>fetch(origin+path,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const json=async(path,options,expected=200)=>{const response=await request(path,options);const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return body;};
  const login=async identity=>{const response=await request('/api/login',{method:'POST',body:{[identity.includes('@')?'email':'username']:identity,password}});assert.equal(response.status,200);return {...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};};
  const withStorage=fn=>{const storage=openStorage({filename});try{return fn(storage);}finally{storage.close();}};
  await start();return {request,json,login,withStorage,users,records,assets,clients,conversations,artifacts,workflows,restart:async()=>{await stop();output='';await start();},get output(){return output;}};
}

const serviceInput=(value,extra={})=>({enabled:value.enabled,expiresAt:value.expiresAt,requestsPerHour:value.requestsPerHour,expectedVersion:value.version,...extra});
test('service HTTP protects owner mutations and cannot grant roles, payment status or foreign data',async t=>{const f=await fixture(t),owner=await f.login('synthetic-owner-alias'),ordinary=await f.login(f.users.one.email),target=f.users.one.id,path=`/api/admin/accounts/${target}/service`;const state=(await f.json('/api/service',{session:ordinary})).service;assert.equal(state.mode,'default');assert.equal(state.paymentManaged,false);await f.json('/api/service',{},401);await f.json('/api/admin/services',{session:ordinary},403);await f.json(path,{method:'PUT',session:ordinary,body:serviceInput(state,{enabled:false})},403);await f.json(path,{method:'PUT',session:owner,body:serviceInput(state),headers:{'X-CSRF-Token':''}},403);await f.json(path,{method:'PUT',session:owner,body:serviceInput(state),headers:{Origin:''}},403);await f.json(path,{method:'PUT',session:owner,body:serviceInput(state,{paid:true})},400);await f.json('/api/admin/accounts/owner/service',{method:'PUT',session:owner,body:serviceInput(state)},403);const saved=await f.json(path,{method:'PUT',session:owner,body:serviceInput(state,{enabled:false})});assert.equal(saved.service.status,'paused');const status=await f.json('/api/status',{session:ordinary});assert.equal(status.role,'trial');assert.equal(status.administrator,false);assert.equal(status.service.status,'paused');await f.json(`/api/cases/${f.records.two.id}`,{session:ordinary},404);});
test('paused or expired AI is rejected before any provider call while owned reads/downloads remain available',async t=>{const f=await fixture(t),owner=await f.login('synthetic-owner-alias'),ordinary=await f.login(f.users.one.email),path=`/api/admin/accounts/${f.users.one.id}/service`;let state=(await f.json('/api/service',{session:ordinary})).service;const chat={locale:'en',consent:true,messages:[{role:'user',content:'Synthetic ordinary question'}]};state=(await f.json(path,{method:'PUT',session:owner,body:serviceInput(state,{enabled:false})})).service;assert.equal((await f.json('/api/chat',{method:'POST',session:ordinary,body:chat},403)).code,'SERVICE_PAUSED');assert.equal((await f.json(`/api/cases/${f.records.one.id}`,{session:ordinary})).case.id,f.records.one.id);const original=await f.request(`/api/assets/${f.assets.one.id}/download`,{session:ordinary});assert.equal(original.status,200);assert.equal(await original.text(),'Synthetic one original');const artifact=await f.request(`/api/artifacts/${f.artifacts.one.id}/download`,{session:ordinary});assert.equal(artifact.status,200);state=(await f.json(path,{method:'PUT',session:owner,body:serviceInput(state,{enabled:true,expiresAt:'2026-01-01T00:00:00.000Z'})})).service;assert.equal((await f.json('/api/chat',{method:'POST',session:ordinary,body:chat},403)).code,'SERVICE_EXPIRED');assert.equal((await f.json('/api/clients',{session:ordinary})).clients.length,1);});
test('same existing cookie sees quota and policy after server restart; stale owner change preserves current state',async t=>{const f=await fixture(t),owner=await f.login('synthetic-owner-alias'),ordinary=await f.login(f.users.one.email),path=`/api/admin/accounts/${f.users.one.id}/service`;const initial=(await f.json('/api/service',{session:ordinary})).service;const saved=await f.json(path,{method:'PUT',session:owner,body:serviceInput(initial,{requestsPerHour:1})});f.withStorage(storage=>storage.serviceEntitlements.consume({userId:f.users.one.id,role:'trial'},randomUUID()));await f.restart();const after=(await f.json('/api/service',{session:ordinary})).service;assert.equal(after.used,1);assert.equal(after.remaining,0);assert.equal((await f.json('/api/chat',{method:'POST',session:ordinary,body:{locale:'en',consent:true,messages:[{role:'user',content:'Synthetic quota request'}]}},429)).code,'TRIAL_LIMIT_REACHED');assert.equal((await f.json(path,{method:'PUT',session:owner,body:serviceInput(initial,{enabled:false})},409)).code,'SERVICE_CONFLICT');assert.equal((await f.json('/api/service',{session:ordinary})).service.enabled,true);assert.equal((await f.json('/api/admin/service-audit',{session:owner})).events.length,1);});
