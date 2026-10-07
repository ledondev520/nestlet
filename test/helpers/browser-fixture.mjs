// Private test harness: actual server.js + SQLite; synthetic mail receipt, NOT delivery.
// Mail secrets travel only over child IPC and remain in memory. No debug HTTP route.
import { randomBytes, scryptSync, createHash } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { openStorage } from '../../storage.js';

export const LEGACY_BROWSER_USERS = Object.freeze([
  'fixture-check-a', 'fixture-check-b', 'synthetic-formats-http',
  'synthetic-journey-a', 'synthetic-journey-b', 'synthetic-file-formats',
  'synthetic-mobile-zh', 'synthetic-mobile-en'
]);
const hash = password => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
};
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
export async function startBrowserFixture({ port, simulatedMail = false, legacyUsers = [] } = {}) {
  if (port === undefined) {
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
  }
  if (!/^\d+$/u.test(String(port)) || port < 1024 || port > 65535) throw new Error('Invalid browser fixture port');
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-browser-'));
  const database = join(directory, 'case.sqlite');
  // Explicit legacy fixtures only. This existing private storage setup never
  // registers new users through an obsolete username endpoint or email bypass.
  const storage = openStorage({ filename: database });
  try { for (const username of legacyUsers) storage.upsertTrialUser({ username, passwordHash: hash('Case26') }); }
  finally { storage.close(); }
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NODE_ENV: 'test',
    HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: simulatedMail ? origin : '',
    NESTLET_DB_PATH: database, NESTLET_ASSETS_PATH: join(directory, 'assets'),
    NESTLET_OPERATOR_PASSWORD_HASH: hash('public-browser-owner-fixture'), NESTLET_OPERATOR_USERNAME: 'owner',
    DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash',
    ...(simulatedMail ? {
      ALIBABA_CLOUD_ACCESS_KEY_ID: 'public-synthetic-test-key-id',
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'public-synthetic-test-key-secret',
      ALIBABA_CLOUD_SECURITY_TOKEN: '', NESTLET_EMAIL_FROM: 'sender@example.invalid'
    } : {})
  };
  const launch = () => spawn(process.execPath, [
    ...(simulatedMail ? ['--import', './test/helpers/simulated-email-bootstrap.mjs'] : []), 'server.js'
  ], { cwd: new URL('../../', import.meta.url), env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const messages = [];
  let output = '', stopped = false;
  const observe = process => {
    process.stdout.on('data', value => { output += value; });
    process.stderr.on('data', value => { output += value; });
    process.on('message', message => { if (message?.type === 'synthetic-mail-accepted') messages.push(message); });
    return process;
  };
  let child = observe(launch());
  const withDatabase = operation => {
    const db = new DatabaseSync(database); db.exec('PRAGMA busy_timeout=5000');
    try { return operation(db); } finally { db.close(); }
  };
  async function stopChild() {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await exited;
    }
  }
  async function ready(outputStart = 0) {
    const deadline = Date.now() + 15000;
    while (!output.slice(outputStart).includes('Nestlet available')) {
      if (child.exitCode !== null || child.signalCode !== null || Date.now() >= deadline) throw new Error('Disposable server did not start');
      await delay(20);
    }
    if (!(await fetch(origin + '/api/health')).ok) throw new Error('Disposable server health failed');
  }
  async function stop() {
    if (stopped) return; stopped = true;
    await stopChild();
    messages.length = 0;
    await rm(directory, { recursive: true, force: true });
  }
  try { await ready(); } catch (error) { await stop(); throw error; }
  return {
    origin, get child() { return child; }, stop, withDatabase,
    // Private test-process lifecycle only: retain the same real SQLite/assets
    // directories and credentials. RAM sessions are deliberately NOT restored.
    async restart() {
      if (stopped) throw new Error('Cannot restart a stopped browser fixture');
      await stopChild();
      const outputStart = output.length;
      child = observe(launch());
      try { await ready(outputStart); } catch (error) { await stop(); throw error; }
    },
    logs: () => output,
    mailCount: (email, purpose) => messages.filter(mail => mail.email === email && (!purpose || mail.purpose === purpose)).length,
    async mailFor(email, purpose, index = 0) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const mail = messages.filter(item => item.email === email && item.purpose === purpose)[index];
        if (mail) {
          const token = new URLSearchParams(new URL(mail.link).hash.slice(1)).get('token');
          const ready = withDatabase(db => db.prepare('SELECT ready FROM email_actions WHERE token_hash=?').get(createHash('sha256').update(token).digest('hex'))?.ready);
          if (ready === 1) return { ...mail, token };
        }
        await delay(20);
      }
      throw new Error('Expected synthetic provider-accepted mail was not captured');
    },
    // Disclosed fixture clock preparation, NOT evidence of real elapsed TTL.
    expireToken(token) {
      const digest = createHash('sha256').update(token).digest('hex');
      return withDatabase(db => db.prepare('UPDATE email_actions SET created_at=?, expires_at=? WHERE token_hash=?')
        .run(Date.now() - 3600000, Date.now() - 1, digest).changes);
    },
    endEmailCooldown(email) {
      const digest = createHash('sha256').update('send:cooldown:' + email).digest('hex');
      return withDatabase(db => db.prepare('UPDATE email_rate_buckets SET expires_at=? WHERE bucket_hash=?').run(Date.now() - 1, digest).changes);
    }
  };
}
