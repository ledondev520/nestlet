// Real HTTP/SQLite contract check only. Does not launch Chromium, validate DOM,
// fabricate message history, or establish provider/production acceptance.
import assert from 'node:assert/strict';
import { startBrowserFixture } from '../helpers/browser-fixture.mjs';
import { extract } from '../../public/core.js';

const usernames = ['synthetic-customer-check-a', 'synthetic-customer-check-b'];
const app = await startBrowserFixture({ legacyUsers: usernames });
const source = 'Property: 128 Example Lane Unit B\nOwner: Synthetic Property LLC\nPHA: Synthetic Housing Office\nCase reference: SYN-CUSTOMER-CHECK\nProposed rent: $2100';
async function call(session, path, { method = 'GET', body } = {}, status = 200) {
  const response = await fetch(app.origin + path, { method, headers: { Origin: app.origin,
    ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken } : {}),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, status, `${method} ${path}`);
  return response;
}
async function json(session, path, options, status) { return (await call(session, path, options, status)).json(); }
async function login(username) {
  const response = await call(null, '/api/login', { method: 'POST', body: { username,
    password: username === 'owner' ? 'public-browser-owner-fixture' : 'Case26' } });
  const status = await response.json();
  const session = { ...status, cookie: response.headers.get('set-cookie').split(';')[0] };
  assert.equal((await json(session, '/api/status')).liveEnabled, false);
  return session;
}
const writable = record => Object.fromEntries(['title', 'sourceText', 'fields', 'draftType', 'draftText', 'clientId', 'extractionMode', 'namesVerified'].map(key => [key, record[key]]));

try {
  const a = await login(usernames[0]);
  const b = await login(usernames[1]);
  const owner = await login('owner');
  const label = 'Synthetic Johnny 100%_case';
  const client = (await json(a, '/api/clients', { method: 'POST', body: { displayName: label } }, 201)).client;
  const unicode = (await json(a, '/api/clients', { method: 'POST', body: { displayName: 'Synthetic Élodie' } }, 201)).client;
  for (const [query, id] of [['johnny', client.id], ['%', client.id], ['_', client.id], ['élodie', unicode.id]]) {
    assert.deepEqual((await json(a, '/api/clients?search=' + encodeURIComponent(query))).clients.map(row => row.id), [id]);
  }
  const cases = [];
  for (const title of ['Synthetic linked case one', 'Synthetic linked case two']) {
    const record = (await json(a, '/api/cases', { method: 'POST', body: { title, sourceText: '', fields: [], draftType: 'followup', draftText: '', clientId: client.id } }, 201)).case;
    assert.equal(record.clientId, client.id); assert.equal(record.sourceText, '');
    assert.ok(record.fields.every(field => !field.value && !field.confirmed));
    cases.push(record);
  }
  const originalBytes = Buffer.from(source + '\r\n', 'utf8');
  const upload = await fetch(app.origin + `/api/assets?caseId=${cases[0].id}`, { method: 'POST',
    headers: { Origin: app.origin, Cookie: a.cookie, 'X-CSRF-Token': a.csrfToken, 'Content-Type': 'text/plain',
      'X-Asset-Filename': 'synthetic-customer-linked-original.txt', 'X-Asset-Consent': 'persist-private' }, body: originalBytes });
  assert.equal(upload.status, 201);
  const { asset } = await upload.json();
  assert.equal(asset.caseId, cases[0].id); assert.equal(asset.clientId, client.id);
  let first = (await json(a, `/api/cases/${cases[0].id}`, { method: 'PUT', body: { ...writable(cases[0]), sourceText: source,
    fields: extract(source).map(field => ({ ...field, confirmed: true })), expectedVersion: cases[0].version } })).case;
  first = (await json(a, `/api/cases/${first.id}/issues`, { method: 'PATCH', body: { expectedVersion: first.version,
    changes: [{ question: 'Synthetic contact question?', status: 'resolved', resolution: 'Use the reviewed synthetic recipient.' }] } })).case;
  first = (await json(a, `/api/cases/${first.id}/document-context`, { method: 'PATCH', body: { expectedVersion: first.version, confirm: true,
    changes: { recipientName: { value: 'Synthetic recipient department' }, recipientContact: { value: 'recipient@example.invalid' },
      senderName: { value: 'Synthetic case operator' }, senderContact: { value: 'operator@example.invalid' } } } })).case;
  const final = (await json(a, `/api/cases/${first.id}/artifacts/generate`, { method: 'POST', body: { kind: 'followup', status: 'final', expectedCaseVersion: first.version } }, 201)).artifact;
  const draft = (await json(a, `/api/cases/${first.id}/artifacts`, { method: 'POST', body: { kind: 'followup', status: 'draft',
    title: 'Synthetic edited review version', content: final.content + '\nSynthetic review note.', expectedCaseVersion: first.version } }, 201)).artifact;
  assert.equal(draft.version, final.version + 1);
  assert.equal(await (await call(a, `/api/artifacts/${final.id}/download`)).text(), final.content);
  assert.equal(await (await call(a, `/api/artifacts/${draft.id}/download`)).text(), draft.content);
  assert.equal((await json(a, `/api/clients/${client.id}/artifacts`)).artifacts.length, 2);
  const conversations = [];
  for (const [record, title] of [[first, 'Synthetic intake discussion'], [first, 'Synthetic follow-up discussion'], [cases[1], 'Synthetic second-case discussion']]) {
    const conversation = (await json(a, `/api/cases/${record.id}/conversations`, { method: 'POST', body: { title } }, 201)).conversation;
    assert.equal(conversation.caseId, record.id);
    assert.deepEqual((await json(a, `/api/conversations/${conversation.id}`)).messages, []);
    conversations.push(conversation);
  }
  assert.equal((await json(a, `/api/cases/${first.id}/conversations`)).conversations.length, 2);
  assert.equal((await json(a, `/api/clients/${client.id}/cases`)).cases.length, 2);

  const latestClient = (await json(a, `/api/clients/${client.id}`, { method: 'PUT', body: { displayName: 'Synthetic remote label', expectedVersion: client.version } })).client;
  assert.equal((await json(a, `/api/clients/${client.id}`, { method: 'PUT', body: { displayName: 'Synthetic stale label', expectedVersion: client.version } }, 409)).code, 'CLIENT_CONFLICT');
  assert.equal((await json(a, `/api/clients/${client.id}`)).client.displayName, latestClient.displayName);
  const second = (await json(a, `/api/cases/${cases[1].id}`, { method: 'PUT', body: { ...writable(cases[1]), sourceText: 'Synthetic remote source.', expectedVersion: cases[1].version } })).case;
  assert.equal((await json(a, `/api/cases/${second.id}`, { method: 'PUT', body: { ...writable(cases[1]), sourceText: 'Synthetic stale source.', expectedVersion: cases[1].version } }, 409)).code, 'CASE_CONFLICT');
  assert.equal((await json(a, `/api/cases/${second.id}`)).case.sourceText, second.sourceText);
  for (const other of [b, owner]) {
    assert.deepEqual((await json(other, '/api/clients')).clients, []);
    assert.deepEqual((await json(other, '/api/cases')).cases, []);
    for (const path of [`/api/clients/${client.id}`, `/api/clients/${client.id}/cases`, `/api/clients/${client.id}/artifacts`,
      `/api/cases/${first.id}`, `/api/cases/${second.id}`, `/api/cases/${first.id}/conversations`,
      `/api/assets/${asset.id}`, `/api/assets/${asset.id}/text`, `/api/assets/${asset.id}/download`,
      ...conversations.map(row => `/api/conversations/${row.id}`),
      ...[final, draft].flatMap(row => [`/api/artifacts/${row.id}`, `/api/artifacts/${row.id}/download`])]) await call(other, path, {}, 404);
    await call(other, `/api/clients/${client.id}`, { method: 'PUT', body: { displayName: 'Forbidden rename', expectedVersion: latestClient.version } }, 404);
    await call(other, `/api/cases/${first.id}`, { method: 'DELETE', body: { expectedVersion: first.version } }, 404);
  }
  await call(b, '/api/settings', {}, 403); await call(owner, '/api/settings');
  await call(a, '/api/logout', { method: 'POST', body: {} });
  await app.restart();
  await call(a, `/api/cases/${first.id}`, {}, 401); // Explicit logout stays revoked.
  await call(b, '/api/cases'); // Untouched ordinary cookie survives restart.
  await call(b, `/api/cases/${first.id}`, {}, 404); // Its foreign case remains private.
  const reopened = await login(usernames[0]);
  assert.deepEqual((await json(reopened, `/api/cases/${first.id}`)).case, first);
  assert.equal((await json(reopened, `/api/artifacts/${final.id}`)).artifact.content, final.content);
  assert.equal((await json(reopened, `/api/artifacts/${draft.id}`)).artifact.content, draft.content);
  assert.equal((await json(reopened, `/api/clients/${client.id}`)).client.displayName, latestClient.displayName);
  assert.deepEqual(Buffer.from(await (await call(reopened, `/api/assets/${asset.id}/download`)).arrayBuffer()), originalBytes);
  console.log('PASS: real HTTP/SQLite customer literal search, two linked cases, resolved question, confirmed context, immutable final/edited draft, three empty conversations, stale case/customer 409, owner/ordinary isolation, real server restart, durable unexpired sessions and persistent logout, exact original bytes and fresh login/reopen. Browser, network interruption and provider NOT RUN.');
} finally { await app.stop(); }
