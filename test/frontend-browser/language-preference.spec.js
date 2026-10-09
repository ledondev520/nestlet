import { test, expect } from '@playwright/test';
import { LANGUAGE_PREFERENCE_KEY } from '../../frontend/lib/language-preference.js';

test('language preference survives reload and a new page without storing private content', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch interface to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('html')).toHaveAttribute('lang', 'en');
  await second.getByRole('button', { name: '切换界面为中文' }).click();
  await second.reload();
  await expect(second.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(await second.evaluate(() => Object.entries(localStorage))).toEqual([[LANGUAGE_PREFERENCE_KEY, 'zh']]);
});

test('invalid preferences fall back to Chinese', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, 'unsupported'), LANGUAGE_PREFERENCE_KEY);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

test('denied storage still shows a usable language switch', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch interface to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(errors).toEqual([]);
});
