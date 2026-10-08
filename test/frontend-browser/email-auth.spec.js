import { test, expect, EMAIL_PASSWORD, NEW_PASSWORD, ACCEPTED, post, requestRegistration, enrollThroughHttp, visit, signIn, registerForm, requestResetForm, watchEmailLeaks, openLink } from './email-support.js';
import { english, logout, noHorizontalOverflow, screenshot, watchBrowser } from './support.js';
import { startBrowserFixture } from '../helpers/browser-fixture.mjs';

// Links and passwords are disposable public fixtures, but do not retain token-bearing
// navigation/POST traces. Screenshots are taken only after fragment scrub/field clear.
test.use({ trace: 'off' });

test('required email registration → explicit verification → signed-in workspace without another login; generic responses and single use', async ({ page, emailApp }, testInfo) => {
  test.setTimeout(120000); // Includes the real 60-second UI resend cooldown.
  const app = emailApp, email = 'synthetic-enrollment@example.invalid';
  const clean = await watchBrowser(page), privateState = await watchEmailLeaks(page);
  const claims = [], registrations = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/auth/email/verify' && request.method() === 'POST') claims.push(true);
    if (new URL(request.url()).pathname === '/api/register' && request.method() === 'POST') registrations.push(true);
  });
  const obsolete = await post(app, '/api/register', { username: 'new-user-must-not-bypass-email', password: EMAIL_PASSWORD, passwordConfirmation: EMAIL_PASSWORD });
  expect(obsolete.status).toBe(400);
  expect((await obsolete.json()).code).toBe('REGISTRATION_INVALID');
  await page.setViewportSize({ width: 320, height: 844 });
  await registerForm(page, app, email);
  await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0);
  await page.getByLabel('Confirm password', { exact: true }).fill('Wrong6');
  await page.getByLabel('Confirm password', { exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toHaveText('The passwords do not match');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(EMAIL_PASSWORD);
  expect(registrations).toHaveLength(0);
  await page.getByRole('button', { name: '切换界面为中文', exact: true }).click();
  await expect(page.getByLabel('邮箱', { exact: true })).toHaveValue(email);
  await noHorizontalOverflow(page); await english(page);
  await page.getByLabel('Confirm password', { exact: true }).fill(EMAIL_PASSWORD);
  const sent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/register' && response.request().method() === 'POST');
  await page.getByLabel('Confirm password', { exact: true }).press('Enter');
  const result = await sent;
  expect(result.status()).toBe(202); expect(await result.json()).toEqual(ACCEPTED);
  expect(await result.headerValue('set-cookie')).toBeNull();
  expect(registrations).toHaveLength(1);
  await expect(page.getByText('Check your inbox if eligible', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend verification email', exact: true })).toBeDisabled();
  await expect(page.getByText(/seconds until another request/u)).toBeVisible();
  expect((await (await page.request.get(app.origin + '/api/status')).json()).authenticated).toBe(false);
  const firstMail = await app.mailFor(email, 'verify');
  expect(app.withDatabase(db => db.prepare('SELECT count(*) AS n FROM email_identities WHERE email=?').get(email).n)).toBe(0);
  const premature = await post(app, '/api/login', { email, password: EMAIL_PASSWORD }); expect(premature.status).toBe(401);
  const suppressed = await post(app, '/api/auth/email/resend', { email });
  expect(suppressed.status).toBe(202); expect(await suppressed.json()).toEqual(ACCEPTED);
  expect(app.mailCount(email, 'verify')).toBe(1);
  await screenshot(page, testInfo, 'simulated-mail-registration-pending-mobile');
  const resend = page.getByRole('button', { name: 'Resend verification email', exact: true });
  // Deliberately wait real elapsed time; no browser clock or rate-limit bypass.
  await expect(resend).toBeEnabled({ timeout: 65000 });
  const resent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/email/resend');
  await resend.press('Enter');
  const resendResult = await resent;
  expect(resendResult.status()).toBe(202); expect(await resendResult.json()).toEqual(ACCEPTED);
  await expect(resend).toBeDisabled();
  const mail = await app.mailFor(email, 'verify', 1);
  expect((await post(app, '/api/auth/email/verify', { token: firstMail.token })).status).toBe(400);
  await openLink(page, mail);
  await expect(page.getByRole('button', { name: 'Confirm email verification', exact: true })).toBeEnabled();
  expect(claims).toHaveLength(0); // Opening/prefetching the link does not consume it.
  await privateState(app, [mail.token]);
  const verified = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/email/verify');
  await page.getByRole('button', { name: 'Confirm email verification', exact: true }).press('Enter');
  expect((await verified).status()).toBe(200);
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  expect(claims).toHaveLength(1);
  expect((await (await page.request.get(app.origin + '/api/status')).json()).authenticated).toBe(true);
  await screenshot(page, testInfo, 'simulated-mail-verification-signed-in-mobile');
  const status = await (await page.request.get(app.origin + '/api/status')).json();
  expect(status).toMatchObject({ authenticated: true, role: 'trial', email, emailVerified: true, canManageSettings: false });
  await logout(page);
  await openLink(page, mail);
  const replay = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/email/verify');
  await page.getByRole('button', { name: 'Confirm email verification', exact: true }).click();
  expect((await replay).status()).toBe(400);
  await expect(page.getByRole('alert')).toBeVisible();
  app.endEmailCooldown(email);
  const existing = await post(app, '/api/register', { email, password: EMAIL_PASSWORD, passwordConfirmation: EMAIL_PASSWORD });
  expect(existing.status).toBe(202); expect(await existing.json()).toEqual(ACCEPTED);
  const unknown = await post(app, '/api/auth/password/forgot', { email: 'unknown@example.invalid' });
  expect(unknown.status).toBe(202); expect(await unknown.json()).toEqual(ACCEPTED);
  await privateState(app, [firstMail.token, mail.token]); await clean();
});

test('forgot/reset UI preserves invalid input, invalidates active sessions and rejects reset-token replay', async ({ page, browser, emailApp }, testInfo) => {
  const app = emailApp, email = 'synthetic-recovery@example.invalid';
  const registration = await enrollThroughHttp(app, email);
  await signIn(page, app, email);
  const activeSession = await (await page.request.get(app.origin + '/api/status')).json();
  expect(activeSession.authenticated).toBe(true);
  const recoveryContext = await browser.newContext();
  const recovery = await recoveryContext.newPage();
  try {
    await recovery.setViewportSize({ width: 390, height: 844 });
    const clean = await watchBrowser(recovery), privateState = await watchEmailLeaks(recovery);
    const reset = await requestResetForm(recovery, app, email);
    await expect(recovery.getByRole('button', { name: 'Request reset link', exact: true })).toBeDisabled();
    await openLink(recovery, reset);
    const resets = [];
    recovery.on('request', request => { if (new URL(request.url()).pathname === '/api/auth/password/reset' && request.method() === 'POST') resets.push(true); });
    await recovery.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
    await recovery.getByLabel('Confirm password', { exact: true }).fill('Wrong6');
    await recovery.getByLabel('Confirm password', { exact: true }).press('Enter');
    await expect(recovery.getByRole('alert')).toHaveText('The passwords do not match');
    await expect(recovery.getByLabel('Password', { exact: true })).toHaveValue(NEW_PASSWORD);
    await expect(recovery.getByLabel('Confirm password', { exact: true })).toHaveValue('Wrong6');
    expect(resets).toHaveLength(0);
    await recovery.getByLabel('Confirm password', { exact: true }).fill(NEW_PASSWORD);
    const result = recovery.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/password/reset');
    await recovery.getByLabel('Confirm password', { exact: true }).press('Enter');
    expect((await result).status()).toBe(200);
    await expect(recovery.getByText('Password reset. Sign in again', { exact: true })).toBeVisible();
    expect(resets).toHaveLength(1);
    expect((await (await page.request.get(app.origin + '/api/status')).json()).authenticated).toBe(false);
    expect((await page.request.get(app.origin + '/api/cases')).status()).toBe(401);
    const oldPassword = await post(app, '/api/login', { email, password: EMAIL_PASSWORD }); expect(oldPassword.status).toBe(401);
    await screenshot(recovery, testInfo, 'simulated-mail-password-reset-mobile');
    await privateState(app, [registration.token, reset.token]);
    await signIn(recovery, app, email, NEW_PASSWORD); await logout(recovery);
    await openLink(recovery, reset);
    await recovery.getByLabel('Password', { exact: true }).fill('Again8');
    await recovery.getByLabel('Confirm password', { exact: true }).fill('Again8');
    const replay = recovery.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/password/reset');
    await recovery.getByLabel('Confirm password', { exact: true }).press('Enter');
    expect((await replay).status()).toBe(400); await expect(recovery.getByRole('alert')).toBeVisible();
    await privateState(app, [reset.token]); await clean();
  } finally { await recoveryContext.close(); }
});

test('invalid and privately aged expired verification/reset links fail without activating or changing credentials', async ({ page, emailApp }, testInfo) => {
  const app = emailApp, privateState = await watchEmailLeaks(page);
  testInfo.annotations.push({ type: 'expiry-evidence', description: 'Expiry timestamps aged directly in disposable SQLite; actual server rejection, not real elapsed TTL.' });
  const expired = await requestRegistration(app, 'synthetic-expired@example.invalid');
  expect(app.expireToken(expired.token)).toBe(1);
  await openLink(page, expired);
  const result = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/email/verify');
  await page.getByRole('button', { name: 'Confirm email verification', exact: true }).click();
  expect((await result).status()).toBe(400); await expect(page.getByRole('alert')).toBeVisible();
  expect((await post(app, '/api/login', { email: expired.email, password: EMAIL_PASSWORD })).status).toBe(401);
  const resetEmail = 'synthetic-expired-reset@example.invalid';
  await enrollThroughHttp(app, resetEmail);
  expect((await post(app, '/api/auth/password/forgot', { email: resetEmail })).status).toBe(202);
  const reset = await app.mailFor(resetEmail, 'reset'); expect(app.expireToken(reset.token)).toBe(1);
  await openLink(page, reset);
  await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(NEW_PASSWORD);
  const denied = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/password/reset');
  await page.getByLabel('Confirm password', { exact: true }).press('Enter');
  expect((await denied).status()).toBe(400); await expect(page.getByRole('alert')).toBeVisible();
  expect((await post(app, '/api/login', { email: resetEmail, password: EMAIL_PASSWORD })).status).toBe(200);
  const missing = { link: app.origin + '/#auth=verify&token=' + 'A'.repeat(43), token: 'A'.repeat(43) };
  await openLink(page, missing);
  const invalid = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/email/verify');
  await page.getByRole('button', { name: 'Confirm email verification', exact: true }).click();
  expect((await invalid).status()).toBe(400); await expect(page.getByRole('alert')).toBeVisible();
  await page.goto(app.origin + '/#auth=reset&token=malformed'); await english(page);
  await expect(page.getByRole('button', { name: 'Confirm password reset', exact: true })).toHaveCount(0);
  expect(new URL(page.url()).hash === '', 'No token remains in the address bar').toBe(true);
  await privateState(app, [expired.token, reset.token, missing.token]);
});

test('email pages retain keyboard/mobile usability, preserve address, and clear abandoned links on Back/Forward', async ({ page, emailApp }, testInfo) => {
  const app = emailApp, email = 'synthetic-mobile-email@example.invalid';
  const mail = await requestRegistration(app, email), privateState = await watchEmailLeaks(page);
  const claims = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/auth/email/verify' && request.method() === 'POST') claims.push(true); });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await registerForm(page, app, email);
    for (const language of ['zh', 'en']) {
      if (language === 'zh') await page.getByRole('button', { name: '切换界面为中文', exact: true }).press('Enter');
      else await english(page);
      await expect(page.getByLabel(language === 'zh' ? '邮箱' : 'Email', { exact: true })).toHaveValue(email);
      await noHorizontalOverflow(page);
    }
    await page.getByRole('button', { name: 'Return to sign in', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).press('Enter');
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
    await noHorizontalOverflow(page);
    await screenshot(page, testInfo, `simulated-mail-mobile-${width}-recovery-form`);
  }
  await openLink(page, mail);
  await expect(page.getByRole('button', { name: 'Confirm email verification', exact: true })).toBeVisible();
  // Scrubbing a hash can create adjacent identical '/' history entries. Traverse
  // while the secret is LIVE: closing first would hide a navigation-clearing bug.
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Confirm email verification', exact: true })).toHaveCount(0);
  await page.goForward(); await english(page);
  await expect(page.getByRole('button', { name: 'Confirm email verification', exact: true })).toHaveCount(0);
  expect(new URL(page.url()).hash === '', 'No token remains in the address bar').toBe(true);
  expect(claims).toHaveLength(0);
  // A deliberate fresh opening can be closed explicitly without claiming it.
  await openLink(page, mail);
  await page.getByRole('button', { name: 'Close link page', exact: true }).press('Enter');
  await expect(page.getByLabel('Email or existing username', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm email verification', exact: true })).toHaveCount(0);
  expect(claims).toHaveLength(0);
  await privateState(app, [mail.token]);
});

test('missing delivery fails closed while privately seeded legacy accounts retain login compatibility', async ({ page }) => {
  const app = await startBrowserFixture({ legacyUsers: ['synthetic-legacy-login'] });
  try {
    await visit(page, app);
    await expect(page.getByRole('group', { name: 'Account', exact: true }).getByRole('button', { name: 'Register', exact: true })).toBeDisabled();
    await expect(page.getByText('Email delivery is not configured or is unavailable. Registration, verification requests, and email recovery are unavailable. Contact the administrator', { exact: true })).toBeVisible();
    const obsolete = await post(app, '/api/register', { username: 'new-name', password: EMAIL_PASSWORD, passwordConfirmation: EMAIL_PASSWORD });
    expect(obsolete.status).toBe(400);
    const blocked = await post(app, '/api/register', { email: 'blocked@example.invalid', password: EMAIL_PASSWORD, passwordConfirmation: EMAIL_PASSWORD });
    expect(blocked.status).toBe(503); expect((await blocked.json()).code).toBe('EMAIL_DELIVERY_UNAVAILABLE');
    await signIn(page, app, 'synthetic-legacy-login');
    const status = await (await page.request.get(app.origin + '/api/status')).json();
    expect(status).toMatchObject({ authenticated: true, username: 'synthetic-legacy-login', emailVerified: false, emailBindingRequired: true });
    await logout(page);
  } finally { await app.stop(); }
});

test('a verification link opened in a separate browser context signs in only that context, once', async ({ page, browser, emailApp }) => {
  const app = emailApp, email = 'synthetic-cross-browser@example.invalid';
  const mail = await requestRegistration(app, email);
  await visit(page, app);
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage(), claims = [], logins = [];
    other.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path === '/api/auth/email/verify' && request.method() === 'POST') claims.push(true);
      if (path === '/api/login') logins.push(true);
    });
    await openLink(other, mail);
    expect(claims).toHaveLength(0);
    expect((await (await other.request.get(app.origin + '/api/status')).json()).authenticated).toBe(false);
    await other.getByRole('button', { name: 'Confirm email verification', exact: true }).dblclick();
    await expect(other.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
    expect(claims).toHaveLength(1); expect(logins).toHaveLength(0);
    const verified = await (await other.request.get(app.origin + '/api/status')).json();
    expect(verified).toMatchObject({ authenticated: true, email, role: 'trial', administrator: false });
    const cookies = await otherContext.cookies(app.origin), session = cookies.find(cookie => cookie.name === 'nestlet_session');
    expect(session.httpOnly).toBe(true); expect(session.sameSite).toBe('Strict');
    expect((await (await page.request.get(app.origin + '/api/status')).json()).authenticated).toBe(false);
    await other.reload(); await english(other);
    await expect(other.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
    await expect(other.getByLabel('Password', { exact: true })).toHaveCount(0);
    expect(new URL(other.url()).hash.includes('token=')).toBe(false);
    await openLink(page, mail);
    await page.getByRole('button', { name: 'Confirm email verification', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await (await page.request.get(app.origin + '/api/status')).json()).authenticated).toBe(false);
  } finally { await otherContext.close(); }
});
