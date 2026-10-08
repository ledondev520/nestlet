// Real SQLite and scrypt; synthetic accounts, no external mail/provider calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync, createHash } from 'node:crypto';
import { openStorage } from '../storage.js';
import { createOperatorAuth } from '../auth.js';
import { createEmailAuth } from '../email-auth.js';
const password = 'synthetic-durable-password';
const hashPassword = value => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(value,salt,32).toString('base64url')}`; };
const passwordHash = hashPassword(password), nextHash = hashPassword('synthetic-replacement-password');
const digest = value => createHash('sha256').update(value).digest('hex');
const request = session => ({headers:{cookie:session.cookie.split(';')[0],'x-csrf-token':session.csrfToken}});
const inspect = (filename, fn) => {const db=new DatabaseSync(filename);try{return fn(db);}finally{db.close();}};
function fixture(t) {
  const directory=mkdtempSync(join(realpathSync(tmpdir()),'nestlet-durable-')),filename=join(directory,'nestlet.sqlite');
  let storage=openStorage({filename});
  const user=storage.createTrialUser({username:'synthetic-user',passwordHash});
  const auth = options => createOperatorAuth({passwordHash,publicOrigin:'https://synthetic.invalid',sessionStore:storage.authSessions,
    findTrialUser:name=>storage.findUserByUsername(name),findTrialUserById:id=>storage.getUserById(id),
    findUserByEmail:email=>storage.emailAuth.findByEmail(email),hasAdministratorCapability:id=>storage.accountAdministration.administrator(id),...options});
  t.after(()=>{storage.close();rmSync(directory,{recursive:true,force:true});});
  return {filename,user,auth,get storage(){return storage;},reopen(){storage.close();storage=openStorage({filename});return auth();}};
}

test('owner and ordinary bearer/CSRF survive reopen; raw bearer never reaches SQLite; logout is durable',async t=>{
  const f=fixture(t),auth=f.auth(),ordinary=await auth.login(password,'synthetic-user'),owner=await auth.login(password,'owner',true);
  for(const session of [ordinary,owner]) {
    assert.match(session.cookie,/Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
    const token=session.cookie.split(';')[0].split('=')[1];
    const row=inspect(f.filename,db=>db.prepare('SELECT * FROM auth_sessions WHERE token_hash=?').get(digest(token)));
    assert.ok(row);assert.equal(readFileSync(f.filename).includes(Buffer.from(token)),false);
    assert.equal(row.credential_fingerprint,digest(passwordHash));
  }
  let restarted=f.reopen();
  for(const session of [ordinary,owner]) {const current=restarted.getSession(request(session));assert.equal(current.userId,session.userId);assert.equal(current.csrfToken,session.csrfToken);assert.equal(restarted.csrfValid(request(session),current),true);}
  assert.equal(restarted.getSession({headers:{cookie:'nestlet_session='+digest('forged')}}),null);
  restarted.logout(restarted.getSession(request(ordinary)));restarted=f.reopen();
  assert.equal(restarted.getSession(request(ordinary)),null);assert.equal(restarted.getSession(request(owner)).userId,'owner');
});

test('idle, remembered and absolute expiry retain original deadlines across restart and prune durable rows',async t=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const f=fixture(t),auth=f.auth(),plain=await auth.login(password,'synthetic-user'),remembered=await auth.login(password,'owner',true);
  now+=30*60*1000;let restarted=f.reopen();assert.ok(restarted.getSession(request(plain)));
  now+=30*60*1000+1;restarted=f.reopen();assert.equal(restarted.getSession(request(plain)),null);assert.ok(restarted.getSession(request(remembered)));
  now+=7*60*60*1000;restarted=f.reopen();assert.equal(restarted.getSession(request(remembered)),null);assert.equal(f.storage.authSessions.size,0);
});

test('credential rotation revokes every session durably even if old hash is later restored; missing users fail closed',async t=>{
  const f=fixture(t);let auth=f.auth();
  const one=await auth.login(password,'synthetic-user'),two=await auth.login(password,'synthetic-user',true);
  f.storage.upsertTrialUser({username:'synthetic-user',passwordHash:nextHash});
  f.storage.upsertTrialUser({username:'synthetic-user',passwordHash});auth=f.reopen();
  for(const session of [one,two])assert.equal(auth.getSession(request(session)),null);
  const next=await auth.login(password,'synthetic-user');inspect(f.filename,db=>db.prepare('DELETE FROM users WHERE id=?').run(f.user.id));
  auth=f.reopen();assert.equal(auth.getSession(request(next)),null);assert.equal(f.storage.authSessions.size,0);
});

test('owner ENV rotation and invalid setup revoke old cookies; capability revocation is refreshed after reopen',async t=>{
  const f=fixture(t), initial=f.auth(), owner=await initial.login(password,'owner'), otherOwner=await initial.login(password,'owner',true);
  f.auth({passwordHash:nextHash}); // No cookie is presented under the replacement credential.
  const restored=f.reopen();
  for (const session of [owner,otherOwner]) assert.equal(restored.getSession(request(session)),null);
  const action=f.storage.emailAuth.createAction({kind:'bind',email:'durable@example.invalid',userId:f.user.id,credentialFingerprint:digest(passwordHash)});
  f.storage.emailAuth.markAccepted(action.tokenHash);f.storage.emailAuth.verify(action.tokenHash);
  const ordinary=await f.auth().login(password,'synthetic-user');
  f.storage.accountAdministration.setAdministrator({userId:'owner',role:'owner'},f.user.id,{administrator:true,expectedVersion:0});
  assert.equal(f.reopen().getSession(request(ordinary)).administrator,true);
  f.storage.accountAdministration.setAdministrator({userId:'owner',role:'owner'},f.user.id,{administrator:false,expectedVersion:1});
  assert.equal(f.reopen().getSession(request(ordinary)).administrator,false);
  assert.equal(f.auth({passwordHash:''}).configured,false);assert.equal(f.reopen().getSession(request(ordinary)),null);
});

test('five-session cap survives restart; a failed insert rolls back eviction instead of logging out existing sessions',async t=>{
  const f=fixture(t);let auth=f.auth();const sessions=[];
  for(let i=0;i<5;i++) sessions.push(await auth.login(password,'synthetic-user'));
  inspect(f.filename,db=>db.exec("CREATE TRIGGER synthetic_session_failure BEFORE INSERT ON auth_sessions BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;"));
  await assert.rejects(auth.login(password,'synthetic-user'),/synthetic write failure/);
  auth=f.reopen();for(const session of sessions)assert.ok(auth.getSession(request(session)));
  inspect(f.filename,db=>db.exec('DROP TRIGGER synthetic_session_failure'));
  const sixth=await auth.login(password,'synthetic-user');auth=f.reopen();
  assert.equal(auth.getSession(request(sessions[0])),null);assert.ok(auth.getSession(request(sixth)));assert.equal(f.storage.authSessions.size,5);
});

for(const mode of ['write','commit'])test(`registration ${mode} failure rolls back account/proof/session/prior-session replacement, and retry works`,async t=>{
  const f=fixture(t);let auth=f.auth();const previous=await auth.login(password,'owner');
  const action=f.storage.emailAuth.createAction({kind:'register',email:'rollback@example.invalid',passwordHash});f.storage.emailAuth.markAccepted(action.tokenHash);
  inspect(f.filename,db=>{
    if(mode==='commit') db.exec('CREATE TABLE synthetic_deferred(id TEXT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER synthetic_session_failure AFTER INSERT ON auth_sessions BEGIN INSERT INTO synthetic_deferred VALUES(\'missing-user\'); END;');
    else db.exec("CREATE TRIGGER synthetic_session_failure BEFORE INSERT ON auth_sessions BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;");
  });
  const service=()=>createEmailAuth({storage:f.storage.emailAuth,delivery:{configured:true},publicOrigin:'https://synthetic.invalid',currentCredential:()=>passwordHash,establishRegistrationSession:auth.establishRegistrationSession});
  assert.throws(()=>service().verify({token:action.token},'synthetic-ip',auth.getSession(request(previous))),mode==='write'?/synthetic write failure/:/FOREIGN KEY constraint failed/);
  auth=f.reopen();assert.ok(auth.getSession(request(previous)));assert.equal(f.storage.authSessions.size,1);
  assert.equal(f.storage.emailAuth.findByEmail('rollback@example.invalid'),null);assert.equal(f.storage.emailAuth.getAction(action.tokenHash).ready,1);
  inspect(f.filename,db=>db.exec('DROP TRIGGER synthetic_session_failure'));
  const result=service().verify({token:action.token},'synthetic-ip',auth.getSession(request(previous)));auth=f.reopen();
  assert.equal(auth.getSession(request(previous)),null);assert.equal(auth.getSession(request(result)).userId,result.userId);
  assert.throws(()=>service().verify({token:action.token},'synthetic-ip'),error=>error.code==='EMAIL_TOKEN_INVALID');
});

test('touch/delete failures fail closed; cross-connection logout cannot be revived by another process or reopen',async t=>{
  const f=fixture(t);let auth=f.auth();const issued=await auth.login(password,'synthetic-user');
  inspect(f.filename,db=>db.exec("CREATE TRIGGER synthetic_touch_failure BEFORE UPDATE ON auth_sessions BEGIN SELECT RAISE(ABORT,'synthetic touch failure'); END;"));
  assert.throws(()=>auth.getSession(request(issued)),/synthetic touch failure/);
  inspect(f.filename,db=>db.exec('DROP TRIGGER synthetic_touch_failure'));
  const valid=auth.getSession(request(issued));
  inspect(f.filename,db=>db.exec("CREATE TRIGGER synthetic_delete_failure BEFORE DELETE ON auth_sessions BEGIN SELECT RAISE(ABORT,'synthetic delete failure'); END;"));
  assert.throws(()=>auth.logout(valid),/synthetic delete failure/);
  auth=f.reopen();assert.ok(auth.getSession(request(issued)));
  inspect(f.filename,db=>db.exec('DROP TRIGGER synthetic_delete_failure'));
  const independent=openStorage({filename:f.filename});
  try {
    const other=createOperatorAuth({passwordHash,sessionStore:independent.authSessions,findTrialUserById:id=>independent.getUserById(id)});
    other.logout(other.getSession(request(issued)));
    assert.equal(auth.getSession(request(issued)),null);
    assert.equal(f.reopen().getSession(request(issued)),null);
  } finally {independent.close();}
});

test('in-flight session checks do not touch last-used time or prolong ordinary idle expiry',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const f=fixture(t),auth=f.auth(),issued=await auth.login(password,'synthetic-user');
 const before=inspect(f.filename,db=>db.prepare('SELECT last_used FROM auth_sessions').get().last_used);
 now+=29*60*1000;
 assert.equal(auth.getSession(request(issued),{touch:false}).userId,f.user.id);
 assert.equal(inspect(f.filename,db=>db.prepare('SELECT last_used FROM auth_sessions').get().last_used),before);
 now+=60*1000+1;
 assert.equal(auth.getSession(request(issued),{touch:false}),null);
 assert.equal(f.storage.authSessions.size,0);
});
