/** Controlled fetch/React DOM development fixtures. Not a browser or mailbox test. */
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { captureAuthFragment } from './auth-route.js';
let App, server, React, createRoot, SessionProvider, AuthPanel, EmailLinkPanel, SettingsPage, EmailAccount, useSession, root, host;
const originalFetch = globalThis.fetch;
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fixture.invalid/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key], configurable: true, writable: true });
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
before(async () => {
  React = await import('react'); ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true, hmr: false, watch: null, ws: false }, appType: 'custom' });
  ({ SessionProvider, useSession } = await server.ssrLoadModule('/lib/session.jsx'));
  ({ AuthPanel, EmailLinkPanel, SettingsPage } = await server.ssrLoadModule('/features/auth/index.js'));
  ({ EmailAccount } = await server.ssrLoadModule('/features/auth/email-account.jsx'));
  ({ default: App } = await server.ssrLoadModule('/App.jsx'));
});
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; host?.remove(); globalThis.fetch = originalFetch; window.history.replaceState(null, '', '/'); window.localStorage.clear(); });
after(async () => { await server?.close(); dom.window.close(); });
const signedOut = { authenticated: false, authConfigured: true, secureLogin: true, registrationEnabled: true, emailDeliveryConfigured: true };
const ordinary = { ...signedOut, authenticated: true, userId: 'synthetic-account', username: 'old-member', role: 'trial', csrfToken: 'fixture-csrf', email: null, emailVerified: false, emailBindingRequired: true, passwordRecoveryMethod: 'bind-email' };
const accepted = { accepted: true, authenticated: false, next: 'check-email-if-eligible', retryAfter: 60 };
function fixture(status = signedOut, handler = () => ({ body: accepted, code: 202 })) {
  const calls = [];
  globalThis.fetch = async (path, options = {}) => {
    const request = { path, ...options, body: options.body ? JSON.parse(options.body) : null };
    calls.push(request);
    const result = path === '/api/status' ? { body: status } : handler(request);
    return new Response(JSON.stringify(result.body), { status: result.code || 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}
async function render(Component, props = {}) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await React.act(async () => root.render(React.createElement(SessionProvider, null, React.createElement(Component, { lang: 'en', ...props }))));
}
async function click(text) { const button = [...host.querySelectorAll('button')].find(node => node.textContent === text); assert.ok(button, text); await React.act(async () => button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); }
async function input(name, value) { const node = host.querySelector(`[name="${name}"]`); assert.ok(node, name); await React.act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new window.Event('input', { bubbles: true })); }); }
async function submit() { await React.act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }
const posts = calls => calls.filter(call => call.method === 'POST');
function link(mode = 'verify') { window.history.replaceState(null, '', `/#auth=${mode}&token=${'t'.repeat(43)}`); return captureAuthFragment(window); }

test('email login sends email while the old username remains a login-only fallback', async () => {
  const calls = fixture(signedOut, () => ({ body: { code: 'INVALID_CREDENTIALS' }, code: 401 })); await render(AuthPanel);
  await input('username', 'Synthetic@example.invalid'); await input('password', '123456'); await submit();
  assert.deepEqual(posts(calls)[0].body, { email: 'synthetic@example.invalid', password: '123456', rememberMe: false });
  assert.equal(host.querySelector('[name=password]').value, ''); assert.equal(host.querySelector('[name=username]').value, 'Synthetic@example.invalid');
  await input('username', 'old-member'); await input('password', '123456'); await submit();
  assert.deepEqual(posts(calls)[1].body, { username: 'old-member', password: '123456', rememberMe: false });
});
test('unconfigured mail does not fake registration or recovery and preserves existing login', async () => {
  const calls = fixture({ ...signedOut, emailDeliveryConfigured: false, registrationEnabled: false }); await render(AuthPanel);
  assert.match(host.textContent, /Email delivery is not configured/);
  assert.equal([...host.querySelectorAll('button')].find(node => node.textContent === 'Register').disabled, true);
  await click('Forgot password?'); await input('email', 'synthetic@example.invalid'); await submit();
  assert.equal(posts(calls).length, 0); assert.match(host.textContent, /private server terminal/);
  assert.equal([...host.querySelectorAll('button')].find(node => node.textContent === 'Request reset link').disabled, true);
});
test('forgot and resend are generic, do not authenticate, and enforce resend cooldown', async () => {
  const calls = fixture(); await render(AuthPanel);
  await click('Forgot password?'); await input('email', 'synthetic@example.invalid'); await submit();
  assert.equal(posts(calls)[0].path, '/api/auth/password/forgot'); assert.deepEqual(posts(calls)[0].body, { email: 'synthetic@example.invalid' });
  assert.match(host.textContent, /does not confirm an account exists or that delivery succeeded/); assert.match(host.textContent, /60 seconds/);
  await click('Request reset link'); assert.equal(posts(calls).length, 1);
  await click('Return to sign in'); await click('Resend verification email'); await submit(); assert.equal(posts(calls).length, 1);
  assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0);
});
test('opening verification link scrubs URL and never consumes it until explicit POST', async () => {
  const authLink = link(); const calls = fixture(signedOut, () => ({ body: { verified: true, authenticated: false } }));
  await render(EmailLinkPanel, { link: authLink });
  assert.equal(window.location.hash, ''); assert.equal(posts(calls).length, 0); assert.doesNotMatch(host.innerHTML, /t{43}/);
  await submit(); assert.deepEqual(posts(calls)[0].body, { token: 't'.repeat(43) }); assert.equal(posts(calls)[0].path, '/api/auth/email/verify');
  assert.equal(posts(calls)[0].cache, 'no-store'); assert.match(host.textContent, /Email verified/); assert.equal(authLink.takeToken(), '');
  assert.equal(host.querySelector('form'), null); assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0);
});
test('reset validates matching passwords then consumes its token only once and clears credentials on failure', async () => {
  const authLink = link('reset'); const calls = fixture(signedOut, () => ({ body: { code: 'EMAIL_TOKEN_INVALID', error: 'must-not-show' }, code: 400 }));
  await render(EmailLinkPanel, { link: authLink }); await input('password', '123456'); await input('passwordConfirmation', '654321'); await submit();
  assert.equal(posts(calls).length, 0); assert.match(host.textContent, /passwords do not match/);
  await input('passwordConfirmation', '123456'); await submit();
  assert.deepEqual(posts(calls)[0].body, { token: 't'.repeat(43), password: '123456', passwordConfirmation: '123456' });
  assert.equal(posts(calls)[0].path, '/api/auth/password/reset'); assert.equal(host.querySelector('input[type=password]'), null);
  assert.match(host.textContent, /invalid, expired, or already used/); assert.doesNotMatch(host.textContent, /must-not-show/); assert.equal(authLink.takeToken(), '');
  await submit(); assert.equal(posts(calls).length, 1);
});
test('closing a link clears the secret without calling verification', async () => {
  const authLink = link(); const calls = fixture(); let closed = false;
  await render(EmailLinkPanel, { link: authLink, onClose: () => { closed = true; } }); await click('Close link page');
  assert.equal(closed, true); assert.equal(authLink.takeToken(), ''); assert.equal(posts(calls).length, 0);
});
test('binding requires current password and CSRF, reports pending, and never claims bound', async () => {
  const calls = fixture(ordinary); await render(SettingsPage); await click('Bind email');
  await input('email', 'synthetic@example.invalid'); await input('currentPassword', '123456'); await submit();
  assert.equal(posts(calls)[0].path, '/api/auth/email/bind'); assert.equal(posts(calls)[0].headers['X-CSRF-Token'], 'fixture-csrf');
  assert.deepEqual(posts(calls)[0].body, { email: 'synthetic@example.invalid', currentPassword: '123456' });
  assert.match(host.textContent, /Binding is not complete/); assert.equal(host.querySelector('[name=currentPassword]'), null);
});
test('leaving a mounted settings view clears binding password and aborts the form', async () => {
  fixture(ordinary); let setActive;
  function Panel() { const session = useSession(); const [active, update] = React.useState(true); setActive = update; return React.createElement(EmailAccount, { session, lang: 'en', active }); }
  await render(Panel); await click('Bind email'); await input('email', 'synthetic@example.invalid'); await input('currentPassword', '123456');
  await React.act(async () => setActive(false)); assert.equal(host.querySelector('[name=currentPassword]'), null);
  await React.act(async () => setActive(true)); await click('Bind email'); assert.equal(host.querySelector('[name=currentPassword]').value, ''); assert.equal(host.querySelector('[name=email]').value, 'synthetic@example.invalid');
});
test('verified bootstrap owner explicitly has handoff-only recovery despite a bound email', async () => {
  fixture({ ...ordinary, role: 'owner', canManageSettings: false, email: 'synthetic@example.invalid', emailVerified: true, passwordRecoveryMethod: 'private-bootstrap' }); await render(SettingsPage);
  assert.match(host.textContent, /Email password reset is unavailable for administrators/); assert.match(host.textContent, /private server terminal/);
  assert.doesNotMatch(host.textContent, /This account can recover its password through/); assert.equal(host.querySelector('input'), null);
});

test('late or repeated verification clicks cannot submit the same token twice', async () => {
  const authLink = link(); let finish;
  const calls = fixture(signedOut, request => ({ body: { verified: true, authenticated: false } }));
  const fetchFixture = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    if (args[0] === '/api/auth/email/verify') await new Promise(resolve => { finish = resolve; });
    return fetchFixture(...args);
  };
  await render(EmailLinkPanel, { link: authLink });
  await React.act(async () => { const form = host.querySelector('form'); form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
  assert.equal(authLink.takeToken(), ''); assert.match(host.textContent, /Verifying/);
  await React.act(async () => finish()); assert.equal(posts(calls).length, 1);
});

test('navigation clears entered login secrets and aborts pending authentication', async () => {
  const calls = fixture(); let requestSignal;
  const fetchFixture = globalThis.fetch;
  globalThis.fetch = (path, options) => {
    if (path !== '/api/login') return fetchFixture(path, options);
    requestSignal = options.signal;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  };
  await render(AuthPanel); await input('username', 'old-member'); await input('password', '123456');
  await React.act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(requestSignal.aborted, false);
  await React.act(async () => window.dispatchEvent(new window.PopStateEvent('popstate')));
  assert.equal(requestSignal.aborted, true); assert.equal(host.querySelector('[name=password]').value, ''); assert.equal(calls.filter(call => call.path === '/api/status').length, 1);
});

test('native autofill survives visibility and remember toggles; successful legacy sign-in remembers only username', async () => {
  const calls = fixture(signedOut, () => ({ body: ordinary })); await render(AuthPanel);
  const identity = host.querySelector('[name=username]'), password = host.querySelector('[name=password]');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(identity, 'old-member');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(password, '123456');
  await click('Show password'); assert.equal(password.type, 'text'); assert.equal(password.value, '123456');
  await React.act(async () => host.querySelector('[role=checkbox]').dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  assert.equal(identity.value, 'old-member'); assert.equal(password.value, '123456');
  await submit();
  assert.deepEqual(posts(calls)[0].body, { username: 'old-member', password: '123456', rememberMe: true });
  assert.equal(window.localStorage.getItem('nestlet.remembered-account'), 'old-member'); assert.doesNotMatch(JSON.stringify({ ...window.localStorage }), /123456/);
});
test('remembered email sign-in changes server rememberMe but does not persist email', async () => {
  const calls = fixture(signedOut, () => ({ body: ordinary })); await render(AuthPanel);
  await input('username', 'synthetic@example.invalid'); await input('password', '123456');
  await React.act(async () => host.querySelector('[role=checkbox]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); await submit();
  assert.equal(posts(calls)[0].body.rememberMe, true); assert.equal(window.localStorage.length, 0);
});
test('App keeps a new link through paired popstate/hashchange, replaces old secrets, and pagehide destroys the token', async () => {
  const calls = fixture(); await render(App);
  await React.act(async () => {
    window.history.pushState(null, '', `/#auth=verify&token=${'x'.repeat(43)}`);
    window.dispatchEvent(new window.PopStateEvent('popstate')); window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  });
  assert.equal(window.location.hash, ''); assert.match(host.textContent, /确认验证邮箱/); assert.equal(posts(calls).length, 0);
  await React.act(async () => {
    window.history.pushState(null, '', `/#auth=reset&token=${'y'.repeat(43)}`);
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  });
  assert.match(host.textContent, /设置新密码/);
  await input('password', '123456'); await input('passwordConfirmation', '123456');
  await React.act(async () => window.dispatchEvent(new window.PageTransitionEvent('pagehide'))); await submit();
  assert.equal(posts(calls).length, 0); assert.match(host.textContent, /链接已从当前页面清除/); assert.equal(host.querySelector('[name=password]'), null);
});
test('signed-in accounts can open verification and close it without consuming a token', async () => {
  const initialAuthLink = link(); const calls = fixture(ordinary, request => ({ body: request.path === '/api/workflows' ? { workflowId: '11111111-1111-4111-8111-111111111111' } : {} }));
  await render(App, { initialAuthLink }); assert.match(host.textContent, /确认验证邮箱/); assert.equal(posts(calls).length, 0);
  await click('关闭链接页面'); assert.equal(initialAuthLink.takeToken(), ''); assert.equal(posts(calls).filter(call => call.path.startsWith('/api/auth/')).length, 0);
});


test('same-URL Back traversal discards a captured token even between adjacent scrubbed root entries', async () => {
  const calls = fixture(); const initialAuthLink = link(); await render(App, { initialAuthLink });
  assert.equal(window.location.hash, ''); assert.match(host.textContent, /确认验证邮箱/);
  await React.act(async () => window.dispatchEvent(new window.PopStateEvent('popstate')));
  assert.doesNotMatch(host.textContent, /确认验证邮箱/); assert.equal(initialAuthLink.takeToken(), ''); assert.equal(posts(calls).length, 0);
});
