import { test as base, expect } from '@playwright/test';
import { startBrowserFixture } from '../helpers/browser-fixture.mjs';
import { english, noHorizontalOverflow } from './support.js';

export const EMAIL_PASSWORD = 'Case26';
export const NEW_PASSWORD = 'Next27';
export const ACCEPTED = { accepted: true, authenticated: false, next: 'check-email-if-eligible', retryAfter: 60 };
export const test = base.extend({
  emailApp: async ({}, use, testInfo) => {
    const app = await startBrowserFixture({ simulatedMail: true });
    testInfo.annotations.push({ type: 'mail-evidence', description: 'Simulated accepted DirectMail transport; real Node HTTP and SQLite. No genuine email delivery.' });
    try { await use(app); }
    finally { await app.stop(); }
  }
});
export { expect };

export async function post(app, path, body) {
  return fetch(app.origin + path, { method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export async function requestRegistration(app, email) {
  const response = await post(app, '/api/register', { email, password: EMAIL_PASSWORD, passwordConfirmation: EMAIL_PASSWORD });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual(ACCEPTED);
  return app.mailFor(email, 'verify');
}
export async function enrollThroughHttp(app, email) {
  // Test preparation uses real email enrollment and the single-use verification
  // HTTP endpoint. No user is privately seeded for any email-specific journey.
  const mail = await requestRegistration(app, email);
  const response = await post(app, '/api/auth/email/verify', { token: mail.token });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ verified: true, authenticated: true, role: 'trial' });
  app.endEmailCooldown(email); // Private synthetic cooldown preparation, not elapsed time.
  return mail;
}
export async function visit(page, app, path = '/') {
  await page.goto(app.origin + path); await english(page);
}
export async function signIn(page, app, email, password = EMAIL_PASSWORD) {
  await visit(page, app);
  await page.getByLabel('Email or existing username', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/login' && value.request().method() === 'POST');
  await page.getByLabel('Password', { exact: true }).press('Enter');
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
}
export async function registerForm(page, app, email) {
  await visit(page, app);
  await page.getByRole('group', { name: 'Account', exact: true }).getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(EMAIL_PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(EMAIL_PASSWORD);
}
export async function requestResetForm(page, app, email) {
  await visit(page, app);
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).press('Enter');
  await page.getByLabel('Email', { exact: true }).fill(email);
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/auth/password/forgot' && value.request().method() === 'POST');
  await page.getByLabel('Email', { exact: true }).press('Enter');
  const result = await response;
  expect(result.status()).toBe(202); expect(await result.json()).toEqual(ACCEPTED);
  await expect(page.getByText('Check your inbox if eligible', { exact: true })).toBeVisible();
  return app.mailFor(email, 'reset');
}
export async function watchEmailLeaks(page) {
  const consoleMessages = [], requests = [];
  page.on('console', entry => consoleMessages.push(entry.text()));
  page.on('pageerror', entry => consoleMessages.push(entry.message));
  page.on('request', request => requests.push({ url: request.url(), referrer: request.headers().referer || '',
    telemetry: new URL(request.url()).pathname.includes('telemetry') ? request.postData() || '' : '' }));
  await page.addInitScript(() => {
    let token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
    // A link can arrive as a same-document fragment navigation. Observe the secret
    // just before the app scrubs it, retaining it only in this test probe's closure.
    const originalReplace = history.replaceState;
    history.replaceState = function (...args) {
      token = new URLSearchParams(location.hash.slice(1)).get('token') || token;
      return originalReplace.apply(this, args);
    };
    const probe = { effectsBeforeScrub: 0, tokenStorageWrites: 0, tokenConsoleWrites: 0 };
    window.__emailPrivacyProbe = probe;
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      if (location.hash.includes('token=')) probe.effectsBeforeScrub++;
      return originalFetch.apply(this, args);
    };
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      if (location.hash.includes('token=')) probe.effectsBeforeScrub++;
      return originalSend.apply(this, args);
    };
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (token && (String(key).includes(token) || String(value).includes(token))) probe.tokenStorageWrites++;
      return originalSet.apply(this, arguments);
    };
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      const original = console[level];
      console[level] = function (...args) {
        if (token && args.some(value => String(value).includes(token))) probe.tokenConsoleWrites++;
        return original.apply(this, args);
      };
    }
  });
  return async (app, tokens) => {
    expect(await page.evaluate(() => window.__emailPrivacyProbe)).toEqual({ effectsBeforeScrub: 0, tokenStorageWrites: 0, tokenConsoleWrites: 0 });
    const state = await page.evaluate(() => ({ url: location.href, dom: document.documentElement.outerHTML,
      local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
    for (const token of tokens) {
      // Assert booleans so a failing check never prints even synthetic one-time secrets.
      expect(Object.values(state).some(value => value.includes(token)), 'Token absent from URL, DOM, localStorage and sessionStorage').toBe(false);
      expect(consoleMessages.some(value => value.includes(token)), 'No browser-console token').toBe(false);
      expect(requests.some(value => Object.values(value).some(item => item.includes(token))), 'No URL, Referrer or telemetry token').toBe(false);
      expect(app.logs().includes(token), 'No server stdout/stderr token').toBe(false);
    }
  };
}
export async function openLink(page, mail) {
  await page.goto(mail.link); await english(page);
  await expect.poll(() => new URL(page.url()).hash === '', { message: 'One-time fragment scrubbed' }).toBe(true);
  const purpose = new URLSearchParams(new URL(mail.link).hash.slice(1)).get('auth');
  await expect(page.getByRole('button', { name: purpose === 'reset' ? 'Confirm password reset' : 'Confirm email verification', exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
}
