// Genuine schema-2 fixtures: no runtime/schema mocks and no private production data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../storage.js';
import { serverTelemetryEvent } from '../telemetry.js';
const oldEvents = ['input.paste','input.file','input.mapping','review.confirm','draft.generate','draft.edit','export.copy','export.download','export.print','case.open','case.save','case.delete','request.pdf_parse','request.workbook_parse','request.extract','request.case_create','request.case_read','request.case_update','request.case_delete','request.case_list'];
const payload = {title:'Synthetic migration case',sourceText:'Synthetic migration source',fields:[],draftType:'followup',draftText:''};
function legacy(t) {
  const directory=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-schema2-'));
  const filename=join(directory,'legacy.sqlite');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  writeFileSync(filename,'',{mode:0o600});
  const db=new DatabaseSync(filename);
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY NOT NULL,username TEXT NOT NULL UNIQUE,role TEXT NOT NULL CHECK(role IN ('owner','trial')),password_hash TEXT,created_at TEXT NOT NULL,CHECK((role='owner' AND id='owner' AND username='owner' AND password_hash IS NULL) OR(role='trial' AND id!='owner' AND username!='owner' AND password_hash IS NOT NULL))) STRICT;
  CREATE TABLE cases(id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),version INTEGER NOT NULL CHECK(version>0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL) STRICT;
  CREATE INDEX cases_by_owner_updated ON cases(user_id,updated_at DESC,id);
  CREATE TABLE telemetry_workflows(id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),case_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL) STRICT;
  CREATE INDEX telemetry_workflows_owner_updated ON telemetry_workflows(user_id,updated_at,id);
  CREATE INDEX telemetry_workflows_case ON telemetry_workflows(case_id,user_id);
  CREATE TABLE telemetry_events(id INTEGER PRIMARY KEY AUTOINCREMENT,workflow_id TEXT NOT NULL REFERENCES telemetry_workflows(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),request_id TEXT,source TEXT NOT NULL CHECK(source IN ('server','client')),event_name TEXT NOT NULL CHECK(event_name IN (${oldEvents.map(x=>"'"+x+"'").join(',')})),outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),http_status INTEGER CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),error_code TEXT,server_elapsed_ms INTEGER CHECK(server_elapsed_ms IS NULL OR server_elapsed_ms BETWEEN 0 AND 300000),client_active_ms INTEGER CHECK(client_active_ms IS NULL OR client_active_ms BETWEEN 0 AND 86400000),client_wait_ms INTEGER CHECK(client_wait_ms IS NULL OR client_wait_ms BETWEEN 0 AND 300000),created_at TEXT NOT NULL) STRICT;
  CREATE INDEX telemetry_events_owner_id ON telemetry_events(user_id,id);
  CREATE INDEX telemetry_events_workflow_id ON telemetry_events(workflow_id,id);
  CREATE INDEX telemetry_events_created ON telemetry_events(created_at);
  CREATE UNIQUE INDEX telemetry_server_request_id ON telemetry_events(request_id) WHERE source='server';
  PRAGMA application_id=1314083916;PRAGMA user_version=2;`);
  const userId=randomUUID(),caseId=randomUUID(),workflowId=randomUUID(),now=new Date().toISOString();
  const salt=randomBytes(16),hash=`scrypt$${salt.toString('base64url')}$${scryptSync('public-migration-password',salt,32).toString('base64url')}`;
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner','owner','owner',null,now);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(userId,'schema-two-user','trial',hash,now);
  db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?)').run(caseId,userId,payload.title,JSON.stringify(payload),7,now,now);
  db.prepare('INSERT INTO telemetry_workflows VALUES(?,?,?,?,?)').run(workflowId,userId,caseId,now,now);
  const insert=db.prepare('INSERT INTO telemetry_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run(7,workflowId,userId,randomUUID(),'server','request.extract','failure',502,'PROVIDER_ERROR',17,null,null,now);
  insert.run(500,workflowId,userId,randomUUID(),'server','request.case_read','success',200,null,4,null,null,now);
  db.prepare('DELETE FROM telemetry_events WHERE id=500').run();
  const before={ users:JSON.stringify(db.prepare('SELECT * FROM users ORDER BY id').all()),cases:JSON.stringify(db.prepare('SELECT * FROM cases ORDER BY id').all()),workflows:JSON.stringify(db.prepare('SELECT * FROM telemetry_workflows ORDER BY id').all()),events:JSON.stringify(db.prepare('SELECT * FROM telemetry_events ORDER BY id').all()) };
  assert.equal(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='telemetry_events'").get().seq,500);
  db.close();
  return {filename,userId,caseId,workflowId,before};
}

test('schema2→current keeps every original row/column and event high-water while permitting the new fixed chat event',t=>{
  const f=legacy(t);const store=openStorage({filename:f.filename});
  try {
    const db=new DatabaseSync(f.filename,{readOnly:true});
    try {
      assert.equal(db.prepare('PRAGMA user_version').get().user_version,7);
      assert.equal(db.prepare('PRAGMA application_id').get().application_id,1314083916);
      assert.ok(JSON.stringify(db.prepare('SELECT * FROM users ORDER BY id').all())===f.before.users,'User columns changed');
      assert.ok(JSON.stringify(db.prepare('SELECT id,user_id,title,payload_json,version,created_at,updated_at FROM cases ORDER BY id').all())===f.before.cases,'Case columns changed');
      assert.ok(JSON.stringify(db.prepare('SELECT * FROM telemetry_workflows ORDER BY id').all())===f.before.workflows,'Workflow columns changed');
      assert.ok(JSON.stringify(db.prepare('SELECT * FROM telemetry_events ORDER BY id').all())===f.before.events,'Event columns changed');
      assert.equal(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='telemetry_events'").get().seq,500);
      assert.equal(db.prepare('SELECT client_id FROM cases').get().client_id,null);
    } finally {db.close();}
    assert.equal(store.getCase(f.userId,f.caseId).version,7);
    store.telemetryAppendEvents(f.userId,f.workflowId,[serverTelemetryEvent({event:'request.chat',requestId:randomUUID(),httpStatus:200,serverElapsedMs:1})]);
    const newest=store.telemetryReadEvents(f.userId,{workflowId:f.workflowId}).events[0];
    assert.equal(newest.id,501);assert.equal(newest.event,'request.chat');
  } finally {store.close();}
  const reopened=openStorage({filename:f.filename});
  try {assert.equal(reopened.getCase(f.userId,f.caseId).sourceText,payload.sourceText);assert.equal(reopened.listClients(f.userId).length,0);} finally {reopened.close();}
});

test('failed additive schema3 migration rolls back event rebuild and original sequence; future schema8 fails closed',t=>{
  const f=legacy(t);let db=new DatabaseSync(f.filename);
  db.exec('CREATE TABLE clients (sentinel TEXT NOT NULL);');db.prepare('INSERT INTO clients VALUES(?)').run('preserve-conflicting-table');db.close();
  assert.throws(()=>openStorage({filename:f.filename}));
  db=new DatabaseSync(f.filename);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
  assert.ok(JSON.stringify(db.prepare('SELECT * FROM telemetry_events ORDER BY id').all())===f.before.events);
  assert.equal(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='telemetry_events'").get().seq,500);
  assert.equal(db.prepare('SELECT sentinel FROM clients').get().sentinel,'preserve-conflicting-table');
  assert.ok(!db.prepare("SELECT sql FROM sqlite_master WHERE name='telemetry_events'").get().sql.includes('request.chat'));
  db.exec('PRAGMA user_version=8;');db.close();
  const before=readFileSync(f.filename);
  assert.throws(()=>openStorage({filename:f.filename}),error=>error.code==='STORAGE_VERSION_UNSUPPORTED');
  assert.deepEqual(readFileSync(f.filename),before);
});
