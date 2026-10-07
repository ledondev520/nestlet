// Isolated acceptance: real HTTP, SQLite, scrypt and private env fixtures. No real accounts or provider calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { openStorage } from '../storage.js';
import { createOperatorAuth } from '../auth.js';
import { inspectOperatorTarget, setOperatorPassword } from '../scripts/operator-setup.js';
import { inspectTrialDatabase, setTrialUserPassword } from '../scripts/trial-user-setup.js';

const ownerPassword = 'public-alias-owner-password';
const ordinaryPassword = 'public-alias-ordinary-password';
const makeHash = password => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
};
const ownerHash = makeHash(ownerPassword);
const ordinaryHash = makeHash(ordinaryPassword);

async function app(context, { alias = 'demo-admin', seed, passwordHash = ownerHash } = {}) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-admin-alias-'));
  const filename = join(directory, 'nestlet.sqlite');
  const storage = openStorage({ filename });
  try { seed?.(storage); } finally { storage.close(); }
  let child, url, output = '';
  const origin = 'https://nestlet-admin-alias.invalid';
  async function stop() {
    if (child?.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  }
  context.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  async function start(nextAlias) {
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    url = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin,
        NESTLET_DB_PATH: filename, NESTLET_OPERATOR_USERNAME: nextAlias, NESTLET_OPERATOR_PASSWORD_HASH: passwordHash,
        DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => output += data);
    child.stderr.on('data', data => output += data);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${output}`)), 5000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`)); });
      const ready = data => { if (data.toString().includes('Nestlet available')) { clearTimeout(timeout); child.stdout.off('data', ready); resolve(); } };
      child.stdout.on('data', ready);
    });
  }
  const request = (path, { method = 'GET', body, session } = {}) => fetch(url + path, {
    method, headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = (username, password = ownerPassword) => request('/api/login', { method: 'POST', body: { username, password } });
  const register = (username, password = ordinaryPassword) => request('/api/register', { method: 'POST', body: { username, password, passwordConfirmation: password } });
  await start(alias);
  return { request, login, register, filename, restart: async nextAlias => { await stop(); await start(nextAlias); }, get output() { return output; } };
}

async function sessionFrom(response) {
  assert.equal(response.status, 200);
  return { ...await response.json(), cookie: response.headers.get('set-cookie').split(';')[0] };
}

test('configured administrator alias signs in to the immutable owner and keeps legacy owner/blank login and cases', async context => {
  let saved;
  const site = await app(context, { seed: storage => {
    saved = storage.createCase('owner', { title: 'Existing owner case', sourceText: 'Synthetic case text', fields: [], draftType: 'followup', draftText: '' });
  } });
  for (const username of ['demo-admin', ' DEMO-ADMIN ', 'owner', '']) {
    const session = await sessionFrom(await site.login(username));
    assert.equal(session.userId, 'owner');
    assert.equal(session.username, 'owner');
    assert.equal(session.role, 'owner');
    assert.equal((await site.request('/api/settings', { session })).status, 200);
    const response = await site.request('/api/cases/' + saved.id, { session });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).case, saved);
  }
  await site.restart('another-admin');
  const session = await sessionFrom(await site.login('another-admin'));
  assert.equal(session.userId, 'owner');
  assert.deepEqual((await (await site.request('/api/cases/' + saved.id, { session })).json()).case, saved);
  assert.equal((await site.login('demo-admin')).status, 401);
  for (const secret of [ownerPassword, ordinaryPassword, ownerHash]) assert.equal(site.output.includes(secret), false);
});

test('administrator names stay reserved while ordinary users retain their own role and cannot manage settings', async context => {
  const site = await app(context);
  for (const username of ['demo-admin', ' DEMO-ADMIN ', 'owner', 'Kelvin']) {
    const response = await site.register(username);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'REGISTRATION_INVALID');
    assert.equal(response.headers.get('set-cookie'), null);
  }
  const registered = await site.register('ordinary-alias-test');
  assert.equal(registered.status, 201);
  const ordinary = await sessionFrom(await site.login('ordinary-alias-test', ordinaryPassword));
  assert.equal(ordinary.role, 'trial');
  assert.notEqual(ordinary.userId, 'owner');
  assert.equal((await site.request('/api/settings', { session: ordinary })).status, 403);
  assert.equal((await site.login('demo-admin', ordinaryPassword)).status, 401);
});

test('an existing ordinary alias collision fails closed without taking over or altering that account or its cases', async context => {
  let ordinary, saved;
  const site = await app(context, { seed: storage => {
    ordinary = storage.createTrialUser({ username: 'demo-admin', passwordHash: ordinaryHash });
    saved = storage.createCase(ordinary.id, { title: 'Existing ordinary case', sourceText: 'Synthetic text', fields: [], draftType: 'followup', draftText: '' });
  } });
  const status = await (await site.request('/api/status')).json();
  assert.equal(status.authConfigured, false);
  assert.equal(status.registrationEnabled, false);
  for (const [username, password] of [['owner', ownerPassword], ['demo-admin', ownerPassword], ['demo-admin', ordinaryPassword]]) {
    const response = await site.login(username, password);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'OPERATOR_SETUP_REQUIRED');
    assert.equal(response.headers.get('set-cookie'), null);
  }
  await site.restart('non-colliding-admin');
  const session = await sessionFrom(await site.login('demo-admin', ordinaryPassword));
  assert.equal(session.role, 'trial');
  assert.equal(session.userId, ordinary.id);
  assert.deepEqual((await (await site.request('/api/cases/' + saved.id, { session })).json()).case, saved);
});

test('default, invalid and Unicode administrator aliases fail safely with the configured password minimum', async () => {
  for (const alias of [undefined, '', 'owner']) {
    const auth = createOperatorAuth({ passwordHash: ownerHash, operatorUsername: alias });
    assert.equal(auth.configured, true);
    assert.equal((await auth.login(ownerPassword)).userId, 'owner');
    assert.equal((await auth.login('short')).error, 'INVALID_CREDENTIALS');
  }
  for (const alias of ['ab', 'a'.repeat(65), 'bad name', 'Kelvin', '管理员', 'admin\n', {}, null]) {
    const auth = createOperatorAuth({ passwordHash: ownerHash, operatorUsername: alias });
    assert.equal(auth.configured, false);
    assert.equal(auth.setupInvalid, true);
    assert.equal((await auth.login(ownerPassword)).error, 'OPERATOR_SETUP_REQUIRED');
  }
  const auth = createOperatorAuth({ passwordHash: ownerHash, operatorUsername: 'kelvin' });
  assert.equal((await auth.login(ownerPassword, 'Kelvin')).error, 'INVALID_CREDENTIALS');
});

test('a collision introduced after sign-in immediately revokes owner sessions instead of promoting the ordinary account', async context => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-alias-collision-'));
  const storage = openStorage({ filename: join(directory, 'nestlet.sqlite') });
  context.after(async () => { storage.close(); await rm(directory, { recursive: true, force: true }); });
  const auth = createOperatorAuth({ passwordHash: ownerHash, operatorUsername: 'demo-admin', findTrialUser: username => storage.findUserByUsername(username) });
  const session = await auth.login(ownerPassword, 'demo-admin');
  assert.equal(session.userId, 'owner');
  storage.createTrialUser({ username: 'demo-admin', passwordHash: ordinaryHash });
  assert.equal(auth.configured, false);
  assert.equal(auth.setupInvalid, true);
  assert.equal(auth.getSession({ headers: { cookie: session.cookie.split(';')[0] } }), null);
  assert.equal((await auth.login(ownerPassword, 'owner')).error, 'OPERATOR_SETUP_REQUIRED');
});

test('private helper optionally writes the alias atomically and preserves unrelated env bytes and omitted aliases', async context => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-alias-helper-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, 'runtime.env');
  const original = '# Synthetic fixture\r\nOTHER="literal $value # retain"\r\nNESTLET_OPERATOR_USERNAME=old-admin\r\nTAIL=unchanged';
  await writeFile(target, original, { mode: 0o600 });
  const before = await stat(target);
  const metadata = await inspectOperatorTarget(target);
  await setOperatorPassword({ target, username: ' DEMO-ADMIN ', password: ownerPassword, passwordConfirmation: ownerPassword, confirmed: true, expectedVersion: metadata.version });
  const updated = await readFile(target, 'utf8');
  assert.ok(updated.startsWith(original.replace('NESTLET_OPERATOR_USERNAME=old-admin', "NESTLET_OPERATOR_USERNAME='demo-admin'")));
  assert.equal(updated.includes(ownerPassword), false);
  assert.equal(updated.split('NESTLET_OPERATOR_USERNAME=').length, 2);
  assert.notEqual((await stat(target)).ino, before.ino);
  assert.equal((await stat(target)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(directory), ['runtime.env']);
  const aliasLine = updated.split('\r\n').find(line => line.startsWith('NESTLET_OPERATOR_USERNAME='));
  await setOperatorPassword({ target, password: ownerPassword, passwordConfirmation: ownerPassword, confirmed: true, expectedVersion: (await inspectOperatorTarget(target)).version });
  assert.ok((await readFile(target, 'utf8')).includes(aliasLine));
  for (const username of ['', 'ab', 'Kelvin', 'admin\n', 'contains space', "bad'quote", null]) {
    const untouched = await readFile(target);
    await assert.rejects(setOperatorPassword({ target, username, password: ownerPassword, passwordConfirmation: ownerPassword, confirmed: true, expectedVersion: (await inspectOperatorTarget(target)).version }));
    assert.deepEqual(await readFile(target), untouched);
  }
  await writeFile(target, 'NESTLET_OPERATOR_USERNAME=first\nexport NESTLET_OPERATOR_USERNAME=second\n');
  await assert.rejects(inspectOperatorTarget(target), /duplicate administrator-username/);
});

test('real administrator login and ordinary registration reject five characters, accept six and preserve the 256-character maximum', async context => {
  const six = 'Abc123'; // Disposable test credential, never a real account.
  const site = await app(context, { passwordHash: makeHash(six) });
  assert.equal((await site.login('demo-admin', 'Abc12')).status, 401);
  assert.equal((await site.login('demo-admin', 'Abc124')).status, 401);
  for (const name of ['demo-admin', 'owner', '']) {
    const owner = await sessionFrom(await site.login(name, six));
    assert.equal(owner.userId, 'owner');
    assert.equal(owner.role, 'owner');
  }
  assert.equal((await site.register('five-characters', 'Abc12')).status, 400);
  assert.equal((await site.register('six-characters', six)).status, 201);
  const ordinary = await sessionFrom(await site.login('six-characters', six));
  assert.equal(ordinary.role, 'trial');
  assert.notEqual(ordinary.userId, 'owner');
  assert.equal((await site.request('/api/settings', { session: ordinary })).status, 403);
  assert.equal((await site.register('too-many-characters', 'x'.repeat(257))).status, 400);
  assert.equal((await site.register('maximum-characters', 'x'.repeat(256))).status, 201);
  assert.equal((await site.login('maximum-characters', 'x'.repeat(256))).status, 200);
  const fiveOnly = createOperatorAuth({ passwordHash: makeHash('Abc12') });
  assert.equal((await fiveOnly.login('Abc12')).error, 'INVALID_CREDENTIALS', 'Even a matching legacy five-character hash cannot bypass the minimum');
});

test('private administrator and ordinary setup both reject five characters and create usable six-character scrypt credentials', async context => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-six-character-helper-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, 'runtime.env');
  await writeFile(target, 'UNRELATED=preserved\n', { mode: 0o600 });
  const metadata = await inspectOperatorTarget(target);
  await assert.rejects(setOperatorPassword({ target, password: 'Abc12', passwordConfirmation: 'Abc12', confirmed: true, expectedVersion: metadata.version }), /6 to 256/);
  assert.equal(await readFile(target, 'utf8'), 'UNRELATED=preserved\n');
  for (const password of ['Abc123', 'x'.repeat(256), ownerPassword]) {
    await setOperatorPassword({ target, password, passwordConfirmation: password, confirmed: true, expectedVersion: (await inspectOperatorTarget(target)).version });
    const hash = /^NESTLET_OPERATOR_PASSWORD_HASH='([^']+)'$/mu.exec(await readFile(target, 'utf8'))[1];
    const auth = createOperatorAuth({ passwordHash: hash });
    assert.equal((await auth.login(password)).userId, 'owner');
  }
  const database = join(directory, 'nestlet.sqlite');
  openStorage({ filename: database }).close();
  const prepared = await inspectTrialDatabase(database, 'six-character-user');
  const options = { target: database, username: prepared.username, confirmed: true, expectedIdentity: prepared.identity };
  await assert.rejects(setTrialUserPassword({ ...options, password: 'Abc12', passwordConfirmation: 'Abc12' }), /6 to 256/);
  const user = await setTrialUserPassword({ ...options, password: 'Abc123', passwordConfirmation: 'Abc123' });
  const storage = openStorage({ filename: database });
  try {
    const auth = createOperatorAuth({ passwordHash: ownerHash, findTrialUser: name => storage.findUserByUsername(name) });
    const session = await auth.login('Abc123', 'six-character-user');
    assert.equal(session.userId, user.userId);
    assert.equal(session.role, 'trial');
    assert.equal((await auth.login(ownerPassword)).role, 'owner', 'Existing longer passwords remain compatible');
  } finally { storage.close(); }
});

test('remember me survives idle time but expires after eight hours and logout revokes it', async () => {
  const { scryptSync } = await import('node:crypto');
  const salt=Buffer.alloc(16,7), password='remember-fixture-only';
  const passwordHash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
  const {createOperatorAuth}=await import('../auth.js');
  const auth=createOperatorAuth({passwordHash});
  const normal=await auth.login(password,'owner');
  const remembered=await auth.login(password,'owner',true);
  const request=session=>({headers:{cookie:session.cookie.split(';')[0]}});
  const realNow=Date.now, start=realNow();
  try {
    Date.now=()=>start+31*60*1000;
    assert.equal(auth.getSession(request(normal)),null);
    assert.equal(auth.getSession(request(remembered)).userId,'owner');
    Date.now=()=>start+8*60*60*1000+1;
    assert.equal(auth.getSession(request(remembered)),null);
  } finally { Date.now=realNow; }
  const signedIn=await auth.login(password,'owner',true);
  auth.logout(auth.getSession(request(signedIn)));
  assert.equal(auth.getSession(request(signedIn)),null);
});
