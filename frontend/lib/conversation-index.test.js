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
 for(const bad of [row(id,{caseId:'bad'}),row(id,{draftCount:-1}),row(id,{lastMessage:{role:'assistant',state:'complete',preview:'x'.repeat(161)}})])await assert.rejects(()=>readConversationIndex({get:async()=>({conversations:[bad]})}));
});
