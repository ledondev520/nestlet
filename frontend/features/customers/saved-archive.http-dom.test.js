// Real HTTP/SQLite/private-file persistence and real SessionProvider + React DOM.
// jsdom is a development DOM, not an actual browser or production-CSP acceptance.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { openStorage } from '../../../storage.js';
import { emptyCasePayload } from './copy.js';

const nativeFetch = globalThis.fetch;
const password = 'Synthetic-archive-recovery-password-only';
const hash = () => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`; };
const ownerHash = hash();
let directory, filename, child, origin, cookie = '', vite, dom, React, createRoot, SessionProvider, useSession, CustomersPage, root, container, currentSession;
let savedCase, savedAsset;
const requests = [], opened = [], original = Buffer.from('Synthetic standalone original\nSaved before any case or customer association.');
async function start() {
  const reserve = net.createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve)); const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  origin = `http://127.0.0.1:${port}`; cookie = '';
  child = spawn(process.execPath, ['server.js'], { cwd: new URL('../../../', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: '', NESTLET_DB_PATH: filename, NESTLET_ASSETS_PATH: join(directory, 'assets'), NESTLET_OPERATOR_PASSWORD_HASH: ownerHash, DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', value => output += value); child.stderr.on('data', value => output += value);
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Startup timeout: ${output}`)), 5000); child.once('exit', code => { clearTimeout(timer); reject(new Error(`Startup exited ${code}: ${output}`)); }); child.stdout.on('data', value => { if (value.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); } }); });
}
async function stop() { if (child?.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); }); }
async function browserFetch(path, options = {}) {
  requests.push({ path, method: options.method || 'GET' });
  const response = await nativeFetch(origin + path, { ...options, headers: { ...options.headers, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } });
  const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
  return response;
}
const bodyText = () => container.textContent;
const button = name => [...container.querySelectorAll('button')].find(element => element.textContent === name || element.getAttribute('aria-label') === name);
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 80; attempt++) { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); if (predicate()) return; }
  assert.ok(predicate(), `Expected UI condition did not appear: ${bodyText()}`);
}
async function mount() {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  function Probe() { currentSession = useSession(); return null; }
  await React.act(async () => root.render(React.createElement(SessionProvider, null, React.createElement(Probe), React.createElement(CustomersPage, { lang: 'en', onOpenCase: id => { opened.push(id); return false; } }))));
  await waitFor(() => currentSession && !currentSession.loading);
}
async function unmount() { if (root) await React.act(async () => root.unmount()); container?.remove(); root = null; }
async function signIn(username) { await React.act(async () => currentSession.login({ username, password })); await waitFor(() => currentSession.status.authenticated && !bodyText().includes('Loading saved cases…')); }
async function expandOriginals() {
  const details = container.querySelector('details'); assert.ok(details, 'Global originals entry exists without choosing a customer');
  await React.act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); });
  await waitFor(() => !bodyText().includes('Loading original materials…') && Boolean(container.querySelector('[aria-label="All originals"]')));
}

before(async () => {
  directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-saved-archive-')); filename = join(directory, 'records.sqlite');
  const storage = openStorage({ filename }); try { for (const username of ['archive-a', 'archive-b']) storage.createTrialUser({ username, passwordHash: hash() }); } finally { storage.close(); }
  await start();
  dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/next/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'Node', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  globalThis.fetch = browserFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import('react'); ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)), server: { middlewareMode: true, hmr: false, watch: null, ws: false }, appType: 'custom' });
  ({ SessionProvider, useSession } = await vite.ssrLoadModule('/lib/session.jsx')); ({ CustomersPage } = await vite.ssrLoadModule('/features/customers/index.jsx'));
  await mount(); await signIn('archive-a');
});
after(async () => { await unmount(); await vite?.close(); dom?.window.close(); globalThis.fetch = nativeFetch; await stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

test('standalone case and original survive server restart and fresh-page login and are both reachable without any customer', async () => {
  const api = currentSession.api;
  savedCase = (await api.post('/api/cases', emptyCasePayload('Synthetic saved Intake case', null))).case;
  savedAsset = (await api.upload('/api/assets', original, { contentType: 'text/plain', filename: 'Synthetic standalone original.txt', assetConsent: true })).asset;
  assert.equal(savedCase.clientId, null); assert.equal(savedAsset.clientId, null); assert.equal(savedAsset.caseId, null);
  await unmount(); await stop(); await start(); await mount(); await signIn('archive-a');
  await waitFor(() => bodyText().includes(savedCase.title));
  assert.match(bodyText(), /No customer records yet/); assert.ok(requests.some(request => request.path === '/api/cases'));
  await React.act(async () => button(`Open saved case: ${savedCase.title}`).click());
  assert.deepEqual(opened, [savedCase.id]); assert.match(bodyText(), /Synthetic saved Intake case/);
  await expandOriginals(); await waitFor(() => bodyText().includes(savedAsset.originalFilename));
  assert.match(bodyText(), /No customer or case linked/);
  const globalRequest = requests.filter(request => request.path.startsWith('/api/assets?')).at(-1);
  assert.equal(new URL(globalRequest.path, origin).searchParams.has('clientId'), false);
  await React.act(async () => button(`Text preview: ${savedAsset.originalFilename}`).click());
  await waitFor(() => Boolean(container.querySelector('pre'))); assert.equal(container.querySelector('pre').textContent, original.toString());
  const link = [...container.querySelectorAll('a')].find(element => element.getAttribute('href') === `/api/assets/${savedAsset.id}/download`); assert.ok(link);
  const download = await browserFetch(link.getAttribute('href')); assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), original);
});

test('real logout clears archive data, ordinary/admin accounts cannot discover it, and original owner can log back in', async () => {
  await React.act(async () => currentSession.logout());
  assert.doesNotMatch(bodyText(), /Synthetic saved Intake case|Synthetic standalone original/);
  assert.match(bodyText(), /Sign in to view your customer records/);
  for (const username of ['archive-b', 'owner']) {
    await signIn(username); await waitFor(() => bodyText().includes('No saved cases yet'));
    await expandOriginals(); await waitFor(() => bodyText().includes('No saved originals yet'));
    assert.doesNotMatch(bodyText(), /Synthetic saved Intake case|Synthetic standalone original/);
    await assert.rejects(currentSession.api.get(`/api/cases/${savedCase.id}`), error => error.status === 404);
    await assert.rejects(currentSession.api.get(`/api/assets/${savedAsset.id}/text`), error => error.status === 404);
    await React.act(async () => currentSession.logout());
  }
  await signIn('archive-a'); await waitFor(() => bodyText().includes(savedCase.title));
  await expandOriginals(); await waitFor(() => bodyText().includes(savedAsset.originalFilename));
});
