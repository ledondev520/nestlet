// Real local HTTP + disposable SQLite: verifies the feature's exact API payloads.
// No browser, external provider, production identities, or deployment is involved.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { openStorage } from '../../../storage.js';
import { createApiClient } from '../../lib/api.js';
import { clientSearchPath, emptyCasePayload } from './copy.js';

const password = 'Synthetic-customer-test-password-only';
const hash = () => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`; };
const origin = 'https://nestlet-customers-ui-http.invalid';
let directory, child, base, clients, output = '';
let savedClient, savedCase;

before(async () => {
  directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-customer-ui-http-'));
  const filename = join(directory, 'cases.sqlite');
  const storage = openStorage({ filename });
  try {
    storage.createTrialUser({ username: 'customer-ui-a', passwordHash: hash() });
    storage.createTrialUser({ username: 'customer-ui-b', passwordHash: hash() });
  } finally { storage.close(); }
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../../../', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin, NESTLET_DB_PATH: filename,
      NESTLET_OPERATOR_PASSWORD_HASH: hash(), DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', value => output += value);
  child.stderr.on('data', value => output += value);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 5000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`)); });
    child.stdout.on('data', value => { if (value.toString().includes('Nestlet available')) { clearTimeout(timeout); resolve(); } });
  });
  clients = {};
  for (const username of ['customer-ui-a', 'customer-ui-b', 'owner']) {
    const response = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const { csrfToken } = await response.json();
    clients[username] = createApiClient({ getCsrfToken: () => csrfToken, fetchImpl: (path, options) => fetch(base + path, { ...options, headers: { ...options.headers, Origin: origin, Cookie: cookie } }) });
  }
});
after(async () => {
  if (child?.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('real HTTP supports literal own-account search, duplicate labels, optimistic rename and the exact empty-case payload', async () => {
  const api = clients['customer-ui-a'];
  savedClient = (await api.post('/api/clients', { displayName: 'Synthetic Johnny %_' })).client;
  const duplicate = (await api.post('/api/clients', { displayName: savedClient.displayName })).client;
  const foreign = (await clients['customer-ui-b'].post('/api/clients', { displayName: savedClient.displayName })).client;
  const result = await api.get(clientSearchPath('Johnny %_'));
  assert.deepEqual(new Set(result.clients.map(record => record.id)), new Set([savedClient.id, duplicate.id]));
  assert.ok(!result.clients.some(record => record.id === foreign.id));
  const updated = (await api.put(`/api/clients/${savedClient.id}`, { displayName: 'Synthetic renamed Johnny', expectedVersion: 1 })).client;
  assert.equal(updated.version, 2);
  await assert.rejects(api.put(`/api/clients/${savedClient.id}`, { displayName: 'Stale overwrite', expectedVersion: 1 }), error => error.status === 409 && error.code === 'CLIENT_CONFLICT');
  savedCase = (await api.post('/api/cases', emptyCasePayload('  Synthetic empty work  ', savedClient.id))).case;
  assert.equal(savedCase.title, 'Synthetic empty work');
  assert.equal(savedCase.clientId, savedClient.id);
  assert.equal(savedCase.sourceText, ''); assert.deepEqual(savedCase.fields, []); assert.equal(savedCase.draftText, '');
  assert.ok(!savedCase.documentContext?.recipientName?.value, 'Customer label must not become a verified document identity');
  assert.ok((await api.get(`/api/clients/${savedClient.id}/cases`)).cases.some(record => record.id === savedCase.id));
});

test('real HTTP lists saved artifact versions and denies foreign customer/case/artifact access, including owner', async () => {
  const api = clients['customer-ui-a'];
  const first = (await api.post(`/api/cases/${savedCase.id}/artifacts`, { kind: 'followup', title: 'Synthetic draft', status: 'draft', content: 'Synthetic working correspondence.', expectedCaseVersion: savedCase.version })).artifact;
  const second = (await api.post(`/api/cases/${savedCase.id}/artifacts`, { kind: 'followup', title: 'Synthetic edited draft', status: 'draft', content: 'Synthetic edited working correspondence.', expectedCaseVersion: savedCase.version })).artifact;
  const documents = (await api.get(`/api/clients/${savedClient.id}/artifacts`)).artifacts;
  assert.deepEqual(new Set(documents.map(record => record.id)), new Set([first.id, second.id]));
  assert.equal(second.version, first.version + 1);
  assert.ok(documents.every(record => record.caseId === savedCase.id && !Object.hasOwn(record, 'content')));
  for (const username of ['customer-ui-b', 'owner']) {
    const foreign = clients[username];
    for (const path of [`/api/clients/${savedClient.id}`, `/api/clients/${savedClient.id}/cases`, `/api/clients/${savedClient.id}/artifacts`, `/api/cases/${savedCase.id}`, `/api/artifacts/${first.id}`]) {
      await assert.rejects(foreign.get(path), error => error.status === 404);
    }
  }
});
