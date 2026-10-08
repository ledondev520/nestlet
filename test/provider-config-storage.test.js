// All keys below are disposable synthetic bytes, never production credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, copyFileSync, symlinkSync, linkSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openProviderConfig } from '../provider-config-storage.js';
const config = { apiKey:'synthetic-provider-secret-value',enabled:true,model:'deepseek-flash',verifiedAt:'2026-10-08T23:00:00.000Z' };
function fixture(t) {
  const directory=mkdtempSync(join(tmpdir(),'nestlet-provider-config-'));
  const secrets=join(directory,'secrets');mkdirSync(secrets,{mode:0o700});
  const keyFile=join(secrets,'wrapping.key');writeFileSync(keyFile,randomBytes(32),{mode:0o600});
  const filename=join(directory,'private','provider-config.sqlite');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  return {directory,keyFile,filename,open:()=>openProviderConfig({filename,wrappingKeyFile:keyFile})};
}
test('encrypted settings survive close/restart and explicit ciphertext-only backup/restore',t=>{
 const f=fixture(t);let store=f.open();assert.equal(store.load(),null);store.save(config);assert.deepEqual(store.load(),config);const db=new DatabaseSync(f.filename);const nonce1=Buffer.from(db.prepare('SELECT nonce FROM provider_config').get().nonce);store.save(config);const nonce2=Buffer.from(db.prepare('SELECT nonce FROM provider_config').get().nonce);assert.notDeepEqual(nonce1,nonce2);db.close();store.close();
 assert.equal(statSync(f.filename).mode&0o777,0o600);assert.equal(statSync(join(f.directory,'private')).mode&0o777,0o700);
 const bytes=readFileSync(f.filename);assert.equal(bytes.includes(Buffer.from(config.apiKey)),false);assert.equal(bytes.includes(readFileSync(f.keyFile)),false);
 store=f.open();assert.deepEqual(store.load(),config);store.save({...config,enabled:false});store.close();
 const backup=join(f.directory,'provider-encrypted-backup.sqlite');copyFileSync(f.filename,backup);
 store=f.open();store.save({...config,apiKey:'synthetic-new-provider-value'});store.close();
 copyFileSync(backup,f.filename);store=f.open();assert.deepEqual(store.load(),{...config,enabled:false});store.close();
});
test('invalid candidate and database write failure preserve the last committed settings',t=>{
 const f=fixture(t),store=f.open();store.save(config);
 assert.throws(()=>store.save({...config,apiKey:'bad'}),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});
 const db=new DatabaseSync(f.filename);db.exec("CREATE TRIGGER fail_save BEFORE INSERT ON provider_config BEGIN SELECT RAISE(ABORT,'SYNTHETIC_DB_FAILURE'); END;");db.close();
 assert.throws(()=>store.save({...config,apiKey:'synthetic-replacement-value'}),error=>error.code==='PROVIDER_SETTINGS_UNAVAILABLE'&&!error.message.includes('SYNTHETIC'));
 assert.deepEqual(store.load(),config);store.close();const reopened=f.open();assert.deepEqual(reopened.load(),config);reopened.close();
});
test('missing wrapping key, wrong key, tampering and unsupported databases fail closed',t=>{
 const f=fixture(t);assert.equal(openProviderConfig({filename:f.filename}).available,false);
 let store=f.open();store.save(config);store.close();
 assert.throws(()=>openProviderConfig({filename:f.filename}),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});
 const original=readFileSync(f.keyFile);writeFileSync(f.keyFile,randomBytes(32));assert.throws(f.open,{code:'PROVIDER_SETTINGS_UNAVAILABLE'});writeFileSync(f.keyFile,original);
 const db=new DatabaseSync(f.filename);db.exec('UPDATE provider_config SET revision=revision+1');db.close();assert.throws(f.open,{code:'PROVIDER_SETTINGS_UNAVAILABLE'});
});
test('wrapping secret must be private, owned, outside data, non-symlink and single-link',t=>{
 const f=fixture(t);chmodSync(f.keyFile,0o644);assert.throws(f.open,{code:'PROVIDER_SETTINGS_UNAVAILABLE'});chmodSync(f.keyFile,0o600);
 const symlink=join(f.directory,'symlink.key');symlinkSync(f.keyFile,symlink);assert.throws(()=>openProviderConfig({filename:f.filename,wrappingKeyFile:symlink}),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});
 const hardlink=join(f.directory,'linked.key');linkSync(f.keyFile,hardlink);assert.throws(f.open,{code:'PROVIDER_SETTINGS_UNAVAILABLE'});rmSync(hardlink);
 mkdirSync(join(f.directory,'private'),{mode:0o700});const inside=join(f.directory,'private','inside.key');writeFileSync(inside,randomBytes(32),{mode:0o600});assert.throws(()=>openProviderConfig({filename:f.filename,wrappingKeyFile:inside}),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});
});
test('foreign SQLite identity and stale writers cannot replace saved data',t=>{
 const f=fixture(t);const first=f.open(),second=f.open();first.save(config);assert.throws(()=>second.save({...config,apiKey:'synthetic-stale-writer'}),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});second.close();first.close();
 const before=readFileSync(f.filename);const db=new DatabaseSync(f.filename);db.exec('PRAGMA application_id=123');db.close();const foreign=readFileSync(f.filename);
 assert.throws(f.open,{code:'PROVIDER_SETTINGS_UNAVAILABLE'});assert.deepEqual(readFileSync(f.filename),foreign);assert.notDeepEqual(before,foreign);
});

test('wrapping key cannot live in separate case or asset data directories even with a custom provider path',t=>{
 const f=fixture(t);
 assert.throws(()=>openProviderConfig({filename:f.filename,wrappingKeyFile:f.keyFile,excludedDirectories:[join(f.directory,'secrets')]}),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});
});

test('unused bootstrap stays file-free and existing truncated or missing-row stores are never reinitialized',t=>{
 const f=fixture(t);let store=f.open();assert.equal(store.load(),null);store.close();assert.equal(existsSync(f.filename),false);
 store=f.open();assert.equal(store.load(),null);store.save(config);store.close();
 const backup=readFileSync(f.filename);writeFileSync(f.filename,Buffer.alloc(0));assert.throws(f.open,{code:'PROVIDER_SETTINGS_UNAVAILABLE'});assert.equal(readFileSync(f.filename).length,0);
 writeFileSync(f.filename,backup);const db=new DatabaseSync(f.filename);db.exec('DELETE FROM provider_config');db.close();const before=readFileSync(f.filename);assert.throws(f.open,{code:'PROVIDER_SETTINGS_UNAVAILABLE'});assert.deepEqual(readFileSync(f.filename),before);
});

test('first-write transaction failure never leaves an activatable credential or auto-repairs its file',t=>{
 const f=fixture(t),store=f.open(),original=DatabaseSync.prototype.prepare;
 const fault=t.mock.method(DatabaseSync.prototype,'prepare',function(sql,...args){if(sql.startsWith('INSERT INTO provider_config'))throw Error('SYNTHETIC_FIRST_WRITE_FAILURE');return original.call(this,sql,...args);});
 assert.throws(()=>store.save(config),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});fault.mock.restore();
 assert.throws(()=>store.load(),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});store.close();
 assert.equal(readFileSync(f.filename).includes(Buffer.from(config.apiKey)),false);
 const before=readFileSync(f.filename);assert.throws(f.open,{code:'PROVIDER_SETTINGS_UNAVAILABLE'});assert.deepEqual(readFileSync(f.filename),before);
});

test('a changed or newly exposed wrapping file blocks writes without changing the previous credential',t=>{
 const f=fixture(t),store=f.open();store.save(config);const original=readFileSync(f.keyFile);
 writeFileSync(f.keyFile,randomBytes(32));assert.throws(()=>store.save({...config,apiKey:'synthetic-rotated-attempt'}),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});assert.deepEqual(store.load(),config);
 writeFileSync(f.keyFile,original);chmodSync(f.keyFile,0o644);assert.throws(()=>store.save({...config,enabled:false}),{code:'PROVIDER_SETTINGS_UNAVAILABLE'});chmodSync(f.keyFile,0o600);store.close();
 const reopened=f.open();assert.deepEqual(reopened.load(),config);reopened.close();
});
