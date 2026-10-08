// Real disposable SQLite databases and public synthetic fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../storage.js';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';

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
  const unicode = store.createClient(alice.id, { displayName:'Synthetic Élodie' });
  assert.deepEqual(store.listClients(alice.id,{search:'élodie'}).map(row=>row.id),[unicode.id]);
  assert.deepEqual(store.listClients(alice.id,{search:'E\u0301LODIE'}).map(row=>row.id),[unicode.id]);
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
  const frozen = JSON.parse(JSON.stringify(first));
  record = store.updateCase(alice.id,record.id,payload({title:'Later case title'}),record.version);
  assert.throws(() => store.createArtifact(alice.id,record.id,{kind:'followup',status:'draft',content:'Stale',expectedCaseVersion:1}),code('CASE_CONFLICT'));
  const second = store.createArtifact(alice.id,record.id,{kind:'followup',status:'draft',content:'Revised draft',expectedCaseVersion:record.version},{generationMethod:'reviewed-template'});
  assert.equal(second.version,2);assert.notEqual(second.id,first.id);
  assert.equal(second.provenance.generationMethod,'reviewed-template');
  const historical = store.getArtifact(alice.id,first.id);
  for (const key of ['id','caseId','kind','title','status','version','sourceCaseVersion','sourceConversationId','sourceMessageId','createdAt','content','provenance']) assert.deepEqual(historical[key],frozen[key]);
  assert.equal(historical.isStale,true);
  assert.equal(historical.currentCaseVersion,record.version);
  assert.equal(store.getArtifact(bob.id,first.id),null);
  assert.equal(store.getArtifact('owner',first.id),null);
  assert.equal(store.listArtifacts(bob.id,record.id),null);
  assert.equal(store.listClientArtifacts(bob.id,client.id),null);
  assert.deepEqual(new Set(store.listClientArtifacts(alice.id,client.id).map(x=>x.id)),new Set([first.id,second.id]));
  assert.ok(store.listArtifacts(alice.id,record.id).every(x=>!Object.hasOwn(x,'content')&&!Object.hasOwn(x,'provenance')));
  assert.throws(()=>store.createArtifact(alice.id,record.id,{kind:'followup',status:'draft',content:'x',expectedCaseVersion:record.version,generationMethod:'reviewed-template'}),code('ARTIFACT_INVALID'));
});

test('explicit document edits archive legacy draft atomically and never discard it on a failed update', t => {
  const { store, alice } = fixture(t);
  const fields = ['property','owner','pha','caseReference','rent'].map(key => ({ key,value:key==='property'?'128 Example Lane':'Synthetic '+key,source:'User fixture',confirmed:true,conflict:false }));
  const original = store.createCase(alice.id,payload({fields,draftText:'Legacy English working draft.'}));
  const editedFields = fields.map(field => ({...field,confirmed:false}));
  const invalidContext = { senderName:{value:'Synthetic sender',source:'Message fixture',confirmed:false,confirmedAt:null,sourceMessageId:randomUUID()} };
  assert.throws(()=>store.updateCase(alice.id,original.id,payload({fields:editedFields,draftText:original.draftText,documentContext:invalidContext}),1,{archiveLegacyDraft:true}));
  assert.equal(store.getCase(alice.id,original.id).draftText,original.draftText);
  assert.equal(store.getCase(alice.id,original.id).version,1);
  assert.deepEqual(store.listArtifacts(alice.id,original.id),[]);
  const revised=store.updateCase(alice.id,original.id,payload({fields:editedFields,draftText:original.draftText}),1,{archiveLegacyDraft:true});
  assert.equal(revised.draftText,'');assert.equal(revised.version,2);
  const [metadata]=store.listArtifacts(alice.id,original.id);
  const archived=store.getArtifact(alice.id,metadata.id);
  assert.equal(archived.status,'draft');assert.equal(archived.content,original.draftText);
  assert.equal(archived.sourceCaseVersion,1);assert.equal(archived.provenance.fields[0].confirmed,true);
});

test('a paid turn reserves its terminal row before provider work and other inserts cannot consume it', t => {
  const { store, alice }=fixture(t);
  const record=store.createCase(alice.id,payload());
  const conversation=store.createConversation(alice.id,record.id,{});
  for(let i=0;i<98;i++) store.appendMessage(alice.id,conversation.id,{role:'assistant',content:'Public standalone fixture '+i,state:'complete'});
  const requestId=randomUUID();
  store.appendMessage(alice.id,conversation.id,{role:'user',content:'Reserved question',state:'complete',requestId,clientMessageId:randomUUID()});
  assert.throws(()=>store.appendMessage(alice.id,conversation.id,{role:'assistant',content:'Unrelated insert',state:'complete'}),code('CAPACITY_REACHED'));
  assert.throws(()=>store.appendMessage(alice.id,conversation.id,{role:'user',content:'Another paid turn',state:'complete',requestId:randomUUID()}),code('CAPACITY_REACHED'));
  const terminal=store.appendMessage(alice.id,conversation.id,{role:'assistant',content:'Retained terminal content',state:'interrupted',requestId});
  assert.equal(terminal.state,'interrupted');assert.equal(store.listMessages(alice.id,conversation.id).length,100);
  assert.throws(()=>store.appendMessage(alice.id,conversation.id,{role:'assistant',content:'Duplicate terminal',state:'complete',requestId}),code('CHAT_TURN_EXISTS'));
});

test('the reserved answer byte budget survives restart and excludes unrelated writes', t => {
  const {store,alice,filename}=fixture(t);
  const record=store.createCase(alice.id,payload());
  const conversation=store.createConversation(alice.id,record.id,{});
  for(let i=0;i<85;i++) store.appendMessage(alice.id,conversation.id,{role:'assistant',content:'字'.repeat(64000),state:'complete'});
  const requestId=randomUUID();
  store.appendMessage(alice.id,conversation.id,{role:'user',content:'Question',state:'complete',requestId});
  store.close();
  const restarted=openStorage({filename});
  try {
    for(let i=0;i<3;i++) restarted.appendMessage(alice.id,conversation.id,{role:'assistant',content:'x'.repeat(64000),state:'complete'});
    assert.throws(()=>restarted.appendMessage(alice.id,conversation.id,{role:'assistant',content:'x'.repeat(64000),state:'complete'}),code('CAPACITY_REACHED'));
    assert.equal(restarted.appendMessage(alice.id,conversation.id,{role:'assistant',content:'字'.repeat(64000),state:'complete',requestId}).state,'complete');
  } finally {restarted.close();}
});

test('complete same-case provenance gates final artifacts; process restart restores history and scoped deletion removes children', t => {
  const {store,alice,bob,filename}=fixture(t);
  const client=store.createClient(alice.id,{displayName:'Synthetic persistent customer'});
  const fields=['property','owner','pha','caseReference','rent'].map(key=>({key,value:key==='property'?'128 Example Lane':'Synthetic '+key,source:'User-reviewed fixture',confirmed:true,conflict:false}));
  let record=store.createCase(alice.id,payload({fields,clientId:client.id}));
  const other=store.createCase(alice.id,payload()),foreign=store.createCase(bob.id,payload());
  const conversation=store.createConversation(alice.id,record.id,{}),otherConversation=store.createConversation(alice.id,other.id,{}),foreignConversation=store.createConversation(bob.id,foreign.id,{});
  const complete=store.appendMessage(alice.id,conversation.id,{role:'assistant',content:'Synthetic sender detail',state:'complete'});
  const partial=store.appendMessage(alice.id,conversation.id,{role:'assistant',content:'Partial text',state:'interrupted'});
  const otherMessage=store.appendMessage(alice.id,otherConversation.id,{role:'assistant',content:'Other-case text',state:'complete'});
  const foreignMessage=store.appendMessage(bob.id,foreignConversation.id,{role:'assistant',content:'Other-user text',state:'complete'});
  const detail=sourceMessageId=>({value:'Synthetic Sender',source:'Reviewed message fixture',confirmed:true,confirmedAt:'2026-01-01T00:00:00.000Z',sourceMessageId});
  for(const message of [otherMessage,foreignMessage]) assert.throws(()=>store.updateCase(alice.id,record.id,payload({fields,documentContext:{senderName:detail(message.id)}}),1),code('DOCUMENT_DETAILS_INVALID'));
  record=store.updateCase(alice.id,record.id,payload({fields,documentContext:{senderName:detail(complete.id)}}),1);
  const finalPayload={kind:'status-summary',status:'final',content:'Status summary for 128 Example Lane.',expectedCaseVersion:record.version};
  assert.throws(()=>store.createArtifact(alice.id,record.id,{...finalPayload,sourceMessageId:partial.id}),code('ARTIFACT_SOURCE_INCOMPLETE'));
  assert.throws(()=>store.createArtifact(alice.id,record.id,{...finalPayload,sourceMessageId:otherMessage.id}),code('ARTIFACT_INVALID'));
  const artifact=store.createArtifact(alice.id,record.id,{...finalPayload,sourceMessageId:complete.id});
  assert.equal(artifact.needsRegeneration,false);
  const physical=new DatabaseSync(filename);
  assert.throws(()=>physical.prepare('UPDATE artifacts SET content=? WHERE id=?').run('Forbidden replacement',artifact.id));
  physical.close();
  store.close();
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import {openStorage} from ${JSON.stringify(new URL('../storage.js',import.meta.url).href)};const [filename,userId,clientId,caseId,conversationId,artifactId]=process.argv.slice(1);const s=openStorage({filename});console.log(JSON.stringify({client:s.getClient(userId,clientId).displayName,caseId:s.getCase(userId,caseId).id,messages:s.listMessages(userId,conversationId).length,content:s.getArtifact(userId,artifactId).content}));s.close();`,filename,alice.id,client.id,record.id,conversation.id,artifact.id],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  assert.deepEqual(JSON.parse(child.stdout),{client:'Synthetic persistent customer',caseId:record.id,messages:2,content:artifact.content});
  const restarted=openStorage({filename});
  try {
    const pending={...detail(complete.id),confirmed:false,confirmedAt:null};
    record=restarted.updateCase(alice.id,record.id,payload({fields,documentContext:{senderName:pending}}),record.version);
    const oldFinal=restarted.getArtifact(alice.id,artifact.id);
    assert.equal(oldFinal.status,'final');assert.equal(oldFinal.isStale,true);assert.equal(oldFinal.needsRegeneration,true);assert.equal(oldFinal.content,artifact.content);
    assert.equal(restarted.deleteCase(bob.id,record.id,record.version),false);
    assert.equal(restarted.deleteCase(alice.id,record.id,record.version),true);
    assert.equal(restarted.getConversation(alice.id,conversation.id),null);
    assert.equal(restarted.getArtifact(alice.id,artifact.id),null);
    assert.deepEqual(restarted.listClientCases(alice.id,client.id),[]);
    assert.equal(restarted.getCase(bob.id,foreign.id).id,foreign.id);
  } finally {restarted.close();}
});

test('account conversation index labels only current linked drafts and bounded last message, never changes case associations', t => {
  const {store,alice,bob}=fixture(t);
  const first=store.createCase(alice.id,payload()),second=store.createCase(alice.id,payload({title:'Another topic'}));
  const a=store.createConversation(alice.id,first.id,{title:'Original conversation'}),b=store.createConversation(alice.id,second.id,{title:'Second conversation'});
  const privateCase=store.createCase(bob.id,payload());store.createConversation(bob.id,privateCase.id,{title:'Private'});
  const user=store.appendMessage(alice.id,a.id,{role:'user',content:'Question',state:'complete'});
  store.appendMessage(alice.id,a.id,{role:'assistant',content:'x'.repeat(500),state:'interrupted'});
  store.createArtifact(alice.id,first.id,{kind:'followup',title:'Draft',status:'draft',content:'Synthetic draft',expectedCaseVersion:1,sourceConversationId:a.id,sourceMessageId:user.id});
  let rows=store.listAccountConversations(alice.id);
  assert.equal(rows.length,2);let row=rows.find(row=>row.id===a.id);
  assert.deepEqual(row.lastMessage,{role:'assistant',state:'interrupted',preview:'x'.repeat(160)});assert.equal(row.draftCount,1);
  assert.equal(rows.find(row=>row.id===b.id).lastMessage,null);
  const replacement=store.createConversation(alice.id,first.id,{title:'Replacement draft conversation'});
  store.createArtifact(alice.id,first.id,{kind:'followup',title:'Replacement draft',status:'draft',content:'Synthetic replacement',expectedCaseVersion:1,sourceConversationId:replacement.id});
  row=store.listAccountConversations(alice.id).find(row=>row.id===a.id);assert.equal(row.draftCount,0);
  assert.equal(store.getConversation(alice.id,a.id).caseId,first.id);
  assert.equal(store.listAccountConversations(bob.id).length,1);
});

test('AI title update is owner-scoped and compare-and-set for the first saved complete answer',t=>{
  const {store,alice,bob}=fixture(t);
  const record=store.createCase(alice.id,payload());
  const conversation=store.createConversation(alice.id,record.id,{title:'New conversation'});
  assert.equal(store.setGeneratedConversationTitle(alice.id,conversation.id,'Generated topic',conversation.title,randomUUID()),null);
  const first=store.appendMessage(alice.id,conversation.id,{role:'assistant',content:'Meaningful answer',state:'complete',requestId:randomUUID()});
  assert.equal(store.setGeneratedConversationTitle(bob.id,conversation.id,'Foreign title',conversation.title,first.id),null);
  assert.equal(store.setGeneratedConversationTitle(alice.id,conversation.id,'Generated topic','stale title',first.id),null);
  const second=store.appendMessage(alice.id,conversation.id,{role:'assistant',content:'Second answer',state:'complete',requestId:randomUUID()});
  assert.equal(store.setGeneratedConversationTitle(alice.id,conversation.id,'Later topic',conversation.title,second.id),null);
  assert.equal(store.setGeneratedConversationTitle(alice.id,conversation.id,'Generated topic',conversation.title,first.id).id,conversation.id);
  assert.equal(store.setGeneratedConversationTitle(alice.id,conversation.id,'Duplicate topic',conversation.title,first.id),null);
  assert.equal(store.getConversation(alice.id,conversation.id).title,'Generated topic');
});
