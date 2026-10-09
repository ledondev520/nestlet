import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationFromHash,conversationHref,openingSuggestions,readConversationIndex} from './conversation-index.js';
const id='11111111-1111-4111-8111-111111111111';
const row=(id,more={})=>({id,caseId:id,title:'Synthetic topic',lastMessage:{role:'assistant',state:'complete',preview:'Done'},draftCount:0,...more});
test('exact conversation links are UUID-only and source-grounded suggestions do not invent pending tasks',()=>{
 assert.equal(conversationFromHash(conversationHref(id)),id);assert.equal(conversationFromHash('#chat?conversation=javascript:evil'),null);
 const suggestions=openingSuggestions([row('a'),row('b',{lastMessage:null}),row('c',{draftCount:1}),row('d',{lastMessage:{role:'assistant',state:'failed',preview:'Partial'}}),row('e')]);
 assert.deepEqual(suggestions.map(x=>[x.id,x.reason]),[['c','draft'],['d','interrupted'],['a','recent']]);
 assert.deepEqual(openingSuggestions([]),[]);
});
test('index parser rejects corrupt metadata and accepts empty own-account history',async()=>{
 assert.deepEqual(await readConversationIndex({get:async()=>({conversations:[]})}),[]);
 assert.deepEqual(await readConversationIndex({get:async()=>({conversations:[row(id)]})}),[row(id)]);
 const unicode=row(id,{lastMessage:{role:'assistant',state:'complete',preview:'🙂'.repeat(160)}});
 assert.deepEqual(await readConversationIndex({get:async()=>({conversations:[unicode]})}),[unicode],'SQLite substr bounds Unicode code points, not UTF-16 units');
 for(const bad of [row(id,{caseId:'bad'}),row(id,{draftCount:-1}),row(id,{lastMessage:{role:'assistant',state:'complete',preview:'x'.repeat(161)}})])await assert.rejects(()=>readConversationIndex({get:async()=>({conversations:[bad]})}));
});

test('history details distinguish identical AI placeholders without changing titles or exposing credential-shaped previews',async()=>{
 const {conversationDetails}=await import('./conversation-index.js');
 const first=row(id,{title:'案例会话',displayId:'DH00000001',updatedAt:'2026-10-09T01:02:00Z',lastMessage:{role:'assistant',state:'complete',preview:'Synthetic Elm Street follow-up draft'}});
 const second={...first,displayId:'DH00000002',lastMessage:{role:'assistant',state:'complete',preview:'Synthetic Oak Street facts'}};
 assert.notEqual(conversationDetails(first).metadata,conversationDetails(second).metadata);
 assert.match(conversationDetails(first,'en').metadata,/2026.*DH00000001/u);
 assert.equal(conversationDetails(first).preview,first.lastMessage.preview);
 assert.equal(first.title,'案例会话');
 for(const preview of ['sk-synthetic-only','Bearer synthetic','API_KEY=synthetic','密码 synthetic','-----BEGIN PRIVATE KEY'])assert.equal(conversationDetails({...first,lastMessage:{preview}}).preview,'');
 assert.equal(conversationDetails({...first,lastMessage:{preview:'🙂'.repeat(80)}}).preview,'🙂'.repeat(60)+'…');
 assert.deepEqual(conversationDetails({updatedAt:'invalid',displayId:'<script>',lastMessage:null}),{metadata:'',preview:''});
 assert.equal(conversationDetails({...first,lastMessage:{preview:'a\n\u202eb'}}).preview,'a b');
});
