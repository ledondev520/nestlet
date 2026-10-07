// Real loopback HTTP + SQLite. No provider key, mocked success, or live-model/browser claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { buildChatTurn, newCasePayload } from './logic.js';

test('real HTTP: ordinary chat payload stays compatible and unsupported or unconfigured retrieval cannot succeed', {timeout:15000}, async context => {
  const directory=await mkdtemp(join(await realpath(tmpdir()),'nestlet-chat-capability-'));
  const salt=randomBytes(16),password='public-chat-capability-fixture';
  const hash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('../../../',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:'',NESTLET_DB_PATH:join(directory,'cases.sqlite'),NESTLET_ASSETS_PATH:join(directory,'assets'),NESTLET_OPERATOR_USERNAME:'owner',NESTLET_OPERATOR_PASSWORD_HASH:hash,DEEPSEEK_API_KEY:'',ENABLE_LIVE_AI:'false',DEEPSEEK_MODEL:'deepseek-flash'},stdio:['ignore','pipe','pipe']});
  context.after(async()=>{if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});await rm(directory,{recursive:true,force:true});});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(output)),5000);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});child.stdout.on('data',data=>{if(data.toString().includes('Nestlet available')){clearTimeout(timer);resolve();}});});
  const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password})});
  assert.equal(login.status,200);const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
  const request=(path,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':session.csrfToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const status=await (await request('/api/status')).json();assert.equal(status.authenticated,true);assert.equal(status.liveEnabled,false);
  const record=await (await request('/api/cases',newCasePayload('Synthetic chat capability case'))).json();assert.ok(record.case.id);
  const thread=await (await request(`/api/cases/${record.case.id}/conversations`,{title:'Synthetic capability thread'})).json();assert.ok(thread.conversation.id);
  const args={caseId:record.case.id,conversationId:thread.conversation.id,clientMessageId:randomUUID(),text:'Explain an administrative next step.',lang:'en'};
  const ordinary=await request('/api/chat',buildChatTurn(args));assert.equal(ordinary.status,503);assert.equal((await ordinary.json()).code,'LIVE_DISABLED');
  const retrieval=await request('/api/chat',buildChatTurn({...args,clientMessageId:randomUUID(),libraryConsent:true}));
  assert.equal(retrieval.ok,false);const error=await retrieval.json();
  if(status.libraryRetrievalEnabled===true){assert.equal(retrieval.status,503);assert.equal(error.code,'LIVE_DISABLED');}
  else {assert.equal(retrieval.status,400);assert.equal(error.code,'CHAT_INVALID');}
  const saved=await (await request(`/api/conversations/${thread.conversation.id}`)).json();assert.deepEqual(saved.messages,[]);
});
