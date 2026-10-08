// Genuine schema6 fixture upgraded once; no production database or restore operation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,readdirSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStorage} from '../storage.js';
import {ACCOUNT_ADMINISTRATION_SCHEMA_SQL} from '../account-administration-storage.js';
import {backupPrivateData,verifyPrivateBackup} from '../scripts/private-data-operations.js';
const snapshot=db=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,JSON.stringify(db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all())]));
const inspect=(filename,fn)=>{const db=new DatabaseSync(filename);try{return fn(db);}finally{db.close();}};
function fixture(t){
 const root=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-schema7-')),source=join(root,'source');mkdirSync(source,{mode:0o700});
 const filename=join(source,'db.sqlite'),assetsDirectory=join(source,'assets');mkdirSync(assetsDirectory,{mode:0o700});writeFileSync(filename,'',{mode:0o600});
 inspect(filename,db=>{db.exec(readFileSync(new URL('./fixtures/schema5.sql',import.meta.url),'utf8'));db.exec(ACCOUNT_ADMINISTRATION_SCHEMA_SQL);db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner','owner','owner',null,'2026-01-01T00:00:00.000Z');});
 t.after(()=>rmSync(root,{recursive:true,force:true}));return{root,filename,assetsDirectory};
}
test('schema6→7 preserves old rows and DDL, immutable audit, reopen, backup and verified receipt snapshot',async t=>{
 const f=fixture(t),before=inspect(f.filename,snapshot),ddl=inspect(f.filename,db=>db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all());
 const beforeBytes=readFileSync(f.filename);const oldBackup=await backupPrivateData({...f,output:join(f.root,'before')});assert.equal(oldBackup.schemaVersion,6);assert.deepEqual(readFileSync(f.filename),beforeBytes);
 let s=openStorage({filename:f.filename});
 inspect(f.filename,db=>{for(const[name,rows]of Object.entries(before))assert.equal(snapshot(db)[name],rows);for(const row of ddl)assert.deepEqual(db.prepare('SELECT type,name,sql FROM sqlite_master WHERE name=?').get(row.name),row);assert.equal(db.prepare('PRAGMA user_version').get().user_version,7);});
 const record=s.createCase('owner',{title:'Synthetic migration case',sourceText:'',fields:[],draftType:'followup',draftText:''}),c=s.createConversation('owner',record.id,{}),m=s.appendMessage('owner',c.id,{role:'assistant',content:'Synthetic evidence',state:'complete'});
 const request={clientRequestId:randomUUID(),locale:'en',conversationAction:{action:'prepare_case_suggestion',expectedVersion:1,sourceConversationId:c.id,sourceMessageId:m.id,factChanges:{rent:{value:'$2200'}},changes:{}}};
 const p=s.conversationReviews.prepare('owner',record.id,request),reply={conversationId:c.id,expectedVersion:1,clientMessageId:randomUUID(),answer:'confirm'};
 s.conversationReviews.reply('owner',record.id,p.intent.id,reply);s.close();s=openStorage({filename:f.filename});
 assert.equal(s.conversationReviews.reply('owner',record.id,p.intent.id,reply).replayed,true);s.close();
 const post=join(f.root,'after');assert.equal((await backupPrivateData({...f,output:post})).schemaVersion,7);assert.equal(verifyPrivateBackup({input:post}).schemaVersion,7);
 inspect(join(post,'nestlet.sqlite'),db=>{assert.equal(db.prepare('SELECT state FROM conversation_review_intents WHERE id=?').get(p.intent.id).state,'applied');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.throws(()=>db.prepare('UPDATE conversation_review_intents SET expected_version=99 WHERE id=?').run(p.intent.id),/immutable/);});
});
test('late migration failure rolls back schema7 DDL without touching schema6 rows',t=>{
 const f=fixture(t);inspect(f.filename,db=>db.exec('CREATE TABLE conversation_review_intents(sentinel TEXT);'));
 const before=inspect(f.filename,snapshot);assert.throws(()=>openStorage({filename:f.filename}),/already exists/);
 inspect(f.filename,db=>{assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);assert.deepEqual(snapshot(db),before);});
});
test('future schema8 refuses before persistent pragmas or files change',t=>{
 const f=fixture(t);inspect(f.filename,db=>db.exec('PRAGMA journal_mode=WAL; PRAGMA user_version=8;'));
 const bytes=readFileSync(f.filename),files=readdirSync(f.root);assert.throws(()=>openStorage({filename:f.filename}),error=>error.code==='STORAGE_VERSION_UNSUPPORTED');assert.deepEqual(readFileSync(f.filename),bytes);assert.deepEqual(readdirSync(f.root),files);
});
