import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountLabel, accountSessionKey, canChangeAdministrator, canManageAccounts, changeFailure, readAccount, readAccounts, readAdministratorChange, verifiedEmail } from './model.js';
const account = { id: 'synthetic-user', username: 'synthetic', role: 'trial', email: 'synthetic@example.invalid', emailVerifiedAt: 1000, createdAt: '2026-10-07T00:00:00Z', administrator: false, capabilityVersion: 0, canGrantAdministrator: true };
const owner = { authenticated: true, userId: 'owner', role: 'owner', canManageAccounts: true, csrfToken: 'fixture-session' };

test('management requires every strict owner capability condition', () => {
  assert.equal(canManageAccounts(owner), true);
  for (const override of [{ authenticated: false }, { authenticated: 'true' }, { userId: 'other-owner' }, { role: 'trial' }, { canManageAccounts: false }, { canManageAccounts: 1 }, { canManageAccounts: undefined }]) assert.equal(canManageAccounts({ ...owner, ...override }), false);
  assert.equal(canManageAccounts(null), false);
});
test('administrator capability labels never replace the owner/trial storage role', () => {
  assert.equal(accountLabel(account), 'ordinary');
  assert.equal(accountLabel({ ...account, administrator: true }), 'administrator');
  assert.equal(accountLabel({ ...account, role: 'owner', administrator: true }), 'owner');
});
test('new grants require verified email and server allowance; revocation stays possible for legacy grants', () => {
  assert.equal(canChangeAdministrator(account), true);
  for (const override of [{ email: null }, { emailVerifiedAt: null }, { emailVerifiedAt: -1 }, { canGrantAdministrator: false }, { capabilityVersion: -1 }, { id: 'owner' }, { id: undefined }, { id: '' }, { role: 'owner' }]) assert.equal(canChangeAdministrator({ ...account, ...override }), false);
  assert.equal(canChangeAdministrator(account, account.id), false);
  assert.equal(canChangeAdministrator({ ...account, administrator: true, email: null, emailVerifiedAt: null, canGrantAdministrator: false }), true);
  assert.equal(verifiedEmail({ ...account, emailVerifiedAt: 0 }), true);
});
test('roster parsing rejects malformed fields, duplicate IDs and contradictory owner identities', () => {
  assert.deepEqual(readAccounts({ accounts: [account] }), [account]);
  assert.deepEqual(readAccounts({ accounts: [] }), []);
  for (const override of [{ id: '' }, { role: 'administrator' }, { id: 'owner' }, { id: undefined }, { id: '' }, { role: 'owner' }, { email: undefined }, { email: null }, { emailVerifiedAt: '1000' }, { emailVerifiedAt: -1 }, { createdAt: 'invalid' }, { administrator: 1 }, { capabilityVersion: 0.5 }, { capabilityVersion: Number.MAX_SAFE_INTEGER + 1 }, { canGrantAdministrator: undefined }]) assert.throws(() => readAccount({ ...account, ...override }), /INVALID_RESPONSE/);
  for (const value of [null, {}, { accounts: null }, { accounts: [account, account] }]) assert.throws(() => readAccounts(value), /INVALID_RESPONSE/);
});
test('allowlist strips extra backend data and update validation binds identity and intended state', () => {
  assert.deepEqual(readAccount({ ...account, passwordHash: 'synthetic-disallowed-field', providerSecret: 'synthetic-disallowed-field' }), account);
  const result = { account: { ...account, administrator: true, capabilityVersion: 1 }, changed: true };
  assert.deepEqual(readAdministratorChange(result, account, true), result);
  for (const bad of [{ ...result, changed: 'true' }, { ...result, account: { ...result.account, id: 'other-user' } }, { ...result, account }, { ...result, account: { ...result.account, capabilityVersion: 0 } }]) {
    if (bad.account?.capabilityVersion === 0 && bad.account?.administrator === true) assert.throws(() => readAdministratorChange(bad, { ...account, capabilityVersion: 1 }, true), /INVALID_RESPONSE/);
    else assert.throws(() => readAdministratorChange(bad, account, true), /INVALID_RESPONSE/);
  }
});
test('session binding changes with token or authority and errors are bounded', () => {
  assert.notEqual(accountSessionKey(owner), accountSessionKey({ ...owner, csrfToken: 'new-fixture-session' }));
  assert.notEqual(accountSessionKey(owner), accountSessionKey({ ...owner, canManageAccounts: false }));
  assert.equal(changeFailure({ status: 409 }), 'conflict');
  assert.equal(changeFailure({ code: 'CAPABILITY_VERSION_CONFLICT' }), 'conflict');
  assert.equal(changeFailure({ status: 403 }), 'permission');
  assert.equal(changeFailure({ code: 'Unexpected backend text' }), 'uncertain');
});

test('diagnostic gate requires authenticated identity and explicit capability; parser is an exact bounded allowlist', async () => {
  const { canViewDiagnostics, readDiagnostics } = await import('./model.js');
  const view = { model: 'deepseek-flash', liveEnabled: false, pdfEnabled: true, workbookEnabled: true, uptimeSeconds: 21, activeRequests: { chat: 0, extraction: 1, pdf: 2, workbook: 0 } };
  assert.equal(canViewDiagnostics({ authenticated: true, userId: 'synthetic-admin', canViewDiagnostics: true }), true);
  for (const value of [null, { authenticated: true, canViewDiagnostics: true }, { authenticated: false, userId: 'owner', canViewDiagnostics: true }, { authenticated: true, userId: 'owner', canViewDiagnostics: 1 }]) assert.equal(canViewDiagnostics(value), false);
  assert.deepEqual(readDiagnostics({ ...view, providerKey: 'synthetic-excluded', activeRequests: { ...view.activeRequests, crossUserRecord: 'excluded' } }), view);
  for (const value of [{ ...view, model: 'unapproved-model' }, { ...view, liveEnabled: 'true' }, { ...view, uptimeSeconds: -1 }, { ...view, activeRequests: { ...view.activeRequests, chat: 0.5 } }, { ...view, activeRequests: null }]) assert.throws(() => readDiagnostics(value), /INVALID_RESPONSE/);
});
