// Synthetic local grant fixtures only; no actual account or provider permission is changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStorage } from '../storage.js';
import { LIBRARY_PERMISSION_SCOPE } from '../library-consent-storage.js';
const hash = `scrypt$${Buffer.alloc(16,1).toString('base64url')}$${Buffer.alloc(32,2).toString('base64url')}`;
const change = (decision, expectedVersion, scope = LIBRARY_PERMISSION_SCOPE) => ({ decision, expectedVersion, ...scope });
function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-permission-'));
  const filename = join(directory, 'private', 'records.sqlite');
  const store = openStorage({ filename });
  const user = store.createTrialUser({ username: 'permission-fixture', passwordHash: hash });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, user, filename };
}
test('absent and legacy permissions default unset; grants/declines persist account-scoped through reopen', t => {
  const {store, user, filename} = fixture(t);
  assert.deepEqual(store.libraryPermissions.read(user.id), { decision:'unset',version:0,...LIBRARY_PERMISSION_SCOPE,updatedAt:null });
  assert.throws(() => store.libraryPermissions.assertAllowed(user.id, 0), {code:'LIBRARY_CONSENT_REQUIRED'});
  const granted = store.libraryPermissions.set(user.id, change('allow', 0));
  assert.equal(granted.version, 1); assert.equal(granted.decision, 'allow');
  assert.equal(store.libraryPermissions.read('owner').decision, 'unset');
  const second = openStorage({filename});
  try {
    assert.deepEqual(second.libraryPermissions.read(user.id), granted);
    second.libraryPermissions.set(user.id, change('deny', 1));
    assert.equal(store.libraryPermissions.read(user.id).decision, 'deny');
    assert.throws(() => store.libraryPermissions.assertAllowed(user.id, 1), {code:'LIBRARY_CONSENT_REQUIRED'});
  } finally { second.close(); }
  const third = openStorage({filename});
  try { assert.equal(third.libraryPermissions.read(user.id).decision, 'deny'); } finally { third.close(); }
});
test('provider id, endpoint, model, policy and category changes each invalidate old grants', t => {
  const {store, user} = fixture(t);
  store.libraryPermissions.set(user.id, change('allow', 0));
  const alternatives = [
    {...LIBRARY_PERMISSION_SCOPE, provider:{...LIBRARY_PERMISSION_SCOPE.provider,id:'different-provider'}},
    {...LIBRARY_PERMISSION_SCOPE, provider:{...LIBRARY_PERMISSION_SCOPE.provider,endpoint:'https://new-provider.example.test/chat'}},
    {...LIBRARY_PERMISSION_SCOPE, provider:{...LIBRARY_PERMISSION_SCOPE.provider,model:'different-model'}},
    {...LIBRARY_PERMISSION_SCOPE, policyVersion:'library-retrieval-v2'},
    {...LIBRARY_PERMISSION_SCOPE, category:'different-category'},
  ];
  for (const scope of alternatives) {
    assert.equal(store.libraryPermissions.read(user.id, scope).decision, 'unset');
    assert.throws(() => store.libraryPermissions.assertAllowed(user.id, 1, scope), {code:'LIBRARY_CONSENT_REQUIRED'});
    assert.throws(() => store.libraryPermissions.set(user.id, change('allow', 1, scope)), {code:'LIBRARY_PERMISSION_CONFLICT'});
  }
  const next = alternatives[1];
  store.libraryPermissions.set(user.id, change('allow', 1, next), next);
  assert.equal(store.libraryPermissions.read(user.id).decision, 'unset');
  assert.equal(store.libraryPermissions.read(user.id).version, 2);
});
test('strict writes and monotonic versions stop stale tabs and revoke/regrant ABA', t => {
  const {store,user} = fixture(t);
  for (const input of [null,[],{},change('unset',0),change('allow',-1),change('allow',1.5),
    {...change('allow',0),userId:'owner'},{...change('allow',0),provider:{...LIBRARY_PERMISSION_SCOPE.provider,extra:true}},
    {...change('allow',0),policyVersion:5}]) assert.throws(() => store.libraryPermissions.set(user.id,input),{code:'LIBRARY_PERMISSION_INVALID'});
  store.libraryPermissions.set(user.id,change('allow',0));
  assert.throws(() => store.libraryPermissions.set(user.id,change('allow',0)),{code:'LIBRARY_PERMISSION_CONFLICT'});
  store.libraryPermissions.set(user.id,change('deny',1));
  store.libraryPermissions.set(user.id,change('allow',2));
  assert.throws(() => store.libraryPermissions.assertAllowed(user.id,1),{code:'LIBRARY_PERMISSION_CONFLICT'});
  assert.equal(store.libraryPermissions.assertAllowed(user.id,3).decision,'allow');
  assert.throws(() => store.libraryPermissions.read('unknown'),{code:'USER_INVALID'});
});
test('concurrent storage handles conflict without lost update and failed writes roll back', t => {
  const {store,user,filename}=fixture(t), second=openStorage({filename});
  try {
    const snapshot=second.libraryPermissions.read(user.id);
    store.libraryPermissions.set(user.id,change('allow',snapshot.version));
    assert.throws(() => second.libraryPermissions.set(user.id,change('deny',snapshot.version)),{code:'LIBRARY_PERMISSION_CONFLICT'});
    const db=new DatabaseSync(filename);try{db.exec("CREATE TRIGGER permission_failure BEFORE UPDATE ON library_permissions BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");}finally{db.close();}
    assert.throws(()=>second.libraryPermissions.set(user.id,change('deny',1)),/synthetic failure/);
    assert.equal(store.libraryPermissions.read(user.id).version,1);
    assert.equal(store.libraryPermissions.read(user.id).decision,'allow');
  } finally {second.close();}
});
test('deleting an otherwise empty account cascades its consent record without affecting another account', t => {
  const {store,user,filename}=fixture(t);
  store.libraryPermissions.set(user.id,change('allow',0));
  store.libraryPermissions.set('owner',change('deny',0));
  const db=new DatabaseSync(filename,{enableForeignKeyConstraints:true});
  try {
    db.prepare('DELETE FROM users WHERE id=?').run(user.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM library_permissions WHERE user_id=?').get(user.id).n,0);
    assert.equal(db.prepare('SELECT decision FROM library_permissions WHERE user_id=?').get('owner').decision,'deny');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});
