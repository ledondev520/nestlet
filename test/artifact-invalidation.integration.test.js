// Actual HTTP/SQLite with DOM event execution, not browser/layout/CSP acceptance. No response mocks or provider calls.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,scryptSync} from 'node:crypto';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {openStorage} from '../storage.js';
import {JSDOM} from 'jsdom';

test('actual HTTP artifact lifecycle exits clean previews while preserving real unsaved document edits', {timeout:45000}, async context=>{
  const directory=await mkdtemp(join(await realpath(tmpdir()),'nestlet-artifact-browser-'));
  const filename=join(directory,'nestlet.sqlite'),storage=openStorage({filename});
  const confirmedAt=new Date().toISOString();
  const confirmed=value=>({value,source:'Synthetic user-confirmed fixture',confirmed:true,confirmedAt,notApplicable:false,sourceMessageId:null});
  const record=storage.createCase('owner',{title:'Synthetic artifact lifecycle',sourceText:'Property: 128 Example Lane',draftType:'followup',draftText:'',
    fields:['property','owner','pha','caseReference','rent'].map(key=>({key,value:key==='property'?'128 Example Lane':'',source:'Synthetic fixture',confirmed:true,conflict:false})),
    documentContext:{recipientName:confirmed('Example Intake Team'),recipientContact:confirmed('intake@example.invalid'),senderName:confirmed('Example Sender'),senderContact:confirmed('sender@example.invalid')}});
  storage.close();
  const password='public-artifact-browser-fixture',salt=randomBytes(16),hash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:'',NESTLET_DB_PATH:filename,NESTLET_OPERATOR_USERNAME:'owner',NESTLET_OPERATOR_PASSWORD_HASH:hash,DEEPSEEK_API_KEY:'',ENABLE_LIVE_AI:'false',DEEPSEEK_MODEL:'deepseek-flash'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  context.after(async()=>{if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});await rm(directory,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(output)),5000);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});child.stdout.on('data',data=>{if(data.toString().includes('Nestlet available')){clearTimeout(timer);resolve();}});});

  const realFetch=globalThis.fetch;
  const login=await realFetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:base,pretendToBeVisual:true});
  const globals=new Map(),requests=[];
  const replace=(key,value)=>{globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
  replace('window',dom.window);replace('document',dom.window.document);replace('navigator',{clipboard:{writeText:async()=>{}}});replace('confirm',()=>true);
  dom.window.matchMedia=()=>({matches:false});dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  replace('fetch',async(path,options={})=>{const response=await realFetch(base+path,{...options,headers:{...options.headers,Origin:base,Cookie:cookie}});requests.push({path,method:options.method||'GET',status:response.status});return response;});
  context.after(()=>{dom.window.close();for(const[key,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const get=id=>{const element=dom.window.document.getElementById(id);assert.ok(element,id);return element;};
  const wait=async predicate=>{const end=Date.now()+5000;while(!predicate()){if(Date.now()>end)throw new Error('DOM wait timed out: '+dom.window.document.body.textContent);await new Promise(resolve=>setTimeout(resolve,10));}};
  const click=id=>{const element=get(id);assert.equal(element.disabled,false,id);element.click();};
  const fill=(id,value)=>{const element=get(id);element.value=value;element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  const check=id=>{const element=get(id);assert.equal(element.disabled,false,id);element.checked=true;element.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  const read=async path=>(await realFetch(base+path,{headers:{Origin:base,Cookie:cookie}})).json();
  await import(new URL('../public/app.js?artifact-invalidation',import.meta.url));
  await wait(()=>dom.window.document.querySelector('#saved-case option[value="'+record.id+'"]'));
  click('language');get('case-manager').open=true;get('saved-case').value=record.id;get('saved-case').dispatchEvent(new dom.window.Event('change',{bubbles:true}));click('open-case');
  await wait(()=>get('save-case').disabled===false&&get('field-0').value==='128 Example Lane');
  click('generate-final');await wait(()=>dom.window.document.getElementById('draft')&&!get('save-artifact').disabled);
  const original=get('draft').value,first=(await read(`/api/cases/${record.id}/artifacts`)).artifacts[0];
  assert.match(original,/128 Example Lane/);
  click('draft-back');fill('field-0','');check('confirm-0');
  click('save-case');await wait(()=>requests.some(item=>item.path===`/api/cases/${record.id}`&&item.method==='PUT'&&item.status===200)&&!get('save-case').disabled);
  assert.equal(get('case-save-status').textContent,'Saved','Clearing a clean artifact preview must not leave a phantom edited-artifact identity');
  assert.equal((await read(`/api/artifacts/${first.id}`)).artifact.content,original);
  assert.equal((await read(`/api/artifacts/${first.id}`)).artifact.isStale,true);

  const answer=dom.window.document.querySelector('[data-readiness="property"]');assert.ok(answer);answer.value='256 Example Lane';
  click('readiness-confirm');await wait(()=>get('field-0').value==='256 Example Lane'&&!get('save-case').disabled);
  click('generate-final');await wait(()=>dom.window.document.getElementById('draft')&&get('draft').value.includes('256 Example Lane')&&!get('save-artifact').disabled);
  const regenerated=get('draft').value;
  assert.equal((await read(`/api/cases/${record.id}/artifacts`)).artifacts.length,2);
  fill('draft',regenerated+'\nUNSAVED HUMAN EDIT TO PRESERVE');click('draft-back');fill('field-1','Example Updated Owner');check('confirm-1');
  const priorPuts=requests.filter(item=>item.method==='PUT').length;
  click('save-case');await wait(()=>requests.filter(item=>item.method==='PUT').length>priorPuts&&!get('save-case').disabled);
  const draftStep=dom.window.document.querySelector('[data-stage="2"]');assert.equal(draftStep.disabled,false,'Real unsaved document edits remain accessible');draftStep.click();
  assert.equal(get('draft').value,regenerated+'\nUNSAVED HUMAN EDIT TO PRESERVE');assert.equal(get('case-save-status').textContent,'Unsaved changes');
  click('save-artifact');await wait(()=>get('case-save-status').textContent==='Saved');
  const versions=(await read(`/api/cases/${record.id}/artifacts`)).artifacts;
  const edited=(await read(`/api/artifacts/${versions[0].id}`)).artifact;
  assert.equal(edited.status,'draft');assert.match(edited.content,/UNSAVED HUMAN EDIT TO PRESERVE/);
  assert.equal((await read(`/api/artifacts/${first.id}`)).artifact.content,original);
});
