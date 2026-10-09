import { DatabaseSync } from 'node:sqlite';
// Real HTTP/SQLite with synthetic provider transport; never live model or real credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdtempSync, realpathSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const password='synthetic-model-check-password',salt=randomBytes(16);
const hash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
const waitFor=async fn=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Fixture timeout');};
async function fixture(t, {titleMode='normal',holdChat=false,persistence=true,environmentKey=''}={}){
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-model-atomic-'));
 const keyFile=join(dir,'synthetic-wrapping.key');writeFileSync(keyFile,randomBytes(32),{mode:0o600});
 const configPath=join(dir,'private','provider-config.sqlite');
 const calls=[];let release=null, output='';
 const upstream=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);calls.push({body,key:req.headers.authorization});
  if(req.headers.authorization==='Bearer synthetic-rejected-key'){res.writeHead(401);res.end('PRIVATE_PROVIDER_FAILURE_SENTINEL');return;}
  if(req.headers.authorization==='Bearer synthetic-delayed-key')await new Promise(resolve=>{release=resolve;});
  if(body.max_tokens===80 && titleMode==='held')await new Promise(resolve=>{release=resolve;});
  if(body.max_tokens===80 && titleMode==='failed'){res.writeHead(500);res.end();return;}
  if(body.stream && holdChat){holdChat=false;await new Promise(resolve=>{release=resolve;});}
  if(body.stream){res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: '+JSON.stringify({choices:[{delta:{content:'Synthetic administrative answer.'},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');return;}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'deepseek-flash',choices:[{message:{content:body.max_tokens===8?'OK':'Synthetic topic'},finish_reason:'stop'}]}));
 });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const preload=join(dir,'fixture.mjs');writeFileSync(preload,`const original=fetch;globalThis.fetch=(url,options)=>{if(String(url)!=='https://api.deepseek.com/chat/completions')throw Error('Unexpected outbound');return original('http://127.0.0.1:${upstream.address().port}',options);};`);
 const reservation=http.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const origin='https://synthetic-model.invalid',url=`http://127.0.0.1:${port}`;
 const launch=()=>spawn(process.execPath,['--import',preload,'server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:origin,NESTLET_DB_PATH:join(dir,'private','test.sqlite'),NESTLET_PROVIDER_WRAPPING_KEY_FILE:persistence?keyFile:'',NESTLET_OPERATOR_PASSWORD_HASH:hash,NESTLET_OPERATOR_USERNAME:'owner',DEEPSEEK_API_KEY:environmentKey,ENABLE_LIVE_AI:environmentKey?'true':'false'},stdio:['ignore','pipe','pipe']});
 let child=launch();
 const observe=()=>{child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);};observe();
 t.after(async()=>{release?.();if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});upstream.closeAllConnections();await new Promise(r=>upstream.close(r));rmSync(dir,{recursive:true,force:true});});
 await waitFor(()=>output.includes('Nestlet available'));
 const login=await fetch(url+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password})});assert.equal(login.status,200);const data=await login.json();
 const headers={Origin:origin,'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrfToken};
 return {calls,configPath,restartFailure:async mutate=>{await new Promise(r=>{child.once('exit',r);child.kill();});mutate();child=launch();observe();return await new Promise(r=>child.once('exit',r));},restart:async(mutate=()=>{})=>{await new Promise(r=>{child.once('exit',r);child.kill();});mutate();const offset=output.length;child=launch();observe();await waitFor(()=>output.slice(offset).includes('Nestlet available'));},rejectPersistence:()=>{const db=new DatabaseSync(configPath);db.exec("CREATE TRIGGER fail_provider_save BEFORE INSERT ON provider_config BEGIN SELECT RAISE(ABORT,'SYNTHETIC_FAIL'); END;");db.close();},release:()=>release?.(),output:()=>output,login:async()=>{const r=await fetch(url+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password})});assert.equal(r.status,200);const b=await r.json();headers.Cookie=r.headers.get('set-cookie').split(';')[0];headers['X-CSRF-Token']=b.csrfToken;},request:(path,body)=>fetch(url+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})})};
}
test('save validates once, atomically retains the working key on failure, and locks concurrent writes',async t=>{
 const f=await fixture(t);
 let response=await f.request('/api/settings',{apiKey:'synthetic-working-key',enableLive:true});assert.equal(response.status,200);const initial=await response.json();assert.equal(initial.chatCompletionTested,true);assert.equal(initial.check,'chat-completion');assert.equal(initial.liveEnabled,true);assert.ok(initial.connectionVerifiedAt);assert.equal(f.calls.length,1);
 response=await f.request('/api/settings',{apiKey:'synthetic-rejected-key',enableLive:true});assert.equal(response.status,502);assert.equal((await response.json()).code,'CONNECTION_FAILED');
 const retained=await(await f.request('/api/settings')).json();assert.equal(retained.connectionVerifiedAt,initial.connectionVerifiedAt);assert.equal(retained.liveEnabled,true);assert.equal(f.calls.length,2);
 response=await f.request('/api/settings',{enableLive:true});assert.equal(response.status,200);assert.equal(f.calls.at(-1).key,'Bearer synthetic-working-key');
 const delayed=f.request('/api/settings',{apiKey:'synthetic-delayed-key',enableLive:true});await waitFor(()=>f.calls.at(-1)?.key==='Bearer synthetic-delayed-key');
 response=await f.request('/api/settings',{apiKey:'synthetic-concurrent-key',enableLive:true});assert.equal(response.status,429);assert.equal((await response.json()).code,'BUSY');f.release();assert.equal((await delayed).status,200);
 assert.equal(f.calls.length,4);assert.equal((await f.request('/api/settings/test',{})).status,410);assert.equal(f.calls.length,4);
 assert.doesNotMatch(f.output(),/synthetic-(working|rejected|delayed|concurrent)-key|PRIVATE_PROVIDER_FAILURE/);
});
test('AI title is saved only on the first successful turn; loads and repeated turns do not generate again',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/settings',{apiKey:'synthetic-working-key',enableLive:true})).status,200);
 const record=(await(await f.request('/api/cases',{title:'Synthetic case',sourceText:'',fields:[],draftType:'followup',draftText:''})).json()).case;
 const created=await f.request(`/api/cases/${record.id}/conversations`,{title:'New conversation'});assert.equal(created.status,201);const conversation=(await created.json()).conversation;
 const send=()=>f.request('/api/chat',{conversationId:conversation.id,clientMessageId:randomUUID(),locale:'en',consent:true,messages:[{role:'user',content:'Help prepare lease paperwork.'}]});
 let response=await send();assert.equal(response.status,200);assert.match(await response.text(),/event: done/);
 await waitFor(()=>f.calls.some(x=>x.body.max_tokens===80));
 let restored; for(let i=0;i<50;i++){restored=await(await f.request(`/api/conversations/${conversation.id}`)).json();if(restored.conversation.title==='Synthetic topic')break;await new Promise(r=>setTimeout(r,10));}assert.equal(restored.conversation.title,'Synthetic topic');
 response=await send();assert.equal(response.status,200);await response.text();await f.request(`/api/conversations/${conversation.id}`);
 assert.equal(f.calls.filter(x=>x.body.max_tokens===80).length,1);assert.equal(f.calls.filter(x=>x.body.stream).length,2);
});

test('a logged-out owner cannot activate a key after the async validation completes',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/settings',{apiKey:'synthetic-working-key',enableLive:true})).status,200);
 const pending=f.request('/api/settings',{apiKey:'synthetic-delayed-key',enableLive:true});await waitFor(()=>f.calls.at(-1)?.key==='Bearer synthetic-delayed-key');
 assert.equal((await f.request('/api/logout',{})).status,200);f.release();const response=await pending;assert.equal(response.status,401);
 assert.equal((await response.json()).code,'AUTH_REQUIRED');await f.login();assert.equal((await f.request('/api/settings',{enableLive:true})).status,200);assert.equal(f.calls.at(-1).key,'Bearer synthetic-working-key');assert.doesNotMatch(f.output(),/synthetic-(working|delayed)-key/);
});

for(const titleMode of ['held','failed'])test(`optional ${titleMode} title never delays or fails a committed answer`,async t=>{
 const f=await fixture(t,{titleMode});await f.request('/api/settings',{apiKey:'synthetic-working-key',enableLive:true});
 const record=(await(await f.request('/api/cases',{title:'Synthetic case',sourceText:'',fields:[],draftType:'followup',draftText:''})).json()).case;
 const conversation=(await(await f.request(`/api/cases/${record.id}/conversations`,{})).json()).conversation;
 const send=()=>f.request('/api/chat',{conversationId:conversation.id,clientMessageId:randomUUID(),locale:'en',consent:true,messages:[{role:'user',content:'Help prepare lease paperwork.'}]});
 const response=await send();const text=await response.text();assert.match(text,/event: done/);assert.doesNotMatch(text,/event: error/);
 await waitFor(()=>f.calls.some(x=>x.body.max_tokens===80));
 const second=await send();assert.match(await second.text(),/event: done/);assert.equal(f.calls.filter(x=>x.body.max_tokens===80).length,1);
 f.release();
 if(titleMode==='held'){let restored;for(let i=0;i<50;i++){restored=await(await f.request(`/api/conversations/${conversation.id}`)).json();if(restored.conversation.title==='Synthetic topic')break;await new Promise(r=>setTimeout(r,10));}assert.equal(restored.conversation.title,'Synthetic topic');}
});

test('the per-conversation active-turn lock prevents duplicate first-turn provider/title calls',async t=>{
 const f=await fixture(t,{holdChat:true});await f.request('/api/settings',{apiKey:'synthetic-working-key',enableLive:true});
 const record=(await(await f.request('/api/cases',{title:'Synthetic case',sourceText:'',fields:[],draftType:'followup',draftText:''})).json()).case;
 const conversation=(await(await f.request(`/api/cases/${record.id}/conversations`,{})).json()).conversation;
 const send=()=>f.request('/api/chat',{conversationId:conversation.id,clientMessageId:randomUUID(),locale:'en',consent:true,messages:[{role:'user',content:'Help prepare lease paperwork.'}]});
 const first=send();await waitFor(()=>f.calls.some(x=>x.body.stream));
 const concurrent=await send();assert.equal(concurrent.status,409);assert.equal((await concurrent.json()).code,'CHAT_CONVERSATION_BUSY');
 f.release();assert.match(await(await first).text(),/event: done/);await waitFor(()=>f.calls.some(x=>x.body.max_tokens===80));
 assert.equal(f.calls.filter(x=>x.body.stream).length,1);assert.equal(f.calls.filter(x=>x.body.max_tokens===80).length,1);
});

test('an image-only first turn generates its optional title from the persisted answer without sending the image again',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/settings',{apiKey:'synthetic-working-key',enableLive:true})).status,200);
 const record=(await(await f.request('/api/cases',{title:'Synthetic image case',sourceText:'',fields:[],draftType:'followup',draftText:''})).json()).case;
 const conversation=(await(await f.request(`/api/cases/${record.id}/conversations`,{title:'New conversation'})).json()).conversation;
 const data=readFileSync(new URL('./local-acceptance-evidence/initial.png',import.meta.url)).toString('base64');
 const response=await f.request('/api/chat',{conversationId:conversation.id,clientMessageId:randomUUID(),locale:'en',consent:true,messages:[{role:'user',content:'',images:[{mimeType:'image/png',data}]}]});
 assert.equal(response.status,200);assert.match(await response.text(),/event: done/);
 await waitFor(()=>f.calls.some(call=>call.body.max_tokens===80));
 const titles=f.calls.filter(call=>call.body.max_tokens===80);assert.equal(titles.length,1);assert.equal(titles[0].body.messages[1].content,'Synthetic administrative answer.');
 assert.equal(JSON.stringify(titles[0].body).includes(data),false);
 assert.equal(f.calls.filter(call=>call.body.stream).length,1);
});

test('validated encrypted configuration is authoritative across server restart, including pause and failed replacements',async t=>{
 const f=await fixture(t,{environmentKey:'synthetic-original-env-key'});const saved=await f.request('/api/settings',{apiKey:'synthetic-durable-key',enableLive:true});assert.equal(saved.status,200);const initial=await saved.json();
 assert.equal(initial.keyStorage,'encrypted-database');assert.equal(initial.persistentSettingsAvailable,true);
 assert.equal(readFileSync(f.configPath).includes(Buffer.from('synthetic-durable-key')),false);
 await f.restart();let status=await(await f.request('/api/settings')).json();assert.equal(status.liveEnabled,true);assert.equal(status.connectionVerifiedAt,initial.connectionVerifiedAt);assert.equal(status.keyStorage,'encrypted-database');assert.equal(f.calls.length,1);
 assert.equal((await f.request('/api/settings',{apiKey:'synthetic-rejected-key',enableLive:true})).status,502);
 f.rejectPersistence();assert.equal((await f.request('/api/settings',{apiKey:'synthetic-uncommitted-key',enableLive:true})).status,503);
 await f.restart();status=await(await f.request('/api/settings')).json();assert.equal(status.connectionVerifiedAt,initial.connectionVerifiedAt);assert.equal(status.liveEnabled,true);
 const db=new DatabaseSync(f.configPath);db.exec('DROP TRIGGER fail_provider_save');db.close();
 assert.equal((await f.request('/api/settings',{enableLive:false})).status,200);await f.restart();status=await(await f.request('/api/settings')).json();assert.equal(status.liveEnabled,false);assert.equal(status.configured,true);assert.equal(status.connectionVerifiedAt,initial.connectionVerifiedAt);
 assert.doesNotMatch(JSON.stringify(status),/synthetic-durable-key|nonce|ciphertext|wrapping/);assert.doesNotMatch(f.output(),/synthetic-durable-key|synthetic-uncommitted-key|SYNTHETIC_FAIL/);
});
test('missing persistence bootstrap rejects a new key before any provider call',async t=>{
 const f=await fixture(t,{persistence:false});const status=await(await f.request('/api/settings')).json();assert.equal(status.persistentSettingsAvailable,false);
 const response=await f.request('/api/settings',{apiKey:'synthetic-unpersistable-key',enableLive:true});assert.equal(response.status,503);assert.equal((await response.json()).code,'PROVIDER_SETTINGS_UNAVAILABLE');assert.equal(f.calls.length,0);
});

test('a truncated credential store disables AI without environment fallback while case data remains available',async t=>{
 const f=await fixture(t,{environmentKey:'synthetic-environment-fallback'});
 const created=await f.request('/api/cases',{title:'Synthetic preserved case',sourceText:'Synthetic retained source',fields:[],draftType:'followup',draftText:''});assert.equal(created.status,201);const record=(await created.json()).case;
 assert.equal((await f.request('/api/settings',{apiKey:'synthetic-saved-before-corruption',enableLive:true})).status,200);
 await f.restart(()=>writeFileSync(f.configPath,Buffer.alloc(0)));
 const status=await(await f.request('/api/settings')).json();assert.equal(status.providerSettingsError,true);assert.equal(status.persistentSettingsAvailable,false);assert.equal(status.configured,false);assert.equal(status.liveEnabled,false);assert.equal(status.keyStorage,'unavailable');
 assert.equal(readFileSync(f.configPath).length,0);assert.equal(f.calls.length,1);
 const restored=await f.request(`/api/cases/${record.id}`);assert.equal(restored.status,200);assert.equal((await restored.json()).case.sourceText,'Synthetic retained source');
 const chat=await f.request('/api/chat',{locale:'en',consent:true,messages:[{role:'user',content:'Synthetic no-fallback request'}]});assert.equal(chat.status,503);assert.equal(f.calls.length,1);
 assert.doesNotMatch(f.output(),/synthetic-environment-fallback|synthetic-saved-before-corruption/);
});
