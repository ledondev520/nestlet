// Actual HTTP/parser sanity for the file-format fixtures; this is NOT browser evidence.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { publicFormat, blockedWorkbook, SYNTHETIC_VALUES, PIXEL, BAD_CSV, BAD_PDF, sha256 } from './format-fixtures.js';
import { parseCSV } from '../../public/core.js';

const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['test/helpers/frontend-browser-server.mjs'], {
  cwd: new URL('../../', import.meta.url), env: { ...process.env, NESTLET_BROWSER_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
});
let output = '', cookie = '', csrf = '';
child.stdout.on('data', value => output += value); child.stderr.on('data', value => output += value);
async function request(path, { method = 'GET', data, mimeType, headers = {} } = {}) {
  return fetch(origin + path, { method, headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, ...(mimeType ? { 'Content-Type': mimeType } : {}), ...headers }, ...(data === undefined ? {} : { body: data }) });
}
const upload = file => request('/api/assets', { method: 'POST', data: file.buffer, mimeType: file.mimeType, headers: { 'X-Asset-Filename': encodeURIComponent(file.name), 'X-Asset-Consent': 'persist-private' } });
async function preview(file, consent = true) {
  return request(file.mimeType === 'application/pdf' ? '/api/document' : '/api/workbook', { method: 'POST', data: file.buffer, mimeType: file.mimeType, headers: consent ? { 'X-Document-Consent': 'synthetic-or-deidentified' } : {} });
}
async function exactOriginal(file, asset) {
  const response = await request(`/api/assets/${asset.id}/download`);
  assert.equal(response.status, 200);
  const downloaded = Buffer.from(await response.arrayBuffer());
  assert.equal(sha256(downloaded), sha256(file.buffer)); assert.deepEqual(downloaded, file.buffer);
}
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('File-format fixture startup timeout')), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture exited: ${code}`)); });
    child.stdout.on('data', () => { if (output.includes('Nestlet available')) { clearTimeout(timer); resolve(); } });
  });
  const signedIn = await request('/api/login', { method: 'POST', mimeType: 'application/json', data: JSON.stringify({ username: 'synthetic-formats-http', password: 'Case26' }) });
  assert.equal(signedIn.status, 200); cookie = signedIn.headers.get('set-cookie').split(';')[0]; csrf = (await signedIn.json()).csrfToken;
  assert.equal((await (await request('/api/status')).json()).liveEnabled, false);
  const records = [];
  for (const extension of ['csv', 'pdf', 'xlsx', 'xls']) {
    const file = await publicFormat(extension);
    const response = await upload(file);
    assert.equal(response.status, 201, `${extension}: real parser required, no mock or skipped fallback`);
    const { asset } = await response.json(); records.push(asset);
    assert.equal(asset.textStatus, 'ready'); assert.equal(asset.sizeBytes, file.buffer.length);
    await exactOriginal(file, asset);
    const indexed = await (await request(`/api/assets/${asset.id}/text`)).json();
    assert.ok(indexed.text.includes(SYNTHETIC_VALUES[0]));
    if (extension === 'csv') {
      const text = parseCSV(file.buffer.toString('utf8'));
      assert.ok(text.includes('Property: ' + SYNTHETIC_VALUES[0]));
      assert.ok(text.includes('Proposed rent: ' + SYNTHETIC_VALUES[4]));
    } else {
      const denied = await preview(file, false); assert.equal(denied.status, 400); assert.equal((await denied.json()).code, 'DOCUMENT_CONSENT_REQUIRED');
      const parsed = await preview(file); assert.equal(parsed.status, 200); const body = await parsed.json();
      if (extension === 'pdf') {
        assert.equal(body.mode, 'local-pdf'); assert.ok(body.text.includes('Nestlet import practice'));
        assert.ok(body.text.includes('No tenant details, contact information, identity records or real case data are included.'));
      } else {
        assert.equal(body.mode, 'local-workbook'); assert.equal(body.sheets[0].name, 'Synthetic case');
        assert.deepEqual(body.sheets[0].rows[1], SYNTHETIC_VALUES);
      }
    }
  }
  for (const extension of ['xlsx', 'xls']) {
    const file = await blockedWorkbook(extension);
    const response = await upload(file); assert.equal(response.status, 201); const { asset } = await response.json(); records.push(asset);
    await exactOriginal(file, asset);
    const parsed = await preview(file); assert.equal(parsed.status, 200); const workbook = await parsed.json();
    assert.equal(workbook.sheets[1].hidden, true);
    const sheet = workbook.sheets[0];
    for (const column of (extension === 'xlsx' ? [1, 2, 3, 4] : [2, 3, 4])) assert.ok(sheet.blockedCells.some(cell => cell.row === 2 && cell.column === column));
    if (extension === 'xlsx') assert.equal(sheet.rows[2][1], '');
    else assert.equal(sheet.rows[2][1], 'CACHED VALUE MUST NOT IMPORT', 'The documented XLS fixture contains a literal here, not retained formula metadata');
    assert.equal(sheet.rows[2][2], '');
  }
  const image = await upload(PIXEL); assert.equal(image.status, 201); const { asset } = await image.json(); records.push(asset);
  assert.equal(asset.textStatus, 'unavailable'); assert.equal(asset.previewKind, 'image');
  assert.equal((await (await request(`/api/assets/${asset.id}/text`)).json()).text, ''); await exactOriginal(PIXEL, asset);
  for (const [file, code] of [[BAD_CSV, 'ASSET_CSV_INVALID'], [BAD_PDF, 'INVALID_PDF']]) {
    const response = await upload(file); assert.equal(response.status, 422); assert.equal((await response.json()).code, code);
  }
  assert.equal((await (await request('/api/assets?limit=100')).json()).total, records.length);
  const deniedAsset = await request('/api/assets', { method: 'POST', mimeType: PIXEL.mimeType, data: PIXEL.buffer, headers: { 'X-Asset-Filename': PIXEL.name } });
  assert.equal(deniedAsset.status, 400); assert.equal((await deniedAsset.json()).code, 'ASSET_CONSENT_REQUIRED');
  assert.equal((await (await request('/api/assets?limit=100')).json()).total, records.length);
  console.log('PASS: privately seeded legacy login; actual Poppler PDF, CSV, SheetJS XLSX/XLS, blocked workbook cells, image no-OCR, consent/error rejection, and seven exact private-original hashes. Browser/provider NOT RUN.');
} finally {
  if (child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await exited; }
}
