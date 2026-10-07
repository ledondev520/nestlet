// controlledDOM: real React controls and observer, controlled business/telemetry transports.
// No real HTTP, real browser, OS download, print output, provider, or deployment claim.
import {after, afterEach, before, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {createJourneyTelemetry} from '../../lib/journey-telemetry.js';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333', W = '44444444-4444-4444-8444-444444444444';
const status = {authenticated:true, userId:'synthetic-owner', csrfToken:'synthetic-session'};
const record = (id = A) => ({id,version:1,title:'Synthetic case',sourceText:'PRIVATE_SOURCE_MARKER',draftType:'followup',draftText:'Synthetic earlier letter',namesVerified:false,fields:[],documentContext:{},caseIssues:[]});
const artifact = (extra = {}) => ({id:C,caseId:A,kind:'followup',title:'PRIVATE_TITLE_MARKER',content:'PRIVATE_BODY_MARKER',status:'final',version:1,createdAt:'2026-10-07T10:00:00Z',...extra});
const deferred = () => {let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes; reject=no;}); return {promise,resolve,reject};};
let dom, vite, React, createRoot, DocumentsPage, root, host, journey, clock, payloads, requests, popups, copied, downloads, printed;
const globals = new Map(), originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
const set = (key,value) => {if (!globals.has(key)) globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key)); Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
const button = label => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === label);
const tick = async () => React.act(async () => {await new Promise(resolve => setTimeout(resolve,5));});
async function click(label) {const target=button(label); assert.ok(target,label); assert.equal(target.disabled,false,label); await React.act(async () => target.click()); await tick();}
async function focus(target) {await React.act(async () => target.focus());}
async function change(id,value) {
  const element=document.getElementById(id); assert.ok(element,id);
  await React.act(async () => {const prototype=element.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value); element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
}
async function events() {await journey.flush(); return payloads.flat();}
function apiFor(handler = () => undefined) {
  const calls=[];
  async function request(method,path,body,options={}) {
    const call={method,path,body,...options}; calls.push(call); const result=handler(call); if (result !== undefined) return result;
    if (path.includes('/readiness?')) return {ready:true,missing:[]};
    if (path.endsWith('/artifacts/generate')) return {artifact:artifact()};
    if (method==='POST' && path.endsWith('/artifacts')) return {artifact:artifact(body)};
    if (path.endsWith('/artifacts')) return {artifacts:[]};
    if (path.endsWith('/conversations')) return {conversations:[]};
    if (path.endsWith('/document-context')) return {case:record()};
    if (path===`/api/cases/${A}` || path===`/api/cases/${B}`) return {case:record(path.endsWith(B)?B:A)};
    throw new Error('Unexpected synthetic API request');
  }
  return {calls,get:(path,options)=>request('GET',path,undefined,options),post:(path,body,options)=>request('POST',path,body,options),patch:(path,body,options)=>request('PATCH',path,body,options)};
}
async function render(api=globalThis.__documentSession.api, props={}) {
  globalThis.__documentSession={status,api,journey};
  await React.act(async () => root.render(React.createElement(DocumentsPage,{lang:'en',caseId:A,...props}))); await tick();
}
function popupWindow({closed=false}={}) {
  const popup=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'https://fixture.invalid/next/'}).window;
  popups.push(popup); Object.defineProperty(popup,'closed',{value:closed,configurable:true}); popup.focus=()=>{}; popup.print=()=>{printed++;};
  const append=popup.document.head.append.bind(popup.document.head);
  popup.document.head.append=(...nodes)=>{append(...nodes); for (const node of nodes) if (node.tagName==='LINK') setTimeout(()=>node.dispatchEvent(new popup.Event('load')),0);};
  return popup;
}
before(async () => {
  dom=new JSDOM('<!doctype html><html><body><button id="outside">Outside</button></body></html>',{url:'https://fixture.invalid/next/',pretendToBeVisual:true});
  for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','MutationObserver']) set(key,dom.window[key]);
  set('IS_REACT_ACT_ENVIRONMENT',true); set('getComputedStyle',dom.window.getComputedStyle.bind(dom.window)); set('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
  React=await import('react'); ({createRoot}=await import('react-dom/client'));
  vite=await createServer({configFile:'vite.config.js',server:{middlewareMode:true,hmr:false,watch:null,ws:false},appType:'custom',logLevel:'error',plugins:[{
    name:'controlled-document-session',enforce:'pre',load(id) {if (id.endsWith('/frontend/lib/session.jsx')) return 'export function useSession() { return globalThis.__documentSession; }';}
  }]});
  ({DocumentsPage}=await vite.ssrLoadModule('/features/documents/index.jsx'));
});
beforeEach(() => {
  host=document.createElement('div'); document.body.append(host); root=createRoot(host);
  clock=0; payloads=[]; requests=[]; popups=[]; copied=[]; downloads=0; printed=0;
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>copied.push(value)},configurable:true});
  journey=createJourneyTelemetry({getSession:()=>status,now:()=>clock,documentTarget:document,windowTarget:window,isOnline:()=>true,setTimer:()=>1,clearTimer:()=>{},fetchImpl:async (path,options)=>{
    requests.push({path,options}); if (path==='/api/workflows') return {ok:true,json:async()=>({workflowId:W})};
    if (path.endsWith('/events')) payloads.push(JSON.parse(options.body).events); return {ok:true,status:202};
  }});
  journey.connect(); journey.visit('documents');
  set('__documentSession',{status,api:apiFor(),journey});
  set('fetch',async ()=>new Response(artifact().content,{status:200}));
  URL.createObjectURL=()=> 'blob:https://fixture.invalid/synthetic'; URL.revokeObjectURL=()=>{};
  dom.window.HTMLAnchorElement.prototype.click=function(){if(this.download)downloads++;}; window.open=()=>popupWindow();
});
afterEach(async () => {await React.act(async () => root.unmount()); journey.dispose(); host.remove(); for (const popup of popups) popup.close();});
after(async () => {await vite?.close(); dom?.window.close(); URL.createObjectURL=originalCreate; URL.revokeObjectURL=originalRevoke; for (const [key,descriptor] of globals) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});

test('controlledDOM: navigation and typing emit nothing; focused edit dwell ends on blur and one save emits draft.edit',async () => {
  await render(); clock=1000;
  assert.deepEqual(await events(),[]); assert.equal(requests.length,0);
  const body=document.getElementById('document-body'); await focus(body); clock=1030;
  await change('document-body','PRIVATE_CHANGED_BODY'); clock=1040; await change('document-body','PRIVATE_CHANGED_BODY twice');
  assert.deepEqual(await events(),[]);
  await focus(button('Save new version')); clock=1070; await click('Save new version');
  const saved=await events(); assert.equal(saved.length,1); assert.equal(saved[0].event,'draft.edit'); assert.equal(saved[0].outcome,'success'); assert.equal(saved[0].clientActiveMs,70);
  assert.equal('requestId' in saved[0],false); assert.doesNotMatch(JSON.stringify(payloads),/PRIVATE_|Synthetic|filename|content|sourceText/);
  assert.ok(globalThis.__documentSession.api.calls.every(call=>call.telemetry===false));
  await focus(document.getElementById('outside')); clock=9000; await click('Save new version');
  assert.equal((await events()).at(-1).clientActiveMs,0);
});

test('controlledDOM: review confirmation and generation are distinct outcomes; a readiness rejection never reports generation success',async () => {
  let checks=0;
  const api=apiFor(({path})=>path.includes('/readiness?')?{ready:++checks===1,missing:[{key:'recipientName'}]}:undefined);
  await render(api); await focus(document.getElementById('document-answer-recipientName')); clock=25;
  await change('document-answer-recipientName','PRIVATE_RECIPIENT_MARKER'); await click('Save answers & generate final');
  const seen=await events(); assert.deepEqual(seen.map(({event,outcome})=>({event,outcome})),[{event:'review.confirm',outcome:'success'},{event:'draft.generate',outcome:'failure'}]);
  assert.equal(seen[0].clientActiveMs,25); assert.equal(seen[1].errorCode,'CLIENT_VALIDATION');
  assert.equal(api.calls.filter(call=>call.path.endsWith('/artifacts/generate')).length,0);
  assert.doesNotMatch(JSON.stringify(payloads),/PRIVATE_|recipientName/);
});

test('controlledDOM: no-op review and readiness-only generation cannot fabricate successes',async () => {
  const api=apiFor(({path})=>path.includes('/readiness?')?{ready:false,missing:[{key:'recipientName'}]}:undefined);
  await render(api); await click('Save answers & generate final');
  assert.deepEqual((await events()).map(item=>[item.event,item.outcome,item.errorCode]),[['review.confirm','failure','CLIENT_VALIDATION'],['draft.generate','failure','CLIENT_VALIDATION']]);
  assert.equal(api.calls.filter(call=>call.method!=='GET').length,0);
});

test('controlledDOM: generation, clipboard, saved download and dialog invocation emit exact fixed success events',async () => {
  await render(); await focus(button('Generate final document')); clock=12; await click('Generate final document');
  await focus(button('Copy text')); clock=20; await click('Copy text');
  await focus(button('Download TXT')); clock=30; await click('Download TXT');
  await focus(button('Print / Save PDF')); clock=40; await click('Print / Save PDF');
  assert.deepEqual((await events()).map(item=>[item.event,item.outcome]),[['draft.generate','success'],['export.copy','success'],['export.download','success'],['export.print','success']]);
  assert.deepEqual(copied,[artifact().content]); assert.equal(downloads,1); assert.equal(printed,1);
  assert.ok((await events()).every(item=>!('requestId' in item))); assert.doesNotMatch(JSON.stringify(payloads),/PRIVATE_/);
});

test('controlledDOM: clipboard, stale download, blocked popup and closed popup fail without raw error metadata',async () => {
  await render(); await click('Generate final document'); await events(); payloads=[];
  navigator.clipboard.writeText=async()=>{throw new Error('PRIVATE_CLIPBOARD_ERROR');}; await click('Copy text');
  set('fetch',async()=>new Response(JSON.stringify({code:'ARTIFACT_STALE'}),{status:409,headers:{'Content-Type':'application/json'}})); await click('Download TXT');
  window.open=()=>null; await click('Print / Save PDF');
  set('fetch',async()=>new Response(artifact().content,{status:200})); window.open=()=>popupWindow({closed:true}); await click('Print / Save PDF');
  const seen=await events(); assert.deepEqual(seen.map(item=>[item.event,item.outcome,item.errorCode]),[['export.copy','failure','CLIPBOARD_FAILED'],['export.download','failure','DOWNLOAD_FAILED'],['export.print','failure','PRINT_FAILED'],['export.print','failure','CLIENT_CANCELLED']]);
  assert.equal(downloads,0); assert.equal(printed,0); assert.doesNotMatch(JSON.stringify(payloads),/PRIVATE_|ARTIFACT_STALE|Error/);
});

test('controlledDOM: save validation and HTTP failures preserve draft and report one failed boundary',async () => {
  const api=apiFor(({method,path})=>method==='POST'&&path.endsWith('/artifacts')?Promise.reject({code:'CASE_CONFLICT',status:409}):undefined);
  await render(api); await change('document-body','PRIVATE_UNSAVED_BODY'); await click('Save new version');
  assert.equal(document.getElementById('document-body').value,'PRIVATE_UNSAVED_BODY');
  assert.deepEqual((await events()).map(item=>[item.event,item.outcome,item.errorCode]),[['draft.edit','failure','CLIENT_VALIDATION']]);
});

test('controlledDOM: repeated pending confirmation is one action and a server rejection preserves answers',async () => {
  const pending=deferred();
  const api=apiFor(({path,method})=>path.includes('/readiness?')?{ready:false,missing:[{key:'recipientName'}]}:method==='PATCH'?pending.promise:undefined);
  await render(api); await change('document-answer-recipientName','PRIVATE_PENDING_ANSWER');
  const confirm=button('Save answers'); assert.ok(confirm);
  await React.act(async()=>{confirm.click();confirm.click();});
  assert.equal(api.calls.filter(call=>call.method==='PATCH').length,1); assert.deepEqual(await events(),[]);
  await React.act(async()=>pending.reject({code:'PRIVATE_SERVER_ERROR',status:500})); await tick();
  const seen=await events(); assert.equal(seen.length,1); assert.equal(seen[0].event,'review.confirm'); assert.equal(seen[0].outcome,'failure'); assert.equal(seen[0].errorCode,'UNKNOWN_CLIENT_ERROR');
  assert.equal(document.getElementById('document-answer-recipientName').value,'PRIVATE_PENDING_ANSWER'); assert.doesNotMatch(JSON.stringify(payloads),/PRIVATE_/);
});

test('controlledDOM: generation server failure preserves the existing document and reports failure once',async () => {
  const api=apiFor(({path})=>path.endsWith('/artifacts/generate')?Promise.reject({code:'PRIVATE_GENERATOR_ERROR',status:503}):undefined);
  await render(api); await click('Generate final document');
  const seen=await events(); assert.equal(seen.length,1); assert.equal(seen[0].event,'draft.generate'); assert.equal(seen[0].outcome,'failure');
  assert.equal(document.getElementById('document-body').value,record().draftText); assert.doesNotMatch(JSON.stringify(payloads),/PRIVATE_/);
});

test('controlledDOM: navigation, old-case aborts and hidden documents cannot contaminate later focused work',async () => {
  const pending=deferred(); const api=apiFor(({path})=>path.endsWith('/artifacts/generate')?pending.promise:undefined);
  await render(api); await focus(button('Generate final document')); clock=25; await click('Generate final document');
  journey.visit('intake'); journey.activateStep('input.paste'); clock=40;
  await focus(document.getElementById('outside')); journey.activateStep('input.paste');
  await render(api,{active:false}); clock=60;
  const next=journey.beginAction('input.paste'); next.finish({ok:true});
  await render(api,{caseId:B,active:false}); await React.act(async()=>pending.resolve({artifact:artifact()})); await tick();
  const seen=await events(); assert.deepEqual(seen.map(item=>item.event),['input.paste']); assert.equal(seen[0].clientActiveMs,20);
  assert.notEqual(document.getElementById('document-body').value,artifact().content);
});

test('controlledDOM: deactivation clears own focus, returning does not start dwell, and hidden-tab time is excluded',async () => {
  await render(); await focus(document.getElementById('document-body')); clock=20; await render(undefined,{active:false}); clock=120;
  await render(undefined,{active:true}); await click('Save new version'); assert.equal((await events()).at(-1).clientActiveMs,0);
  await focus(document.getElementById('outside')); await focus(document.getElementById('document-body')); clock=150;
  Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new dom.window.Event('visibilitychange')); clock=1150;
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true}); document.dispatchEvent(new dom.window.Event('visibilitychange')); clock=1180;
  await click('Save new version'); assert.equal((await events()).at(-1).clientActiveMs,60);
});

test('controlledDOM: missing or throwing observation methods cannot turn successful edits/exports into business failures',async () => {
  await render(); journey.beginAction=()=>{throw new Error('observer unavailable');}; journey.activateStep=()=>{throw new Error('observer unavailable');};
  await focus(document.getElementById('document-body')); await click('Save new version'); assert.match(host.textContent,/Saved/);
  journey.beginAction=()=>({finish(){throw new Error('observer failed');}}); await click('Copy text'); assert.equal(copied.length,1); assert.match(host.textContent,/Copied/);
  delete globalThis.__documentSession.journey;
  await React.act(async()=>root.render(React.createElement(DocumentsPage,{lang:'en',caseId:A})));
  await click('Copy text'); assert.equal(copied.length,2); assert.equal(host.querySelector('[role="alert"]'),null);
});
