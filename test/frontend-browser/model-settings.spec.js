import { accountSettings, switchLanguage } from './support.js';
import { test, expect } from '@playwright/test';
import { noHorizontalOverflow } from './support.js';
import { LANGUAGE_PREFERENCE_KEY } from '../../frontend/lib/language-preference.js';

// Synthetic API fixtures only. Never submit a real key or contact a provider.
test.use({ trace: 'off' });
const owner = { authenticated: true, userId: 'owner', username: 'owner', role: 'owner', canManageSettings: true, authConfigured: true, csrfToken: 'synthetic-csrf', secureSettings: true, persistentSettingsAvailable: true, secureLogin: true };
async function fixture(page, { role = 'owner', failSave = false, initialStatusGate = null, persistenceReady = true } = {}) {
  const writes = [];
  let settings = { configured: false, liveEnabled: false, secureSettings: true, persistentSettingsAvailable: persistenceReady, keyStorage: 'none' };
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/status' && initialStatusGate) await initialStatusGate;
    if (request.method() === 'POST') writes.push({ path, body: request.postDataJSON() });
    let body = path === '/api/status' ? { ...owner, role, userId:role==='owner'?'owner':'11111111-1111-4111-8111-111111111111', canManageSettings: role === 'owner', liveEnabled:settings.liveEnabled } : path === '/api/settings' ? settings : { conversations: [], customers: [], cases: [], assets: [] };
    if (path === '/api/settings' && request.method() === 'POST') {
      if (failSave) return route.fulfill({ status: 503, json: { code: 'PROVIDER_UNAVAILABLE', error: 'synthetic-untrusted-provider-detail' } });
      settings = { ...settings, configured: true, liveEnabled: request.postDataJSON().enableLive, keyStorage: 'encrypted-database', connectionVerifiedAt: '2026-10-08T00:00:00.000Z', check: 'chat-completion', chatCompletionTested: true };
      body = settings;
    }
    if (path === '/api/settings/test') body = { ok: true, model: 'deepseek-flash', check: 'model-access', chatCompletionTested: false, verifiedAt: '2026-10-08T00:00:00.000Z' };
    await route.fulfill({ json: body });
  });
  return writes;
}
for (const [lang, width] of [['en', 1280], ['zh', 390], ['en', 320]]) test(`key-only popover: keyboard, dismissal, save and layout (${lang}/${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let releaseStatus;
  const delayed = width === 320 && lang === 'en';
  const gate = delayed ? new Promise(resolve => { releaseStatus = resolve; }) : null;
  const writes = await fixture(page, { initialStatusGate: gate });
  await page.goto('/');
  if (delayed) {
    await expect(page.getByRole('status', { name: '正在连接', exact: true })).toBeVisible();
    const languageChange = switchLanguage(page, 'en');
    await expect(page.getByRole('button', { name: /^(Account menu|账号菜单)$/u })).toHaveCount(0);
    releaseStatus(); await languageChange;
  } else if (lang === 'en') await switchLanguage(page,'en');
  await expect(page.locator('.wb-topbar')).toBeVisible();
  if(width<960)expect((await page.locator('.wb-topbar').boundingBox()).height).toBeLessThanOrEqual(64);
  await page.locator('.chat-input').fill('Synthetic question retained during model setup.');
  await expect(page.locator('.chat-composer button[type="submit"]')).toBeDisabled();
  const trigger = page.getByRole('button', { name: lang === 'zh' ? "助手设置" : 'Model settings', exact: true });
  await trigger.hover(); await expect(page.getByRole('tooltip')).toBeVisible();
  await trigger.focus(); await trigger.press('Enter');
  const popover = page.getByRole('dialog', { name: lang === 'zh' ? "助手设置" : 'Model settings' });
  await expect(popover).toBeVisible();
  if(width>=960)expect((await popover.boundingBox()).width).toBeLessThanOrEqual(320);
  const field = popover.locator('input');
  await expect(field).toHaveCount(1); await expect(field).toHaveAttribute('type', 'password'); await expect(field).toHaveValue('');
  await expect(popover).not.toContainText(/https?:|endpoint|端点/i);
  await popover.locator('summary').click();
  await expect(popover.getByText(lang==='zh'?"保存时会检查一次，成功后启用助手。\n检查失败会保留原有密钥。\n检查会消耗少量模型额度。":'Save checks the key once and enables AI on success. A failed check keeps your previous key. Verification uses a small amount of model quota.',{exact:true})).toBeVisible();
  await popover.locator('summary').click();
  await expect(popover.locator('details > div')).toBeHidden();
  await field.fill('synthetic-key-123456'); expect(writes).toEqual([]);
  await field.press('Escape'); await expect(popover).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await expect(field).toHaveValue('');
  await field.fill('synthetic-key-123456');
  await popover.getByRole('button', { name: lang === 'zh' ? '保存' : 'Save' }).click();
  await expect(field).toHaveValue('');
  expect(writes).toEqual([{ path: '/api/settings', body: { apiKey: 'synthetic-key-123456', enableLive: true } }]);
  await expect(popover).toContainText(lang === 'zh' ? '助手调用检查通过。' : 'Model response verified');
  await expect(popover.getByRole('button', { name: /检查权限|验证模型|Verify model|测试连接|Test connection/ })).toHaveCount(0);
  expect(writes).toHaveLength(1);
  await expect(page.locator('.chat-composer button[type="submit"]')).toBeEnabled();
  await expect(page.locator('.chat-input')).toHaveValue('Synthetic question retained during model setup.');
  await expect(page.locator('[data-feature="chat"]')).not.toContainText(lang==='zh'?'请先在设置中连接 DeepSeek。':'Connect DeepSeek in Settings first.');
  if(width>=960)expect((await popover.boundingBox()).height).toBeLessThanOrEqual(300);
  await expect(popover.locator('[data-slot="card"]')).toHaveCount(0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `test-results/model-key-${lang}-${width}.png` });
  await popover.locator('summary').click();
  await expect(popover).toContainText(lang==='zh'?'连接密钥已加密保存。':'The connection key is stored encrypted');
  await expect(popover).toContainText(lang==='zh'?'服务重启后仍可使用。':'remains available after a service restart');
  await expect(popover).not.toContainText(lang==='zh'?'需重新填写密钥':'Re-enter the API key after a service restart');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `test-results/model-key-persistent-${lang}-${width}.png` });
  await popover.locator('summary').click();
  await field.fill('synthetic-unsaved-key');
  await page.mouse.click(2, 2);
  await expect(popover).toHaveCount(0);
  await trigger.click(); await expect(field).toHaveValue('');
  await page.evaluate(() => { window.location.hash = 'settings'; });
  await expect(popover).toHaveCount(0);
  await expect(page.locator('.wb-topbar').getByRole('button', {name:lang==='zh'?"助手设置":'Model settings',exact:true})).toBeVisible();
  await page.getByRole('button', { name: lang === 'zh' ? "助手设置" : 'Model settings', exact: true }).click();
  await expect(popover.locator('input')).toHaveValue('');
  expect(await page.evaluate(() => ({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) }))).toEqual({ local: [[LANGUAGE_PREFERENCE_KEY, lang]], session: [] });
});
test('ordinary account never gets model settings and failed save keeps secrets out of errors', async ({ page }) => {
  await fixture(page, { role: 'trial' }); await page.goto('/');
  await expect(page.getByRole('button', { name: "助手设置", exact: true })).toHaveCount(0);
  await page.unroute('**/api/**'); await fixture(page, { failSave: true }); await page.reload();
  await page.getByRole('button', { name: "助手设置", exact: true }).click();
  const popover = page.getByRole('dialog', { name: "助手设置" });
  await popover.locator('input').fill('synthetic-key-123456');
  await popover.getByRole('button', { name: '保存' }).click();
  await expect(popover.getByRole('alert')).toBeVisible(); await expect(popover.locator('input')).toHaveValue('');
  await expect(popover).not.toContainText(/synthetic-key|synthetic-untrusted/);
});

test('missing secure storage blocks key entry before any model-settings write',async({page})=>{
 const writes=await fixture(page,{persistenceReady:false});await page.goto('/');
 await page.getByRole('button',{name:'助手设置',exact:true}).click();const popover=page.getByRole('dialog',{name:'助手设置'});
 await expect(popover.locator('input')).toHaveCount(0);await expect(popover).toContainText('安全保存尚未就绪');expect(writes).toEqual([]);
 await page.screenshot({path:'test-results/model-storage-unavailable-zh.png'});
});
