// Disposable CI credentials only. Run in the actual image with a read-only synthetic key mount.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const phase=process.argv[2];assert.ok(['write','read','paused','wrong-key'].includes(phase));
const root=process.env.NESTLET_SMOKE_APP_ROOT || '/app';
const state=process.env.NESTLET_SMOKE_STATE || '/provider-config';
const keyFile=process.env.NESTLET_PROVIDER_WRAPPING_KEY_FILE || '/run/nestlet-private/provider-wrapping.key';
const proof=state+'/expected.json';
const password='synthetic-container-provider-password';
const apiKey='synthetic-container-provider-key';
const salt=Buffer.alloc(16,42),hash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
if(!process.env.NESTLET_SMOKE_APP_ROOT)assert.throws(()=>appendFileSync(keyFile,'x'),'Wrapping mount must refuse writes');
const preload='/tmp/provider-smoke-transport.mjs';
writeFileSync(preload,`globalThis.fetch=async(url,options)=>{if(String(url)!=='https://api.deepseek.com/chat/completions'||options.headers.Authorization!=='Bearer synthetic-container-provider-key')throw Error('Unexpected synthetic provider request');const body=JSON.parse(options.body);if(body.model!=='deepseek-flash'||body.max_tokens!==8||body.messages.length!==1||body.messages[0].content!=='Reply with exactly OK.')throw Error('Unexpected model check');return Response.json({model:'deepseek-flash',choices:[{finish_reason:'stop',message:{content:'OK'}}]});};`,{mode:0o600});
const origin='https://provider-container.invalid',url='http://127.0.0.1:4177';let output='';
const child=spawn(process.execPath,['--import',preload,root+'/server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'4177',PUBLIC_ORIGIN:origin,NESTLET_DB_PATH:state+'/cases.sqlite',NESTLET_PROVIDER_CONFIG_PATH:state+'/provider-config.sqlite',NESTLET_PROVIDER_WRAPPING_KEY_FILE:keyFile,NESTLET_OPERATOR_USERNAME:'owner',NESTLET_OPERATOR_PASSWORD_HASH:hash,DEEPSEEK_API_KEY:phase==='wrong-key'?'synthetic-forbidden-fallback':'',ENABLE_LIVE_AI:'true'},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
try {
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Synthetic server readiness timeout')),10000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Synthetic server exited'));});child.stdout.on('data',()=>{if(output.includes('Nestlet available')){clearTimeout(timer);resolve();}});});
 const login=await fetch(url+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password})});assert.equal(login.status,200);const session=await login.json();
 const headers={Origin:origin,'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrfToken};
 const request=(path,body)=>fetch(url+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(phase==='write'){
   const saved=await request('/api/settings',{apiKey,enableLive:true});assert.equal(saved.status,200);const settings=await saved.json();assert.equal(settings.keyStorage,'encrypted-database');assert.equal(settings.liveEnabled,true);
   const created=await request('/api/cases',{title:'Synthetic durable mount case',sourceText:'Synthetic retained source',fields:[],draftType:'followup',draftText:''});assert.equal(created.status,201);const record=(await created.json()).case;
   writeFileSync(proof,JSON.stringify({verifiedAt:settings.connectionVerifiedAt,caseId:record.id}),{mode:0o600});
 }else{
   const expected=JSON.parse(readFileSync(proof,'utf8'));const settings=await(await request('/api/settings')).json();
   const record=await request('/api/cases/'+expected.caseId);assert.equal(record.status,200);assert.equal((await record.json()).case.sourceText,'Synthetic retained source');
   if(phase==='wrong-key'){
     assert.equal(settings.providerSettingsError,true);assert.equal(settings.configured,false);assert.equal(settings.liveEnabled,false);assert.equal(settings.persistentSettingsAvailable,false);
     assert.equal((await request('/api/chat',{locale:'en',consent:true,messages:[{role:'user',content:'Synthetic disabled AI check'}]})).status,503);
   }else{
     assert.equal(settings.providerSettingsError,false);assert.equal(settings.keyStorage,'encrypted-database');assert.equal(settings.connectionVerifiedAt,expected.verifiedAt);assert.equal(settings.liveEnabled,phase==='read');assert.equal(settings.configured,true);
     if(phase==='read'){
       // The fixture rejects any different authorization, proving the key was actually restored.
       const checked=await request('/api/settings',{enableLive:true});assert.equal(checked.status,200);const validated=await checked.json();
       assert.equal((await request('/api/settings',{enableLive:false})).status,200);
       writeFileSync(proof,JSON.stringify({...expected,verifiedAt:validated.connectionVerifiedAt}),{mode:0o600});
     }
   }
 }
 assert.equal(readFileSync(state+'/provider-config.sqlite').includes(Buffer.from(apiKey)),false);
 assert.doesNotMatch(output,/synthetic-container-provider-key|synthetic-forbidden-fallback/);
 console.log(`PASS: ${process.env.NESTLET_SMOKE_APP_ROOT ? 'local harness (not Docker)' : 'actual image with read-only key mount'} provider-settings ${phase}; synthetic wrapping file, encrypted persisted settings and case access`);
} finally {
 if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});
}
