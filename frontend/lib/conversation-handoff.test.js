import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { conversationDraft, conversationHandoff, conversationSource, handoffMatches, reviewableMessage, HANDOFF_LIMIT, caseWriteDefinitelyRejected } from './conversation-handoff.js';
const message = () => ({ id: randomUUID(), role: 'assistant', state: 'complete', content: 'Property: Synthetic Avenue' });
const scope = () => ({ userId: 'owner', caseId: randomUUID(), conversationId: randomUUID() });
test('conversation handoff has exact source identity, works for bootstrap owner, and never confirms prose', () => {
  const item = message(), origin = scope(), request = conversationHandoff(item, origin);
  assert.ok(request); assert.ok(handoffMatches(request, origin.userId, origin.caseId));
  assert.equal(request.content, item.content); assert.equal(request.messageId, item.id);
  assert.equal(handoffMatches(request, 'other-owner', origin.caseId), false);
  assert.equal(handoffMatches(request, origin.userId, randomUUID()), false);
  assert.match(conversationSource(request), /^UNREVIEWED AI RESPONSE/);
  assert.match(conversationSource(request), new RegExp(item.id));
  assert.equal('fields' in request, false); assert.equal('confirmed' in request, false);
  assert.match(conversationDraft(item), /^DRAFT — UNREVIEWED CONVERSATION ANSWER/);
});
test('local, interrupted, streaming, empty, or oversized messages cannot enter the handoff', () => {
  for (const change of [{localOnly:true}, {streaming:true}, {state:'failed'}, {state:'interrupted'}, {content:' '}, {content:'x'.repeat(HANDOFF_LIMIT+1)}, {id:'arbitrary'}]) {
    assert.equal(reviewableMessage({...message(), ...change}), false);
    assert.equal(conversationHandoff({...message(), ...change}, scope()), null);
  }
  const user = conversationHandoff({...message(), role:'user'}, scope());
  assert.match(conversationSource(user), /^UNREVIEWED USER MESSAGE/);
});

test('only a known parsed pre-commit rejection is safe to retry', () => {
  assert.equal(caseWriteDefinitelyRejected({code:'CASE_CONFLICT',status:409}),true);
  assert.equal(caseWriteDefinitelyRejected({code:'CASE_INVALID',status:400}),true);
  for (const failure of [{code:'INVALID_RESPONSE',status:201},{code:'INVALID_RESPONSE',status:400},{code:'NETWORK_ERROR',status:0},{code:'CASE_INVALID',status:503},{code:'UNKNOWN_PROXY_FAILURE',status:408}]) assert.equal(caseWriteDefinitelyRejected(failure),false);
});
