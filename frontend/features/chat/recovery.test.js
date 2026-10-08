import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {restoredTurn,pendingTurns,reconcilePendingTurns} from './recovery.js';
const turn=()=>restoredTurn({userMessageId:randomUUID(),clientMessageId:randomUUID(),question:'Synthetic question',assistantMessageId:randomUUID(),reply:'Synthetic unconfirmed reply',requestId:randomUUID()});
const savedUser=turn=>({...turn.user,requestId:turn.assistant.requestId,localOnly:undefined});
test('saved newer turn never establishes persistence for an earlier unconfirmed copy',()=>{
 const first=turn(),second=turn();const result=reconcilePendingTurns([savedUser(first),savedUser(second),{...second.assistant,state:'complete'}],[first,second]);
 assert.deepEqual(result.remaining,[first]);assert.deepEqual(result.completed,[second.user.clientMessageId]);assert.equal(result.messages.find(row=>row.id===first.assistant.id).localOnly,true);
});
test('missing users and mismatching saved partial text retain labelled recovery without duplicate IDs',()=>{
 const first=turn();const absent=reconcilePendingTurns([], [first]);assert.equal(absent.messages.length,2);assert.equal(absent.messages[1].localOnly,true);
 const different=reconcilePendingTurns([savedUser(first),{...first.assistant,content:'Different saved partial',state:'failed'}],[first]);
 assert.equal(different.messages.filter(row=>row.id===first.assistant.id).length,1);assert.equal(different.messages[1].content,first.assistant.content);assert.deepEqual(different.remaining,[first]);
});
test('exact saved partial retires its recovery copy without inventing completed status',()=>{
 const first=turn();const result=reconcilePendingTurns([savedUser(first),{...first.assistant,state:'interrupted'}],[first]);assert.deepEqual(result.remaining,[]);assert.deepEqual(result.completed,[]);assert.equal(result.messages[1].state,'interrupted');assert.equal(result.messages[1].localOnly,undefined);
 assert.equal(pendingTurns([first],first).length,1);
});
