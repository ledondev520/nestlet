// STRICT ACCEPTANCE: real HTTP process and real parsers. No request/response mocks.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import http from 'node:http';
import { randomBytes, scryptSync } from 'node:crypto';
const password = 'public-test-only-parser-password';
const salt = randomBytes(16);
const passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url')}`;
let sessionHeaders;

let disabled;
let child;
before(async () => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), ENABLE_LIVE_AI: 'false', DEEPSEEK_API_KEY: '', DEEPSEEK_MODEL: 'deepseek-flash', PUBLIC_ORIGIN: '', NESTLET_OPERATOR_PASSWORD_HASH: passwordHash, HOST: '127.0.0.1' },
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
  const login = await fetch(disabled.url + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: disabled.url }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200);
  const loginData = await login.json();
  sessionHeaders = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': loginData.csrfToken, Origin: disabled.url };
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
    method: 'POST', headers: { 'Content-Type': 'application/json', ...sessionHeaders }, body: JSON.stringify({ text: 'Property: 128 Example Lane', consent: true }),
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
  headers: { ...sessionHeaders, 'Content-Type': 'application/pdf', 'X-Document-Consent': 'synthetic-or-deidentified', ...headers },
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
  headers: { ...sessionHeaders, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'X-Document-Consent': 'synthetic-or-deidentified', ...headers },
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

test('workbook route enforces consent, MIME type, origin, and upload size', async () => {
  let response = await workbookRequest('not a workbook', { 'X-Document-Consent': '' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'DOCUMENT_CONSENT_REQUIRED');
  response = await workbookRequest('not a workbook', { 'Content-Type': 'text/csv' });
  assert.equal(response.status, 415);
  response = await workbookRequest('not a workbook', { Origin: 'https://untrusted.invalid' });
  assert.equal(response.status, 403);
  response = await workbookRequest('not a workbook', { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(response.status, 403);
  response = await workbookRequest(Buffer.alloc(5 * 1024 * 1024 + 1, 65));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'INPUT_TOO_LARGE');
});

test('workbook route rejects CSV disguised as Excel and truncated ZIP/legacy packages', async () => {
  const xlsx = await fixture('case.xlsx');
  const xls = await fixture('case.xls');
  for (const bytes of [Buffer.from('Property,Owner\nExample,Example LLC'), xlsx.subarray(0, 150), xls.subarray(0, 150)]) {
    const response = await workbookRequest(bytes);
    assert.equal(response.status, 422);
    const result = await response.json();
    assert.equal(result.code, 'INVALID_WORKBOOK');
    assert.equal('sheets' in result, false);
  }
});

test('real chunked workbook upload over 5 MiB returns a complete 413 response', async () => {
  const response = await new Promise((resolve, reject) => {
    const request = http.request(disabled.url + '/api/workbook', {
      method: 'POST', headers: { ...sessionHeaders, 'Content-Type': 'application/vnd.ms-excel', 'Transfer-Encoding': 'chunked', 'X-Document-Consent': 'synthetic-or-deidentified' },
    }, incoming => {
      let body = '';
      incoming.setEncoding('utf8');
      incoming.on('data', chunk => body += chunk);
      incoming.on('end', () => { try { resolve({ status: incoming.statusCode, body: JSON.parse(body) }); } catch (error) { reject(error); } });
      incoming.on('error', reject);
    });
    request.on('error', reject);
    for (let i = 0; i < 81; i++) request.write(Buffer.alloc(65536, 65));
    request.end();
  });
  assert.equal(response.status, 413);
  assert.equal(response.body.code, 'INPUT_TOO_LARGE');
});

test('real XLSX preview suppresses cached formula, linked, merged, and hidden-row cell values', async () => {
  const response = await workbookRequest(await fixture('blocked.xlsx'));
  assert.equal(response.status, 200);
  const body = await response.json();
  const sheet = body.sheets[0];
  assert.equal(sheet.name, 'Visible cases');
  assert.equal(body.sheets[1].hidden, true);
  assert.deepEqual(sheet.rows[2], ['Plain address', '', '', '', '']);
  assert.deepEqual(sheet.rows[3], ['', '', '', '', '']);
  for (const [row, column, reason] of [[2, 1, 'formula'], [2, 2, 'hyperlink'], [2, 3, 'merged'], [2, 4, 'merged'], [3, 0, 'hidden']]) {
    assert.ok(sheet.blockedCells.some(cell => cell.row === row && cell.column === column && cell.reason === reason));
  }
  assert.equal(JSON.stringify(body).includes('CACHED VALUE MUST NOT IMPORT'), false);
  assert.equal(JSON.stringify(body).includes('LINK MUST NOT BE FOLLOWED'), false);
});

test('real legacy XLS preview suppresses hyperlinks and merged cells and identifies hidden sheets', async () => {
  const response = await workbookRequest(await fixture('blocked.xls'), { 'Content-Type': 'application/vnd.ms-excel' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sheets[1].hidden, true);
  const sheet = body.sheets[0];
  for (const [row, column, reason] of [[2, 2, 'hyperlink'], [2, 3, 'merged'], [2, 4, 'merged']]) {
    assert.ok(sheet.blockedCells.some(cell => cell.row === row && cell.column === column && cell.reason === reason));
    assert.equal(sheet.rows[row][column], '');
  }
});

test('actual large workbook preview is capped at 200 rows and 50 columns and hides hidden-column values', async () => {
  const response = await workbookRequest(await fixture('limits.xlsx'));
  assert.equal(response.status, 200);
  const body = await response.json();
  const sheet = body.sheets[0];
  assert.equal(sheet.rows.length, 200);
  assert.ok(sheet.rows.every(row => row.length === 50));
  assert.equal(sheet.truncated, true);
  assert.equal(sheet.rows[199][49], 'Synthetic r200 c50');
  assert.equal(sheet.rows[0][1], '');
  assert.ok(sheet.blockedCells.some(cell => cell.row === 0 && cell.column === 1 && cell.reason === 'hidden'));
  assert.ok(body.warnings.some(warning => /200 rows and 50 columns/.test(warning)));
});

test('actual workbook with 13 worksheets is rejected before producing a partial preview', async () => {
  const response = await workbookRequest(await fixture('many-sheets.xlsx'));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, 'WORKBOOK_TOO_COMPLEX');
  assert.equal('sheets' in body, false);
});

for (const [filename, type] of [['encrypted.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['encrypted.xls', 'application/vnd.ms-excel']]) {
test(`actual password-encrypted ${filename} fails with an explicit encryption error`, async () => {
  const response = await workbookRequest(await fixture(filename), { 'Content-Type': type });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, 'WORKBOOK_ENCRYPTED');
  assert.equal('sheets' in body, false);
});

}

test('actual server serves the interface entry point and every shipped browser dependency', async () => {
  for (const [path, mime] of [
    ['/', /text\/html/], ['/app.js', /javascript/], ['/core.js', /javascript/],
    ['/agency-guidance.js', /javascript/], ['/style.css', /text\/css/], ['/logo.svg', /image\/svg\+xml/],
  ]) {
    const response = await fetch(disabled.url + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), mime);
    assert.ok((await response.text()).trim().length > 0, path);
  }
});
