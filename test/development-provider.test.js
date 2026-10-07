// DEVELOPMENT-ONLY: provider responses are simulated. Never live or no-mock acceptance evidence.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const children = [];
let disabled;
let enabled;

async function unusedPort() {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  return port;
}

async function startServer(live) {
  const port = await unusedPort();
  // Replace outbound fetch before loading the server. This suite never contacts
  // a real AI provider and never reads or supplies a real API credential.
  const bootstrap = `
    const attempts = new Map();
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      const text = body.messages.at(-1).content;
      console.log('MOCK_PROVIDER_CALLED');
      attempts.set(text, (attempts.get(text) || 0) + 1);
      if (text.includes('SLOW_PROVIDER')) {
        console.log('SLOW_PROVIDER_STARTED');
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 5000);
          options.signal.addEventListener('abort', () => { clearTimeout(timer); console.log('SLOW_PROVIDER_ABORTED'); reject(new Error('Aborted')); }, {once:true});
        });
      }
      if (text.includes('TRANSIENT_ALWAYS')) return new Response('{}', {status: 429});
      if (text.includes('TRANSIENT_ONCE') && attempts.get(text) === 1) return new Response('{}', {status: 503});
      if (text.includes('TRUNCATED_RESPONSE')) return Response.json({choices:[{finish_reason:'length',message:{content:'{\"fields\":[]}'}}]});
      if (text.includes('TOOL_RESPONSE')) return Response.json({choices:[{message:{content:'{\"fields\":[]}',tool_calls:[{type:'function',function:{name:'send_email',arguments:'{}'}}]}}]});
      if (text.includes('FUNCTION_RESPONSE')) return Response.json({choices:[{message:{content:'{\"fields\":[]}',function_call:{name:'send_email',arguments:'{}'}}}]});
      if (text.includes('EXTRA_ENVELOPE')) return Response.json({choices:[{message:{content:JSON.stringify({fields:[],send_email:true})}}]});
      if (text.includes('NO_CHOICES')) return Response.json({other:'invalid'});
      if (text.includes('OVERSIZED_RESPONSE')) return new Response('x'.repeat(150001));
      if (text.includes('PROVIDER_FAIL')) return new Response('{}', {status: 500});
      if (text.includes('MALFORMED_RESPONSE')) return new Response('not json');
      if (text.includes('MALFORMED_CONTENT')) return Response.json({choices:[{message:{content:'not json'}}]});
      return Response.json({choices:[{message:{content:JSON.stringify({fields:[
        {key:'owner',value:'Example Property LLC',source:'Owner: Example Property LLC'},
        {key:'property',value:'Invented Address',source:'Property: Invented Address'}
      ]})}}]});
    };
    await import('./server.js');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ENABLE_LIVE_AI: live ? 'true' : 'false', DEEPSEEK_API_KEY: live ? 'synthetic-test-key-never-transmitted' : '', DEEPSEEK_MODEL: 'synthetic-test-model' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const state = { url: `http://127.0.0.1:${port}`, output: '' };
  child.stdout.on('data', data => { state.output += data; });
  child.stderr.on('data', data => { state.output += data; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${state.output}`)), 5000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${state.output}`)); });
    const check = data => {
      if (data.toString().includes('Nestlet available')) {
        clearTimeout(timeout);
        child.stdout.off('data', check);
        resolve();
      }
    };
    child.stdout.on('data', check);
  });
  return state;
}

const post = (server, body, headers = {}) => fetch(server.url + '/api/extract', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

before(async () => {
  disabled = await startServer(false);
  enabled = await startServer(true);
});

after(async () => {
  await Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill('SIGTERM');
  })));
});

test('status reports live extraction disabled by default and no secret material', async () => {
  const response = await fetch(disabled.url + '/api/status');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.liveEnabled, false);
  assert.equal(body.model, 'synthetic-test-model');
  assert.equal(JSON.stringify(body).includes('key'), false);
});

test('disabled live route fails closed before provider access', async () => {
  const response = await post(disabled, { text: 'Owner: Example Property LLC', consent: true });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /disabled/);
  assert.equal(disabled.output.includes('MOCK_PROVIDER_CALLED'), false);
});

test('live route rejects a different origin', async () => {
  const response = await post(enabled, { text: 'Owner: Example Property LLC', consent: true }, { Origin: 'https://untrusted.invalid' });
  assert.equal(response.status, 403);
});

for (const body of [
  { text: 'Owner: Example Property LLC' },
  { text: 'Owner: Example Property LLC', consent: false },
  { text: 'Owner: Example Property LLC', consent: 'true' },
  { text: '', consent: true },
  { text: '   ', consent: true },
  { text: 123, consent: true },
  { text: 'x'.repeat(50001), consent: true },
]) {
  test(`live route rejects missing consent or invalid text (${typeof body.text}; length ${body.text?.length ?? 'n/a'}; consent ${body.consent})`, async () => {
    const response = await post(enabled, body);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /consent required/);
  });
}

test('live route enforces its body-size limit', async () => {
  const response = await post(enabled, { text: 'x'.repeat(71000), consent: true });
  assert.equal(response.status, 413);
});

test('live route applies source grounding and returns unconfirmed suggestions', async () => {
  const response = await post(enabled, { text: 'Owner: Example Property LLC', consent: true }, { Origin: enabled.url });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'live');
  assert.equal(body.fields.length, 5);
  assert.equal(body.fields.find(f => f.key === 'owner').value, 'Example Property LLC');
  assert.equal(body.fields.find(f => f.key === 'property').value, '');
  assert.ok(body.fields.every(f => f.confirmed === false));
});

for (const text of ['PROVIDER_FAIL', 'MALFORMED_RESPONSE', 'MALFORMED_CONTENT', 'TRUNCATED_RESPONSE', 'TOOL_RESPONSE', 'FUNCTION_RESPONSE', 'EXTRA_ENVELOPE', 'NO_CHOICES', 'OVERSIZED_RESPONSE']) {
  test(`live route returns a safe failure for ${text}`, async () => {
    const response = await post(enabled, { text, consent: true });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.match(body.error, /No suggestions were applied/);
    assert.equal('fields' in body, false);
  });
}

test('malformed request JSON returns a client error', async () => {
  const response = await post(enabled, '{not json');
  assert.equal(response.status, 400);
});

test('responses disable caching, sniffing, third-party sources, and frame embedding', async () => {
  const response = await fetch(disabled.url + '/api/status');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'self'/);
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});

test('server exposes core JavaScript with the expected MIME type', async () => {
  const response = await fetch(disabled.url + '/core.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /javascript/);
  assert.match(await response.text(), /export function extract/);
});

test('server does not expose source, environment files, or arbitrary paths', async () => {
  for (const path of ['/server.js', '/.env', '/.env.example', '/missing', '/%2e%2e/server.js']) {
    const response = await fetch(disabled.url + path);
    assert.equal(response.status, 404, path);
  }
  const response = await fetch(disabled.url + '/core.js', { method: 'POST' });
  assert.equal(response.status, 404);
});

test('identifier safeguards reject synthetic sensitive-data shapes before provider access', async () => {
  for (const text of ['SYNTHETIC TEST: 000-00-0000', 'SSN: synthetic-placeholder', 'Bank account: synthetic-placeholder', 'Tax ID: synthetic-placeholder']) {
    const calls = enabled.output.split('MOCK_PROVIDER_CALLED').length;
    const response = await post(enabled, { text, consent: true });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, 'SENSITIVE_DATA');
    assert.equal(enabled.output.split('MOCK_PROVIDER_CALLED').length, calls);
    assert.equal(enabled.output.includes(text), false, 'Rejected input must not appear in process logs');
    assert.equal(JSON.stringify(body).includes(text), false, 'Error must not echo rejected input');
  }
});

test('provider retries a transient failure once and safely bounds persistent throttling', async () => {
  let calls = enabled.output.split('MOCK_PROVIDER_CALLED').length;
  let response = await post(enabled, { text: 'TRANSIENT_ONCE\nOwner: Example Property LLC', consent: true });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).fields.find(field => field.key === 'owner').value, 'Example Property LLC');
  assert.equal(enabled.output.split('MOCK_PROVIDER_CALLED').length - calls, 2);
  calls = enabled.output.split('MOCK_PROVIDER_CALLED').length;
  response = await post(enabled, { text: 'TRANSIENT_ALWAYS', consent: true });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'PROVIDER_ERROR');
  assert.equal(enabled.output.split('MOCK_PROVIDER_CALLED').length - calls, 2);
});

async function waitForOutput(server, needle, count) {
  const deadline = Date.now() + 2000;
  while (server.output.split(needle).length - 1 < count) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${needle}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('concurrent extraction is bounded and client cancellation releases capacity', async () => {
  const controllers = [new AbortController(), new AbortController()];
  const requests = controllers.map((controller, index) => fetch(enabled.url + '/api/extract', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `SLOW_PROVIDER ${index}`, consent: true }), signal: controller.signal,
  }).catch(error => error));
  try {
    await waitForOutput(enabled, 'SLOW_PROVIDER_STARTED', 2);
    const busy = await post(enabled, { text: 'Owner: Example Property LLC', consent: true });
    assert.equal(busy.status, 429);
    assert.equal((await busy.json()).code, 'BUSY');
  } finally {
    controllers.forEach(controller => controller.abort());
    await Promise.all(requests);
  }
  await waitForOutput(enabled, 'SLOW_PROVIDER_ABORTED', 2);
  const next = await post(enabled, { text: 'Owner: Example Property LLC', consent: true });
  assert.equal(next.status, 200);
});

test('JSON request parsing rejects non-object bodies and unsupported content types', async () => {
  for (const body of ['null', '[]', 'true', '42', '"text"']) {
    const response = await post(enabled, body);
    assert.equal(response.status, 400, body);
    assert.equal((await response.json()).code, 'INVALID_JSON');
  }
  const response = await post(enabled, { text: 'Owner: Example Property LLC', consent: true }, { 'Content-Type': 'text/plain' });
  assert.equal(response.status, 415);
});

test('cross-site fetch metadata is rejected even without an Origin header', async () => {
  const response = await post(enabled, { text: 'Owner: Example Property LLC', consent: true }, { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(response.status, 403);
});

test('chunked oversized request returns 413 without dropping the HTTP response', async () => {
  const response = await new Promise((resolve, reject) => {
    const request = http.request(enabled.url + '/api/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    }, incoming => {
      let body = '';
      incoming.setEncoding('utf8');
      incoming.on('data', chunk => body += chunk);
      incoming.on('end', () => resolve({ status: incoming.statusCode, body: JSON.parse(body) }));
      incoming.on('error', reject);
    });
    request.on('error', reject);
    request.write('{"text":"');
    request.write('x'.repeat(35000));
    request.write('x'.repeat(35000));
    request.end('","consent":true}');
  });
  assert.equal(response.status, 413);
  assert.equal(response.body.code, 'INPUT_TOO_LARGE');
});
