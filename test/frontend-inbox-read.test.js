// React DOM synthetic delayed reads; no provider, server or browser acceptance claim.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useScopedRead } from '../frontend/lib/use-scoped-read.js';
let dom, root, host;const saved=new Map();
before(()=>{dom=new JSDOM('<body><div id="root"></div></body>',{url:'https://nestlet.invalid'});for(const k of ['window','document','navigator']){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});}globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.querySelector('#root');root=createRoot(host);});
after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
const api={};let requests=[],renders=[];
function Probe({scope}){const state=useScopedRead(api,scope,signal=>new Promise((resolve,reject)=>requests.push({scope,signal,resolve,reject})));renders.push({scope,...state});return React.createElement('p',null,`${scope}:${state.phase}:${state.data||''}`);}
async function render(scope){await act(async()=>root.render(React.createElement(Probe,{scope})));}
async function settle(request,value){await act(async()=>request.resolve(value));}
test('render-time scope gating and request generation reject A→B→A stale success/failure',async()=>{
 await render('A');const a=requests.at(-1);await settle(a,'old-A');assert.match(host.textContent,/old-A/);
 renders=[];await render('B');assert.ok(renders.every(row=>row.scope!=='B'||row.data===null));const b=requests.at(-1);assert.equal(a.signal.aborted,true);
 await render('A');const newer=requests.at(-1);assert.notEqual(newer,a);await settle(b,'wrong-B');assert.doesNotMatch(host.textContent,/wrong-B|old-A/);
 await settle(newer,'current-A');assert.match(host.textContent,/current-A/);
 await render('B');const failed=requests.at(-1);await act(async()=>failed.reject(Error('private failure')));assert.equal(host.textContent,'B:error:');
});
test('same-case revision and locale clear cached data; late prior identity cannot overwrite',async()=>{
 await render('user-A:case:zh:1');const old=requests.at(-1);await render('user-A:case:en:2');const en=requests.at(-1);await settle(old,'private-A');assert.doesNotMatch(host.textContent,/private-A/);await settle(en,'current-en');
 renders=[];await render('user-B:case:en:2');assert.ok(renders.every(row=>row.data===null));await render(null);assert.equal(host.textContent,'null:idle:');
});
