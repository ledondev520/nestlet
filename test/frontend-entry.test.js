// Real HTTP entry/CSP checks. No browser or provider response is simulated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, mkdir, copyFile, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';

const project = fileURLToPath(new URL('../', import.meta.url));
async function start(context, root = project) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-entry-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env: {
    PATH: process.env.PATH, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: '',
    NESTLET_DB_PATH: join(directory, 'case.sqlite'), NESTLET_ASSETS_PATH: join(directory, 'assets'),
    NESTLET_OPERATOR_PASSWORD_HASH: '', DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false'
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  context.after(async () => {
    if (child.exitCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await done; }
    await rm(directory, { recursive: true, force: true });
  });
  let output = '';
  child.stderr.on('data', value => output += value);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Fixture startup failed: ${output}`)), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}: ${output}`)); });
    child.stdout.on('data', value => { if (value.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); } });
  });
  return path => fetch(`http://127.0.0.1:${port}${path}`);
}

test('root and next alias serve the real React build with fresh matching style-only nonces', async context => {
  const get = await start(context);
  const nonces = new Set();
  for (const path of ['/', '/next/', '/', '/next']) {
    const response = await get(path), html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /src="\/next\/app\.js"/);
    assert.match(html, /href="\/next\/index\.css"/);
    const nonce = /name="nestlet-style-nonce" content="([A-Za-z0-9+/]{24})"/u.exec(html)?.[1];
    assert.ok(nonce, 'Server replaces the build placeholder with a strong fresh style nonce');
    assert.equal(nonces.has(nonce), false); nonces.add(nonce);
    const policy = response.headers.get('content-security-policy');
    assert.ok(policy.includes(`style-src 'self' 'nonce-${nonce}'`));
    assert.match(policy, /(?:^|; )script-src 'self';/);
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|style-src-attr/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(html, /__NESTLET_STYLE_NONCE__/);
  }
  const legacy = await get('/legacy/');
  assert.equal(legacy.status, 200);
  assert.match(await legacy.text(), /src="\/app\.js"/);
  assert.doesNotMatch(legacy.headers.get('content-security-policy'), /nonce-/);
  for (const path of ['/next/app.js', '/next/index.css']) assert.equal((await get(path)).status, 200);
  for (const path of ['/frontend/main.jsx', '/server.js', '/next/app.js.map']) assert.equal((await get(path)).status, 404);
});

test('missing React build returns explicit bilingual 503, never silently serves the legacy page', async context => {
  const fixture = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-no-build-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  // Copy only public source modules required by this disposable backend; no
  // credentials/configuration files or built React output are copied.
  for (const file of await readdir(project)) if (file.endsWith('.js') || file === 'package.json') await copyFile(join(project, file), join(fixture, file));
  await mkdir(join(fixture, 'public'));
  for (const file of ['core.js', 'agency-guidance.js', 'index.html']) await copyFile(join(project, 'public', file), join(fixture, 'public', file));
  await symlink(join(project, 'node_modules'), join(fixture, 'node_modules'));
  const get = await start(context, fixture);
  for (const path of ['/', '/next/']) {
    const response = await get(path), body = await response.text();
    assert.equal(response.status, 503);
    assert.match(body, /工作区暂不可用/);
    assert.match(body, /Workspace temporarily unavailable/);
    assert.doesNotMatch(body, /src="\/app\.js"|stack|ENOENT|__NESTLET/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await get('/legacy/')).status, 200);
});
