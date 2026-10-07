// Real disposable SQLite databases and public synthetic fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../storage.js';

const salt = randomBytes(16);
const passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync('public-storage-test', salt, 32).toString('base64url')}`;
const payload = (more = {}) => ({ title: 'Synthetic case', sourceText: 'Property: Synthetic example', fields: [], draftType: 'followup', draftText: '', ...more });
function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-library-'));
  const filename = join(directory, 'private', 'nestlet.sqlite');
  const store = openStorage({ filename });
  const alice = store.createTrialUser({ username: 'library-alice', passwordHash });
  const bob = store.createTrialUser({ username: 'library-bob', passwordHash });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, alice, bob, filename };
}
const code = expected => error => error.code === expected;

test('own customer search is literal, bounded and private; rename uses optimistic versions', t => {
  const { store, alice, bob } = fixture(t);
  const a = store.createClient(alice.id, { displayName: 'Johnny %_ Example' });
  store.createClient(bob.id, { displayName: 'Johnny %_ Secret' });
  assert.equal(a.version, 1);
  assert.equal(store.listClients(alice.id, { search: 'johnny', limit: 10 }).length, 1);
  assert.deepEqual(store.listClients(alice.id, { search: '%_', limit: 10 }).map(x => x.id), [a.id]);
  assert.equal(store.listClients(alice.id, { search: "' OR 1=1 --" }).length, 0);
  assert.equal(store.getClient(bob.id, a.id), null);
  assert.equal(store.getClient('owner', a.id), null);
  assert.equal(store.updateClient(bob.id, a.id, { displayName: 'Unchanged' }, 1), null);
  const renamed = store.updateClient(alice.id, a.id, { displayName: 'Johnny Revised' }, 1);
  assert.equal(renamed.version, 2);
  assert.throws(() => store.updateClient(alice.id, a.id, { displayName: 'Stale' }, 1), code('CLIENT_CONFLICT'));
  assert.throws(() => store.createClient(alice.id, { displayName: 'Name', userId: bob.id }), code('CLIENT_INVALID'));
});

test('case association, reviewed context and issues survive old-client updates and explicit clear stays versioned', t => {
  const { store, alice, bob } = fixture(t);
  const client = store.createClient(alice.id, { displayName: 'Synthetic customer' });
  const foreign = store.createClient(bob.id, { displayName: 'Another customer' });
  const documentContext = { recipientName: { value: 'Synthetic recipient', source: 'User supplied fixture', confirmed: false, confirmedAt: null } };
  const caseIssues = [{ id: randomUUID(), question: 'Who receives this document?', status: 'pending', resolution: '', updatedAt: '2026-01-01T00:00:00.000Z' }];
  assert.throws(() => store.createCase(alice.id, payload({ clientId: foreign.id })), code('CLIENT_NOT_FOUND'));
  const saved = store.createCase(alice.id, payload({ clientId: client.id, documentContext, caseIssues }));
  assert.equal(saved.clientId, client.id);
  assert.deepEqual(store.listClientCases(alice.id, client.id).map(record => record.id), [saved.id]);
  assert.equal(store.listClientCases(bob.id, client.id), null);
  const revised = store.updateCase(alice.id, saved.id, payload({ title: 'Old client changed title' }), saved.version);
  assert.equal(revised.clientId, client.id);
  assert.deepEqual(revised.documentContext, saved.documentContext);
  assert.deepEqual(revised.caseIssues, saved.caseIssues);
  assert.throws(() => store.updateCase(alice.id, saved.id, payload({ documentContext: null }), revised.version));
  const cleared = store.updateCase(alice.id, saved.id, payload({ clientId: null, documentContext: {}, caseIssues: [] }), revised.version);
  assert.equal(cleared.clientId, null);
  assert.deepEqual(cleared.documentContext, {});
  assert.deepEqual(cleared.caseIssues, []);
  assert.deepEqual(store.listClientCases(alice.id, client.id), []);
});

test('multiple conversations retain ordered genuine states and only image-presence metadata, with private idempotent turns', t => {
  const { store, alice, bob } = fixture(t);
  const saved = store.createCase(alice.id, payload());
  const first = store.createConversation(alice.id, saved.id, { title: 'Original discussion' });
  const second = store.createConversation(alice.id, saved.id, { title: 'Follow-up' });
  assert.equal(store.createConversation(bob.id, saved.id, {}), null);
  assert.equal(store.getConversation(bob.id, first.id), null);
  assert.equal(store.listMessages(bob.id, first.id), null);
  assert.deepEqual(new Set(store.listConversations(alice.id, saved.id).map(row => row.id)), new Set([first.id,second.id]));
  const requestId = randomUUID(), clientMessageId = randomUUID();
  const user = store.appendMessage(alice.id, first.id, { role: 'user', content: 'Synthetic question', state: 'complete', requestId, clientMessageId });
  const answer = store.appendMessage(alice.id, first.id, { role: 'assistant', content: 'Actual retained fixture text', state: 'interrupted', requestId });
  assert.deepEqual(store.listMessages(alice.id, first.id).map(row => [row.id,row.state]), [[user.id,'complete'],[answer.id,'interrupted']]);
  assert.throws(() => store.appendMessage(alice.id, second.id, { role: 'user', content: 'Duplicate', state: 'complete', clientMessageId }), code('CHAT_TURN_EXISTS'));
  const image = store.appendMessage(alice.id, second.id, { role: 'user', content: '', state: 'complete', imageMetadata: [{ mimeType: 'image/png', byteCount: 128, retained: false }] });
  assert.deepEqual(image.imageMetadata, [{ mimeType: 'image/png', byteCount: 128, retained: false }]);
  assert.throws(() => store.appendMessage(alice.id, second.id, { role: 'user', content: 'data:image/png;base64,AAAA', state: 'complete' }), code('MESSAGE_INVALID'));
  assert.throws(() => store.appendMessage(alice.id, second.id, { role: 'system', content: 'Cannot persist a system prompt', state: 'complete' }), code('MESSAGE_INVALID'));
  assert.throws(() => store.appendMessage(alice.id, second.id, { role: 'user', content: 'x', state: 'complete', imageMetadata: [{ mimeType:'image/png',byteCount:1,retained:false,data:'AAAA' }] }), code('MESSAGE_INVALID'));
  assert.equal(store.appendMessage(alice.id, second.id, { role: 'assistant', content: '', state: 'failed' }).state, 'failed');
});

test('artifact saves append immutable per-kind versions and case snapshots without crossing users', t => {
  const { store, alice, bob } = fixture(t);
  const client = store.createClient(alice.id, { displayName: 'Synthetic artifact customer' });
  let record = store.createCase(alice.id, payload({ clientId: client.id }));
  const conversation = store.createConversation(alice.id, record.id, {});
  const partial = store.appendMessage(alice.id, conversation.id, { role:'assistant',content:'Retained partial draft',state:'interrupted' });
  const first = store.createArtifact(alice.id, record.id, { kind:'followup',status:'draft',content:'Working draft with [to be confirmed].',sourceMessageId:partial.id,expectedCaseVersion:record.version });
  assert.equal(first.version,1);
  assert.equal(first.sourceConversationId,conversation.id);
  assert.equal(first.provenance.generationMethod,'user-edited');
  assert.equal(first.provenance.clientDisplayName,'Synthetic artifact customer');
  const frozen = JSON.stringify(first);
  record = store.updateCase(alice.id,record.id,payload({title:'Later case title'}),record.version);
  assert.throws(() => store.createArtifact(alice.id,record.id,{kind:'followup',status:'draft',content:'Stale',expectedCaseVersion:1}),code('CASE_CONFLICT'));
  const second = store.createArtifact(alice.id,record.id,{kind:'followup',status:'draft',content:'Revised draft',expectedCaseVersion:record.version},{generationMethod:'reviewed-template'});
  assert.equal(second.version,2);assert.notEqual(second.id,first.id);
  assert.equal(second.provenance.generationMethod,'reviewed-template');
  assert.equal(JSON.stringify(store.getArtifact(alice.id,first.id)),frozen);
  assert.equal(store.getArtifact(bob.id,first.id),null);
  assert.equal(store.getArtifact('owner',first.id),null);
  assert.equal(store.listArtifacts(bob.id,record.id),null);
  assert.equal(store.listClientArtifacts(bob.id,client.id),null);
  assert.deepEqual(new Set(store.listClientArtifacts(alice.id,client.id).map(x=>x.id)),new Set([first.id,second.id]));
  assert.ok(store.listArtifacts(alice.id,record.id).every(x=>!Object.hasOwn(x,'content')&&!Object.hasOwn(x,'provenance')));
  assert.throws(()=>store.createArtifact(alice.id,record.id,{kind:'followup',status:'draft',content:'x',expectedCaseVersion:record.version,generationMethod:'reviewed-template'}),code('ARTIFACT_INVALID'));
});
