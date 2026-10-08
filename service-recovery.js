import { DatabaseSync } from 'node:sqlite';
/** Private restore fence. Source/backup files are never modified by this module. */
import {constants,openSync,closeSync,fstatSync,readSync,writeSync,fsyncSync,unlinkSync,lstatSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,join} from 'node:path';
import {pauseRecoveredServices} from './service-entitlement-storage.js';
const suffix='.service-reconfirm.json';
const fail=()=>{throw Object.assign(new Error('Private restore service reconfirmation requires operator review'),{code:'SERVICE_RECOVERY_INVALID'});};
function privateRead(path,max=Infinity) {
 let fd;try{fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const info=fstatSync(fd);if(info.nlink===0&&max===512)throw Object.assign(new Error('Fence consumed'),{code:'ENOENT'});if(!info.isFile()||info.nlink!==1||(info.mode&0o777)!==0o600||info.uid!==(process.geteuid?.()??process.getuid?.())||info.size>max)fail();const bytes=Buffer.alloc(info.size);let at=0;while(at<bytes.length){const n=readSync(fd,bytes,at,bytes.length-at,null);if(!n)fail();at+=n;}return bytes;}finally{if(fd!==undefined)closeSync(fd);}
}
function digestFile(filename) {
 const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try {
  const info=fstatSync(fd);if(!info.isFile()||info.nlink!==1||(info.mode&0o777)!==0o600||info.uid!==(process.geteuid?.()??process.getuid?.()))fail();
  const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let n;
  while((n=readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));return hash.digest('hex');
 } finally {closeSync(fd);}
}
function syncDirectory(filename) {const fd=openSync(dirname(filename),constants.O_RDONLY|constants.O_DIRECTORY);try{fsyncSync(fd);}finally{closeSync(fd);}}
export function readServiceRecoveryFence(filename) {
 let bytes;try{bytes=privateRead(filename+suffix,512);}catch(error){if(error.code==='ENOENT')return null;throw error;}
 let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{fail();}
 if(!value||Object.keys(value).sort().join(',')!=='databaseSha256,kind,recoveryId,sourceSchema,version'||value.kind!=='nestlet-service-reconfirmation'||value.version!==1||!Number.isInteger(value.sourceSchema)||value.sourceSchema<1||value.sourceSchema>9||!/^[0-9a-f]{64}$/u.test(value.databaseSha256)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.recoveryId))fail();
 return value;
}
export function writeServiceRecoveryFence(filename,sourceSchema) {
 if(!Number.isInteger(sourceSchema)||sourceSchema<1||sourceSchema>9)fail();
 const value={kind:'nestlet-service-reconfirmation',version:1,sourceSchema,recoveryId:randomUUID(),databaseSha256:digestFile(filename)};
 const bytes=Buffer.from(JSON.stringify(value)+'\n'),fd=openSync(filename+suffix,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
 try{let at=0;while(at<bytes.length)at+=writeSync(fd,bytes,at,bytes.length-at);fsyncSync(fd);}finally{closeSync(fd);}
 syncDirectory(filename);
 return value;
}
function receipt(db,fence) {
 const row=db.prepare('SELECT source_schema AS sourceSchema,source_sha256 AS databaseSha256 FROM service_recovery_receipts WHERE recovery_id=?').get(fence.recoveryId);
 if(row&&(row.sourceSchema!==fence.sourceSchema||row.databaseSha256!==fence.databaseSha256))fail();
 return row;
}
export function verifyServiceRecoveryFence(db,filename,fence) {
 if(!fence)return;
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version===10&&receipt(db,fence))return;
 if(version!==fence.sourceSchema||digestFile(filename)!==fence.databaseSha256)fail();
}
export function applyServiceRecoveryFence(db,fence) {
 if(!fence||receipt(db,fence))return;
 pauseRecoveredServices(db);
 db.prepare('INSERT INTO service_recovery_receipts VALUES(?,?,?,?)').run(fence.recoveryId,fence.sourceSchema,fence.databaseSha256,new Date().toISOString());
}
export function consumeServiceRecoveryFence(filename,fence) {
 if(!fence)return;
 const latest=readServiceRecoveryFence(filename);
 if(!latest)return; // Another successfully committed startup may have consumed this exact fence.
 if(JSON.stringify(latest)!==JSON.stringify(fence))fail();
 const info=lstatSync(filename+suffix);if(!info.isFile()||info.isSymbolicLink())fail();
 try{unlinkSync(filename+suffix);syncDirectory(filename);}catch(error){if(error.code!=='ENOENT')throw error;}
}


// Restore output is standalone DELETE-mode SQLite. Refuse sidecars rather than
// opening a hot/WAL recovery file and implicitly repairing it before verification.
export function preflightServiceRecoveryFence(filename,fence) {
 if(!fence)return;
 for(const suffix of ['-wal','-shm','-journal'])try{lstatSync(filename+suffix);fail();}catch(error){if(error.code!=='ENOENT')throw error;}
 const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK),header=Buffer.alloc(100);
 try{const info=fstatSync(fd);if(!info.isFile()||info.nlink!==1||(info.mode&0o777)!==0o600||info.uid!==(process.geteuid?.()??process.getuid?.())||readSync(fd,header,0,100,0)!==100)fail();}finally{closeSync(fd);}
 if(header.subarray(0,16).toString('binary')!=='SQLite format 3\0'||header.readUInt32BE(68)!==0x4e53544c)fail();
 const version=header.readUInt32BE(60);
 if(version===fence.sourceSchema){if(digestFile(filename)!==fence.databaseSha256)fail();return;}
 if(version!==10)fail();
 const readOnly=new DatabaseSync(filename,{readOnly:true,allowExtension:false});
 try{if(!receipt(readOnly,fence))fail();}finally{readOnly.close();}
}

// Serialize only restore-fence startup before opening SQLite. A stale lock is a
// bounded fail-closed operator-review condition, never guessed or auto-deleted.
export function acquireServiceRecoveryFence(filename) {
 try{lstatSync(join(dirname(filename),'INCOMPLETE'));fail();}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!readServiceRecoveryFence(filename))return {fence:null,release(){}};
 const path=filename+'.service-reconfirm.lock',deadline=Date.now()+5000;let fd;
 while(fd===undefined){try{fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);}catch(error){if(error.code!=='EEXIST')throw error;if(Date.now()>=deadline)fail();Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}
 const identity=fstatSync(fd);let released=false;
 const release=()=>{if(released)return;released=true;try{const current=lstatSync(path);if(current.dev!==identity.dev||current.ino!==identity.ino)fail();unlinkSync(path);}finally{closeSync(fd);}};
 try{const fence=readServiceRecoveryFence(filename);if(!fence){release();return {fence:null,release(){}};}return {fence,release};}catch(error){release();throw error;}
}
