// Fixture sanity only: actual HTTP/SQLite/private-file bytes, not browser evidence.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['test/helpers/frontend-browser-server.mjs'], {
  cwd: new URL('../../', import.meta.url),
  // Deliberately unusable public sentinel proves that the helper does not inherit it.
  env: { ...process.env, NESTLET_BROWSER_PORT: String(port), ENABLE_LIVE_AI: 'true', DEEPSEEK_API_KEY: 'public-unused-fixture-sentinel' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', value => output += value);
child.stderr.on('data', value => output += value);
let cookie = '', csrf = '';
async function call(path, { method = 'GET', body, raw, headers = {} } = {}) {
  return fetch(origin + path, { method, headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf,
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(raw === undefined ? {} : { body: raw }) });
}
async function session(path, username) {
  const response = await call(path, { method: 'POST', body: { username, password: 'Case26', ...(path === '/api/register' ? { passwordConfirmation: 'Case26' } : {}) } });
  assert.equal(response.status, path === '/api/register' ? 201 : 200);
  cookie = response.headers.get('set-cookie').split(';')[0];
  const value = await response.json(); csrf = value.csrfToken;
  assert.equal(value.role, 'trial');
  return value;
}
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser fixture startup timeout')), 10000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Browser fixture exited: ${code}`)); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', value => { if (output.includes('Nestlet available')) { clearTimeout(timer); resolve(); } });
  });
  const status = await (await call('/api/status')).json();
  assert.equal(status.registrationEnabled, false); assert.equal(status.liveEnabled, false);
  const entry = await call('/next/'); assert.equal(entry.status, 200);
  assert.match(entry.headers.get('content-security-policy'), /script-src 'self'/);
  assert.doesNotMatch(entry.headers.get('content-security-policy'), /unsafe-inline/);
  await session('/api/login', 'fixture-check-a');
  const bytes = Buffer.from('Synthetic standalone HTTP fixture\r\nExact original bytes.\r\n');
  const uploaded = await call('/api/assets', { method: 'POST', raw: bytes, headers: { 'Content-Type': 'text/plain', 'X-Asset-Filename': 'synthetic-fixture.txt', 'X-Asset-Consent': 'persist-private' } });
  assert.equal(uploaded.status, 201);
  const { asset } = await uploaded.json(); assert.equal(asset.caseId, null); assert.equal(asset.clientId, null);
  assert.deepEqual(Buffer.from(await (await call(`/api/assets/${asset.id}/download`)).arrayBuffer()), bytes);
  const saved = await call('/api/cases', { method: 'POST', body: { title: 'Synthetic fixture case', sourceText: 'Property: 128 Example Lane', fields: ['property', 'owner', 'pha', 'caseReference', 'rent'].map(key => ({ key, value: key === 'property' ? '128 Example Lane' : '', source: key === 'property' ? 'Synthetic manual fixture' : '', confirmed: key === 'property', conflict: false })), draftType: 'followup', draftText: '', extractionMode: 'manual', namesVerified: false } });
  assert.equal(saved.status, 201); const { case: record } = await saved.json(); assert.equal(record.clientId, null);
  const readiness = await (await call(`/api/cases/${record.id}/readiness?kind=followup&locale=en`)).json();
  assert.equal(readiness.ready, false); assert.deepEqual(readiness.missing.map(item => item.key), ['recipientName', 'recipientContact', 'senderName', 'senderContact']);
  const confirmed = await call(`/api/cases/${record.id}/document-context`, { method: 'PATCH', body: { expectedVersion: record.version, confirm: true, changes: {
    recipientName: { value: 'Synthetic recipient' }, recipientContact: { value: 'recipient@example.invalid' }, senderName: { value: 'Synthetic operator' }, senderContact: { value: 'operator@example.invalid' }
  } } });
  assert.equal(confirmed.status, 200); const latest = (await confirmed.json()).case;
  const generated = await call(`/api/cases/${record.id}/artifacts/generate`, { method: 'POST', body: { kind: 'followup', status: 'final', expectedCaseVersion: latest.version } });
  assert.equal(generated.status, 201); const { artifact } = await generated.json(); assert.equal(artifact.status, 'final');
  assert.equal(await (await call(`/api/artifacts/${artifact.id}/download`)).text(), artifact.content);
  assert.equal((await call('/api/logout', { method: 'POST', body: {} })).status, 200);
  assert.equal((await call(`/api/cases/${record.id}`)).status, 401);
  await session('/api/login', 'fixture-check-b');
  for (const path of [`/api/cases/${record.id}`, `/api/assets/${asset.id}/download`, `/api/artifacts/${artifact.id}/download`]) assert.equal((await call(path)).status, 404);
  assert.equal((await call('/api/logout', { method: 'POST', body: {} })).status, 200);
  await session('/api/login', 'fixture-check-a');
  assert.equal((await (await call(`/api/cases/${record.id}`)).json()).case.id, record.id);
  assert.equal(await (await call(`/api/artifacts/${artifact.id}/download`)).text(), artifact.content);
  assert.equal(output.includes('Case26'), false);
  assert.equal(output.includes('Synthetic fixture case'), false);
  console.log('PASS: real HTTP private legacy-seeded fixture login, original bytes, case storage, readiness, deterministic final, logout, six-character login, and user isolation. Browser and live provider NOT RUN.');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await exited;
  }
}

// The same official browser CI entry also validates the independent email fixture.
await import('./email-fixture.check.mjs');
