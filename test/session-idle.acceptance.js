// Optional long-running acceptance: real elapsed time, real crypto/session/HTTP.
// Run separately: node --test test/session-idle.acceptance.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('operator session expires after 30 real idle minutes', { timeout: 31 * 60 * 1000 }, async context => {
  const dataDirectory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-idle-db-'));
  const password = 'public-test-only-idle-password';
  const salt = randomBytes(16);
  const hash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url')}`;
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_ORIGIN: '', NESTLET_OPERATOR_PASSWORD_HASH: hash, NESTLET_DB_PATH: join(dataDirectory, 'nestlet.sqlite'), ENABLE_LIVE_AI: 'false', DEEPSEEK_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  context.after(async () => {
    if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
    await rm(dataDirectory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
    child.stdout.on('data', data => { if (data.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); } });
  });
  const login = await fetch(url + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const initial = await fetch(url + '/api/settings', { headers: { Cookie: cookie } });
  assert.equal(initial.status, 200);
  const started = Date.now();
  context.diagnostic(`Real idle observation began at ${new Date(started).toISOString()}; no session requests for 30 minutes`);
  await new Promise(resolve => setTimeout(resolve, 30 * 60 * 1000 + 1000));
  assert.ok(Date.now() - started >= 30 * 60 * 1000);
  const expired = await fetch(url + '/api/settings', { headers: { Cookie: cookie } });
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).code, 'AUTH_REQUIRED');
});
