// Real HTTP + SQLite using the exact intake payload and shared API client.
// Authored synthetic data only; no provider calls or response doubles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { openStorage } from '../../../storage.js';
import { createApiClient } from '../../lib/api.js';
import { casePayload, caseWork, extract } from './logic.js';

test('real intake PUT preserves exact prior draft once, returns canonical invalidation, and keeps newer-version conflicts atomic', async context => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-intake-atomic-'));
  const filename = join(directory, 'case.sqlite');
  const password = 'public-synthetic-intake-test-only';
  const salt = randomBytes(16), hash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
  const store = openStorage({ filename });
  store.createTrialUser({ username: 'intake-atomic-test', passwordHash: hash });
  store.close();
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('../../../', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: '', NESTLET_DB_PATH: filename, NESTLET_ASSETS_PATH: join(directory, 'assets'), NESTLET_OPERATOR_PASSWORD_HASH: hash, DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' }, stdio: ['ignore', 'pipe', 'pipe'] });
  context.after(async () => {
    if (child.exitCode === null) { const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await stopped; }
    await rm(directory, { recursive: true, force: true });
  });
  let output = '';
  child.stdout.on('data', value => output += value); child.stderr.on('data', value => output += value);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Fixture failed to start: ${output}`)), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}`)); });
    child.stdout.on('data', value => { if (value.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); } });
  });
  const login = await fetch(origin + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'intake-atomic-test', password }) });
  assert.equal(login.status, 200);
  const { csrfToken } = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0];
  const api = createApiClient({ getCsrfToken: () => csrfToken, fetchImpl: (path, options) => fetch(origin + path, { ...options, headers: { ...options.headers, Origin: origin, Cookie: cookie } }) });
  const source = 'Property: Synthetic Lane\nOwner: Synthetic LLC\nPHA: Synthetic Agency\nCase reference: TEST-ONLY\nProposed rent: $2100';
  const oldText = 'Subject: Synthetic follow-up\n\nKeep this exact carefully edited paragraph.\n';
  const original = (await api.post('/api/cases', casePayload({ ...caseWork(), title: 'Synthetic intake archival', sourceText: source, fields: extract(source).map(field => ({ ...field, confirmed: true })), draftText: oldText }, 'Synthetic'))).case;
  const edits = caseWork(original);
  edits.fields = edits.fields.map(field => field.key === 'property' ? { ...field, value: 'Changed synthetic lane', confirmed: false, edited: true } : field);
  const payload = { ...casePayload(edits, 'Synthetic'), expectedVersion: original.version };
  assert.equal(payload.draftText, oldText, 'Intake carries the old text and lets the transaction own archival');
  const result = await api.put(`/api/cases/${original.id}`, payload);
  assert.equal(result.archivedLegacyDraft, true);
  assert.equal(result.legacyDraftInvalidated, true);
  assert.equal(result.case.draftText, '');
  assert.equal(result.case.fields.find(field => field.key === 'property').confirmed, false);
  const archived = (await api.get(`/api/artifacts/${result.archivedArtifactId}`)).artifact;
  assert.equal(archived.content, oldText);
  assert.equal(archived.sourceCaseVersion, original.version);
  assert.equal(archived.status, 'draft');
  await assert.rejects(api.put(`/api/cases/${original.id}`, payload), error => error.status === 409 && error.code === 'CASE_CONFLICT');
  assert.equal((await api.get(`/api/cases/${original.id}/artifacts`)).artifacts.length, 1);
  assert.equal((await api.get(`/api/cases/${original.id}`)).case.version, result.case.version);
});
