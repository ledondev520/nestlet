// Development DOM tests using controlled HTTP responses, not browser or live-provider evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { transformWithOxc } from 'vite';
import React, { act } from 'react';
import { draftVault } from '../frontend/lib/draft-vault.js';

const source = await readFile(new URL('../frontend/lib/session.jsx', import.meta.url), 'utf8');
const compiled = await transformWithOxc(source, 'session.jsx', { jsx: { runtime: 'automatic' } });
const generated = new URL(`../frontend/lib/.session-test-${randomUUID()}.mjs`, import.meta.url);
await writeFile(generated, compiled.code);
let SessionProvider, useSession;
try { ({ SessionProvider, useSession } = await import(generated.href)); }
finally { await unlink(generated); }

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const signedOut = { authenticated: false, registrationEnabled: true, authConfigured: true };

async function setup(handler) {
  draftVault.clear();
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/next/' });
  const saved = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, fetch: handler, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  let value;
  function Probe() { value = useSession(); return React.createElement('p', null, value.status.username || 'signed out'); }
  await act(async () => root.render(React.createElement(SessionProvider, null, React.createElement(Probe))));
  return {
    get session() { return value; },
    async close() {
      await act(async () => root.unmount());
      dom.window.close();
      draftVault.clear();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  };
}

test('session login, capability refresh, current-token mutation and logout have one owner', async context => {
  let account = signedOut;
  const requests = [];
  const app = await setup(async (path, options) => {
    requests.push({ path, options });
    if (path === '/api/status') return response(account);
    if (path === '/api/login') { account = { authenticated: true, userId: 'synthetic-A', username: 'trial-a', csrfToken: 'test-token-A', role: 'trial' }; return response(account); }
    if (path === '/api/logout') { account = signedOut; return response({ authenticated: false }); }
    return response({ ok: true });
  });
  context.after(app.close);
  assert.equal(app.session.loading, false);
  assert.equal(app.session.status.authenticated, false);
  await act(async () => app.session.login({ username: 'trial-a', password: 'synthetic-test-password' }));
  assert.equal(app.session.status.userId, 'synthetic-A');
  await app.session.api.post('/api/clients', { displayName: 'Synthetic Example' });
  assert.equal(requests.at(-1).options.headers['X-CSRF-Token'], 'test-token-A');
  await act(async () => app.session.logout());
  assert.equal(app.session.status.authenticated, false);
  assert.equal(app.session.status.csrfToken, undefined);
});

test('a stale status refresh cannot restore a different account after login', async context => {
  let account = signedOut, hold = false, finish;
  const app = await setup(async path => {
    if (path === '/api/status' && hold) { hold = false; return new Promise(resolve => { finish = () => resolve(response({ authenticated: true, userId: 'old-account', csrfToken: 'old-test-token' })); }); }
    if (path === '/api/status') return response(account);
    account = { authenticated: true, userId: 'new-account', username: 'new-trial', csrfToken: 'new-test-token' };
    return response(account);
  });
  context.after(app.close);
  hold = true;
  let oldRefresh;
  await act(async () => { oldRefresh = app.session.refresh(); });
  await act(async () => app.session.login({ username: 'new-trial', password: 'synthetic-password' }));
  await act(async () => { finish(); await oldRefresh; });
  assert.equal(app.session.status.userId, 'new-account');
  assert.equal(app.session.status.csrfToken, 'new-test-token');
});

test('a successful login survives a failed capability refresh and never stores credentials', async context => {
  let signedIn = false;
  const app = await setup(async path => {
    if (path === '/api/status') {
      if (signedIn) throw new Error('offline');
      return response(signedOut);
    }
    signedIn = true;
    return response({ authenticated: true, userId: 'synthetic-A', csrfToken: 'public-test-token' });
  });
  context.after(app.close);
  await act(async () => app.session.login({ username: 'trial-a', password: 'not-a-real-password' }));
  assert.equal(app.session.status.authenticated, true);
  assert.equal(app.session.error.code, 'NETWORK_ERROR');
  assert.equal('password' in app.session.status, false);
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);
});

test('expiry hides private state, only verified same-user login restores memory, and another account purges it', async context => {
  const firstId = '11111111-1111-4111-8111-111111111111';
  const nextId = '22222222-2222-4222-8222-222222222222';
  const workspaceKey = '33333333-3333-4333-8333-333333333333';
  const key = { userId: firstId, workspaceKey, feature: 'chat' };
  let account = { ...signedOut, authenticated: true, userId: firstId, username: 'first-user', csrfToken: 'first-test-csrf', secureLogin: true };
  const app = await setup(async (path, options) => {
    if (path === '/api/status') return response(account);
    if (path === '/api/clients') return response({ code: 'AUTH_REQUIRED' }, 401);
    if (path === '/api/login') {
      const id = JSON.parse(options.body).username === 'second-user' ? nextId : firstId;
      account = { ...signedOut, authenticated: true, userId: id, csrfToken: `test-${id}`, secureLogin: true };
      return response(account);
    }
    throw new Error('Unexpected test request');
  });
  context.after(app.close);
  assert.equal(draftVault.write(key, { input: 'Unsent synthetic text' }), true);
  await act(async () => { await assert.rejects(app.session.api.get('/api/clients')); });
  assert.equal(app.session.status.authenticated, false);
  assert.equal(app.session.status.userId, null);
  assert.equal(app.session.status.secureLogin, true);
  assert.equal(app.session.status.username, undefined);
  assert.equal(app.session.recovery, 'suspended');
  assert.equal(draftVault.read(key), null);
  await act(async () => app.session.login({ username: 'first-user', password: 'synthetic-only' }));
  assert.equal(app.session.recovery, 'restored');
  assert.deepEqual(draftVault.read(key), { input: 'Unsent synthetic text' });
  await act(async () => { await assert.rejects(app.session.api.get('/api/clients')); });
  await act(async () => app.session.login({ username: 'second-user', password: 'synthetic-only' }));
  assert.equal(app.session.status.userId, nextId);
  assert.equal(app.session.recovery, null);
  assert.equal(draftVault.read(key), null);
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);
});

test('explicit logout discards the recovery cache even when the network result is uncertain', async context => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const key = { userId, workspaceKey: '33333333-3333-4333-8333-333333333333', feature: 'chat' };
  const account = { ...signedOut, authenticated: true, userId, csrfToken: 'test-csrf' };
  const app = await setup(async path => {
    if (path === '/api/status') return response(account);
    throw new Error('Network unavailable');
  });
  context.after(app.close);
  assert.equal(draftVault.write(key, { input: 'Explicitly discarded text' }), true);
  await act(async () => { await assert.rejects(app.session.logout(), { code: 'NETWORK_ERROR' }); });
  assert.equal(draftVault.read(key), null);
  assert.equal(app.session.recovery, null);
  await act(async () => app.session.refresh());
  assert.equal(draftVault.read(key), null);
});

test('email registration202 never changes identity, capability state, or authenticates the draft vault', async context => {
  const calls = [];
  const app = await setup(async (path, options) => {
    calls.push({ path, options });
    return response(path === '/api/status' ? { ...signedOut, secureLogin: true, emailDeliveryConfigured: true } : { accepted: true, authenticated: false, next: 'check-email-if-eligible', retryAfter: 60 }, path === '/api/status' ? 200 : 202);
  });
  context.after(app.close);
  let result;
  await act(async () => { result = await app.session.register({ email: 'synthetic@example.invalid', password: '123456', passwordConfirmation: '123456' }); });
  assert.equal(result.accepted, true);
  assert.equal(app.session.status.authenticated, false);
  assert.equal(app.session.status.emailDeliveryConfigured, true);
  assert.equal(app.session.status.accepted, undefined);
  assert.equal(calls.filter(call => call.path === '/api/status').length, 1);
  assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0);
});
