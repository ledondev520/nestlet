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
  const response = await page.goto('/next/#components');
  const nonce = await page.locator('meta[name="nestlet-style-nonce"]').getAttribute('content');
  expect(nonce).toMatch(/^[A-Za-z0-9+/]{24}$/u);
  expect(response.headers()['content-security-policy']).toContain(`style-src 'self' 'nonce-${nonce}'`);
  const trigger = page.getByRole('button', { name: '检查对话框' });
  const scrollState = () => page.evaluate(() => ({
    body: getComputedStyle(document.body).overflowY,
    root: getComputedStyle(document.documentElement).overflowY
  }));
  const originalScroll = await scrollState();
  // Reopening must not leak scroll locks or lose focus behavior. Exercise both
  // keyboard dismissal and the actual close control under unchanged strict CSP.
  for (const closeWith of ['Escape', 'button']) {
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '组件检查' })).toBeVisible();
    await expect.poll(async () => Object.values(await scrollState()).includes('hidden')).toBe(true);
    const scrollStyleNonces = await page.locator('style').evaluateAll(styles => styles
      .filter(style => style.textContent.includes('body[data-scroll-locked]'))
      .map(style => style.nonce));
    expect(scrollStyleNonces.length, 'The official modal scroll-lock stylesheet is present').toBeGreaterThan(0);
    expect(scrollStyleNonces.every(value => value === nonce), 'Only this document’s trusted nonce permits the modal style').toBe(true);
    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    }
    if (closeWith === 'Escape') await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect.poll(scrollState).toEqual(originalScroll);
  }
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


test('root and alias HTML use fresh style-only nonces while legacy and script policy stay strict', async ({ request }) => {
  const seen = new Set();
  for (const path of ['/', '/', '/next/', '/next/', '/next']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    const nonce = /<meta\s+name=["']nestlet-style-nonce["']\s+content=["']([^"']+)["']/u.exec(html)?.[1];
    expect(nonce, `Fresh trusted-style meta at ${path}`).toMatch(/^[A-Za-z0-9+/]{24}$/u);
    expect(seen.has(nonce), 'Each HTML response needs an unpredictable, unreused nonce').toBe(false);
    seen.add(nonce);
    expect(html).not.toContain('__NESTLET_STYLE_NONCE__');
    const csp = response.headers()['content-security-policy'];
    const directives = csp.split(';').map(value => value.trim());
    expect(directives.find(value => value.startsWith('script-src '))).toBe("script-src 'self'");
    expect(directives.find(value => value.startsWith('style-src '))).toBe(`style-src 'self' 'nonce-${nonce}'`);
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(response.headers()['cache-control']).toContain('no-store');
  }
  const legacy = await request.get('/legacy/');
  expect(legacy.status()).toBe(200);
  expect(await legacy.text()).not.toContain('nestlet-style-nonce');
  expect(legacy.headers()['content-security-policy']).not.toContain("'nonce-");
  expect(legacy.headers()['content-security-policy']).not.toContain('unsafe-inline');
});
