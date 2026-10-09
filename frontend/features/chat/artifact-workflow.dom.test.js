// Controlled read timing in React DOM, not HTTP/provider/browser evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('workflow distinguishes current/draft/stale/unknown inventory and discards delayed cross-scope reads', async context => {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true}), originals=new Map();
  for(const key of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','Event']) {originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});}
  originals.set('IS_REACT_ACT_ENVIRONMENT',Object.getOwnPropertyDescriptor(globalThis,'IS_REACT_ACT_ENVIRONMENT'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react'),{createRoot}=await import('react-dom/client');
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},logLevel:'error'}),{ChatCaseWorkflow}=await vite.ssrLoadModule('/features/chat/case-workflow.jsx');
  const root=createRoot(document.getElementById('root'));
  context.after(async()=>{await React.act(async()=>root.unmount());await vite.close();dom.window.close();for(const[k,v]of originals)v?Object.defineProperty(globalThis,k,v):delete globalThis[k];});
  const record={id:randomUUID(),version:4,title:'Synthetic A',draftType:'followup',fields:[]};
  const other={...record,id:randomUUID(),title:'Synthetic B'};
  const final={id:randomUUID(),caseId:record.id,kind:'followup',title:'Synthetic final',status:'final',version:3,sourceCaseVersion:4,currentCaseVersion:4,isStale:false,needsRegeneration:false};
  let inventory=[final], fail=false, hold=null;
  const api={get:async path=>{
    if(path.endsWith('/artifacts')) {if(hold){const gate=hold;gate.reached=true;await gate.promise;return {artifacts:[final]};}if(fail)throw {code:'REQUEST_FAILED'};return {artifacts:path.includes(other.id)?[]:inventory};}
    if(path.includes('/readiness?'))return {ready:true,missing:[]};
    return {case:path.endsWith(other.id)?other:record};
  }};
  let props={api,lang:'en',userId:'synthetic-a',caseId:record.id,active:true,onOpenMaterials(){},onOpenDocuments(){}};
  const render=async changes=>{props={...props,...changes};await React.act(async()=>root.render(React.createElement(ChatCaseWorkflow,props)));};
  const flush=async()=>React.act(async()=>new Promise(resolve=>setTimeout(resolve,5)));
  const wait=async condition=>{const deadline=Date.now()+3000;while(!condition()){assert.ok(Date.now()<deadline,document.body.textContent);await flush();}};
  const body=()=>document.body.textContent;
  await render({});await wait(()=>body().includes('A final document matches'));
  assert.match(body(),/View saved documents/);assert.doesNotMatch(body(),/Saved details are ready for document generation/);
  inventory=[{...final,status:'draft'}];await render({refreshKey:1});await wait(()=>body().includes('A saved draft still needs review'));
  inventory=[{...final,sourceCaseVersion:2,isStale:true,needsRegeneration:true}];await render({refreshKey:2});await wait(()=>body().includes('older case details'));
  inventory=[{...final,currentCaseVersion:5,isStale:true,needsRegeneration:true}];await render({refreshKey:3});await wait(()=>body().includes('could not be verified'));assert.doesNotMatch(body(),/Finish and preview/);
  fail=true;await render({refreshKey:4});await wait(()=>document.querySelector('[data-slot="alert"]'));assert.doesNotMatch(body(),/A final document matches|Saved details are ready/);assert.match(body(),/View saved documents/);
  fail=false;let resolve;hold={promise:new Promise(done=>resolve=done)};await render({refreshKey:5});await wait(()=>hold.reached);
  const delayed=hold;hold=null;await render({caseId:other.id,userId:'synthetic-b'});await wait(()=>body().includes('Saved details are ready'));
  await React.act(async()=>resolve());await flush();assert.doesNotMatch(body(),/Synthetic final|A final document matches/);
  inventory=[final];await render({caseId:record.id,userId:'synthetic-a',refreshKey:6});await wait(()=>body().includes('A final document matches'));
  await render({active:false});assert.doesNotMatch(body(),/A final document matches/);
  await render({active:true,lang:'zh'});await wait(()=>body().includes('已有当前资料的完成版'));assert.doesNotMatch(body(),/可以生成文档/);
});
