// Strict acceptance: actual HTTP, SQLite files, identities and scrypt. No provider/network mocks.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import { openStorage } from '../storage.js';
import { extract } from '../public/core.js';

const passwords = { owner: 'acceptance-owner-password-only', 'trial-a': 'acceptance-trial-a-password-only', 'trial-b': 'acceptance-trial-b-password-only' };
const passwordHash = password => { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`; };
const ownerHash = passwordHash(passwords.owner);
let directory, filename, server, identities, sessions;
const source = 'Property: 128 Example Lane\nOwner: Example LLC\nPHA: Not confirmed\nCase reference: ACCEPTANCE-1\nProposed rent: $2,100';
const payload = (title, extra = {}) => ({ title, sourceText: source, fields: extract(source), draftType: 'followup', draftText: '', extractionMode: 'manual', namesVerified: false, ...extra });

async function start() {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: 'https://nestlet-customer-acceptance.invalid',
      NESTLET_DB_PATH: filename, NESTLET_OPERATOR_PASSWORD_HASH: ownerHash, DEEPSEEK_API_KEY: '', ENABLE_LIVE_AI: 'false', DEEPSEEK_MODEL: 'deepseek-flash' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const result = { child, url: `http://127.0.0.1:${port}`, origin: 'https://nestlet-customer-acceptance.invalid', output: '' };
  child.stdout.on('data', data => result.output += data);
  child.stderr.on('data', data => result.output += data);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${result.output}`)), 5000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${result.output}`)); });
    const ready = data => { if (data.toString().includes('Nestlet available')) { clearTimeout(timeout); child.stdout.off('data', ready); resolve(); } };
    child.stdout.on('data', ready);
  });
  return result;
}
async function stop() {
  if (server?.child.exitCode === null) await new Promise(resolve => { server.child.once('exit', resolve); server.child.kill('SIGTERM'); });
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
async function create(session, title, extra = {}) {
  const response = await request('/api/cases', { method: 'POST', session, body: payload(title, extra) });
  assert.equal(response.status, 201);
  return (await response.json()).case;
}

before(async () => {
  directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-customer-api-'));
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

// This suite uses real disposable SQLite and HTTP; no upstream generation is performed.
async function json(path, options, status = 200) {
  const response = await request(path, options);
  const result = await response.json();
  assert.equal(response.status, status, `${options?.method ?? 'GET'} ${path}: ${JSON.stringify(result)}`);
  return result;
}
const client = async (session, displayName) => (await json('/api/clients', { method: 'POST', session, body: { displayName } }, 201)).client;
const conversation = async (session, record, title) => (await json(`/api/cases/${record.id}/conversations`, { method: 'POST', session, body: { title } }, 201)).conversation;
const artifact = async (session, record, content, extra = {}) => (await json(`/api/cases/${record.id}/artifacts`, {
  method: 'POST', session, body: { kind: 'followup', title: 'Synthetic working correspondence', status: 'draft', content, expectedCaseVersion: record.version, ...extra },
}, 201)).artifact;

test('customer names are literal own-user substring searches, including Unicode, SQL wildcard characters and duplicate names', async () => {
  const a = sessions['trial-a'], b = sessions['trial-b'];
  const owned = await client(a, 'Synthetic Johnny 100%_案例');
  const duplicate = await client(a, owned.displayName);
  const foreign = await client(b, owned.displayName);
  const unrelated = await client(a, 'Synthetic Janice unrelated');
  assert.notEqual(owned.id, duplicate.id);
  for (const query of ['johnny', 'JOHNNY', '100%_', '案例']) {
    const result = await json('/api/clients?search=' + encodeURIComponent(query), { session: a });
    const ids = result.clients.map(item => item.id);
    assert.ok(ids.includes(owned.id) && ids.includes(duplicate.id));
    assert.ok(!ids.includes(foreign.id) && !ids.includes(unrelated.id));
  }
  for (const query of ['%', '_']) {
    const result = await json('/api/clients?search=' + encodeURIComponent(query), { session: a });
    assert.ok(result.clients.some(item => item.id === owned.id));
    assert.ok(!result.clients.some(item => item.id === unrelated.id));
  }
  assert.deepEqual((await json('/api/clients?search=' + encodeURIComponent("' OR 1=1 --"), { session: a })).clients, []);
  assert.ok((await json('/api/clients?limit=1', { session: a })).clients.length <= 1);
  const unicodeName = await client(a, 'Synthetic Élodie');
  const otherUnicodeName = await client(b, 'Synthetic Élodie');
  const folded = (await json('/api/clients?search=' + encodeURIComponent('élodie'), { session: a })).clients;
  assert.ok(folded.some(item => item.id === unicodeName.id), 'Case-insensitive search includes non-ASCII customer names');
  assert.ok(!folded.some(item => item.id === otherUnicodeName.id));
});

test('customer mutation requires session, CSRF and Origin and rejects arbitrary identity or malformed names', async () => {
  await json('/api/clients', { method: 'POST', body: { displayName: 'Unauthorized customer' } }, 401);
  await json('/api/clients', { method: 'POST', session: sessions['trial-a'], headers: { 'X-CSRF-Token': '' }, body: { displayName: 'No CSRF' } }, 403);
  await json('/api/clients', { method: 'POST', session: sessions['trial-a'], headers: { Origin: 'https://foreign.invalid' }, body: { displayName: 'Wrong Origin' } }, 403);
  for (const body of [{ displayName: '' }, { displayName: '   ' }, { displayName: 'x'.repeat(121) }, { displayName: 'Valid', userId: 'owner' }, { displayName: 7 }]) {
    await json('/api/clients', { method: 'POST', session: sessions['trial-a'], body }, 400);
  }
});

test('customers, nested case directories, conversations and artifacts remain inaccessible to other users including the administrator', async () => {
  const a = sessions['trial-a'];
  const owned = await client(a, 'Private synthetic customer');
  const record = await create(a, 'Private related case', { clientId: owned.id });
  const thread = await conversation(a, record, 'Private conversation');
  const saved = await artifact(a, record, 'Private synthetic working text.');
  for (const attacker of [sessions['trial-b'], sessions.owner]) {
    for (const path of [`/api/clients/${owned.id}`, `/api/clients/${owned.id}/cases`, `/api/clients/${owned.id}/artifacts`, `/api/cases/${record.id}/conversations`, `/api/conversations/${thread.id}`, `/api/cases/${record.id}/artifacts`, `/api/artifacts/${saved.id}`, `/api/artifacts/${saved.id}/download`, `/api/cases/${record.id}/readiness`]) {
      const response = await request(path, { session: attacker });
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(await response.text(), /Private synthetic|Private related|Private conversation|Private synthetic working/);
    }
    await json(`/api/clients/${owned.id}`, { method: 'PUT', session: attacker, body: { displayName: 'Overwritten', expectedVersion: owned.version } }, 404);
    await json(`/api/cases/${record.id}/conversations`, { method: 'POST', session: attacker, body: { title: 'Unauthorized' } }, 404);
    await json('/api/cases', { method: 'POST', session: attacker, body: payload('Foreign customer association', { clientId: owned.id }) }, 404);
  }
  assert.equal((await json(`/api/clients/${owned.id}`, { session: a })).client.displayName, owned.displayName);
  const directory = await json(`/api/clients/${owned.id}/cases`, { session: a });
  assert.ok(directory.cases.some(item => item.id === record.id));
  const docs = await json(`/api/clients/${owned.id}/artifacts`, { session: a });
  assert.ok(docs.artifacts.some(item => item.id === saved.id));
});

test('customer edits use optimistic versions and legacy case updates preserve the customer association', async () => {
  const session = sessions['trial-a'];
  const owned = await client(session, 'Original customer');
  const updated = (await json(`/api/clients/${owned.id}`, { method: 'PUT', session, body: { displayName: 'Updated customer', expectedVersion: owned.version } })).client;
  assert.equal(updated.version, owned.version + 1);
  await json(`/api/clients/${owned.id}`, { method: 'PUT', session, body: { displayName: 'Stale overwrite', expectedVersion: owned.version } }, 409);
  const record = await create(session, 'Legacy update compatibility', { clientId: owned.id });
  const changed = (await json(`/api/cases/${record.id}`, { method: 'PUT', session, body: { ...payload('Legacy client omits association'), expectedVersion: record.version } })).case;
  assert.equal(changed.clientId, owned.id);
  assert.equal(changed.version, record.version + 1);
});

test('multiple conversations and immutable artifact versions persist separately and downloaded bytes match the saved content', async () => {
  const session = sessions['trial-a'];
  const record = await create(session, 'Multiple conversations and artifacts');
  const first = await conversation(session, record, 'First conversation');
  const second = await conversation(session, record, 'Second conversation');
  const firstArtifact = await artifact(session, record, 'First operator-edited draft.');
  const secondArtifact = await artifact(session, record, 'Second operator-edited draft.');
  assert.notEqual(first.id, second.id);
  assert.notEqual(firstArtifact.id, secondArtifact.id);
  assert.equal(secondArtifact.version, firstArtifact.version + 1);
  assert.deepEqual((await json(`/api/conversations/${first.id}`, { session })).messages, []);
  assert.deepEqual(new Set((await json(`/api/cases/${record.id}/conversations`, { session })).conversations.map(item => item.id)), new Set([first.id, second.id]));
  assert.equal((await json(`/api/artifacts/${firstArtifact.id}`, { session })).artifact.content, firstArtifact.content);
  for (const item of [firstArtifact, secondArtifact]) {
    const response = await request(`/api/artifacts/${item.id}/download`, { session });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /attachment;.*\.txt/i);
    assert.match(response.headers.get('content-type'), /text\/plain/i);
    assert.equal(await response.text(), item.content);
  }
  const list = (await json(`/api/cases/${record.id}/artifacts`, { session })).artifacts;
  assert.equal(list.length, 2);
  assert.ok(list.every(item => !Object.hasOwn(item, 'content')));
});

test('missing required document facts block final artifacts while incomplete draft work remains saveable', async () => {
  const session = sessions['trial-a'];
  const record = await create(session, 'Incomplete final must stay a draft');
  const readiness = await json(`/api/cases/${record.id}/readiness?kind=followup&locale=en`, { session });
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missing.length > 0);
  assert.doesNotMatch(JSON.stringify(readiness.missing), /[\p{Script=Han}]/u);
  const rejected = await request(`/api/cases/${record.id}/artifacts`, { method: 'POST', session, body: { kind: 'followup', status: 'final', content: 'A final-looking text is not proof of reviewed facts.', expectedCaseVersion: record.version } });
  assert.equal(rejected.status, 409);
  assert.deepEqual((await json(`/api/cases/${record.id}/artifacts`, { session })).artifacts, []);
  const incomplete = await artifact(session, record, 'Incomplete working draft [To be confirmed].');
  assert.equal(incomplete.status, 'draft');
});

test('real logout, process restart and login restore customer, case, conversation and artifact IDs without exposing them to another user', async () => {
  const session = sessions['trial-a'];
  const owned = await client(session, 'Restart fixture customer');
  const record = await create(session, 'Restart case', { clientId: owned.id });
  const thread = await conversation(session, record, 'Restart conversation');
  const saved = await artifact(session, record, 'Persist this exact synthetic edit across process restart.');
  await json('/api/logout', { method: 'POST', session, body: {} });
  await stop(); server = await start();
  sessions = {};
  for (const username of ['owner', 'trial-a', 'trial-b']) sessions[username] = await login(username);
  assert.deepEqual((await json(`/api/clients/${owned.id}`, { session: sessions['trial-a'] })).client, owned);
  assert.equal((await json(`/api/cases/${record.id}`, { session: sessions['trial-a'] })).case.clientId, owned.id);
  assert.equal((await json(`/api/conversations/${thread.id}`, { session: sessions['trial-a'] })).conversation.id, thread.id);
  assert.deepEqual((await json(`/api/artifacts/${saved.id}`, { session: sessions['trial-a'] })).artifact, saved);
  assert.deepEqual((await json('/api/clients?search=Restart%20fixture', { session: sessions['trial-b'] })).clients, []);
});

test('explicit document answers persist review provenance and unconfirmed suggestions preserve prior confirmations', async () => {
  const session = sessions['trial-a'];
  let record = await create(session, 'Confirmed document answers', { fields: extract(source).map(field => ({ ...field, confirmed: Boolean(field.value && !field.conflict) })) });
  const initialVersion = record.version;
  const changes = { documentDate: { value: '2026-10-07', source: 'Synthetic operator supplied date' }, senderName: { value: 'Example Operator', source: 'Synthetic operator supplied identity' } };
  let answer = await json(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: { changes, confirm: true, expectedVersion: record.version } });
  record = answer.case;
  assert.equal(record.version, initialVersion + 1);
  for (const key of Object.keys(changes)) {
    assert.equal(record.documentContext[key].confirmed, true);
    assert.ok(Number.isFinite(Date.parse(record.documentContext[key].confirmedAt)));
    assert.equal(record.documentContext[key].value, changes[key].value);
  }
  const readiness = await json(`/api/cases/${record.id}/readiness?kind=status-summary&locale=en`, { session });
  assert.equal(readiness.ready, true);
  assert.ok(!readiness.missing.some(item => item.key === 'senderName' || item.key === 'documentDate'));
  const oldDate = record.documentContext.documentDate;
  const legacy = await json(`/api/cases/${record.id}`, { method: 'PUT', session, body: { ...payload('Legacy update preserves reviewed answers', { fields: record.fields }), expectedVersion: record.version } });
  record = legacy.case;
  assert.deepEqual(record.documentContext.documentDate, oldDate);
  const rejectedSuggestion = await json(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: { changes: { senderName: { value: 'Changed Operator', source: 'Unconfirmed correction' } }, confirm: false, expectedVersion: record.version } }, 409);
  assert.equal(rejectedSuggestion.code, 'DOCUMENT_CONTEXT_CONFLICT');
  answer = await json(`/api/cases/${record.id}`, { session });
  assert.deepEqual(answer.case, record);
  assert.equal(answer.case.documentContext.senderName.value, 'Example Operator');
  assert.deepEqual(answer.case.documentContext.documentDate, oldDate);
  const unresolved = await json(`/api/cases/${record.id}/readiness?kind=status-summary&locale=zh`, { session });
  assert.equal(unresolved.ready, true);
  assert.ok(!unresolved.missing.some(item => item.key === 'senderName'));
  await json(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: { changes, confirm: true, expectedVersion: initialVersion } }, 409);
  const spoofed = await request(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: { changes: { senderName: { value: 'Forged confirmation', confirmedAt: '2020-01-01T00:00:00.000Z', confirmed: true } }, confirm: false, expectedVersion: answer.case.version } });
  assert.equal(spoofed.status, 400);
});

test('case deletion cascades only its own conversations and artifacts, preserving siblings under the same customer', async () => {
  const session = sessions['trial-a'];
  const owned = await client(session, 'Case deletion siblings');
  const removed = await create(session, 'Case to delete', { clientId: owned.id });
  const retained = await create(session, 'Case to preserve', { clientId: owned.id });
  const thread = await conversation(session, removed, 'Deleted conversation');
  const saved = await artifact(session, removed, 'Deleted case synthetic draft.');
  const sibling = await artifact(session, retained, 'Preserved sibling synthetic draft.');
  await json(`/api/cases/${removed.id}`, { method: 'DELETE', session, body: { expectedVersion: removed.version } });
  for (const path of [`/api/cases/${removed.id}`, `/api/conversations/${thread.id}`, `/api/artifacts/${saved.id}`]) await json(path, { session }, 404);
  assert.equal((await json(`/api/artifacts/${sibling.id}`, { session })).artifact.content, sibling.content);
  const directory = await json(`/api/clients/${owned.id}/cases`, { session });
  assert.deepEqual(directory.cases.map(item => item.id), [retained.id]);
});

test('one explicit fill-and-continue confirms missing property and sender facts, then generates a placeholder-free final summary', async () => {
  const session = sessions['trial-a'];
  let record = await create(session, 'Single answer completion', { sourceText: '', fields: [], draftType: 'status-summary' });
  const answer = await json(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: {
    changes: { senderName: { value: 'Example Operator', source: 'Explicit synthetic reply' } },
    factChanges: { property: { value: '128 Example Lane', source: 'Explicit synthetic reply' } }, confirm: true, expectedVersion: record.version,
  } });
  record = answer.case;
  const readiness = await json(`/api/cases/${record.id}/readiness?kind=status-summary&locale=en`, { session });
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missing, []);
  assert.equal(record.fields.find(field => field.key === 'property').confirmed, true);
  const generated = (await json(`/api/cases/${record.id}/artifacts/generate`, { method: 'POST', session, body: { kind: 'status-summary', status: 'final', expectedCaseVersion: record.version } }, 201)).artifact;
  assert.equal(generated.status, 'final');
  assert.match(generated.content, /128 Example Lane/);
  assert.match(generated.content, /Example Operator/);
  assert.doesNotMatch(generated.content, /\[To be confirmed\]|\{\{|\bTBD\b|\bTODO\b/);
  assert.doesNotMatch(generated.content, /\bDRAFT\b|NOT FOR SUBMISSION|DE-IDENTIFIED/iu);
  assert.match(generated.content, /not an official (?:agency|government) form/i);
  assert.match(generated.content, /does not constitute an eligibility determination, rent approval/i);
  const working = (await json(`/api/cases/${record.id}/artifacts/generate`, { method: 'POST', session, body: { kind: 'status-summary', status: 'draft', expectedCaseVersion: record.version } }, 201)).artifact;
  assert.equal(working.status, 'draft');
  assert.match(working.content, /DRAFT.*FOR HUMAN REVIEW/);
  for (const content of ['Incomplete [Recipient]', 'Incomplete {{recipient_name}}', 'Incomplete TBD']) {
    const rejected = await request(`/api/cases/${record.id}/artifacts`, { method: 'POST', session, body: { kind: 'status-summary', status: 'final', content, expectedCaseVersion: record.version } });
    assert.equal(rejected.status, 409);
  }
  assert.equal((await json(`/api/cases/${record.id}/artifacts`, { session })).artifacts.length, 2);
});

test('case questions persist explicit pending, confirmed and resolved outcomes and reject unresolved conclusions or stale writes', async () => {
  const session = sessions['trial-a'];
  let record = await create(session, 'Reusable question state');
  let result = await json(`/api/cases/${record.id}/issues`, { method: 'PATCH', session, body: { changes: [{ question: 'Which synthetic contact should receive the draft?', status: 'pending', resolution: '' }], expectedVersion: record.version } });
  record = result.case;
  assert.equal(record.caseIssues.length, 1);
  const issue = record.caseIssues[0];
  assert.equal(issue.status, 'pending'); assert.ok(issue.id); assert.ok(Number.isFinite(Date.parse(issue.updatedAt)));
  result = await json(`/api/cases/${record.id}/issues`, { method: 'PATCH', session, body: { changes: [{ id: issue.id, question: issue.question, status: 'confirmed', resolution: '' }], expectedVersion: record.version } });
  record = result.case;
  assert.equal(record.caseIssues[0].status, 'confirmed');
  const bad = await request(`/api/cases/${record.id}/issues`, { method: 'PATCH', session, body: { changes: [{ id: issue.id, question: issue.question, status: 'resolved', resolution: '' }], expectedVersion: record.version } });
  assert.equal(bad.status, 400);
  assert.deepEqual((await json(`/api/cases/${record.id}`, { session })).case, record);
  result = await json(`/api/cases/${record.id}/issues`, { method: 'PATCH', session, body: { changes: [{ id: issue.id, question: issue.question, status: 'resolved', resolution: 'The operator confirmed desk@example.invalid for this synthetic case.' }], expectedVersion: record.version } });
  const resolved = result.case;
  assert.equal(resolved.caseIssues.length, 1);
  assert.equal(resolved.caseIssues[0].id, issue.id);
  assert.equal(resolved.caseIssues[0].status, 'resolved');
  assert.match(resolved.caseIssues[0].resolution, /desk@example\.invalid/);
  await json(`/api/cases/${record.id}/issues`, { method: 'PATCH', session, body: { changes: [], expectedVersion: record.version } }, 409);
  await json(`/api/cases/${record.id}/issues`, { method: 'PATCH', session: sessions['trial-b'], body: { changes: [], expectedVersion: resolved.version } }, 404);
  assert.deepEqual((await json(`/api/cases/${record.id}`, { session })).case.caseIssues, resolved.caseIssues);
});

test('actual stored message fixtures enforce same-case provenance and incomplete answers cannot support final artifacts', async () => {
  // Deliberately authored database records exercise persistence guards only; these are not model answers.
  const session = sessions['trial-a'];
  let record = await create(session, 'Message provenance final guard', { sourceText: 'Property: 128 Example Lane', fields: extract('Property: 128 Example Lane').map(field => ({ ...field, confirmed: field.key === 'property' })), draftType: 'status-summary' });
  record = (await json(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: { changes: { senderName: { value: 'Example Operator', source: 'Explicit synthetic reply' } }, confirm: true, expectedVersion: record.version } })).case;
  const other = await create(session, 'Different case provenance');
  const foreign = await create(sessions['trial-b'], 'Foreign user provenance');
  let ownConversation, otherConversation, foreignConversation, complete, interrupted, failed, wrongCaseMessage, foreignMessage;
  const storage = openStorage({ filename });
  try {
    ownConversation = storage.createConversation(session.userId, record.id, { title: 'Authored guard fixture' });
    otherConversation = storage.createConversation(session.userId, other.id, { title: 'Different case fixture' });
    foreignConversation = storage.createConversation(sessions['trial-b'].userId, foreign.id, { title: 'Foreign fixture' });
    complete = storage.appendMessage(session.userId, ownConversation.id, { role: 'assistant', content: 'Complete authored test fixture.', state: 'complete' });
    interrupted = storage.appendMessage(session.userId, ownConversation.id, { role: 'assistant', content: 'Interrupted authored test fixture', state: 'interrupted' });
    failed = storage.appendMessage(session.userId, ownConversation.id, { role: 'assistant', content: '', state: 'failed' });
    wrongCaseMessage = storage.appendMessage(session.userId, otherConversation.id, { role: 'assistant', content: 'Different case fixture.', state: 'complete' });
    foreignMessage = storage.appendMessage(sessions['trial-b'].userId, foreignConversation.id, { role: 'assistant', content: 'Foreign fixture.', state: 'complete' });
  } finally { storage.close(); }
  for (const message of [interrupted, failed]) {
    const response = await request(`/api/cases/${record.id}/artifacts`, { method: 'POST', session, body: { kind: 'status-summary', status: 'final', content: 'Reviewed summary prose.', sourceConversationId: ownConversation.id, sourceMessageId: message.id, expectedCaseVersion: record.version } });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'ARTIFACT_SOURCE_INCOMPLETE');
  }
  const savedDraft = await artifact(session, record, 'Incomplete work remains visibly draft.', { kind: 'status-summary', sourceConversationId: ownConversation.id, sourceMessageId: interrupted.id });
  assert.equal(savedDraft.status, 'draft');
  for (const [thread, message] of [[otherConversation, wrongCaseMessage], [foreignConversation, foreignMessage]]) {
    const response = await request(`/api/cases/${record.id}/artifacts`, { method: 'POST', session, body: { kind: 'status-summary', status: 'final', content: 'Wrong source must not attach.', sourceConversationId: thread.id, sourceMessageId: message.id, expectedCaseVersion: record.version } });
    assert.ok([400, 404].includes(response.status), `Wrong-case source status ${response.status}`);
    const context = await request(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: { changes: { senderName: { value: 'Example Operator', source: 'Invalid other-case provenance', sourceMessageId: message.id } }, confirm: true, expectedVersion: record.version } });
    assert.ok([400, 404].includes(context.status), `Wrong-case document source status ${context.status}`);
  }
  const saved = await artifact(session, record, 'Reviewed summary from a correctly scoped complete source.', { kind: 'status-summary', status: 'final', sourceConversationId: ownConversation.id, sourceMessageId: complete.id });
  assert.equal(saved.status, 'final');
  assert.equal(saved.sourceMessageId, complete.id);
  const reopened = await json(`/api/conversations/${ownConversation.id}`, { session });
  assert.deepEqual(reopened.messages.map(item => item.state), ['complete', 'interrupted', 'failed']);
});

test('persistent chat validates conversation ownership and single-turn shape before the disabled-provider barrier without fabricating a response', async () => {
  const session = sessions['trial-a'];
  const record = await create(session, 'Persistent chat without provider');
  const thread = await conversation(session, record, 'No-key conversation');
  const foreignCase = await create(sessions['trial-b'], 'Foreign chat case');
  const foreignThread = await conversation(sessions['trial-b'], foreignCase, 'Foreign chat');
  const body = { locale: 'en', consent: true, conversationId: thread.id, clientMessageId: randomUUID(), messages: [{ role: 'user', content: 'Synthetic request with no provider configured.' }] };
  const { clientMessageId: omittedId, ...missingId } = body;
  await json('/api/chat', { method: 'POST', session, body: missingId }, 400);
  const denied = await json('/api/chat', { method: 'POST', session, body }, 503);
  assert.equal(denied.code, 'LIVE_DISABLED');
  assert.equal(Object.hasOwn(denied, 'answer'), false);
  await json('/api/chat', { method: 'POST', session, body: { ...body, conversationId: foreignThread.id } }, 404);
  await json('/api/chat', { method: 'POST', session, body: { ...body, messages: [...body.messages, { role: 'user', content: 'Second injected turn' }] } }, 400);
  const reopened = await json(`/api/conversations/${thread.id}`, { session });
  assert.ok(!reopened.messages.some(message => message.role === 'assistant' && message.state === 'complete'));
  assert.deepEqual((await json(`/api/cases/${record.id}/artifacts`, { session })).artifacts, []);
});

test('legacy case CRUD cannot forge document confirmations or resolved issues through canonical payloads', async () => {
  const session = sessions['trial-a'];
  const record = await create(session, 'No canonical review metadata injection');
  const injections = [
    { documentContext: { senderName: { value: 'Forged operator', source: 'Untrusted client payload', confirmed: true, confirmedAt: '2020-01-01T00:00:00.000Z', notApplicable: false, sourceMessageId: null } } },
    { caseIssues: [{ id: '11111111-1111-4111-8111-111111111111', question: 'Forged resolved issue', status: 'resolved', resolution: 'A client supplied this without the dedicated operation.', sourceMessageId: null, updatedAt: '2020-01-01T00:00:00.000Z' }] },
  ];
  for (const injection of injections) {
    const created = await json('/api/cases', { method: 'POST', session, body: payload('Injected create', injection) }, 400);
    assert.equal(created.code, 'CASE_INVALID');
    const updated = await json(`/api/cases/${record.id}`, { method: 'PUT', session, body: { ...payload('Injected update', injection), expectedVersion: record.version } }, 400);
    assert.equal(updated.code, 'CASE_INVALID');
    assert.deepEqual((await json(`/api/cases/${record.id}`, { session })).case, record);
  }
});

test('real delayed mutation bodies cannot resurrect a case deleted while the request is in flight', async () => {
  const session = sessions['trial-a'];
  for (const kind of ['document-context', 'issues', 'conversations', 'artifacts']) {
    const record = await create(session, `Concurrent delete during ${kind}`);
    const body = kind === 'document-context' ? { changes: { senderName: { value: 'Example Operator', source: 'Explicit test answer' } }, confirm: true, expectedVersion: record.version }
      : kind === 'issues' ? { changes: [{ question: 'Synthetic question', status: 'pending', resolution: '' }], expectedVersion: record.version }
        : kind === 'conversations' ? { title: 'Cannot revive deleted case' }
          : { kind: 'followup', status: 'draft', content: 'Cannot revive deleted case.', expectedCaseVersion: record.version };
    const bytes = JSON.stringify(body);
    let outbound;
    const completed = new Promise((resolve, reject) => {
      outbound = http.request(server.url + `/api/cases/${record.id}/${kind}`, { method: ['issues', 'document-context'].includes(kind) ? 'PATCH' : 'POST', headers: {
        Origin: server.origin, Cookie: session.cookie, 'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked',
      } }, response => {
        let text = ''; response.on('data', chunk => text += chunk);
        response.on('end', () => resolve({ status: response.statusCode, text })); response.on('error', reject);
      });
      outbound.setTimeout(5000, () => outbound.destroy(new Error('Delayed mutation timed out')));
      outbound.on('error', reject); outbound.flushHeaders(); outbound.write(bytes.slice(0, 8));
    });
    // A real incomplete chunk keeps server body reading pending; no request or clock doubles.
    await new Promise(resolve => setTimeout(resolve, 80));
    try { await json(`/api/cases/${record.id}`, { method: 'DELETE', session, body: { expectedVersion: record.version } }); }
    finally { outbound.end(bytes.slice(8)); }
    const response = await completed;
    assert.equal(response.status, 404, `${kind}: ${response.text}`);
    await json(`/api/cases/${record.id}`, { session }, 404);
  }
});

test('withdrawing or correcting a reviewed legacy fact clears its stale draft without deleting immutable artifact history', async () => {
  const session = sessions['trial-a'];
  const completeSource = 'Property: 128 Example Lane\nOwner: Example LLC\nPHA: Example Authority\nCase reference: SYNTHETIC-REVIEW-1\nProposed rent: $2,100';
  const fields = extract(completeSource).map(field => ({ ...field, confirmed: true }));
  for (const confirm of [false, true]) {
    const record = await create(session, 'Changed reviewed fact', { sourceText: completeSource, fields, draftText: 'Older reviewed synthetic working draft.' });
    const saved = await artifact(session, record, 'Immutable history from the previous case version.');
    const property = fields.find(field => field.key === 'property');
    const value = confirm ? '130 Corrected Example Lane' : property.value;
    const result = await json(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: { changes: {}, factChanges: { property: { value, source: property.source } }, confirm, expectedVersion: record.version } });
    assert.equal(result.case.fields.find(field => field.key === 'property').confirmed, confirm);
    assert.equal(result.case.fields.find(field => field.key === 'property').value, value);
    assert.equal(result.case.draftText, '');
    assert.equal(result.case.version, record.version + 1);
    const previousArtifact = (await json(`/api/artifacts/${saved.id}`, { session })).artifact;
    for (const key of ['id', 'content', 'version', 'sourceCaseVersion', 'provenance', 'createdAt']) assert.deepEqual(previousArtifact[key], saved[key]);
    const archiveList = (await json(`/api/cases/${record.id}/artifacts`, { session })).artifacts;
    const preserved = await Promise.all(archiveList.map(async item => (await json(`/api/artifacts/${item.id}`, { session })).artifact));
    const oldDraft = preserved.filter(item => item.content === record.draftText);
    assert.equal(oldDraft.length, 1, 'The pre-edit legacy draft must be archived exactly once');
    assert.equal(oldDraft[0].status, 'draft');
    assert.equal(oldDraft[0].sourceCaseVersion, record.version);
  }
});

test('final artifacts become visibly stale after case facts change and download is blocked while historical content remains readable', async () => {
  const session = sessions['trial-a'];
  let record = await create(session, 'Final artifact freshness', { sourceText: 'Property: 128 Example Lane', fields: extract('Property: 128 Example Lane').map(field => ({ ...field, confirmed: field.key === 'property' })), draftType: 'status-summary' });
  record = (await json(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: { changes: { senderName: { value: 'Example Operator', source: 'Explicit user reply' } }, confirm: true, expectedVersion: record.version } })).case;
  const saved = (await json(`/api/cases/${record.id}/artifacts/generate`, { method: 'POST', session, body: { kind: 'status-summary', status: 'final', expectedCaseVersion: record.version } }, 201)).artifact;
  assert.equal((await request(`/api/artifacts/${saved.id}/download`, { session })).status, 200);
  record = (await json(`/api/cases/${record.id}/document-context`, { method: 'PATCH', session, body: { changes: {}, factChanges: { property: { value: '130 Corrected Example Lane', source: 'Explicit user correction' } }, confirm: true, expectedVersion: record.version } })).case;
  const historical = (await json(`/api/artifacts/${saved.id}`, { session })).artifact;
  assert.equal(historical.content, saved.content);
  assert.equal(historical.sourceCaseVersion, saved.sourceCaseVersion);
  assert.equal(historical.isStale, true);
  assert.equal(historical.needsRegeneration, true);
  const listed = (await json(`/api/cases/${record.id}/artifacts`, { session })).artifacts.find(item => item.id === saved.id);
  assert.equal(listed.isStale, true); assert.equal(listed.needsRegeneration, true);
  const response = await request(`/api/artifacts/${saved.id}/download`, { session });
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'ARTIFACT_STALE');
  const stalePdf = await request(`/api/artifacts/${saved.id}/pdf`, { session });
  assert.equal(stalePdf.status,409); assert.equal((await stalePdf.json()).code,'ARTIFACT_STALE');
  const regenerated = (await json(`/api/cases/${record.id}/artifacts/generate`, { method: 'POST', session, body: { kind: 'status-summary', status: 'final', expectedCaseVersion: record.version } }, 201)).artifact;
  assert.notEqual(regenerated.id, saved.id);
  assert.match(regenerated.content, /130 Corrected Example Lane/);
  const download = await request(`/api/artifacts/${regenerated.id}/download`, { session });
  assert.equal(download.status, 200); assert.equal(await download.text(), regenerated.content);
  assert.equal((await request(`/api/artifacts/${regenerated.id}/pdf`, {session})).status,200);
});


test('PDF downloads are authenticated, own-user, immutable saved artifact bytes with safe headers', async () => {
  const a=sessions['trial-a'], b=sessions['trial-b'];
  const record=await create(a,'Synthetic PDF export');
  const saved=await artifact(a,record,'Synthetic saved PDF body. Literal <script>not executable</script>.');
  const path=`/api/artifacts/${saved.id}/pdf`;
  assert.equal((await request(path)).status,401);
  assert.equal((await request(path,{session:b})).status,404);
  const response=await request(path,{session:a});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(response.headers.get('content-disposition'),`attachment; filename="nestlet-followup-v${saved.version}-draft.pdf"`);
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  assert.equal((await request(path+'?content=injected',{session:a})).status,400);
});

test('account conversation index crosses own cases only, bounds previews, and keeps exact conversation references', async () => {
  const a=sessions['trial-a'],b=sessions['trial-b'];
  const first=await create(a,'Synthetic unified first'),second=await create(a,'Synthetic unified second');
  const left=await conversation(a,first,'Synthetic first topic'),right=await conversation(a,second,'Synthetic second topic');
  const foreign=await conversation(b,await create(b,'Synthetic foreign case'),'Synthetic private topic');
  const index=await json('/api/conversations',{session:a});
  assert.ok(index.conversations.some(row=>row.id===left.id&&row.caseId===first.id));
  assert.ok(index.conversations.some(row=>row.id===right.id&&row.caseId===second.id));
  assert.equal(index.conversations.some(row=>row.id===foreign.id),false);
  const empty=index.conversations.find(row=>row.id===left.id);
  assert.equal(empty.lastMessage,null);assert.equal(empty.draftCount,0);
  assert.equal((await request('/api/conversations')).status,401);
  await json('/api/conversations?userId='+b.userId,{session:a},400);
  await json('/api/conversations?limit=10000',{session:a},400);
});
