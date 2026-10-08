import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Public, disposable test-only data. Never point this suite at a deployed service.
export const ENTRY_PATH = process.env.NESTLET_BROWSER_ENTRY_PATH || '/next/';
export const PASSWORD = 'Case26'; // Exactly the supported six-character boundary.
export const SOURCE = [
  'Property: 128 Example Lane Unit B',
  'Owner: Synthetic Property LLC',
  'PHA: Synthetic Housing Office',
  'Case reference: SYN-BROWSER-104',
  'Proposed rent: $2100'
].join('\n');
export const ORIGINAL_NAME = 'synthetic-standalone-original.txt';
export const ORIGINAL_BYTES = Buffer.from('Synthetic standalone original\r\nNot linked to any customer or case.\r\nLiteral text: <img src=x onerror=alert(1)>\r\n', 'utf8');

export async function revealAccountAction(page, name) {
  // The loading header is replaced by the authenticated mobile menu. Choose a
  // control only after the first account-layout decision has committed.
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByRole('status', { name: /^(Connecting|正在连接)$/u })).toHaveCount(0);
  const action = page.getByRole('button', { name, exact: true });
  if (!await action.first().isVisible()) await page.getByRole('button', { name: /^(Account menu|账户菜单)$/u }).click();
  await expect(action.first()).toBeVisible();
  return action.first();
}
export async function switchLanguage(page, lang, keyboard = false) {
  if ((await page.locator('html').getAttribute('lang')) === (lang === 'en' ? 'en' : 'zh-CN')) return;
  const action = await revealAccountAction(page, lang === 'en' ? 'Switch interface to English' : '切换界面为中文');
  if (keyboard) await action.press('Enter'); else await action.click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
}
export async function english(page) { await switchLanguage(page, 'en'); }
export async function accountSettings(page, keyboard = false) {
  const action = await revealAccountAction(page, (await page.locator('html').getAttribute('lang')) === 'en' ? 'Account and settings' : '账户与设置');
  if (keyboard) await action.press('Enter'); else await action.click();
}

// Existing synthetic users were seeded privately by the fixture. This helper
// exercises legacy sign-in only; new email enrollment has its own browser suite.
export async function legacyLogin(page, username) {
  await login(page, username);
  const status = await (await page.request.get('/api/status')).json();
  expect(status).toMatchObject({ authenticated: true, username, role: 'trial', canManageSettings: false, liveEnabled: false });
  return status;
}

export async function login(page, username) {
  await english(page);
  await page.getByLabel('Email or existing username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/login' && value.request().method() === 'POST');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
}

export async function navigate(page, name) {
  await page.getByRole('navigation', { name: /^(Workspace navigation|工作区导航)$/u }).getByRole('button', { name, exact: true }).click();
}

export async function reload(page) {
  const discard = dialog => dialog.accept();
  page.on('dialog', discard);
  try { await page.reload(); } finally { page.off('dialog', discard); }
  await english(page);
}

export async function logout(page, { cancel = false } = {}) {
  const control = await revealAccountAction(page, 'Sign out');
  const dialog = page.waitForEvent('dialog');
  const click = control.click();
  const confirmation = await dialog;
  expect(confirmation.type()).toBe('confirm');
  expect(confirmation.message()).toContain('Sign out of this account?');
  await (cancel ? confirmation.dismiss() : confirmation.accept());
  await click;
  if (cancel) await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  else await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
}

export async function saveCase(page, title, { review = false } = {}) {
  await navigate(page, 'Materials & facts');
  const materials = page.locator('main > section:not([hidden])');
  await materials.getByLabel('Case name', { exact: true }).fill(title);
  await materials.getByLabel('Case source text', { exact: true }).fill(SOURCE);
  if (review) {
    await materials.getByRole('button', { name: 'Organize explicit labels', exact: true }).click();
    await expect(materials.getByLabel('Property address', { exact: true })).toHaveValue('128 Example Lane Unit B');
    const confirmations = materials.getByRole('checkbox', { name: 'I reviewed this fact or its unknown status', exact: true });
    await expect(confirmations).toHaveCount(5);
    for (const checkbox of await confirmations.all()) await checkbox.check();
  }
  await expect(materials.getByRole('button', { name: 'Extract with DeepSeek', exact: true })).toBeDisabled();
  const saved = page.waitForResponse(value => new URL(value.url()).pathname === '/api/cases' && value.request().method() === 'POST');
  await materials.getByRole('button', { name: 'Save case', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const record = (await response.json()).case;
  expect(record).toMatchObject({ title, sourceText: SOURCE, clientId: null });
  await expect(materials.getByText('Case saved.', { exact: true })).toBeVisible();
  return record;
}

export async function openSavedCase(page, title) {
  await navigate(page, 'Customers');
  const archive = page.getByRole('region', { name: 'Saved cases', exact: true });
  await archive.getByRole('button', { name: 'Unassigned', exact: true }).click();
  await archive.getByLabel('Search saved cases', { exact: true }).fill(title);
  await archive.getByRole('button', { name: `Open saved case: ${title}`, exact: true }).click();
  await expect(page).toHaveURL(/#chat$/u);
  await expect(page.locator('[data-feature="chat"]')).toContainText(title);
}

export async function openOriginals(page) {
  const summary = page.locator('summary').filter({ hasText: /^All originals, including unassigned$/u });
  if (!await summary.evaluate(element => element.closest('details').open)) await summary.click();
  return page.locator('[data-slot="card"][aria-label="All originals"]');
}

export async function downloadedBytes(page, click) {
  const result = page.waitForEvent('download');
  await click();
  const download = await result;
  expect(await download.failure()).toBeNull();
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}

// Capture actual browser errors across full navigations; no product/API interception.
export async function watchBrowser(page) {
  const errors = [], violations = [], modelRequests = [];
  await page.exposeFunction('__recordBrowserCsp', directive => violations.push(directive));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      window.__recordBrowserCsp(`${event.violatedDirective}: ${event.blockedURI}`);
    });
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const { pathname, origin } = new URL(request.url());
    if (request.method() === 'POST' && (pathname.startsWith('/api/chat') || pathname === '/api/extract' || pathname === '/api/settings/test' || origin === 'https://api.deepseek.com')) modelRequests.push(pathname);
  });
  return async () => {
    expect(errors, 'No uncaught application errors').toEqual([]);
    expect(violations, 'Strict production CSP must remain intact').toEqual([]);
    expect(modelRequests, 'This suite must not submit model requests').toEqual([]);
  };
}

export async function noHorizontalOverflow(page) {
  const measurement = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // Check controls as well as root scroll width, so overflow:hidden cannot hide failures.
    const clipped = [...document.querySelectorAll('button,input,textarea,select,summary,a')].filter(element => {
      if (!element.getClientRects().length || element.closest('[hidden]')) return false;
      if (getComputedStyle(element).position === 'absolute' && element.offsetWidth <= 1) return false; // Unfocused skip link.
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && (rect.left < -1 || rect.right > width + 1);
    }).map(element => ({ tag: element.tagName, label: element.getAttribute('aria-label') || element.textContent?.slice(0, 80), width: Math.round(element.getBoundingClientRect().width) }));
    return { width, scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), clipped };
  });
  expect(measurement.scroll, JSON.stringify(measurement)).toBeLessThanOrEqual(measurement.width + 1);
  expect(measurement.clipped, 'Visible controls must fit inside the viewport').toEqual([]);
}

export async function screenshot(page, testInfo, name, fullPage = true) {
  const path = testInfo.outputPath(`synthetic-${name}.png`);
  await page.screenshot({ path, fullPage, animations: 'disabled' });
  await testInfo.attach(`Synthetic fixture: ${name}`, { path, contentType: 'image/png' });
}
