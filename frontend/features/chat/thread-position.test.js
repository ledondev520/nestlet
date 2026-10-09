import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useThreadPosition } from './use-thread-position.js';

test('thread position follows only the active scoped reader, after history renders', async context => {
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  const originals=new Map();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})){
    originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  }
  let resize;
  originals.set('ResizeObserver',Object.getOwnPropertyDescriptor(globalThis,'ResizeObserver'));
  globalThis.ResizeObserver=class{constructor(callback){resize=callback;}observe(){}disconnect(){resize=null;}};
  let height=1000;
  const root=createRoot(document.getElementById('root'));
  function Thread(props){const position=useThreadPosition(props);return React.createElement('div',{...position},React.createElement('div',null,props.messages));}
  let props={scope:'user-a:case-a:conversation-a',active:true,loading:true,messages:'Loading'};
  const render=async update=>{props={...props,...update};await act(async()=>root.render(React.createElement(Thread,props)));};
  context.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  await render({});const node=document.querySelector('#root > div');
  Object.defineProperties(node,{scrollHeight:{get:()=>height},clientHeight:{get:()=>200}});
  assert.equal(node.scrollTop,0,'Loading placeholder does not choose the reading position');
  await render({loading:false,messages:'old\nlatest'});
  assert.equal(node.scrollTop,1000,'First completed history render opens the latest content');
  const scroll=async top=>{node.scrollTop=top;await act(async()=>node.dispatchEvent(new dom.window.Event('scroll',{bubbles:true})));};
  await scroll(250);
  height=1200;await render({messages:'old\nlatest\nnew chunk'});
  assert.equal(node.scrollTop,250,'Streaming must not pull a reader away from older messages');
  await act(async()=>resize());assert.equal(node.scrollTop,250,'Late image/markdown layout keeps the reader position');
  await render({active:false});node.scrollTop=0;await act(async()=>node.dispatchEvent(new dom.window.Event('scroll')));
  await render({active:true});assert.equal(node.scrollTop,250,'Returning from materials/settings restores this conversation');
  await scroll(1000);height=1400;await render({messages:'another chunk'});assert.equal(node.scrollTop,1400,'A reader at the end follows the reply');
  await render({scope:'user-a:case-b:conversation-b',loading:true,messages:'Loading'});node.scrollTop=0;
  height=800;await render({loading:false,messages:'other history'});assert.equal(node.scrollTop,800,'Different conversation gets its own initial end position');
  await scroll(100);await render({scope:'user-b:case-b:conversation-b'});assert.equal(node.scrollTop,800,'An account change cannot reuse another reader position');
  await render({active:false,loading:true,scope:'user-b:case-c:conversation-c'});node.scrollTop=0;
  await render({loading:false,messages:'loaded while hidden'});assert.equal(node.scrollTop,0);
  await render({active:true});assert.equal(node.scrollTop,800,'Hidden history only positions when visible');
});
