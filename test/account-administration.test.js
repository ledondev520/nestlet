// Real SQLite, scrypt and in-memory sessions; synthetic accounts only, no mail/provider calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { openStorage } from '../storage.js';
import { createOperatorAuth } from '../auth.js';
import { accountPermissions, administratorChange } from '../account-administration.js';
import { digest } from '../email-auth-domain.js';
const owner = { userId: 'owner', role: 'owner' };
const password = 'synthetic-admin-password';
const hash = value => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(value, salt, 32).toString('base64url')}`; };
const passwordHash = hash(password), replacementHash = hash('synthetic-admin-new-password');
function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-account-admin-')), filename = join(directory, 'records.sqlite');
  const storage = openStorage({ filename });
  t.after(() => { storage.close(); rmSync(directory, { recursive: true, force: true }); });
  const legacy = storage.createTrialUser({ username: 'synthetic-legacy', passwordHash });
  const action = storage.emailAuth.createAction({ kind: 'register', email: 'synthetic-admin@example.test', passwordHash });
  storage.emailAuth.markAccepted(action.tokenHash); storage.emailAuth.verify(action.tokenHash);
  const user = storage.emailAuth.findByEmail('synthetic-admin@example.test');
  return { storage, filename, user, legacy, admin: storage.accountAdministration };
}
function inspect(filename, action) { const db = new DatabaseSync(filename); try { return action(db); } finally { db.close(); } }
const code = expected => error => error.code === expected;

test('only immutable owner can list/grant/revoke; strict desired-state payload and verified email required', t => {
  const { admin, user, legacy, storage } = fixture(t);
  for (const session of [null, {}, {userId:user.id,role:'trial'}, {userId:user.id,role:'owner'}, {userId:'owner',role:'trial'}]) {
    assert.throws(() => admin.listAccounts(session), code('OWNER_REQUIRED'));
    assert.throws(() => admin.setAdministrator(session,user.id,{administrator:true,expectedVersion:0}), code('OWNER_REQUIRED'));
    assert.throws(() => admin.audit(session), code('OWNER_REQUIRED'));
  }
  for (const input of [{}, null, [], {administrator:true}, {administrator:'true',expectedVersion:0}, {administrator:true,expectedVersion:-1}, {administrator:true,expectedVersion:0,role:'owner'}, {administrator:false,expectedVersion:Number.MAX_SAFE_INTEGER+1}]) assert.throws(() => administratorChange(input), code('ACCOUNT_ADMIN_INVALID'));
  assert.throws(() => admin.setAdministrator(owner,'owner',{administrator:false,expectedVersion:0}), code('OWNER_IMMUTABLE'));
  assert.throws(() => admin.setAdministrator(owner,randomUUID(),{administrator:true,expectedVersion:0}), code('ACCOUNT_NOT_FOUND'));
  assert.throws(() => admin.setAdministrator(owner,legacy.id,{administrator:true,expectedVersion:0}), code('ACCOUNT_EMAIL_REQUIRED'));
  assert.equal(storage.getUserById('owner').passwordHash, null);
  const roster = admin.listAccounts(owner).accounts;
  assert.equal(roster.find(row => row.id === legacy.id).canGrantAdministrator, false);
  assert.equal(roster.find(row => row.id === user.id).canGrantAdministrator, true);
  assert.doesNotMatch(JSON.stringify(roster), /passwordHash|scrypt\$|token|sourceText/);
  assert.deepEqual(admin.audit(owner).events, []);
  assert.deepEqual(accountPermissions({userId:user.id,role:'owner'},true), {administrator:false,canManageAccounts:false,canViewDiagnostics:false});
});

test('grant/revoke are atomic, idempotent and versioned; stale ABA cannot restore access or duplicate audit', t => {
  const { admin, user, filename } = fixture(t), change = { administrator: true, expectedVersion: 0 };
  assert.equal(admin.setAdministrator(owner,user.id,change).changed,true);
  assert.equal(admin.administrator(user.id),true);
  assert.equal(admin.setAdministrator(owner,user.id,change).changed,false);
  assert.equal(admin.setAdministrator(owner,user.id,{administrator:true,expectedVersion:1}).changed,false);
  assert.equal(admin.audit(owner).events.length,1);
  assert.equal(admin.setAdministrator(owner,user.id,{administrator:false,expectedVersion:1}).account.capabilityVersion,2);
  assert.equal(admin.administrator(user.id),false);
  assert.throws(() => admin.setAdministrator(owner,user.id,change),code('ACCOUNT_CAPABILITY_CONFLICT'));
  assert.throws(() => admin.setAdministrator(owner,user.id,{administrator:false,expectedVersion:0}),code('ACCOUNT_CAPABILITY_CONFLICT'));
  assert.equal(admin.setAdministrator(owner,user.id,{administrator:false,expectedVersion:1}).changed,false);
  const audit = admin.audit(owner,{limit:1});
  assert.equal(audit.events[0].administrator,false); assert.equal(audit.events[0].actorUserId,'owner');
  assert.equal(admin.audit(owner,{before:audit.nextBefore,limit:1}).events[0].administrator,true);
  assert.equal(admin.audit(owner).events.length,2);
  inspect(filename,db => {
    assert.throws(() => db.exec('DELETE FROM account_capability_audit'),/append-only/);
    assert.throws(() => db.exec("UPDATE account_capability_audit SET created_at='changed'"),/append-only/);
    db.exec("CREATE TRIGGER reject_synthetic_audit BEFORE INSERT ON account_capability_audit BEGIN SELECT RAISE(ABORT,'synthetic audit rejection'); END;");
  });
  assert.throws(() => admin.setAdministrator(owner,user.id,{administrator:true,expectedVersion:2}),/synthetic audit rejection/);
  assert.equal(admin.administrator(user.id),false);
  assert.equal(admin.listAccounts(owner).accounts.find(row => row.id===user.id).capabilityVersion,2);
});

test('existing cookie reflects grants/revokes on next request; email/password reset revokes sessions without changing capability or ownership', async t => {
  const { admin, storage, user } = fixture(t);
  const original = storage.getUserById(user.id), email = storage.emailAuth.identity(user.id);
  const saved = storage.createCase(user.id,{title:'Synthetic isolated case',sourceText:'Synthetic admin-owned source',fields:[],draftType:'followup',draftText:''});
  const auth = createOperatorAuth({ passwordHash, findTrialUserById:id=>storage.getUserById(id), findUserByEmail:email=>storage.emailAuth.findByEmail(email), hasAdministratorCapability:id=>admin.administrator(id) });
  const login = await auth.login(password,user.email), request = {headers:{cookie:login.cookie.split(';')[0]}};
  assert.equal(auth.getSession(request).administrator,false);
  admin.setAdministrator(owner,user.id,{administrator:true,expectedVersion:0});
  assert.equal(auth.getSession(request).administrator,true);
  assert.equal(auth.getSession(request).canManageAccounts,false);
  assert.equal(auth.getSession(request).role,'trial');
  admin.setAdministrator(owner,user.id,{administrator:false,expectedVersion:1});
  assert.equal(auth.getSession(request).canViewDiagnostics,false);
  admin.setAdministrator(owner,user.id,{administrator:true,expectedVersion:2});
  const action = storage.emailAuth.createAction({kind:'reset',email:user.email,userId:user.id,credentialFingerprint:digest(passwordHash)});
  storage.emailAuth.markAccepted(action.tokenHash);
  assert.equal(storage.emailAuth.reset(action.tokenHash,replacementHash),true);
  assert.equal(auth.getSession(request),null);
  assert.equal((await auth.login('synthetic-admin-new-password',user.email)).administrator,true);
  assert.equal(admin.administrator(user.id),true);
  assert.deepEqual(storage.emailAuth.identity(user.id),email);
  const current = storage.getUserById(user.id); assert.equal(current.id,original.id); assert.equal(current.role,'trial'); assert.equal(current.username,original.username);
  assert.equal(storage.getCase(user.id,saved.id).sourceText,saved.sourceText);
  assert.equal(storage.getCase('owner',saved.id),null);
});

// Source-contract evidence only; an actual container build/start remains a release gate.
test('runtime packaging explicitly includes both imported administration modules', () => {
  const ignore = readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8').split('\n');
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  for (const file of ['account-administration.js', 'account-administration-storage.js']) {
    assert.ok(ignore.includes('!' + file));
    assert.ok(dockerfile.split('\n').some(line => line.startsWith('COPY --chown=node:node package.json ') && line.split(/\s+/u).includes(file)));
  }
});
