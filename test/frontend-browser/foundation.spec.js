import { test, expect } from '@playwright/test';

test('built JavaScript preview keeps Kimi tokens, bilingual text and escaped input', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/next/#components');
  await expect(page.getByLabel('组件测试名称')).toBeVisible();
  const palette = await page.evaluate(() => ({
    paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
    ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()
  }));
  expect(palette).toEqual({ paper: '#f6f1e6', ink: '#252a20' });
  await page.getByLabel('组件测试名称').fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Switch interface to English' }).click();
  await expect(page.getByLabel('Component test label')).toHaveValue('<img src=x onerror=alert(1)>');
  expect(errors).toEqual([]);
});

test('real shadcn dialog traps focus, closes with Escape and returns focus under production CSP', async ({ page }) => {
  const violations = [];
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.__cspViolations.push(event.violatedDirective));
  });
  await page.goto('/next/#components');
  const trigger = page.getByRole('button', { name: '检查对话框' });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '组件检查' })).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  violations.push(...await page.evaluate(() => window.__cspViolations));
  expect(violations).toEqual([]);
});

test('static frontend assets are allowlisted and source/server files stay private', async ({ request }) => {
  for (const path of ['/next/', '/next/app.js', '/next/index.css']) expect((await request.get(path)).status()).toBe(200);
  for (const path of ['/frontend/main.jsx', '/next/app.js.map', '/components.json', '/server.js', '/next/../server.js']) expect((await request.get(path)).status()).toBe(404);
  const page = await request.get('/next/');
  expect(page.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(page.headers()['content-security-policy']).not.toContain('unsafe-inline');
});
