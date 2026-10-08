// Actual React/JSDOM coordination test. Geometry is not browser evidence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
test('mobile shell yields sole modal ownership to an external shared dialog without stealing focus',async t=>{
 const dom=new JSDOM('<body><div id="root"></div></body>',{url:'https://nestlet.invalid',pretendToBeVisual:true}),saved=new Map();
 for(const key of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});}
 const oldAct=globalThis.IS_REACT_ACT_ENVIRONMENT;globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},logLevel:'error'});
 const {WorkbenchShell}=await vite.ssrLoadModule('/workbench/shell.jsx');const root=createRoot(document.querySelector('#root'));
 t.after(async()=>{await React.act(async()=>root.unmount());await vite.close();dom.window.close();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}globalThis.IS_REACT_ACT_ENVIRONMENT=oldAct;});
 await React.act(async()=>root.render(React.createElement(WorkbenchShell,{lang:'en',contextOpen:true,onContextOpenChange(){},context:React.createElement('button',null,'Context action'),center:'Workspace',rail:'Cases'})));
 assert.equal(document.querySelector('.wb [aria-modal="true"]'),null);
 for(const explicitAria of [false,true]){
  const open=document.querySelector('button[aria-label="Open case context"]');await React.act(async()=>open.click());assert.ok(document.querySelector('.wb [aria-modal="true"]'));assert.equal(document.activeElement.getAttribute('aria-label'),'Close context');
  const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.dataset.slot='dialog-content';modal.dataset.state='open';if(explicitAria)modal.setAttribute('aria-modal','true');const input=document.createElement('input');modal.append(input);
  await React.act(async()=>{document.body.append(modal);input.focus();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(document.querySelector('.wb [aria-modal="true"]'),null);assert.equal(document.activeElement,input);assert.equal(document.querySelector('.wb-context').hidden,true);modal.remove();
 }
});
