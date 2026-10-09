import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('home and history render distinct scoped metadata while preserving canonical titles and exact links',async context=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},logLevel:'error'});context.after(()=>vite.close());
 const {ConversationRail}=await vite.ssrLoadModule('/workbench/conversation-rail.jsx');
 const {ConversationOpening}=await vite.ssrLoadModule('/features/chat/opening.jsx');
 const rows=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].map((id,index)=>({id,caseId:id,title:'案例会话',displayId:`DH0000000${index+1}`,updatedAt:'2026-10-09T01:02:00Z',draftCount:0,lastMessage:{role:'assistant',state:'complete',preview:['Synthetic Elm Street follow-up','<script>Synthetic Oak Street facts</script>'][index]}}));
 for(const lang of ['zh','en'])for(const Component of [ConversationRail,ConversationOpening]){
  const html=renderToStaticMarkup(React.createElement(Component,{lang,state:{phase:'ready',data:rows},onOpen:()=>{},onRetry:()=>{}}));
  const dom=new JSDOM(html);context.after(()=>dom.window.close());
  const links=[...dom.window.document.querySelectorAll('a')];assert.equal(links.length,2);assert.notEqual(links[0].textContent,links[1].textContent);
  for(const [index,link] of links.entries()){assert.equal(link.getAttribute('href'),`#chat?conversation=${rows[index].id}`);assert.match(link.textContent,/案例会话/);assert.ok(link.textContent.includes(rows[index].displayId));assert.ok(link.textContent.includes(rows[index].lastMessage.preview));}
  assert.equal(dom.window.document.querySelector('script'),null,'Preview remains escaped plain text');
 }
 assert.equal(rows[0].title,'案例会话');
});
