// Disposable, unconfigured real backend for component/CSP/static-route tests.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'nestlet-frontend-browser-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: new URL('../../', import.meta.url),
  stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', PORT: '4199', PUBLIC_ORIGIN: '', NESTLET_DB_PATH: join(directory, 'case.sqlite'), NESTLET_OPERATOR_PASSWORD_HASH: '', DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false' }
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  await rm(directory, { recursive: true, force: true });
}
process.once('SIGTERM', () => stop().finally(() => process.exit(0)));
process.once('SIGINT', () => stop().finally(() => process.exit(0)));
child.once('exit', async code => { if (!stopping) { await stop(); process.exit(code || 0); } });
