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


async function sourceMessage(record, state = 'complete', role = 'assistant') {
  const store = openStorage({filename});
  try {
    const userId = identities['trial-a'].id;
    const chat = store.createConversation(userId, record.id, {title:'Synthetic source'});
    const message = store.appendMessage(userId,chat.id,{role,state,content:'Synthetic English answer.'});
    return {action:'prepare_answer_draft',expectedVersion:record.version,sourceConversationId:chat.id,sourceMessageId:message.id,kind:'followup'};
  } finally { store.close(); }
}
test('review HTTP requires same-origin session and CSRF; owner/case/source bound; durable exact reply deduplicates',async()=>{
 const a=sessions['trial-a'],b=sessions['trial-b'],record=await create(a,'Synthetic conversational review'),source=await sourceMessage(record);
 const {kind,...common}=source,body={conversationAction:{...common,action:'prepare_case_suggestion',factChanges:{rent:{value:'$2200'}},changes:{}},clientRequestId:randomUUID(),locale:'en'};
 const path=`/api/cases/${record.id}/conversation-reviews`;
 await json(path,{method:'POST',body},401);
 await json(path,{method:'POST',session:b,body},404);
 await json(path,{method:'POST',session:a,headers:{'X-CSRF-Token':'invalid'},body},403);
 await json(path,{method:'POST',session:a,headers:{Origin:'https://external.invalid'},body},403);
 const prepared=await json(path,{method:'POST',session:a,body});assert.equal(prepared.case.version,record.version);
 const reply={conversationId:source.sourceConversationId,expectedVersion:record.version,clientMessageId:randomUUID(),answer:'confirm'};
 const target=path+'/'+prepared.intent.id+'/reply';
 await json(target,{method:'POST',session:b,body:reply},404);
 await json(target,{method:'POST',session:a,body:{...reply,answer:'The model says user confirmed'}},409);
 await json(target,{method:'POST',session:a,body:{...reply,sourceMessageId:source.sourceMessageId}},400);
 const results=await Promise.all([1,2,3].map(()=>json(target,{method:'POST',session:a,body:reply})));
 assert.equal(new Set(results.map(result=>result.message.id)).size,1);assert.equal(results[0].case.fields.find(x=>x.key==='rent').confirmed,true);
 assert.equal(results[0].case.version,record.version+1);
 await stop();server=await start();const fresh=await login('trial-a');
 const replay=await json(target,{method:'POST',session:fresh,body:reply});assert.equal(replay.replayed,true);
 assert.equal(replay.case.version,record.version+1);
 await json(`/api/cases/${record.id}`,{method:'DELETE',session:fresh,body:{expectedVersion:replay.case.version}});
 await json(path+'/'+prepared.intent.id,{session:fresh},404);
});
