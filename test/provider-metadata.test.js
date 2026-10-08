// Authored provider responses only. This is not live-provider acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModelKey, generateConversationTitle } from '../provider-metadata.js';
const result = (content, more = {}) => Response.json({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content }, ...more }] });
test('key validation makes exactly one bounded Flash inference with no user data', async () => {
  let calls=0;
  const verified=await validateModelKey({apiKey:'synthetic-key',transport:async (url,options)=>{
    calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.redirect,'error');
    const body=JSON.parse(options.body);assert.equal(body.model,'deepseek-flash');assert.equal(body.max_tokens,8);assert.equal(body.stream,false);
    assert.deepEqual(body.messages,[{role:'user',content:'Reply with exactly OK.'}]);return result('OK');
  }});
  assert.equal(calls,1);assert.equal(verified.chatCompletionTested,true);assert.equal(verified.check,'chat-completion');
});
test('key validation rejects provider rejection, malformed, incomplete, tool and oversized output',async()=>{
  for(const response of [new Response('',{status:401}),result('no'),result('OK',{finish_reason:'length'}),result('OK',{message:{content:'OK',tool_calls:[]}}),new Response('x'.repeat(17000)),new Response('bad json')]) {
    await assert.rejects(validateModelKey({apiKey:'synthetic-key',transport:async()=>response}));
  }
});
test('titles use only bounded user topic and reject malformed output without fabrication',async()=>{
  let calls=0;
  assert.equal(await generateConversationTitle({userText:' ',locale:'zh',transport:()=>{calls++;}}),null);assert.equal(calls,0);
  const title=await generateConversationTitle({userText:'x'.repeat(2000),locale:'zh',apiKey:'synthetic-key',transport:async(url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.max_tokens,80);assert.equal(body.messages.length,2);assert.equal(body.messages[1].content.length,1200);return result('准备租约材料');
  }});assert.equal(title,'准备租约材料');
  for(const bad of ['x'.repeat(81),'two\nlines','<script>','# heading'])assert.equal(await generateConversationTitle({userText:'topic',transport:async()=>result(bad)}),null);
});
