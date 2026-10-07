/** Real Node/SQLite/scrypt + React DOM. Accepted test challenges are explicitly
 * seeded; this does not send email or claim provider/inbox/browser acceptance. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { openStorage } from '../../../storage.js';
import { digest } from '../../../email-auth-domain.js';
import { captureAuthFragment } from './auth-route.js';
const makeHash = password => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`; };

test('actual HTTP email verification, native login and password reset preserve identity and revoke the old session', async context => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-email-dom-http-'));
  const filename = join(directory, 'account.sqlite'), initial = openStorage({ filename }); initial.close();
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const origin = 'https://email-ui-fixture.invalid', base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('../../../', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin, NESTLET_DB_PATH: filename,
    NESTLET_OPERATOR_PASSWORD_HASH: makeHash('public-synthetic-owner-password'), NESTLET_OPERATOR_USERNAME: 'owner',
    ALIBABA_CLOUD_ACCESS_KEY_ID: '', ALIBABA_CLOUD_ACCESS_KEY_SECRET: '', ALIBABA_CLOUD_SECURITY_TOKEN: '', NESTLET_EMAIL_FROM: '', DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', vite, root, host;
  const saved = new Map(), originalFetch = globalThis.fetch;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: origin, pretendToBeVisual: true });
  context.after(async () => {
    if (root) await React.act(async () => root.unmount()); await vite?.close(); dom.window.close();
    if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
    for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
    await rm(directory, { recursive: true, force: true });
  });
  child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Synthetic server did not start')), 8000);
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Synthetic server exited')); });
    child.stdout.on('data', data => { if (data.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); } }); });
  let cookie = '', pendingHttp = 0; const requests = [];
  const http = async (path, options = {}) => {
    pendingHttp++;
    try {
    const response = await originalFetch(base + path, { ...options, headers: { ...options.headers, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } });
    const nextCookie = response.headers.get('set-cookie'); if (nextCookie) cookie = nextCookie.split(';')[0];
    requests.push({ path, method: options.method || 'GET', status: response.status }); return response;
    } finally { pendingHttp--; }
  };
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, fetch: http, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const React = await import('react'), { createRoot } = await import('react-dom/client');
  vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true, hmr: false, watch: null, ws: false }, appType: 'custom' });
  const { SessionProvider } = await vite.ssrLoadModule('/lib/session.jsx');
  const { AuthPanel, EmailLinkPanel } = await vite.ssrLoadModule('/features/auth/index.js');
  async function render(Component, props = {}) {
    if (root) await React.act(async () => root.unmount()); host?.remove(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await React.act(async () => { root.render(React.createElement(SessionProvider, null, React.createElement(Component, { lang: 'en', ...props }))); });
    await settle(() => !host.textContent.includes('Reading account status'));
  }
  async function settle(check) { for (let i = 0; i < 100 && !check(); i++) await React.act(async () => new Promise(resolve => setTimeout(resolve, 20))); assert.ok(check(), host.textContent); }
  function input(name, value) { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(host.querySelector(`[name=${name}]`), value); }
  async function submit(check) { await React.act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); await settle(check); await React.act(async () => { do { await new Promise(resolve => setTimeout(resolve, 20)); } while (pendingHttp); }); }
  const withStorage = fn => { const storage = openStorage({ filename }); try { return fn(storage); } finally { storage.close(); } };
  function capture(action, mode) { window.history.replaceState(null, '', `/#auth=${mode}&token=${action.token}`); return captureAuthFragment(window); }
  const email = 'synthetic-ui@example.invalid', password = 'synthetic-original-password', nextPassword = 'synthetic-replacement-password';
  const registration = withStorage(storage => { const action = storage.emailAuth.createAction({ kind: 'register', email, passwordHash: makeHash(password) }); storage.emailAuth.markAccepted(action.tokenHash); return action; });
  await render(EmailLinkPanel, { link: capture(registration, 'verify') });
  await settle(() => [...host.querySelectorAll('button')].some(button => button.textContent === 'Confirm email verification' && !button.disabled));
  assert.equal(window.location.hash, ''); assert.equal(requests.filter(request => request.path === '/api/auth/email/verify').length, 0);
  await submit(() => host.textContent.includes('Email verified.'));
  assert.equal(cookie, '');
  await render(AuthPanel); assert.match(host.textContent, /Email delivery is not configured/);
  input('username', email); input('password', password); await submit(() => host.textContent.includes('Signed in'));
  const verified = await (await http('/api/status')).json(), oldCookie = cookie;
  assert.equal(verified.email, email); assert.equal(verified.emailVerified, true); assert.equal(verified.passwordRecoveryMethod, 'email');
  const reset = withStorage(storage => { const action = storage.emailAuth.createAction({ kind: 'reset', email, userId: verified.userId, credentialFingerprint: digest(storage.getUserById(verified.userId).passwordHash) }); storage.emailAuth.markAccepted(action.tokenHash); return action; });
  await render(EmailLinkPanel, { link: capture(reset, 'reset') });
  await settle(() => host.querySelector('[name=password]')?.readOnly === false);
  input('password', nextPassword); input('passwordConfirmation', nextPassword); await submit(() => host.textContent.includes('Password reset.'));
  assert.equal((await originalFetch(base + '/api/cases', { headers: { Origin: origin, Cookie: oldCookie } })).status, 401);
  await render(AuthPanel); input('username', email); input('password', nextPassword); await submit(() => host.textContent.includes('Signed in'));
  const changed = await (await http('/api/status')).json(); assert.equal(changed.userId, verified.userId);
  const replay = await http('/api/auth/password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: reset.token, password: nextPassword, passwordConfirmation: nextPassword }) }); assert.equal(replay.status, 400);
  assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0);
  for (const secret of [password, nextPassword, registration.token, reset.token, email]) assert.equal(output.includes(secret), false);
});
