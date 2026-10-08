// Real historical schema5 SQL fixture; no mislabeled downgrade of the current schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { openStorage } from '../storage.js';
const now = new Date().toISOString(), instant = Date.parse(now), salt = randomBytes(16);
const passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-schema6-password',salt,32).toString('base64url')}`;
const inspect = (filename, fn) => { const db=new DatabaseSync(filename,{enableForeignKeyConstraints:true});try{return fn(db);}finally{db.close();} };
const schema = db => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
function snapshot(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name);
  return { schema:schema(db), rows:Object.fromEntries(tables.map(name=>[name,JSON.stringify(db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all())])), foreignKeys:Object.fromEntries(tables.map(name=>[name,db.prepare(`PRAGMA foreign_key_list(${name})`).all()])) };
}
function fixture(t) {
  const directory=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-schema6-')),filename=join(directory,'records.sqlite');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  writeFileSync(filename,'',{mode:0o600});
  const db=new DatabaseSync(filename,{enableForeignKeyConstraints:true});
  db.exec(readFileSync(new URL('./fixtures/schema5.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner','owner','owner',null,now);
  const id=randomUUID(),client=randomUUID(),record=randomUUID(),conversation=randomUUID(),message=randomUUID(),artifact=randomUUID(),workflow=randomUUID(),asset=randomUUID();
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,'synthetic-schema6-user','trial',passwordHash,now);
  db.prepare('INSERT INTO clients VALUES(?,?,?,?,?,?)').run(client,id,'Synthetic customer',3,now,now);
  db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?,?)').run(record,id,'Synthetic case',JSON.stringify({title:'Synthetic case',sourceText:'Synthetic retained text',fields:[],draftType:'followup',draftText:''}),7,now,now,client);
  db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run(conversation,id,record,'Synthetic conversation',now,now);
  db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(message,id,conversation,1,'user','Synthetic message','complete',null,randomUUID(),'[]',now);
  db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(artifact,id,record,'followup','Synthetic artifact','draft','Synthetic artifact contents',2,7,conversation,message,'{}',now);
  db.prepare('INSERT INTO telemetry_workflows VALUES(?,?,?,?,?)').run(workflow,id,record,now,now);
  db.prepare('INSERT INTO telemetry_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(8,workflow,id,randomUUID(),'server','request.chat','success',200,null,3,null,null,now);
  db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(asset,id,record,client,'synthetic.txt','text/plain',14,'a'.repeat(64),'Synthetic text','synthetic text','ready',0,'text','[]',2,now,now);
  db.prepare('INSERT INTO email_identities VALUES(?,?,?)').run(id,'synthetic-migration@example.test',instant);
  db.prepare('INSERT INTO email_actions VALUES(?,?,?,?,?,?,?,?,?)').run('b'.repeat(64),'reset','synthetic-migration@example.test',id,null,'c'.repeat(64),1,instant,instant+3600000);
  db.prepare('INSERT INTO email_rate_buckets VALUES(?,?,?)').run('d'.repeat(64),3,instant+3600000);
  db.exec("UPDATE sqlite_sequence SET seq=777 WHERE name='telemetry_events';");
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);
  const before=snapshot(db);db.close();return {directory,filename,before,id,record};
}
function preserved(db,before) {
  for(const [name,rows] of Object.entries(before.rows)) assert.equal(JSON.stringify(db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()),rows,name+' rows');
  for(const old of before.schema) assert.deepEqual(schema(db).find(item=>item.name===old.name&&item.type===old.type),old,old.name+' schema');
  for(const [name,keys] of Object.entries(before.foreignKeys)) assert.deepEqual(db.prepare(`PRAGMA foreign_key_list(${name})`).all(),keys,name+' foreign keys');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
}
test('genuine populated schema5→6 preserves every identity, email action, data row, DDL, foreign key and sequence through reopen',t=>{
  const f=fixture(t);
  for(let i=0;i<2;i++) {
    const store=openStorage({filename:f.filename});
    assert.equal(store.getCase(f.id,f.record).version,7);
    assert.equal(store.getUserById(f.id).passwordHash,passwordHash);
    assert.equal(store.getUserById('owner').passwordHash,null);
    assert.equal(store.accountAdministration.administrator(f.id),false);
    assert.equal(store.accountAdministration.listAccounts({userId:'owner',role:'owner'}).accounts.find(row=>row.id===f.id).email,'synthetic-migration@example.test');
    store.close();
    inspect(f.filename,db=>{preserved(db,f.before);assert.equal(db.prepare('PRAGMA user_version').get().user_version,9);for(const name of ['user_capabilities','account_capability_audit'])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n,0);});
  }
});
test('late schema6 migration failure rolls back all capability DDL and version while preserving schema5 data',t=>{
  const f=fixture(t);
  inspect(f.filename,db=>db.exec('CREATE TABLE account_capability_audit(sentinel TEXT) STRICT; INSERT INTO account_capability_audit VALUES(\'synthetic untouched sentinel\');'));
  const before=inspect(f.filename,snapshot);
  assert.throws(()=>openStorage({filename:f.filename}),/account_capability_audit/);
  inspect(f.filename,db=>{assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);preserved(db,before);assert.deepEqual(schema(db),before.schema);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='user_capabilities'").get().n,0);});
});
test('future schema10 fails closed with unchanged bytes, file set, DDL and WAL mode',t=>{
  const f=fixture(t);inspect(f.filename,db=>db.exec('PRAGMA journal_mode=WAL; PRAGMA user_version=10;'));
  const bytes=readFileSync(f.filename),files=readdirSync(f.directory).sort();
  assert.throws(()=>openStorage({filename:f.filename}),error=>error.code==='STORAGE_VERSION_UNSUPPORTED');
  assert.deepEqual(readFileSync(f.filename),bytes);assert.deepEqual(readdirSync(f.directory).sort(),files);
  inspect(f.filename,db=>{assert.equal(db.prepare('PRAGMA user_version').get().user_version,10);assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');preserved(db,f.before);assert.deepEqual(schema(db),f.before.schema);});
});

test('two actual startup processes serialize schema5→6 and leave one additive migration with no automatic grants',async t=>{
  const {spawn}=await import('node:child_process');
  const f=fixture(t);
  const run=()=>new Promise((resolve,reject)=>{
    const script="import {openStorage} from './storage.js'; const store=openStorage({filename:process.argv[1]}); store.close();";
    const child=spawn(process.execPath,['--input-type=module','-e',script,f.filename],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});
    let error='';child.stderr.on('data',data=>error+=data);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Synthetic concurrent migration failed: '+error)));
  });
  await Promise.all([run(),run()]);
  inspect(f.filename,db=>{assert.equal(db.prepare('PRAGMA user_version').get().user_version,9);preserved(db,f.before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_capabilities').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM account_capability_audit').get().n,0);});
});
