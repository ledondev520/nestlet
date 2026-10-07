/** Actual React/JSDOM with synthetic API fixtures. Not browser or production acceptance. */
import { after, before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let vite, dom, React, createRoot, AccountAdministrationPanel, AccountAdministration, OperationalDiagnosticsPanel, SessionProvider, root, container;
const originalFetch = globalThis.fetch;
const owner = { authenticated: true, userId: 'owner', role: 'owner', canManageAccounts: true, canViewDiagnostics: true, csrfToken: 'fixture-owner-session' };
const account = { id: 'synthetic-ordinary', username: 'Synthetic ordinary', role: 'trial', email: 'ordinary@example.invalid', emailVerifiedAt: 1000, createdAt: '2026-10-07T00:00:00Z', administrator: false, capabilityVersion: 2, canGrantAdministrator: true };
const ownerRow = { ...account, id: 'owner', username: 'owner', role: 'owner', email: null, emailVerifiedAt: null, administrator: true, capabilityVersion: 0, canGrantAdministrator: false };
const admin = { ...account, id: 'synthetic-admin', username: 'Synthetic administrator', email: 'admin@example.invalid', administrator: true, capabilityVersion: 4, canGrantAdministrator: false };
const legacy = { ...account, id: 'synthetic-legacy', username: 'Synthetic legacy', email: null, emailVerifiedAt: null, canGrantAdministrator: false };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const button = name => [...container.querySelectorAll('button')].find(element => element.textContent === name || element.getAttribute('aria-label') === name);
const content = () => container.textContent;
function fixture({ rows = [ownerRow, account, admin, legacy], get, put } = {}) {
  const calls = [];
  return {
    calls,
    get: async (path, options) => { calls.push({ method: 'GET', path, ...options }); return get ? get(path, options) : { accounts: rows }; },
    put: async (path, body, options) => { calls.push({ method: 'PUT', path, body, ...options }); return put ? put(path, body, options) : { account: { ...account, administrator: body.administrator, capabilityVersion: account.capabilityVersion + 1 }, changed: true }; },
  };
}
async function render(api, props = {}) { await React.act(async () => root.render(React.createElement(AccountAdministrationPanel, { api, status: owner, lang: 'en', ...props }))); }
async function click(element) { assert.ok(element, 'button exists'); await React.act(async () => element.click()); }
async function select(name = account.username, action = 'Grant administrator access') { await click(button(`${action}: ${name}`)); }

before(async () => {
  dom = new JSDOM('<!doctype html><body></body>', { url: 'https://fixture.invalid/next/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'Event']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import('react'); ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true, hmr: false, watch: null, ws: false }, appType: 'custom' });
  ({ AccountAdministrationPanel, AccountAdministration, OperationalDiagnosticsPanel } = await vite.ssrLoadModule('/features/account-administration/index.jsx'));
  ({ SessionProvider } = await vite.ssrLoadModule('/lib/session.jsx'));
});
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { if (root) await React.act(async () => root.unmount()); container.remove(); globalThis.fetch = originalFetch; });
after(async () => { await vite?.close(); dom?.window.close(); });

test('ordinary, delegated administrator, malformed owner and inactive panels never read or show the directory', async () => {
  for (const status of [{ authenticated: false }, { ...owner, userId: 'synthetic-admin', role: 'trial', administrator: true }, { ...owner, userId: 'not-owner' }, { ...owner, canManageAccounts: undefined }, { ...owner, canManageAccounts: 'true' }, { ...owner, authenticated: 1 }]) {
    const api = fixture(); await render(api, { status }); assert.deepEqual(api.calls, []); assert.equal(content(), '');
  }
  const api = fixture(); await render(api, { active: false }); assert.deepEqual(api.calls, []); assert.equal(content(), '');
});

test('owner gets three distinct access labels, immutable owner, and a bind-first legacy reason', async () => {
  const api = fixture(); await render(api);
  assert.deepEqual(api.calls.map(call => call.path), ['/api/admin/accounts']);
  const rows = [...container.querySelectorAll('li')];
  assert.match(rows[0].textContent, /Owner/); assert.equal(rows[0].querySelector('button'), null);
  assert.match(rows[1].textContent, /Ordinary user/); assert.match(rows[2].textContent, /Administrator/);
  assert.equal(rows[3].querySelector('button'), null); assert.match(rows[3].textContent, /bind and verify an email/);
  assert.match(content(), /other users’ cases or files, provider secrets or settings, account grants, or global telemetry/);
  assert.equal(container.querySelector('[role=switch],input[type=checkbox]'), null);
});

test('select and cancel never send PUT; cancel restores the initiating button focus', async () => {
  const api = fixture(); await render(api); const trigger = button(`Grant administrator access: ${account.username}`);
  await click(trigger); assert.match(content(), /Confirm access change/); assert.equal(document.activeElement.textContent, 'Confirm access change');
  assert.equal(api.calls.filter(call => call.method === 'PUT').length, 0);
  await click(button('Cancel')); assert.equal(api.calls.filter(call => call.method === 'PUT').length, 0);
  assert.equal(button('Confirm grant'), undefined); assert.equal(document.activeElement, trigger);
});

test('grant requires confirmation, sends exact version, blocks duplicate clicks and shows only reread rows', async () => {
  const mutation = deferred(), refresh = deferred(); let reads = 0;
  const api = fixture({ get: () => ++reads === 1 ? { accounts: [account] } : refresh.promise, put: () => mutation.promise });
  await render(api); await select(); const confirm = button('Confirm grant');
  await React.act(async () => { confirm.click(); confirm.click(); });
  assert.deepEqual(api.calls.filter(call => call.method === 'PUT').map(({ path, body }) => ({ path, body })), [{ path: '/api/admin/accounts/synthetic-ordinary/administrator', body: { administrator: true, expectedVersion: 2 } }]);
  assert.equal(container.querySelectorAll('li').length, 0); assert.equal(reads, 1); assert.equal(button('Reload accounts').disabled, true);
  await React.act(async () => mutation.resolve({ account: { ...account, administrator: true, capabilityVersion: 3 }, changed: true }));
  assert.equal(reads, 2); assert.equal(container.querySelectorAll('li').length, 0);
  // The directory is authoritative even if another owner action followed the acknowledged write.
  await React.act(async () => refresh.resolve({ accounts: [{ ...account, username: 'Fresh server row', administrator: false, capabilityVersion: 4 }] }));
  assert.match(content(), /Fresh server row/); assert.match(content(), /Ordinary user/); assert.match(content(), /freshly reread/);
  assert.equal(button('Confirm grant'), undefined); assert.equal(button('Reload accounts').disabled, false);
});

test('revocation is an explicit false intent and works for an existing administrator without verified email', async () => {
  const oldAdmin = { ...admin, email: null, emailVerifiedAt: null }; let updated = false;
  const api = fixture({ get: () => ({ accounts: [{ ...oldAdmin, administrator: !updated, capabilityVersion: updated ? 5 : 4 }] }), put: (path, body) => { updated = true; return { account: { ...oldAdmin, administrator: false, capabilityVersion: 5 }, changed: true }; } });
  await render(api); await select(admin.username, 'Revoke administrator access'); assert.match(content(), /keep access to its own cases and files/);
  await click(button('Confirm revocation'));
  assert.deepEqual(api.calls.find(call => call.method === 'PUT').body, { administrator: false, expectedVersion: 4 });
  assert.match(content(), /Ordinary user/); assert.match(content(), /bind and verify an email/);
});

test('conflict clears all actionable rows, never retries, and requires explicit reload before a fresh confirmation', async () => {
  let reads = 0;
  const api = fixture({ get: () => ({ accounts: [{ ...account, capabilityVersion: ++reads === 1 ? 2 : 8 }] }), put: () => { throw { status: 409, code: 'CAPABILITY_VERSION_CONFLICT', message: 'Do not render backend details' }; } });
  await render(api); await select(); await click(button('Confirm grant'));
  assert.match(content(), /did not overwrite the newer state/); assert.equal(container.querySelectorAll('li').length, 0); assert.equal(reads, 1);
  assert.equal(api.calls.filter(call => call.method === 'PUT').length, 1); assert.doesNotMatch(content(), /Do not render backend details/);
  await render(api, { lang: 'zh' }); assert.equal(reads, 1); assert.match(content(), /重新加载账号后重新确认/);
  await click(button('重新加载账号')); assert.equal(reads, 2); await render(api);
  await select(); await click(button('Confirm grant'));
  assert.deepEqual(api.calls.filter(call => call.method === 'PUT').map(call => call.body.expectedVersion), [2, 8]);
});

test('uncertain network, invalid update and forbidden results clear rows without retry or trusting backend text', async () => {
  for (const failure of [{ code: 'NETWORK_ERROR' }, { status: 403, code: 'FORBIDDEN' }, null]) {
    const api = fixture({ rows: [account], put: () => { if (failure) throw { ...failure, message: 'private backend detail' }; return { account: { ...account, id: 'wrong-account', administrator: true }, changed: true }; } });
    await render(api, { status: { ...owner, csrfToken: JSON.stringify(failure) } }); await select(); await click(button('Confirm grant'));
    assert.equal(container.querySelectorAll('li').length, 0); assert.ok(container.querySelector('[role=alert]'));
    assert.equal(api.calls.filter(call => call.method === 'GET').length, 1); assert.equal(api.calls.filter(call => call.method === 'PUT').length, 1);
    assert.doesNotMatch(content(), /private backend detail/); assert.equal(button('Reload accounts').disabled, false);
  }
});

test('acknowledged write plus failed refresh gives a precise reload-only state', async () => {
  let reads = 0; const api = fixture({ get: () => { if (++reads > 1) throw { code: 'NETWORK_ERROR' }; return { accounts: [account] }; } });
  await render(api); await select(); await click(button('Confirm grant'));
  assert.match(content(), /server acknowledged the change request/); assert.equal(container.querySelectorAll('li').length, 0);
  assert.equal(reads, 2); assert.equal(api.calls.filter(call => call.method === 'PUT').length, 1);
});

test('load failures and malformed rows stay distinct from empty accounts; Chinese is the default', async () => {
  const api = fixture({ get: () => ({ accounts: [{ ...account, capabilityVersion: -1 }] }) });
  await render(api, { lang: undefined }); assert.match(content(), /暂时无法加载账号/); assert.doesNotMatch(content(), /当前没有可显示的账号/); assert.equal(container.querySelectorAll('li').length, 0);
  const empty = fixture({ rows: [] }); await render(empty, { status: { ...owner, csrfToken: 'empty-session' } });
  assert.match(content(), /There are no accounts to display/); assert.equal(container.querySelector('[role=alert]'), null);
});

test('inactive navigation aborts pending reads, ignores late data, and rereads on active reentry', async () => {
  const late = deferred(); let reads = 0; const api = fixture({ get: () => ++reads === 1 ? late.promise : { accounts: [admin] } });
  await render(api); await render(api, { active: false }); assert.equal(api.calls[0].signal.aborted, true); assert.equal(content(), '');
  await React.act(async () => late.resolve({ accounts: [account] })); assert.equal(content(), '');
  await render(api); assert.match(content(), /Synthetic administrator/); assert.doesNotMatch(content(), /Synthetic ordinary/); assert.equal(reads, 2);
});

test('session token or owner authority change clears pending confirmation and old roster immediately', async () => {
  const api = fixture(); await render(api); await select();
  await render(api, { status: { ...owner, role: 'trial', userId: 'synthetic-admin', canManageAccounts: false } });
  assert.equal(content(), ''); assert.equal(api.calls.filter(call => call.method === 'PUT').length, 0);
  const next = deferred(); const newApi = fixture({ get: () => next.promise });
  await render(newApi, { status: { ...owner, csrfToken: 'new-owner-session' } });
  assert.doesNotMatch(content(), /Synthetic ordinary|Confirm access change/); assert.match(content(), /Loading accounts/);
  await React.act(async () => next.resolve({ accounts: [] })); assert.match(content(), /There are no accounts/);
});

test('late old-session reads cannot overwrite a newer owner session', async () => {
  const old = deferred(); let count = 0;
  const api = fixture({ get: () => ++count === 1 ? old.promise : { accounts: [admin] } });
  await render(api); await render(api, { status: { ...owner, csrfToken: 'new-session' } });
  assert.equal(api.calls[0].signal.aborted, true);
  await React.act(async () => old.resolve({ accounts: [account] }));
  assert.match(content(), /Synthetic administrator/); assert.doesNotMatch(content(), /Synthetic ordinary/);
});

test('inactive or unmounted in-flight writes are aborted and never start a late refresh', async () => {
  for (const mode of ['inactive', 'unmount']) {
    const late = deferred(), api = fixture({ rows: [account], put: () => late.promise });
    await render(api); await select(); await click(button('Confirm grant'));
    if (mode === 'inactive') await render(api, { active: false });
    else { await React.act(async () => root.unmount()); root = null; }
    assert.equal(api.calls.find(call => call.method === 'PUT').signal.aborted, true);
    await React.act(async () => late.resolve({ account: { ...account, administrator: true, capabilityVersion: 3 }, changed: true }));
    assert.equal(api.calls.filter(call => call.method === 'GET').length, 1); assert.equal(content(), '');
  }
});

test('pagehide clears pending state and requires reload without an automatic request', async () => {
  const api = fixture(); await render(api); await select();
  await React.act(async () => window.dispatchEvent(new Event('pagehide')));
  assert.equal(container.querySelectorAll('li').length, 0); assert.equal(button('Confirm grant'), undefined); assert.match(content(), /request was interrupted/);
  assert.equal(api.calls.length, 1); await click(button('Reload accounts')); assert.equal(api.calls.length, 2);
});

test('account strings render as text and no account data is persisted to browser storage', async () => {
  const api = fixture({ rows: [{ ...account, username: '<img src=x onerror=alert(1)>', passwordHash: 'never-render-this-secret' }] });
  await render(api); assert.equal(container.querySelector('img'), null); assert.match(content(), /<img src=x onerror=alert\(1\)>/); assert.doesNotMatch(container.innerHTML, /never-render-this-secret/);
  assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0);
});

test('session wrapper uses same-origin API client and current CSRF for a confirmed capability write', async () => {
  const calls = []; let updated = false;
  globalThis.fetch = async (path, options) => {
    calls.push({ path, ...options });
    let body = path === '/api/status' ? owner : { accounts: [{ ...account, administrator: updated, capabilityVersion: updated ? 3 : 2 }] };
    if (options.method === 'PUT') { updated = true; body = { account: { ...account, administrator: true, capabilityVersion: 3 }, changed: true }; }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await React.act(async () => root.render(React.createElement(SessionProvider, null, React.createElement(AccountAdministration, { lang: 'en' }))));
  await select(); await click(button('Confirm grant'));
  const mutation = calls.find(call => call.method === 'PUT'); assert.ok(mutation);
  assert.equal(mutation.headers['X-CSRF-Token'], owner.csrfToken); assert.equal(mutation.credentials, 'same-origin'); assert.equal(mutation.cache, 'no-store');
  assert.deepEqual(JSON.parse(mutation.body), { administrator: true, expectedVersion: 2 });
  assert.match(content(), /Administrator/); assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0);
});

test('a capability change during a write aborts it and blocks any late refresh', async () => {
  const write = deferred(), api = fixture({ rows: [account], put: () => write.promise });
  await render(api); await select(); await click(button('Confirm grant'));
  await render(api, { status: { ...owner, canManageAccounts: false } });
  assert.equal(api.calls.find(call => call.method === 'PUT').signal.aborted, true); assert.equal(content(), '');
  await React.act(async () => write.resolve({ account: { ...account, administrator: true, capabilityVersion: 3 }, changed: true }));
  assert.equal(api.calls.length, 2); assert.equal(content(), '');
});

test('server says grant allowed but missing verification still has no action; no-op response is reread honestly', async () => {
  const unverified = { ...account, id: 'synthetic-unverified', username: 'Unverified synthetic', emailVerifiedAt: null };
  const api = fixture({ rows: [unverified, account], put: () => ({ account: { ...account, administrator: true }, changed: false }) });
  await render(api); assert.equal(button(`Grant administrator access: ${unverified.username}`), undefined);
  await select(); await click(button('Confirm grant')); assert.match(content(), /no change was needed/);
  assert.equal(api.calls.filter(call => call.method === 'GET').length, 2);
});

test('replacing the API binding aborts its old read even within the same session', async () => {
  const old = deferred(), api = fixture({ get: () => old.promise }), replacement = fixture({ rows: [admin] });
  await render(api); await render(replacement); assert.equal(api.calls[0].signal.aborted, true);
  await React.act(async () => old.resolve({ accounts: [account] }));
  assert.match(content(), /Synthetic administrator/); assert.doesNotMatch(content(), /Synthetic ordinary/);
});

const diagnostics = { model: 'deepseek-flash', liveEnabled: false, pdfEnabled: true, workbookEnabled: true, uptimeSeconds: 21, activeRequests: { chat: 0, extraction: 1, pdf: 2, workbook: 0 } };
async function renderDiagnostics(api, props = {}) { await React.act(async () => root.render(React.createElement(OperationalDiagnosticsPanel, { api, status: { authenticated: true, userId: 'synthetic-admin', role: 'trial', administrator: true, canViewDiagnostics: true }, lang: 'en', ...props }))); }

test('optional diagnostics is read-only and never requests the account directory for delegated administrators', async () => {
  const api = fixture({ get: () => ({ ...diagnostics, providerKey: 'synthetic-excluded-secret', users: [account] }) });
  await renderDiagnostics(api);
  assert.deepEqual(api.calls.map(call => call.path), ['/api/admin/diagnostics']);
  assert.match(content(), /deepseek-flash|Bounded operational status/); assert.doesNotMatch(content(), /synthetic-excluded-secret|Synthetic ordinary/);
  assert.equal(container.querySelectorAll('button').length, 1); assert.equal(api.calls.filter(call => call.method !== 'GET').length, 0);
  await renderDiagnostics(api, { lang: 'zh' }); assert.match(content(), /有限运行状态/); assert.equal(api.calls.length, 1);
});

test('diagnostic capability and activity gates make no unauthorized request and abort revoked reads', async () => {
  const late = deferred(), api = fixture({ get: () => late.promise });
  await renderDiagnostics(api, { status: { authenticated: true, userId: 'ordinary', canViewDiagnostics: false } });
  await renderDiagnostics(api, { active: false }); assert.equal(api.calls.length, 0);
  await renderDiagnostics(api); assert.equal(api.calls.length, 1);
  await renderDiagnostics(api, { status: { authenticated: true, userId: 'synthetic-admin', canViewDiagnostics: false } });
  assert.equal(api.calls[0].signal.aborted, true);
  await React.act(async () => late.resolve(diagnostics)); assert.equal(content(), '');
});

test('invalid or failed diagnostics stays unavailable until manual refresh, with no fake counts', async () => {
  let count = 0; const api = fixture({ get: () => ++count === 1 ? { ...diagnostics, activeRequests: { chat: -1 } } : diagnostics });
  await renderDiagnostics(api); assert.match(content(), /could not be loaded/); assert.equal(container.querySelector('dl'), null); assert.equal(count, 1);
  await click(button('Refresh operational status')); assert.equal(count, 2); assert.match(content(), /deepseek-flash/);
});
