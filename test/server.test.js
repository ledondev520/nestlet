// STRICT ACCEPTANCE: real HTTP process and real parsers. No request/response mocks.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';

let disabled;
let child;
before(async () => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), ENABLE_LIVE_AI: 'false', DEEPSEEK_API_KEY: '', DEEPSEEK_MODEL: 'deepseek-flash', PUBLIC_ORIGIN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  disabled = { url: `http://127.0.0.1:${port}`, output: '' };
  child.stdout.on('data', data => disabled.output += data);
  child.stderr.on('data', data => disabled.output += data);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${disabled.output}`)), 5000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${disabled.output}`)); });
    const ready = data => {
      if (data.toString().includes('Nestlet available')) { clearTimeout(timeout); child.stdout.off('data', ready); resolve(); }
    };
    child.stdout.on('data', ready);
  });
});
after(async () => {
  if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
});

test('real server truthfully reports Flash and unavailable live extraction without a configured credential', async () => {
  const response = await fetch(disabled.url + '/api/status');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.liveEnabled, false);
  assert.equal(body.configured, false);
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.providerEndpoint, 'https://api.deepseek.com/chat/completions');
  assert.equal(body.workbookEnabled, true);
  const unavailable = await fetch(disabled.url + '/api/extract', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Property: 128 Example Lane', consent: true }),
  });
  assert.equal(unavailable.status, 503);
  const result = await unavailable.json();
  assert.equal(result.code, 'LIVE_DISABLED');
  assert.equal('fields' in result, false);
  assert.equal('mode' in result, false);
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

const documentRequest = (body, headers = {}) => fetch(disabled.url + '/api/document', {
  method: 'POST',
  headers: { 'Content-Type': 'application/pdf', 'X-Document-Consent': 'synthetic-or-deidentified', ...headers },
  body,
});
const fixture = name => readFile(new URL(`fixtures/${name}`, import.meta.url));

async function requirePdf(context) {
  const status = await (await fetch(disabled.url + '/api/status')).json();
  assert.equal(typeof status.pdfEnabled, 'boolean');
  if (!status.pdfEnabled) {
    const response = await documentRequest('not a PDF');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'PDF_UNAVAILABLE');
    context.skip('pdftotext unavailable: optional local PDF processing cannot be exercised');
    return false;
  }
  return true;
}

test('text-based synthetic PDF extracts locally with the real local parser', async context => {
  if (!await requirePdf(context)) return;
  const response = await documentRequest(await fixture('text.pdf'));
  assert.equal(response.status, 200);
  const body = await response.json();
  const expected = (await fixture('expected.txt')).toString('utf8').trim().split('\n');
  assert.deepEqual(body.text.split('\n').map(line => line.trim()).filter(Boolean), expected);
  assert.equal(body.mode, 'local-pdf');
  assert.ok(body.warnings.some(warning => /No OCR or form verification/.test(warning)));
});

test('PDF consent, media type, and origin are checked before parsing', async context => {
  if (!await requirePdf(context)) return;
  for (const consent of ['', 'true', 'synthetic']) {
    const response = await documentRequest('not a PDF', { 'X-Document-Consent': consent });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'DOCUMENT_CONSENT_REQUIRED');
  }
  let response = await documentRequest('not a PDF', { 'Content-Type': 'image/png' });
  assert.equal(response.status, 415);
  response = await documentRequest('not a PDF', { Origin: 'https://untrusted.invalid' });
  assert.equal(response.status, 403);
});

for (const [name, status, code] of [
  ['blank.pdf', 422, 'OCR_REQUIRED'],
  ['encrypted.pdf', 422, 'PDF_ENCRYPTED'],
  ['large-text.pdf', 413, 'TEXT_TOO_LARGE'],
]) {
  test(`PDF route safely rejects ${name} with ${code}`, async context => {
    if (!await requirePdf(context)) return;
    const response = await documentRequest(await fixture(name));
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.equal('text' in body, false);
  });
}

test('PDF route rejects disguised non-PDFs, corrupt PDFs, and files above the byte limit', async context => {
  if (!await requirePdf(context)) return;
  for (const value of ['not a PDF', '%PDF-1.7\ncorrupt document']) {
    const response = await documentRequest(value);
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'INVALID_PDF');
  }
  const response = await documentRequest(Buffer.alloc(5 * 1024 * 1024 + 1, 65));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'INPUT_TOO_LARGE');
});

const workbookRequest = (body, headers = {}) => fetch(disabled.url + '/api/workbook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'X-Document-Consent': 'synthetic-or-deidentified', ...headers },
  body,
});

for (const [name, type] of [
  ['case.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['case.xls', 'application/vnd.ms-excel'],
]) {
  test(`real ${name} workbook yields string-valued preview from the real local parser`, async () => {
    const response = await workbookRequest(await fixture(name), { 'Content-Type': type });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mode, 'local-workbook');
    assert.equal(body.sheets.length, 1);
    assert.equal(body.sheets[0].name, 'Case');
    assert.equal(body.sheets[0].hidden, false);
    assert.equal(body.sheets[0].truncated, false);
    assert.deepEqual(body.sheets[0].rows, [
      ['Property', 'Owner', 'PHA', 'Case reference', 'Proposed rent'],
      ['128 Example Lane', 'Example LLC', 'Example Authority', 'CASE-SYNTHETIC-1', '2100'],
    ]);
    assert.deepEqual(body.sheets[0].blockedCells, []);
    assert.ok(body.warnings.some(warning => /Macros are not run/.test(warning)));
  });
}
