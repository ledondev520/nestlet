// Independent acceptance: real loopback HTTP and actual files; no provider/parser mocks.
// Deliberately separate from npm test: known final-contract failures must remain visible.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { readFile } from 'node:fs/promises';

let child, base;
before(async () => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ENABLE_LIVE_AI: 'false',
      DEEPSEEK_API_KEY: '', DEEPSEEK_MODEL: 'deepseek-flash', PUBLIC_ORIGIN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    child.stdout.on('data', data => {
      if (data.toString().includes('Nestlet available')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
  });
});
after(async () => {
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
});
const workbook = (bytes, extraHeaders = {}) => fetch(base + '/api/workbook', {
  method: 'POST', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'X-Document-Consent': 'synthetic-or-deidentified', ...extraHeaders }, body: bytes,
});

test('missing authentication fails closed on the document-processing route', async () => {
  const response = await workbook(await readFile(new URL('./fixtures/case.xlsx', import.meta.url)));
  assert.ok([401, 403].includes(response.status), `Unauthenticated workbook POST returned ${response.status}`);
});

test('workbook processing rejects a foreign Origin', async () => {
  const response = await workbook(await readFile(new URL('./fixtures/case.xlsx', import.meta.url)), { Origin: 'https://synthetic.invalid' });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'ORIGIN_REJECTED');
});

for (const [name, bytes] of [
  ['renamed text', Buffer.from('Synthetic text is not an Excel workbook')],
  ['truncated ZIP', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])],
]) {
  test(`actual workbook parser rejects ${name}`, async () => {
    const response = await workbook(bytes);
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'INVALID_WORKBOOK');
  });
}
