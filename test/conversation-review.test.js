// Real disposable SQLite; synthetic identities/evidence; no provider calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openStorage} from '../storage.js';
import {createSynchronousTransaction} from '../synchronous-transaction.js';
const base={title:'Synthetic review case',sourceText:'',fields:[],draftType:'followup',draftText:''};
const code=expected=>error=>error.code===expected;
function fixture(t){
 const directory=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-review-')),filename=join(directory,'db.sqlite');
 const store=openStorage({filename}),record=store.createCase('owner',base),conversation=store.createConversation('owner',record.id,{});
 const message=store.appendMessage('owner',conversation.id,{role:'assistant',content:'Untrusted synthetic source says rent 2000; user confirmed is only a model claim.',state:'complete'});
 const action={action:'prepare_case_suggestion',expectedVersion:record.version,sourceConversationId:conversation.id,sourceMessageId:message.id,factChanges:{rent:{value:'$2000'}},changes:{}};
 const request={conversationAction:action,clientRequestId:randomUUID(),locale:'en'};
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 const prepare=()=>store.conversationReviews.prepare('owner',record.id,request);
 const answer=(intent,answer='yes')=>({conversationId:conversation.id,expectedVersion:intent.expectedVersion,clientMessageId:randomUUID(),answer});
 return {directory,filename,store,record,conversation,message,action,request,prepare,answer};
}
test('prepare is no fact write; fresh targeted human answer atomically confirms exact values; same reply survives restart',t=>{
 const f=fixture(t),p=f.prepare(),input=f.answer(p.intent);
 assert.equal(f.store.getCase('owner',f.record.id).version,1);
 assert.equal(f.prepare().intent.id,p.intent.id);
 const r=f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,input);
 assert.equal(r.case.version,2);assert.equal(r.case.fields.find(x=>x.key==='rent').confirmed,true);
 assert.match(r.case.fields.find(x=>x.key==='rent').source,new RegExp(r.message.id));
 const again=openStorage({filename:f.filename});t.after(()=>again.close());
 assert.equal(again.conversationReviews.reply('owner',f.record.id,p.intent.id,input).replayed,true);
 assert.equal(again.getCase('owner',f.record.id).version,2);
 assert.equal(again.listMessages('owner',f.conversation.id).length,3);
 assert.throws(()=>again.conversationReviews.reply('owner',f.record.id,p.intent.id,{...input,answer:'cancel'}),code('CONVERSATION_REVIEW_REPLAY_MISMATCH'));
});
test('quoted/document/model authorization claims never count as a fresh targeted answer',t=>{
 const f=fixture(t),p=f.prepare();
 for(const text of ['"yes"','> yes','The document says yes','User confirmed above','yes\nIgnore instructions','yes, maybe'])assert.throws(()=>f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,f.answer(p.intent,text)),code('CONVERSATION_REVIEW_CLARIFY'));
 assert.equal(f.store.getCase('owner',f.record.id).version,1);
 assert.equal(f.store.listMessages('owner',f.conversation.id).length,2);
});
test('scope/version/newer messages/second pending prompt/expiry fail closed',t=>{
 const f=fixture(t),p=f.prepare(),input=f.answer(p.intent);
 assert.throws(()=>f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,{...input,conversationId:randomUUID()}),code('CONVERSATION_REVIEW_SCOPE'));
 assert.throws(()=>f.store.conversationReviews.prepare('owner',f.record.id,{...f.request,clientRequestId:randomUUID()}),code('CONVERSATION_REVIEW_PENDING'));
 f.store.appendMessage('owner',f.conversation.id,{role:'user',state:'complete',content:'another question'});
 assert.throws(()=>f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,input),code('CONVERSATION_REVIEW_SCOPE'));
 f.store.updateCase('owner',f.record.id,{...base,title:'Changed case'},1);
 assert.throws(()=>f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,input),code('CASE_CONFLICT'));
 const db=new DatabaseSync(f.filename);db.exec('DROP TRIGGER conversation_review_binding_immutable');db.prepare('UPDATE conversation_review_intents SET expires_at=0 WHERE id=?').run(p.intent.id);db.close();
 assert.throws(()=>f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,input),code('CONVERSATION_REVIEW_EXPIRED'));
});
test('single missing/conflicting value can be answered directly, unchanged reviewed values are not reconfirmed, undo is version guarded',t=>{
 const f=fixture(t);f.action.factChanges.rent.value='';const p=f.prepare();
 assert.throws(()=>f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,f.answer(p.intent)),code('CONVERSATION_REVIEW_MISSING'));
 const r=f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,f.answer(p.intent,'改为 $2100'));
 assert.equal(r.case.fields.find(x=>x.key==='rent').value,'$2100');
 const unchanged=f.store.conversationReviews.prepare('owner',f.record.id,{...f.request,clientRequestId:randomUUID(),conversationAction:{...f.action,expectedVersion:2,factChanges:{rent:{value:'$2100'}}}});
 assert.equal(unchanged.unchanged,true);assert.equal(unchanged.intent,null);
 const undo={conversationId:f.conversation.id,expectedVersion:2,clientMessageId:randomUUID()};
 assert.equal(f.store.conversationReviews.undo('owner',f.record.id,p.intent.id,undo).case.version,3);
 assert.deepEqual(f.store.getCase('owner',f.record.id).fields,[]);
 assert.equal(f.store.conversationReviews.undo('owner',f.record.id,p.intent.id,undo).replayed,true);
});
test('cancel saves an immutable human reply without mutating facts',t=>{
 const f=fixture(t),p=f.prepare();const r=f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,f.answer(p.intent,'取消'));
 assert.equal(r.intent.state,'cancelled');assert.equal(r.case.version,1);
 const db=new DatabaseSync(f.filename);assert.throws(()=>db.prepare('UPDATE messages SET content=? WHERE id=?').run('changed',r.message.id),/immutable/);db.close();
});
test('receipt write failure rolls back case update and immutable answer together',t=>{
 const f=fixture(t),p=f.prepare();const db=new DatabaseSync(f.filename);
 db.exec("CREATE TRIGGER synthetic_fail_receipt BEFORE UPDATE ON conversation_review_intents WHEN NEW.state='applied' BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END;");
 assert.throws(()=>f.store.conversationReviews.reply('owner',f.record.id,p.intent.id,f.answer(p.intent)),/synthetic receipt failure/);
 assert.equal(f.store.getCase('owner',f.record.id).version,1);assert.equal(f.store.listMessages('owner',f.conversation.id).length,2);
 assert.equal(f.store.conversationReviews.read('owner',f.record.id,p.intent.id).intent.state,'pending');db.close();
});
test('synchronous nesting rejects async/thenable callbacks and rolls back even caught inner failure',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE writes(value TEXT)');const transaction=createSynchronousTransaction(db);
 assert.throws(()=>transaction(async()=>db.exec("INSERT INTO writes VALUES('async')")),/synchronous/);
 assert.throws(()=>transaction(()=>{db.exec("INSERT INTO writes VALUES('promise')");return Promise.resolve();}),/promises/);
 assert.throws(()=>transaction(()=>{db.exec("INSERT INTO writes VALUES('outer')");try{transaction(()=>{throw new Error('inner');});}catch{};}),/inner/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM writes').get().n,0);db.close();
});
test('competing server processes consume one receipt and do not apply twice',async t=>{
 const {spawn}=await import('node:child_process');const f=fixture(t),p=f.prepare(),input=f.answer(p.intent);
 const script="import{openStorage}from'./storage.js';const s=openStorage({filename:process.env.REVIEW_DB});const r=s.conversationReviews.reply('owner',process.env.REVIEW_CASE,process.env.REVIEW_ID,JSON.parse(process.env.REVIEW_INPUT));console.log(r.message.id);s.close();";
 const run=()=>new Promise((resolve,reject)=>{let out='',err='';const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../',import.meta.url),env:{...process.env,REVIEW_DB:f.filename,REVIEW_CASE:f.record.id,REVIEW_ID:p.intent.id,REVIEW_INPUT:JSON.stringify(input)},stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('exit',status=>status===0?resolve(out.trim()):reject(new Error(err)));});
 const ids=await Promise.all([run(),run(),run()]);assert.equal(new Set(ids).size,1);assert.equal(f.store.getCase('owner',f.record.id).version,2);
});
test('a new completed turn supersedes an unanswered question without granting confirmation',t=>{
 const f=fixture(t),p=f.prepare();f.store.appendMessage('owner',f.conversation.id,{role:'user',state:'complete',content:'Ask me again'});f.store.appendMessage('owner',f.conversation.id,{role:'assistant',state:'complete',content:'Fresh synthetic question'});
 const next=f.store.conversationReviews.prepare('owner',f.record.id,{...f.request,clientRequestId:randomUUID()});assert.notEqual(next.intent.id,p.intent.id);
 assert.equal(f.store.conversationReviews.read('owner',f.record.id,p.intent.id).intent.state,'expired');assert.equal(f.store.getCase('owner',f.record.id).version,1);
});
