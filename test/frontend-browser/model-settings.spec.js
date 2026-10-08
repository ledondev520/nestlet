import { test, expect } from '@playwright/test';
import { noHorizontalOverflow } from './support.js';

// Synthetic API fixtures only. Never submit a real key or contact a provider.
test.use({ trace: 'off' });
const owner = { authenticated: true, userId: 'synthetic-model-owner', username: 'owner', role: 'owner', canManageSettings: true, authConfigured: true, csrfToken: 'synthetic-csrf', secureSettings: true, secureLogin: true };
async function fixture(page, { role = 'owner', failSave = false } = {}) {
  const writes = [];
  let settings = { configured: false, liveEnabled: false, secureSettings: true, keyStorage: 'none' };
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST') writes.push({ path, body: request.postDataJSON() });
    let body = path === '/api/status' ? { ...owner, role, canManageSettings: role === 'owner' } : path === '/api/settings' ? settings : { conversations: [], customers: [], cases: [], assets: [] };
    if (path === '/api/settings' && request.method() === 'POST') {
      if (failSave) return route.fulfill({ status: 503, json: { code: 'PROVIDER_UNAVAILABLE', error: 'synthetic-untrusted-provider-detail' } });
      settings = { ...settings, configured: true, liveEnabled: request.postDataJSON().enableLive, keyStorage: 'server-memory' };
      body = settings;
    }
    if (path === '/api/settings/test') body = { ok: true, model: 'deepseek-flash', check: 'model-access', chatCompletionTested: false, verifiedAt: '2026-10-08T00:00:00.000Z' };
    await route.fulfill({ json: body });
  });
  return writes;
}
for (const [lang, width] of [['en', 1280], ['zh', 390], ['en', 320]]) test(`key-only popover: keyboard, dismissal, save and layout (${lang}/${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const writes = await fixture(page);
  await page.goto('/');
  if (lang === 'en') await page.getByRole('button', { name: 'Switch interface to English' }).click();
  const trigger = page.getByRole('button', { name: lang === 'zh' ? '模型设置' : 'Model settings', exact: true });
  await trigger.hover(); await expect(page.getByRole('tooltip')).toBeVisible();
  await trigger.focus(); await trigger.press('Enter');
  const popover = page.getByRole('dialog', { name: lang === 'zh' ? '模型设置' : 'Model settings' });
  await expect(popover).toBeVisible();
  const field = popover.locator('input');
  await expect(field).toHaveCount(1); await expect(field).toHaveAttribute('type', 'password'); await expect(field).toHaveValue('');
  await expect(popover).not.toContainText(/https?:|endpoint|端点/i);
  await field.fill('synthetic-key-123456'); expect(writes).toEqual([]);
  await field.press('Escape'); await expect(popover).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await expect(field).toHaveValue('');
  await field.fill('synthetic-key-123456');
  await popover.getByRole('button', { name: lang === 'zh' ? '保存并启用 AI' : 'Save and enable AI' }).click();
  await expect(field).toHaveValue('');
  expect(writes).toEqual([{ path: '/api/settings', body: { apiKey: 'synthetic-key-123456', enableLive: true } }]);
  await expect(popover).toContainText(lang === 'zh' ? '待验证' : 'Not checked');
  await popover.getByRole('button', { name: lang === 'zh' ? '验证模型权限' : 'Verify model access' }).click();
  await expect(popover).toContainText(lang === 'zh' ? '模型访问权限验证通过' : 'Model access verified');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `test-results/model-key-${lang}-${width}.png` });
  await field.fill('synthetic-unsaved-key');
  await page.mouse.click(2, 2);
  await expect(popover).toHaveCount(0);
  await trigger.click(); await expect(field).toHaveValue('');
  await page.evaluate(() => { window.location.hash = 'settings'; });
  await expect(popover).toHaveCount(0);
  await page.locator('main').getByRole('button', { name: lang === 'zh' ? '模型设置' : 'Model settings', exact: true }).click();
  await expect(popover.locator('input')).toHaveValue('');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
test('ordinary account never gets model settings and failed save keeps secrets out of errors', async ({ page }) => {
  await fixture(page, { role: 'trial' }); await page.goto('/');
  await expect(page.getByRole('button', { name: '模型设置', exact: true })).toHaveCount(0);
  await page.unroute('**/api/**'); await fixture(page, { failSave: true }); await page.reload();
  await page.getByRole('button', { name: '模型设置', exact: true }).click();
  const popover = page.getByRole('dialog', { name: '模型设置' });
  await popover.locator('input').fill('synthetic-key-123456');
  await popover.getByRole('button', { name: '保存并启用 AI' }).click();
  await expect(popover.getByRole('alert')).toBeVisible(); await expect(popover.locator('input')).toHaveCount(0);
  await expect(popover).not.toContainText(/synthetic-key|synthetic-untrusted/);
});
