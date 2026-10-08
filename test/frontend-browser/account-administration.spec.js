import { test as base, expect } from '@playwright/test';
import { startBrowserFixture } from '../helpers/browser-fixture.mjs';
import { requestRegistration, post, signIn } from './email-support.js';
import { signInCustomer, getJson, responseFor, createCustomer, createLinkedCase } from './customer-case-support.js';
import { english, navigate, logout, noHorizontalOverflow, screenshot, watchBrowser } from './support.js';

// Official browser-CI gate against a fresh loopback server, never a deployment.
// Mail receipt alone is simulated. Enrollment, verification, permissions, sessions,
// cases and diagnostics use actual HTTP/SQLite; no product responses are replaced.
// Discovery/source checks are not browser acceptance. Do not launch Chromium in
// the restricted authoring environment. No real mail or model provider is used.
const LEGACY = 'synthetic-admin-unverified';
const EMAIL = 'synthetic-delegated-admin@example.invalid';
const test = base.extend({
  accountApp: async ({}, use, testInfo) => {
    const app = await startBrowserFixture({ simulatedMail: true, legacyUsers: [LEGACY] });
    testInfo.annotations.push({ type: 'account-administration-evidence', description: 'Disposable synthetic accounts; actual HTTP/SQLite and compiled UI; simulated accepted mail transport, not genuine delivery; no model requests or production grants.' });
    try { await use(app); } finally { await app.stop(); }
  }
});
// Never retain token-bearing enrollment traces, even for disposable fixtures.
test.use({ trace: 'off' });

const card = (page, title) => page.locator('[data-slot="card"]').filter({ has: page.getByText(title, { exact: true }) });
const accountsPanel = page => card(page, 'Accounts and administrator access');
const diagnosticsPanel = page => card(page, 'Bounded operational status');
const accountRow = (page, username) => page.getByRole('list', { name: 'Account directory', exact: true })
  .getByRole('listitem').filter({ has: page.getByRole('heading', { name: username, exact: true }) });
const confirmation = page => page.getByRole('region', { name: 'Confirm access change', exact: true });
const settingsButton = page => page.getByRole('button', { name: 'Account and settings', exact: true });

function observeAdministration(page) {
  const requests = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/admin/') || path === '/api/settings' || path === '/api/settings/test') {
      requests.push({ path, method: request.method(), ...(request.method() === 'PUT' ? { body: request.postDataJSON() } : {}) });
    }
  });
  return requests;
}

async function ownerControlsAbsent(page) {
  await expect(accountsPanel(page)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Account directory', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Model settings', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Grant|Revoke) administrator access:/u })).toHaveCount(0);
}

test('owner confirms grant/revoke; delegated diagnostics stay bounded and ordinary accounts stay private', async ({ page, browser, accountApp: app }, testInfo) => {
  test.setTimeout(120000);
  const cleanOwner = await watchBrowser(page), ownerRequests = observeAdministration(page);
  const delegatedContext = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const delegated = await delegatedContext.newPage();
    const cleanDelegated = await watchBrowser(delegated), delegatedRequests = observeAdministration(delegated);
    const mail = await requestRegistration(app, EMAIL);
    const verified = await post(app, '/api/auth/email/verify', { token: mail.token });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ verified: true, authenticated: true, role: 'trial' });

    await signInCustomer(page, app, 'owner');
    const ownerClient = await createCustomer(page, 'Synthetic owner-only customer');
    const ownerCase = await createLinkedCase(page, ownerClient, 'Synthetic owner-only case');
    await signIn(delegated, app, EMAIL);
    const ordinary = await getJson(delegated, app, '/api/status');
    expect(ordinary).toMatchObject({ role: 'trial', email: EMAIL, emailVerified: true, administrator: false,
      canManageAccounts: false, canViewDiagnostics: false, canManageSettings: false });
    const ownClient = await createCustomer(delegated, 'Synthetic delegated customer');
    const ownCase = await createLinkedCase(delegated, ownClient, 'Synthetic delegated case');

    await test.step('Ordinary settings mount no privileged modules or privileged requests', async () => {
      await settingsButton(delegated).press('Enter');
      await expect(delegated).toHaveURL(/#settings$/u);
      await ownerControlsAbsent(delegated);
      await expect(diagnosticsPanel(delegated)).toHaveCount(0);
      await expect(delegated.getByText('Ordinary user', { exact: true })).toBeVisible();
      expect(delegatedRequests).toEqual([]);
      expect((await delegated.request.get(app.origin + '/api/admin/diagnostics')).status()).toBe(403);
      await noHorizontalOverflow(delegated);
      await screenshot(delegated, testInfo, 'ordinary-account-settings-320-en');
    });

    let target;
    const writes = () => ownerRequests.filter(request => request.method === 'PUT');
    await test.step('Owner directory is reachable; owner and unverified legacy rows are immutable', async () => {
      const loaded = responseFor(page, '/api/admin/accounts', 'GET');
      await settingsButton(page).press('Enter');
      const result = await loaded;
      expect(result.status()).toBe(200);
      const { accounts } = await result.json();
      expect(accounts).toHaveLength(3);
      target = accounts.find(account => account.email === EMAIL);
      expect(target).toMatchObject({ id: ordinary.userId, role: 'trial', administrator: false,
        canGrantAdministrator: true, capabilityVersion: 0 });
      await expect(accountsPanel(page)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Model settings', exact: true })).toBeVisible();
      await expect(accountRow(page, 'owner')).toContainText('Owner access is fixed and cannot be changed here.');
      await expect(accountRow(page, 'owner').getByRole('button')).toHaveCount(0);
      await expect(accountRow(page, LEGACY)).toContainText('Ask this account to bind and verify an email');
      await expect(accountRow(page, LEGACY).getByRole('button')).toHaveCount(0);
      expect((await getJson(page, app, '/api/admin/account-audit')).events).toEqual([]);
    });

    await test.step('Keyboard cancel sends no PUT; leaving settings clears pending permission intent', async () => {
      const grant = page.getByRole('button', { name: `Grant administrator access: ${target.username}`, exact: true });
      await grant.press('Enter');
      await expect(confirmation(page).getByRole('heading', { name: 'Confirm access change', exact: true })).toBeFocused();
      await expect(confirmation(page)).toContainText(EMAIL);
      await expect(confirmation(page)).toContainText('Other users’ records, provider settings, and account grants remain inaccessible.');
      await page.keyboard.press('Tab');
      await expect(confirmation(page).getByRole('button', { name: 'Confirm grant', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(confirmation(page).getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(confirmation(page)).toHaveCount(0);
      await expect(grant).toBeFocused();
      expect(writes()).toEqual([]);
      await grant.press('Space');
      await expect(confirmation(page)).toBeVisible();
      await navigate(page, 'Conversation');
      await expect(accountsPanel(page)).toHaveCount(0);
      const reread = responseFor(page, '/api/admin/accounts', 'GET');
      await settingsButton(page).press('Enter');
      expect((await reread).status()).toBe(200);
      await expect(grant).toBeEnabled();
      await expect(confirmation(page)).toHaveCount(0);
      expect(writes()).toEqual([]);
      expect((await getJson(page, app, '/api/admin/account-audit')).events).toEqual([]);
    });

    const permissionPath = `/api/admin/accounts/${target.id}/administrator`;
    await test.step('Explicit owner confirmation sends one desired-state grant and rereads the roster', async () => {
      await page.setViewportSize({ width: 320, height: 844 });
      await page.getByRole('button', { name: `Grant administrator access: ${target.username}`, exact: true }).press('Enter');
      await noHorizontalOverflow(page);
      await screenshot(page, testInfo, 'owner-grant-confirmation-320-en');
      const changed = responseFor(page, permissionPath, 'PUT'), reread = responseFor(page, '/api/admin/accounts', 'GET');
      await confirmation(page).getByRole('button', { name: 'Confirm grant', exact: true }).press('Enter');
      const result = await changed;
      expect(result.status()).toBe(200);
      expect(await result.json()).toMatchObject({ changed: true, account: { id: target.id, role: 'trial', administrator: true, capabilityVersion: 1 } });
      expect((await reread).status()).toBe(200);
      await expect(accountRow(page, target.username)).toContainText('Administrator');
      await expect(page.getByRole('button', { name: `Revoke administrator access: ${target.username}`, exact: true })).toBeEnabled();
      expect(writes()).toEqual([{ path: permissionPath, method: 'PUT', body: { administrator: true, expectedVersion: 0 } }]);
    });

    await test.step('The existing ordinary cookie gains diagnostics, never provider/roster or another user’s records', async () => {
      expect(await getJson(delegated, app, '/api/status')).toMatchObject({ userId: ordinary.userId, role: 'trial',
        administrator: true, canViewDiagnostics: true, canManageAccounts: false, canManageSettings: false });
      const loaded = responseFor(delegated, '/api/admin/diagnostics', 'GET');
      await delegated.getByRole('button', { name: 'Refresh status', exact: true }).press('Enter');
      const result = await loaded;
      expect(result.status()).toBe(200);
      const diagnostics = await result.json();
      expect(Object.keys(diagnostics).sort()).toEqual(['activeRequests', 'liveEnabled', 'model', 'pdfEnabled', 'uptimeSeconds', 'workbookEnabled']);
      expect(Object.keys(diagnostics.activeRequests).sort()).toEqual(['chat', 'extraction', 'pdf', 'workbook']);
      expect(diagnostics).toMatchObject({ model: 'deepseek-flash', liveEnabled: false });
      await expect(diagnosticsPanel(delegated)).toContainText('deepseek-flash');
      await expect(delegated.getByText('Administrator', { exact: true })).toBeVisible();
      await ownerControlsAbsent(delegated);
      expect(delegatedRequests.every(request => request.path === '/api/admin/diagnostics' && request.method === 'GET')).toBe(true);
      for (const path of ['/api/admin/accounts', '/api/admin/account-audit', '/api/admin/telemetry', '/api/settings']) {
        expect((await delegated.request.get(app.origin + path)).status(), path).toBe(403);
      }
      for (const path of [`/api/clients/${ownerClient.id}`, `/api/cases/${ownerCase.id}`]) {
        expect((await delegated.request.get(app.origin + path)).status(), path).toBe(404);
      }
      expect((await getJson(delegated, app, `/api/cases/${ownCase.id}`)).case.id).toBe(ownCase.id);
      await noHorizontalOverflow(delegated);
      await screenshot(delegated, testInfo, 'delegated-diagnostics-320-en');
      await delegated.getByRole('button', { name: '切换界面为中文', exact: true }).press('Enter');
      await expect(card(delegated, '有限运行状态')).toBeVisible();
      await noHorizontalOverflow(delegated);
      await screenshot(delegated, testInfo, 'delegated-diagnostics-320-zh');
      await english(delegated);
    });

    await test.step('Explicit revocation immediately denies the existing cookie; refresh removes diagnostics', async () => {
      await page.getByRole('button', { name: `Revoke administrator access: ${target.username}`, exact: true }).press('Enter');
      await expect(confirmation(page)).toContainText('keep access to its own cases and files');
      const changed = responseFor(page, permissionPath, 'PUT'), reread = responseFor(page, '/api/admin/accounts', 'GET');
      await confirmation(page).getByRole('button', { name: 'Confirm revocation', exact: true }).press('Enter');
      const result = await changed;
      expect(result.status()).toBe(200);
      expect(await result.json()).toMatchObject({ changed: true, account: { id: target.id, role: 'trial', administrator: false, capabilityVersion: 2 } });
      expect((await reread).status()).toBe(200);
      await expect(page.getByRole('button', { name: `Grant administrator access: ${target.username}`, exact: true })).toBeEnabled();
      expect(writes()).toEqual([
        { path: permissionPath, method: 'PUT', body: { administrator: true, expectedVersion: 0 } },
        { path: permissionPath, method: 'PUT', body: { administrator: false, expectedVersion: 1 } }
      ]);
      // Stale UI still cannot read: no re-login or new browser cookie is involved.
      const denied = responseFor(delegated, '/api/admin/diagnostics', 'GET');
      await diagnosticsPanel(delegated).getByRole('button', { name: 'Refresh operational status', exact: true }).press('Enter');
      expect((await denied).status()).toBe(403);
      await expect(diagnosticsPanel(delegated).getByRole('alert')).toHaveText('Operational status could not be loaded. Refresh manually to try again.');
      await expect(diagnosticsPanel(delegated)).not.toContainText('deepseek-flash');
      await delegated.getByRole('button', { name: 'Refresh status', exact: true }).press('Enter');
      await expect(diagnosticsPanel(delegated)).toHaveCount(0);
      await ownerControlsAbsent(delegated);
      expect(await getJson(delegated, app, '/api/status')).toMatchObject({ userId: ordinary.userId, role: 'trial', administrator: false, canViewDiagnostics: false });
      expect((await getJson(delegated, app, `/api/cases/${ownCase.id}`)).case.id).toBe(ownCase.id);
      const audit = await getJson(page, app, '/api/admin/account-audit');
      expect(audit.events.map(({ actorUserId, targetUserId, administrator, version }) => ({ actorUserId, targetUserId, administrator, version }))).toEqual([
        { actorUserId: 'owner', targetUserId: target.id, administrator: false, version: 2 },
        { actorUserId: 'owner', targetUserId: target.id, administrator: true, version: 1 }
      ]);
    });

    await test.step('Owner sign-out and legacy sign-in cannot retain the owner roster', async () => {
      await navigate(page, 'Conversation'); // One visible shell sign-out control.
      await logout(page);
      const before = ownerRequests.length;
      await signIn(page, app, LEGACY);
      await settingsButton(page).press('Enter');
      await ownerControlsAbsent(page);
      await expect(diagnosticsPanel(page)).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(EMAIL);
      expect(ownerRequests.slice(before)).toEqual([]);
      await noHorizontalOverflow(page);
      await screenshot(page, testInfo, 'legacy-account-after-owner-signout-320-en');
    });
    await cleanOwner();
    await cleanDelegated();
  } finally { await delegatedContext.close(); }
});
