// Strict acceptance: actual HTTP, SQLite files, identities and scrypt. No provider/network mocks.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openStorage } from '../storage.js';
import { extract } from '../public/core.js';

const passwords = { owner: 'acceptance-owner-password-only', 'trial-a': 'acceptance-trial-a-password-only', 'trial-b': 'acceptance-trial-b-password-only' };
const passwordHash = password => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`; };
const ownerHash = passwordHash(passwords.owner);
let directory, filename, server, identities, sessions;
const source = 'Property: 128 Example Lane\nOwner: Example LLC\nPHA: Not confirmed\nCase reference: ACCEPTANCE-1\nProposed rent: $2,100';
const payload = title => ({ title, sourceText: source, fields: extract(source), draftType: 'followup', draftText: '', extractionMode: 'manual', namesVerified: false });

async function start(database = filename) {
  const child = spawn(process.execPath, ['--import', './test/helpers/ephemeral-server-bootstrap.mjs', 'server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', PUBLIC_ORIGIN: 'https://nestlet-cases-acceptance.invalid',
      NESTLET_DB_PATH: database, NESTLET_OPERATOR_PASSWORD_HASH: ownerHash, DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const result = { child, url: null, origin: 'https://nestlet-cases-acceptance.invalid', output: '' };
  child.stdout.on('data', data => result.output += data);
  child.stderr.on('data', data => result.output += data);
  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        child.off('error', failed);
        child.off('exit', exited);
        child.off('message', ready);
      };
      const failed = error => { cleanup(); reject(error); };
      const exited = (code, signal) => failed(new Error(`Server exited ${code ?? signal}: ${result.output}`));
      const ready = message => {
        if (message?.type !== 'nestlet-test-listening') return;
        const address = message.address;
        if (address?.address !== '127.0.0.1' || !Number.isInteger(address.port) || address.port <= 0) {
          return failed(new Error('Invalid server listening address'));
        }
        result.url = `http://127.0.0.1:${address.port}`;
        cleanup();
        resolve();
      };
      const timeout = setTimeout(() => failed(new Error(`Server did not start: ${result.output}`)), 5000);
      child.once('error', failed);
      child.once('exit', exited);
      child.on('message', ready);
    });
    return result;
  } catch (error) {
    await stop(result);
    throw error;
  }
}
async function stop(instance = server) {
  const child = instance?.child;
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  }
}
const request = (path, { method = 'GET', body, session, headers = {} } = {}) => fetch(server.url + path, {
  method, headers: { Origin: server.origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}), ...headers },
  ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
});
async function login(username, password = passwords[username]) {
  const response = await request('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(response.status, 200, `Login for ${username}`);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.csrfToken, ...body };
}
async function create(session, title) {
  const response = await request('/api/cases', { method: 'POST', session, body: payload(title) });
  assert.equal(response.status, 201);
  return (await response.json()).case;
}

before(async () => {
  directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-case-api-'));
  filename = join(directory, 'cases.sqlite');
  const storage = openStorage({ filename });
  try {
    identities = Object.fromEntries(['trial-a', 'trial-b'].map(username => [username, storage.createTrialUser({ username, passwordHash: passwordHash(passwords[username]) })]));
  } finally { storage.close(); }
  server = await start();
  sessions = {};
  for (const username of ['owner', 'trial-a', 'trial-b']) sessions[username] = await login(username);
});
after(async () => { await stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

test('named real logins bind immutable owner/trial identities and hide owner settings metadata from trials', async () => {
  assert.equal(sessions.owner.role, 'owner');
  assert.equal(sessions.owner.userId, 'owner');
  for (const username of ['trial-a', 'trial-b']) {
    const session = sessions[username];
    assert.equal(session.role, 'trial');
    assert.equal(session.userId, identities[username].id);
    const response = await request('/api/status', { session });
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.authenticated, true);
    assert.equal(status.role, 'trial');
    for (const key of ['configured', 'keyStorage', 'connectionVerifiedAt', 'operatorSetupInvalid']) assert.equal(key in status, false, key);
  }
  const publicStatus = await (await request('/api/status')).json();
  for (const key of ['configured', 'keyStorage', 'connectionVerifiedAt', 'operatorSetupInvalid']) assert.equal(key in publicStatus, false, key);
});

test('trial identities cannot read, change, or test provider settings even with valid CSRF', async () => {
  for (const username of ['trial-a', 'trial-b']) {
    for (const [method, path, body] of [['GET', '/api/settings', undefined], ['POST', '/api/settings', { enableLive: false }], ['POST', '/api/settings/test', {}]]) {
      const response = await request(path, { method, body, session: sessions[username], headers: { 'X-User-Id': 'owner', 'X-Role': 'owner' } });
      assert.equal(response.status, 403, `${username} ${method} ${path}`);
      const result = await response.json();
      assert.equal(result.code, 'OWNER_REQUIRED');
      assert.equal('configured' in result, false);
      assert.equal('apiKey' in result, false);
    }
  }
  const owner = await request('/api/settings', { session: sessions.owner });
  assert.equal(owner.status, 200);
  assert.equal((await owner.json()).configured, false);
});

test('owner and both trial users can access only their own case IDs for read, update, and delete', async () => {
  const names = ['owner', 'trial-a', 'trial-b'];
  const records = {};
  for (const name of names) records[name] = await create(sessions[name], `Private case for ${name}`);
  for (const victim of names) {
    const record = records[victim];
    assert.equal(record.version, 1);
    assert.ok(Number.isFinite(Date.parse(record.createdAt)));
    for (const attacker of names.filter(name => name !== victim)) {
      for (const [method, body] of [['GET', undefined], ['PUT', { ...payload('Unauthorized overwrite'), expectedVersion: record.version }], ['DELETE', { expectedVersion: record.version }]]) {
        const response = await request('/api/cases/' + record.id, { method, body, session: sessions[attacker] });
        assert.equal(response.status, 404, `${attacker} ${method} ${victim}`);
        const error = await response.json();
        assert.equal(error.code, 'CASE_NOT_FOUND');
        assert.equal(JSON.stringify(error).includes(record.title), false);
      }
    }
    const own = await request('/api/cases/' + record.id, { session: sessions[victim] });
    assert.equal(own.status, 200);
    assert.deepEqual((await own.json()).case, record);
    const list = await request('/api/cases', { session: sessions[victim] });
    assert.equal(list.status, 200);
    const metadata = (await list.json()).cases;
    assert.ok(metadata.some(item => item.id === record.id));
    for (const other of names.filter(name => name !== victim)) assert.equal(metadata.some(item => item.id === records[other].id), false);
    for (const item of metadata) for (const key of ['sourceText', 'fields', 'draftText', 'passwordHash', 'userId']) assert.equal(key in item, false, key);
  }
});

test('case version checks prevent stale overwrites/deletes and allow a correctly versioned delete', async () => {
  const record = await create(sessions['trial-a'], 'Versioned working copy');
  const update = { ...payload('Reviewed working copy'), fields: extract(source).map(field => ({ ...field, confirmed: true })), draftText: 'DRAFT — FOR HUMAN REVIEW\nAn English working copy.', expectedVersion: 1 };
  let response = await request('/api/cases/' + record.id, { method: 'PUT', session: sessions['trial-a'], body: update });
  assert.equal(response.status, 200);
  const saved = (await response.json()).case;
  assert.equal(saved.version, 2);
  assert.equal(saved.draftText, update.draftText);
  assert.ok(saved.fields.every(field => field.confirmed === true));
  for (const [method, body] of [['PUT', { ...payload('Stale overwrite'), expectedVersion: 1 }], ['DELETE', { expectedVersion: 1 }]]) {
    response = await request('/api/cases/' + record.id, { method, body, session: sessions['trial-a'] });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'CASE_CONFLICT');
  }
  response = await request('/api/cases/' + record.id, { session: sessions['trial-a'] });
  assert.deepEqual((await response.json()).case, saved);
  response = await request('/api/cases/' + record.id, { method: 'DELETE', body: { expectedVersion: 2 }, session: sessions['trial-a'] });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  response = await request('/api/cases/' + record.id, { session: sessions['trial-a'] });
  assert.equal(response.status, 404);
});

test('two actual concurrent saves with one version permit exactly one write', async () => {
  const record = await create(sessions['trial-b'], 'Concurrent draft');
  const responses = await Promise.all(['First actual save', 'Second actual save'].map(title => request('/api/cases/' + record.id, {
    method: 'PUT', session: sessions['trial-b'], body: { ...payload(title), expectedVersion: 1 },
  })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = (await responses.find(response => response.status === 200).json()).case;
  const response = await request('/api/cases/' + record.id, { session: sessions['trial-b'] });
  const persisted = (await response.json()).case;
  assert.equal(persisted.version, 2);
  assert.equal(persisted.title, winner.title);
});

test('case routes enforce authentication, CSRF, and same-origin mutation without changing saved data', async () => {
  const record = await create(sessions['trial-a'], 'CSRF-protected case');
  for (const [method, path, body] of [
    ['GET', '/api/cases', undefined], ['GET', '/api/cases/' + record.id, undefined],
    ['POST', '/api/cases', payload('Unauthorized create')],
    ['PUT', '/api/cases/' + record.id, { ...payload('Unauthorized edit'), expectedVersion: 1 }],
    ['DELETE', '/api/cases/' + record.id, { expectedVersion: 1 }],
  ]) {
    const response = await request(path, { method, body });
    assert.equal(response.status, 401);
  }
  for (const [method, path, body] of [
    ['POST', '/api/cases', payload('Missing CSRF')],
    ['PUT', '/api/cases/' + record.id, { ...payload('Missing CSRF'), expectedVersion: 1 }],
    ['DELETE', '/api/cases/' + record.id, { expectedVersion: 1 }],
  ]) {
    const response = await request(path, { method, body, session: sessions['trial-a'], headers: { 'X-CSRF-Token': '' } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'CSRF_REJECTED');
  }
  const foreign = await request('/api/cases/' + record.id, { method: 'DELETE', body: { expectedVersion: 1 }, session: sessions['trial-a'], headers: { Origin: 'https://untrusted.invalid' } });
  assert.equal(foreign.status, 403);
  const retained = await request('/api/cases/' + record.id, { session: sessions['trial-a'] });
  assert.deepEqual((await retained.json()).case, record);
});

test('case payload validation rejects malformed, oversized, credential-bearing, or falsely reviewed documents', async () => {
  const baseline = (await (await request('/api/cases', { session: sessions['trial-b'] })).json()).cases;
  const normal = payload('Validation boundary');
  const largeFields = normal.fields.map(field => ({ ...field, source: 'x'.repeat(45000) }));
  for (const [body, status, code] of [
    ['{broken JSON', 400, 'INVALID_JSON'],
    [{ ...normal, title: '' }, 400, 'CASE_INVALID'],
    [{ ...normal, title: 'x'.repeat(121) }, 413, 'CASE_TOO_LARGE'],
    [{ ...normal, sourceText: 'x'.repeat(50001) }, 413, 'CASE_TOO_LARGE'],
    [{ ...normal, draftText: 'x'.repeat(50001) }, 413, 'CASE_TOO_LARGE'],
    [{ ...normal, title: 'forbidden\nline' }, 400, 'CASE_INVALID'],
    [{ ...normal, userId: 'owner' }, 400, 'CASE_INVALID'],
    [{ ...normal, apiKey: 'inert-test-only-value' }, 400, 'CASE_INVALID'],
    [{ ...normal, draftType: 'official-government-form' }, 400, 'CASE_INVALID'],
    [{ ...normal, fields: normal.fields.slice(1) }, 400, 'CASE_INVALID'],
    [{ ...normal, fields: normal.fields.map(field => ({ ...field, confirmed: 'yes' })) }, 400, 'CASE_INVALID'],
    [{ ...normal, draftText: 'Unreviewed document cannot become a saved reviewed draft.' }, 400, 'CASE_INVALID'],
    [{ ...normal, fields: largeFields, sourceText: 'x'.repeat(40000) }, 413, 'CASE_TOO_LARGE'],
    ['x'.repeat(300001), 413, 'CASE_TOO_LARGE'],
  ]) {
    const response = await request('/api/cases', { method: 'POST', body, session: sessions['trial-b'] });
    assert.equal(response.status, status, code);
    assert.equal((await response.json()).code, code);
  }
  const after = (await (await request('/api/cases', { session: sessions['trial-b'] })).json()).cases;
  assert.deepEqual(after, baseline);
});

test('actual SQLite cases and named identities survive a server reopen and unexpired sessions do too', async () => {
  const records = {};
  for (const name of ['owner', 'trial-a']) records[name] = await create(sessions[name], `Durable ${name} case`);
  const oldSessions = sessions;
  await stop();
  assert.equal((await readFile(filename)).subarray(0, 16).toString(), 'SQLite format 3\u0000');
  server = await start();
  for (const name of ['owner', 'trial-a', 'trial-b']) {
    const response = await request('/api/cases', { session: oldSessions[name] });
    assert.equal(response.status, 200);
  }
  sessions = {};
  for (const name of ['owner', 'trial-a', 'trial-b']) sessions[name] = await login(name);
  for (const name of ['owner', 'trial-a']) {
    const response = await request('/api/cases/' + records[name].id, { session: sessions[name] });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).case, records[name]);
  }
  const unrelated = await request('/api/cases/' + records['trial-a'].id, { session: sessions['trial-b'] });
  assert.equal(unrelated.status, 404);
  assert.equal(sessions['trial-a'].userId, identities['trial-a'].id);
});

test('actual trial password rotation keeps the user ID and cases but immediately revokes old sessions', async () => {
  const record = await create(sessions['trial-a'], 'Case retained after credential rotation');
  const oldSession = sessions['trial-a'];
  const nextPassword = 'new-acceptance-trial-password-only';
  const storage = openStorage({ filename });
  try {
    const updated = storage.upsertTrialUser({ username: 'trial-a', passwordHash: passwordHash(nextPassword) });
    assert.equal(updated.id, identities['trial-a'].id);
  } finally { storage.close(); }
  let response = await request('/api/cases/' + record.id, { session: oldSession });
  assert.equal(response.status, 401);
  response = await request('/api/login', { method: 'POST', body: { username: 'trial-a', password: passwords['trial-a'] } });
  assert.equal(response.status, 401);
  passwords['trial-a'] = nextPassword;
  sessions['trial-a'] = await login('trial-a');
  assert.equal(sessions['trial-a'].userId, identities['trial-a'].id);
  response = await request('/api/cases/' + record.id, { session: sessions['trial-a'] });
  assert.deepEqual((await response.json()).case, record);
  response = await request('/api/cases', { session: sessions['trial-b'] });
  assert.equal(response.status, 200, 'Another user session must remain valid');
});

test('a real trial account is capped at 100 cases and recovers capacity after deleting its own case', async () => {
  const username = 'trial-cap';
  const password = 'acceptance-cap-password-only';
  const storage = openStorage({ filename });
  try { storage.createTrialUser({ username, passwordHash: passwordHash(password) }); }
  finally { storage.close(); }
  const session = await login(username, password);
  const records = [];
  for (let index = 0; index < 100; index++) records.push(await create(session, `Capacity case ${index + 1}`));
  let response = await request('/api/cases', { method: 'POST', session, body: payload('Over capacity') });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'CASE_LIMIT_REACHED');
  response = await request('/api/cases', { session });
  assert.equal((await response.json()).cases.length, 100);
  response = await request('/api/cases/' + records[0].id, { method: 'PUT', session, body: { ...payload('Update at capacity'), expectedVersion: 1 } });
  assert.equal(response.status, 200);
  response = await request('/api/cases/' + records[0].id, { method: 'DELETE', session, body: { expectedVersion: 2 } });
  assert.equal(response.status, 200);
  await create(session, 'Replacement after deletion');
  response = await request('/api/cases', { session });
  assert.equal((await response.json()).cases.length, 100);
});

test('concurrent fixture starts keep distinct kernel-assigned ports through repeated restarts', async () => {
  // Separate actual SQLite databases; no provider or HTTP mocks.
  for (let round = 0; round < 3; round++) {
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, (_, index) =>
      start(join(directory, `parallel-${index}.sqlite`))));
    const instances = attempts.filter(attempt => attempt.status === 'fulfilled').map(attempt => attempt.value);
    try {
      const failed = attempts.find(attempt => attempt.status === 'rejected');
      if (failed) throw failed.reason;
      assert.equal(new Set([server.url, ...instances.map(instance => instance.url)]).size, 5);
      for (const instance of instances) {
        const response = await fetch(instance.url + '/api/status');
        assert.equal(response.status, 200);
        assert.equal((await response.json()).authenticated, false);
      }
    } finally {
      await Promise.all(instances.map(instance => stop(instance)));
    }
  }
});
