// Real backup/restore of historical schema5 and capability-enabled schema6, including original bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { openStorage } from '../storage.js';
import { openAssetVault, parseAsset } from '../private-assets.js';
import { digest } from '../email-auth-domain.js';
import { backupPrivateData, verifyPrivateBackup, restorePrivateBackup } from '../scripts/private-data-operations.js';
const owner={userId:'owner',role:'owner'},now=new Date().toISOString(),instant=Date.parse(now),salt=randomBytes(16);
const passwordHash=`scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-backup-admin-password',salt,32).toString('base64url')}`;
const inspect=(filename,fn)=>{const db=new DatabaseSync(filename);try{return fn(db);}finally{db.close();}};
function fixture(t) {
  const root=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-schema6-backup-')),source=join(root,'source');mkdirSync(source,{mode:0o700});
  const filename=join(source,'records.sqlite'),assetsDirectory=join(source,'assets');writeFileSync(filename,'',{mode:0o600});mkdirSync(assetsDirectory,{mode:0o700});
  const id=randomUUID(),record=randomUUID();
  inspect(filename,db=>{
    db.exec(readFileSync(new URL('./fixtures/schema5.sql',import.meta.url),'utf8'));
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner','owner','owner',null,now);
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,'synthetic-backup-admin','trial',passwordHash,now);
    db.prepare('INSERT INTO email_identities VALUES(?,?,?)').run(id,'synthetic-backup-admin@example.test',instant);
    db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?,?)').run(record,id,'Synthetic preserved case',JSON.stringify({title:'Synthetic preserved case',sourceText:'Synthetic text',fields:[],draftType:'followup',draftText:''}),3,now,now,null);
    db.prepare('INSERT INTO email_actions VALUES(?,?,?,?,?,?,?,?,?)').run('e'.repeat(64),'reset','synthetic-backup-admin@example.test',id,null,digest(passwordHash),1,instant,instant+3600000);
    db.prepare('INSERT INTO email_rate_buckets VALUES(?,?,?)').run('f'.repeat(64),4,instant+3600000);
  });
  t.after(()=>rmSync(root,{recursive:true,force:true}));return {root,source,filename,assetsDirectory,id,record};
}

test('pre-upgrade schema5 snapshot stays unchanged; drill migrates to6; capability, audit, email identities/actions and originals survive6 backup/restore',async t=>{
  const f=fixture(t),originalBytes=readFileSync(f.filename),pre=join(f.root,'schema5-snapshot');
  assert.equal((await backupPrivateData({...f,output:pre})).schemaVersion,5);
  const snapshotBytes=readFileSync(join(pre,'nestlet.sqlite'));
  assert.deepEqual(readFileSync(f.filename),originalBytes);
  const drill=await restorePrivateBackup({input:pre,output:join(f.root,'upgrade-drill')});
  assert.equal(drill.schemaVersion,5);
  const store=openStorage({filename:drill.filename});
  assert.equal(store.getUserById(f.id).passwordHash,passwordHash);
  assert.equal(store.getCase(f.id,f.record).version,3);
  store.accountAdministration.setAdministrator(owner,f.id,{administrator:true,expectedVersion:0});
  store.accountAdministration.setAdministrator(owner,f.id,{administrator:false,expectedVersion:1});
  store.accountAdministration.setAdministrator(owner,f.id,{administrator:true,expectedVersion:2});
  const expectedAudit=store.accountAdministration.audit(owner);
  const vault=openAssetVault({directory:drill.assetsDirectory}),bytes=Buffer.from('Synthetic immutable administrator original');
  const metadata=await parseAsset(bytes,{originalFilename:'synthetic-admin.txt',mimeType:'text/plain'});
  const asset=store.createAsset(f.id,metadata,{caseId:f.record},id=>vault.write(id,bytes));
  store.close();
  const post=join(f.root,'schema6-snapshot');
  assert.equal((await backupPrivateData({filename:drill.filename,assetsDirectory:drill.assetsDirectory,output:post})).schemaVersion,9);
  assert.equal(verifyPrivateBackup({input:post}).schemaVersion,9);
  const recovered=await restorePrivateBackup({input:post,output:join(f.root,'schema6-restored')}),again=openStorage({filename:recovered.filename});
  try {
    assert.equal(again.accountAdministration.administrator(f.id),true);
    assert.deepEqual(again.accountAdministration.audit(owner),expectedAudit);
    assert.equal(again.accountAdministration.listAccounts(owner).accounts.find(row=>row.id===f.id).capabilityVersion,3);
    assert.equal(again.getUserById(f.id).id,f.id);assert.equal(again.getUserById(f.id).passwordHash,passwordHash);assert.equal(again.getUserById('owner').passwordHash,null);
    assert.equal(again.emailAuth.findByEmail('synthetic-backup-admin@example.test').id,f.id);
    assert.equal(again.emailAuth.getAction('e'.repeat(64)).ready,1);
    assert.equal(again.getCase(f.id,f.record).sourceText,'Synthetic text');
    assert.equal(again.getAsset('owner',asset.id),null);
    assert.deepEqual(openAssetVault({directory:recovered.assetsDirectory}).read(again.getAsset(f.id,asset.id)),bytes);
  } finally {again.close();}
  inspect(recovered.filename,db=>{assert.equal(db.prepare('SELECT count FROM email_rate_buckets WHERE bucket_hash=?').get('f'.repeat(64)).count,4);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');});
  assert.deepEqual(readFileSync(join(pre,'nestlet.sqlite')),snapshotBytes);assert.deepEqual(readFileSync(f.filename),originalBytes);
  assert.equal(verifyPrivateBackup({input:pre}).schemaVersion,5);
  assert.equal(inspect(f.filename,db=>db.prepare('PRAGMA user_version').get().user_version),5);
});

test('future schema10 backup refuses without snapshot/source mutation; restore rejects future manifest before creating destination',async t=>{
  const f=fixture(t),snapshot=join(f.root,'supported-snapshot');await backupPrivateData({...f,output:snapshot});
  inspect(f.filename,db=>db.exec('PRAGMA user_version=10;'));
  const before=readFileSync(f.filename),files=readdirSync(f.source).sort();
  await assert.rejects(backupPrivateData({...f,output:join(f.root,'future-snapshot')}),/schema1–9/);
  assert.deepEqual(readFileSync(f.filename),before);assert.deepEqual(readdirSync(f.source).sort(),files);assert.equal(readdirSync(f.root).includes('future-snapshot'),false);
  const manifestPath=join(snapshot,'manifest.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));manifest.schemaVersion=10;writeFileSync(manifestPath,JSON.stringify(manifest));
  assert.throws(()=>verifyPrivateBackup({input:snapshot}),/manifest/);
  await assert.rejects(restorePrivateBackup({input:snapshot,output:join(f.root,'future-restored')}),/manifest/);
  assert.equal(readdirSync(f.root).includes('future-restored'),false);
});
