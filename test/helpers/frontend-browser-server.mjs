// Real, disposable Node + SQLite + private-file backend for browser acceptance.
// This public fixture password has no value outside this temporary loopback app.
// No ambient credentials, customer data, mail, or live provider configuration is inherited.
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const port = process.env.NESTLET_BROWSER_PORT || '4199';
if (!/^\d+$/u.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('Invalid browser fixture port');
const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-browser-'));
const salt = randomBytes(16);
const hash = `scrypt$${salt.toString('base64url')}$${scryptSync('public-browser-owner-fixture', salt, 32).toString('base64url')}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: new URL('../../', import.meta.url),
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NODE_ENV: 'test',
    HOST: '127.0.0.1', PORT: port, PUBLIC_ORIGIN: '',
    NESTLET_DB_PATH: join(directory, 'case.sqlite'), NESTLET_ASSETS_PATH: join(directory, 'assets'),
    NESTLET_OPERATOR_PASSWORD_HASH: hash, NESTLET_OPERATOR_USERNAME: 'owner',
    DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash'
  }
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  await rm(directory, { recursive: true, force: true });
}
process.once('SIGTERM', () => stop().finally(() => process.exit(0)));
process.once('SIGINT', () => stop().finally(() => process.exit(0)));
child.once('error', () => stop().finally(() => process.exit(1)));
child.once('exit', async code => { if (!stopping) { await stop(); process.exit(code ?? 1); } });
