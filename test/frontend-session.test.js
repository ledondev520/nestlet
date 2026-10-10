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

test('registration verification installs the issued session without login and survives a failed capability refresh', async context => {
  let verified = false; const requests = [];
  const app = await setup(async (path, options) => {
    requests.push({ path, options });
    if (path === '/api/status') { if (verified) throw new Error('Synthetic status outage'); return response(signedOut); }
    if (path === '/api/auth/email/verify') { verified = true; return response({ verified: true, authenticated: true, userId: 'new-registration', role: 'trial', csrfToken: 'new-csrf' }); }
    return response({ ok: true });
  });
  context.after(app.close);
  await act(async () => app.session.verifyEmail({ token: 'synthetic-one-time-proof' }));
  assert.equal(app.session.status.userId, 'new-registration'); assert.equal(app.session.status.authenticated, true);
  assert.equal(requests.some(request => request.path === '/api/login'), false);
  await app.session.api.post('/api/clients', { displayName: 'Synthetic New Account' });
  assert.equal(requests.at(-1).options.headers['X-CSRF-Token'], 'new-csrf');
  assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0);
});

test('abandoning registration verification cannot install a late session response', async context => {
  let finish;
  const app = await setup(async path => path === '/api/status' ? response(signedOut) : new Promise(resolve => { finish = resolve; }));
  context.after(app.close);
  const controller = new AbortController(); let request;
  await act(async () => { request = app.session.verifyEmail({ token: 'synthetic-proof' }, { signal: controller.signal }).catch(error => error); });
  controller.abort();
  await act(async () => { finish(response({ verified: true, authenticated: true, userId: 'abandoned', role: 'trial', csrfToken: 'new-csrf' })); assert.equal((await request).name, 'AbortError'); });
  assert.equal(app.session.status.authenticated, false);
});

test('a delayed old-cookie 401 rechecks the current cookie before interrupting the same account',async context=>{
  const userId='11111111-1111-4111-8111-111111111111',key={userId,workspaceKey:'33333333-3333-4333-8333-333333333333',feature:'chat'};
  let account={authenticated:true,userId,username:'synthetic-user',csrfToken:'old-synthetic-csrf'},release,reads=0,statusReads=0;
  const app=await setup(async path=>{
    if(path==='/api/status'){statusReads++;return response(account);}
    if(path==='/api/conversations/synthetic'){
      if(++reads===1)return new Promise(resolve=>{release=()=>resolve(response({code:'AUTH_REQUIRED'},401));});
      return response({messages:[]});
    }
    throw new Error('Unexpected request');
  });context.after(app.close);
  assert.equal(draftVault.write(key,{input:'Preserve synthetic pending question'}),true);
  let pending;await act(async()=>{pending=app.session.api.get('/api/conversations/synthetic').catch(error=>error);});
  // Another tab renewed the same browser cookie; this tab still holds the old CSRF.
  account={...account,csrfToken:'new-synthetic-csrf'};
  let result;await act(async()=>{release();result=await pending;});
  assert.deepEqual(result,{messages:[]});assert.equal(app.session.status.authenticated,true);
  assert.equal(app.session.status.csrfToken,'new-synthetic-csrf');assert.equal(statusReads,2);assert.equal(reads,2);
  assert.deepEqual(draftVault.read(key),{input:'Preserve synthetic pending question'});
});

test('same-account session recovery does not replay a rejected write',async context=>{
 let token='old-csrf',writes=0;
 const app=await setup(async path=>{
  if(path==='/api/status')return response({authenticated:true,userId:'same-user',csrfToken:token});
  writes++;token='new-csrf';return response({code:'AUTH_REQUIRED'},401);
 });context.after(app.close);
 await act(async()=>{await assert.rejects(app.session.api.post('/api/clients',{displayName:'Synthetic'}),{code:'SESSION_REFRESHED',status:409});});
 assert.equal(writes,1);assert.equal(app.session.status.authenticated,true);assert.equal(app.session.status.csrfToken,'new-csrf');
});

for(const mode of ['expired','other-user','offline'])test(`401 recovery ${mode} never retries the old account read`,async context=>{
 let statusReads=0,reads=0;
 const app=await setup(async path=>{
  if(path==='/api/status'){
   if(++statusReads>1){if(mode==='offline')throw new Error('Synthetic offline status');if(mode==='expired')return response(signedOut);return response({authenticated:true,userId:'other-user',csrfToken:'other-csrf'});}
   return response({authenticated:true,userId:'first-user',csrfToken:'first-csrf'});
  }
  reads++;return response({code:'AUTH_REQUIRED'},401);
 });context.after(app.close);
 await act(async()=>{await assert.rejects(app.session.api.get('/api/cases'),{code:'AUTH_REQUIRED'});});
 assert.equal(reads,1);assert.equal(app.session.status.authenticated,mode==='other-user');
 if(mode==='other-user')assert.equal(app.session.status.userId,'other-user');
});

test('concurrent stale-cookie reads share one verification and retry at most once',async context=>{
 let statusReads=0,release;const counts={};
 const app=await setup(async path=>{
  if(path==='/api/status'){
   if(++statusReads===1)return response({authenticated:true,userId:'same-user',csrfToken:'old-csrf'});
   return new Promise(resolve=>release=()=>resolve(response({authenticated:true,userId:'same-user',csrfToken:'new-csrf'})));
  }
  counts[path]=(counts[path]||0)+1;return counts[path]===1?response({code:'AUTH_REQUIRED'},401):response({ok:true});
 });context.after(app.close);
 let one,two;await act(async()=>{one=app.session.api.get('/api/cases');two=app.session.api.get('/api/clients');});
 await act(async()=>{release();await Promise.all([one,two]);});
 assert.equal(statusReads,2);assert.deepEqual(counts,{'/api/cases':2,'/api/clients':2});
});

test('an old-cookie verification cannot replace a newer explicit login',async context=>{
 let account={authenticated:true,userId:'first-user',csrfToken:'first-csrf'},statusReads=0,release,reads=0;
 const app=await setup(async path=>{
  if(path==='/api/status'){
   if(++statusReads===2)return new Promise(done=>release=()=>done(response({authenticated:true,userId:'first-user',csrfToken:'late-csrf'})));
   return response(account);
  }
  if(path==='/api/login'){account={authenticated:true,userId:'new-user',csrfToken:'new-csrf'};return response(account);}
  reads++;return response({code:'AUTH_REQUIRED'},401);
 });context.after(app.close);
 let pending;await act(async()=>{pending=app.session.api.get('/api/cases').catch(error=>error);});
 await act(async()=>app.session.login({username:'synthetic-other',password:'synthetic-only'}));
 await act(async()=>{release();await pending;});
 assert.equal(app.session.status.userId,'new-user');assert.equal(app.session.status.csrfToken,'new-csrf');assert.equal(reads,1);
});
