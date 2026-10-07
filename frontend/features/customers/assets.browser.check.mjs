// Real Chromium component check against disposable real HTTP/private-file storage.
// Vite development rendering is not production CSP or whole-App acceptance.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const serverRoot = process.env.NESTLET_ASSET_TEST_ROOT ? resolve(process.env.NESTLET_ASSET_TEST_ROOT) : repo;
const { openStorage } = await import(pathToFileURL(join(serverRoot, 'storage.js')).href);
const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-assets-browser-'));
const password = 'Synthetic-browser-file-check';
const salt = randomBytes(16), hash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
let child, vite, browser;
try {
  const filename = join(directory, 'records.sqlite');
  const storage = openStorage({ filename });
  try { storage.createTrialUser({ username: 'files-browser', passwordHash: hash }); } finally { storage.close(); }
  const reserve = net.createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve)); const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], { cwd: serverRoot, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: '', NESTLET_DB_PATH: filename, NESTLET_ASSETS_PATH: join(directory, 'assets'), NESTLET_OPERATOR_PASSWORD_HASH: hash, DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${output}`)), 5000); child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); }); child.stdout.on('data', chunk => { if (chunk.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); } }); });
  const login = await fetch(origin + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'files-browser', password }) });
  assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0], { csrfToken } = await login.json();
  const headers = { Cookie: cookie, Origin: origin, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' };
  const post = async (path, body) => { const response = await fetch(origin + path, { method: 'POST', headers, body: JSON.stringify(body) }); assert.equal(response.status, 201); return response.json(); };
  const { client } = await post('/api/clients', { displayName: 'Synthetic originals customer' });
  const { case: record } = await post('/api/cases', { title: 'Synthetic case with a deliberately long title to check responsive file filters', sourceText: '', fields: [], draftType: 'followup', draftText: '', clientId: client.id });
  const upload = async (name, type, bytes) => { const response = await fetch(origin + `/api/assets?caseId=${record.id}`, { method: 'POST', headers: { ...headers, 'Content-Type': type, 'X-Asset-Filename': encodeURIComponent(name), 'X-Asset-Consent': 'persist-private' }, body: bytes }); assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).asset; };
  const original = Buffer.from('Synthetic 中文 100%_ original.\n<script>this is escaped text, never executable</script>');
  const textAsset = await upload('Synthetic-notes.txt', 'text/plain', original);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await upload('Synthetic-image.png', 'image/png', png);
  const virtualId = 'virtual:customers-assets-check.js';
  vite = await createServer({ root: join(repo, 'frontend'), configFile: join(repo, 'vite.config.js'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null, ws: false, proxy: { '/api': { target: origin, changeOrigin: true } } }, plugins: [{ name: 'customers-assets-check', resolveId(id) { if (id === virtualId) return '\0' + id; }, load(id) { if (id === '\0' + virtualId) return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {OriginalMaterials} from '@/features/customers/original-materials'; import {createApiClient} from '@/lib/api'; import '/styles.css'; createRoot(document.getElementById('root')).render(React.createElement('div',{className:'paper-shell py-8'},React.createElement(OriginalMaterials,{api:createApiClient(),clientId:${JSON.stringify(client.id)},cases:${JSON.stringify([record])},lang:'en'})));`; }, configureServer(server) { server.middlewares.use('/next/assets-check', async (request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(await server.transformIndexHtml('/next/assets-check', `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/next/@id/${virtualId}"></script></body></html>`)); }); } }] });
  await vite.listen(); const frontend = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const separator = cookie.indexOf('='); await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: frontend, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(frontend + '/next/assets-check');
  await page.getByRole('heading', { name: 'Synthetic-notes.txt' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'desktop has no horizontal overflow');
  const trigger = page.getByRole('button', { name: 'Text preview: Synthetic-notes.txt', exact: true }); await trigger.click();
  await page.locator('pre').waitFor(); assert.equal(await page.locator('pre').textContent(), original.toString());
  assert.equal(await page.locator('pre script').count(), 0);
  await page.getByRole('button', { name: 'Close text preview' }).click(); assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download original: Synthetic-notes.txt', exact: true }).click(); const download = await downloadEvent; assert.equal(download.suggestedFilename(), textAsset.originalFilename);
  const popupEvent = page.waitForEvent('popup'); await page.getByRole('link', { name: 'Preview original (new tab): Synthetic-image.png', exact: true }).click(); const popup = await popupEvent; await popup.waitForLoadState(); assert.match(popup.url(), /\/api\/assets\/[a-f0-9-]+\/preview$/); await popup.close();
  await page.screenshot({ path: join(tmpdir(), 'nestlet-assets-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile has no horizontal overflow');
  await page.getByLabel('Search original materials', { exact: true }).fill('100%_');
  await page.getByRole('heading', { name: 'Synthetic-image.png' }).waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Synthetic-notes.txt' }).waitFor();
  await page.screenshot({ path: join(tmpdir(), 'nestlet-assets-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: real Chromium component + live temporary HTTP; desktop/mobile overflow, literal search, escaped text, focus return, authenticated image preview, and download filename. Vite rendering only; production CSP and full App remain separate.');
} finally {
  await browser?.close(); await vite?.close();
  if (child?.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  await rm(directory, { recursive: true, force: true });
}
