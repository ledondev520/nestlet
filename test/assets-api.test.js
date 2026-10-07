// Real HTTP, sessions, SQLite, parsers and original bytes. All fixtures are synthetic.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import jpeg from 'jpeg-js';
import { openStorage } from '../storage.js';
const hash = (p) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${scryptSync(p, salt, 32).toString('base64url')}`;
};
const password = 'public-assets-test-password';
const ownerHash = hash(password);
let dir, filename, child, origin, sessions, userA, userB;
async function start() {
  const reserve = net.createServer();
  await new Promise((r) => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      PUBLIC_ORIGIN: '',
      NESTLET_OPERATOR_PASSWORD_HASH: ownerHash,
      NESTLET_DB_PATH: filename,
      NESTLET_ASSETS_PATH: join(dir, 'assets'),
      ENABLE_LIVE_AI: 'false',
      DEEPSEEK_API_KEY: '',
      DEEPSEEK_MODEL: 'deepseek-flash'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stderr.on('data', (d) => (output += d));
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(Error('Startup timeout ' + output)), 5000);
    child.once('exit', (c) => {
      clearTimeout(timer);
      rej(Error('Startup exit ' + c + ' ' + output));
    });
    child.stdout.on('data', (d) => {
      output += d;
      if (output.includes('Nestlet available')) {
        clearTimeout(timer);
        res();
      }
    });
  });
  sessions = {};
  for (const username of ['owner', 'asset-user-a', 'asset-user-b']) {
    const response = await req('/api/login', { method: 'POST', body: { username, password } });
    assert.equal(response.status, 200);
    const data = await response.json();
    sessions[username] = {
      cookie: response.headers.get('set-cookie').split(';')[0],
      csrf: data.csrfToken
    };
  }
}
async function stop() {
  if (child?.exitCode === null)
    await new Promise((r) => {
      child.once('exit', r);
      child.kill('SIGTERM');
    });
}
function req(path, { method = 'GET', body, session, headers = {} } = {}) {
  return fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(body !== undefined && !Buffer.isBuffer(body)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) })
  });
}
async function json(path, options = {}, status = 200) {
  const response = await req(path, options),
    data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
async function upload(name, bytes, mimeType = 'text/plain', extra = {}) {
  const { headers = {}, query = '', ...rest } = extra;
  return req('/api/assets' + query, {
    method: 'POST',
    session: sessions['asset-user-a'],
    body: bytes,
    headers: {
      'Content-Type': mimeType,
      'X-Asset-Filename': encodeURIComponent(name),
      'X-Asset-Consent': 'persist-private',
      ...headers
    },
    ...rest
  });
}
const fixture = (name) => readFile(new URL('fixtures/' + name, import.meta.url));
before(async () => {
  dir = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-assets-api-'));
  filename = join(dir, 'records.sqlite');
  const store = openStorage({ filename });
  userA = store.createTrialUser({ username: 'asset-user-a', passwordHash: hash(password) });
  userB = store.createTrialUser({ username: 'asset-user-b', passwordHash: hash(password) });
  store.close();
  await start();
});
after(async () => {
  await stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
test('actual upload stores byte-identical original and text search/preview remain owner scoped including administrator', async () => {
  const bytes = Buffer.from('Synthetic Résumé 中文 100%_\n<script>alert(1)</script>');
  const response = await upload('合成 résumé.txt', bytes);
  assert.equal(response.status, 201);
  const { asset } = await response.json();
  assert.equal(asset.textStatus, 'ready');
  assert.equal(asset.sizeBytes, bytes.length);
  assert.equal(asset.caseId, null);
  assert.ok(!JSON.stringify(asset).includes(dir));
  for (const session of [sessions.owner, sessions['asset-user-b']]) {
    for (const suffix of ['', '/text', '/preview', '/download'])
      await json('/api/assets/' + asset.id + suffix, { session }, 404);
    assert.equal((await json('/api/assets?q=' + encodeURIComponent('中文'), { session })).total, 0);
  }
  const a = sessions['asset-user-a'];
  for (const q of ['résumé', '中文', '100%_'])
    assert.equal(
      (await json('/api/assets?q=' + encodeURIComponent(q), { session: a })).assets[0].id,
      asset.id
    );
  const original = await req('/api/assets/' + asset.id + '/download', { session: a });
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  assert.match(original.headers.get('content-disposition'), /attachment;.*filename\*=UTF-8/);
  assert.equal(original.headers.get('cache-control'), 'no-store');
  const preview = await req('/api/assets/' + asset.id + '/preview', { session: a });
  assert.equal(preview.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await preview.text(), bytes.toString());
  assert.match(preview.headers.get('content-security-policy'), /sandbox/);
  for (const path of [
    '/assets/' + asset.id + '.blob',
    '/data/assets/' + asset.id + '.blob',
    '/api/assets/..%2Foutside/download'
  ])
    assert.equal((await req(path, { session: a })).status, 404);
  await json('/api/assets/' + asset.id, { session: a, method: 'DELETE' }, 405);
  assert.equal((await req('/api/assets/' + asset.id + '/download', { session: a })).status, 200);
});
test('session/Origin/CSRF/explicit save consent and strict type/filename/size checks precede persistence', async () => {
  const bytes = Buffer.from('synthetic');
  for (const [extra, status, code] of [
    [{ session: null }, 401, 'AUTH_REQUIRED'],
    [{ headers: { 'X-CSRF-Token': '' } }, 403, 'CSRF_REJECTED'],
    [{ headers: { Origin: '' } }, 403, 'ORIGIN_REJECTED'],
    [{ headers: { Origin: 'https://foreign.invalid' } }, 403, 'ORIGIN_REJECTED'],
    [{ headers: { 'X-Asset-Consent': '' } }, 400, 'ASSET_CONSENT_REQUIRED']
  ]) {
    const r = await upload('test.txt', bytes, 'text/plain', extra);
    assert.equal(r.status, status);
    assert.equal((await r.json()).code, code);
  }
  for (const name of ['../outside.txt', 'a\\b.txt', 'x\n.txt'])
    assert.equal((await upload(name, bytes)).status, 400);
  assert.equal((await upload('fake.pdf', bytes, 'application/pdf')).status, 422);
  assert.equal((await upload('page.html', bytes, 'text/html')).status, 415);
  assert.equal((await upload('empty.txt', Buffer.alloc(0))).status, 422);
  assert.equal((await upload('huge.txt', Buffer.alloc(5 * 1024 * 1024 + 1, 65))).status, 413);
  assert.equal((await upload('bad.txt', Buffer.from([0xff, 0xff]))).status, 422);
  const a = sessions['asset-user-a'];
  for (const q of [
    '?userId=owner',
    '?limit=101',
    '?offset=-1',
    '?q=a&q=b',
    '?q=' + 'x'.repeat(201)
  ])
    await json('/api/assets' + q, { session: a }, 400);
  await json('/api/assets', { session: a, headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403);
});
test('real PDF/Excel/CSV parse indexes content; corrupt/encrypted files never become saved originals', async () => {
  for (const [name, mime] of [
    ['text.pdf', 'application/pdf'],
    ['case.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['case.xls', 'application/vnd.ms-excel']
  ]) {
    const bytes = await fixture(name),
      r = await upload(name, bytes, mime);
    assert.equal(r.status, 201, await r.clone().text());
    const { asset } = await r.json();
    assert.equal(asset.textStatus, 'ready');
    const text = await json('/api/assets/' + asset.id + '/text', {
      session: sessions['asset-user-a']
    });
    assert.ok(text.text.length > 20);
    const download = await req('/api/assets/' + asset.id + '/download', {
      session: sessions['asset-user-a']
    });
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  }
  const csv = await upload(
    'any-columns.csv',
    Buffer.from('label,description\n"Synthetic, quoted","line one\nline two"\n'),
    'text/csv'
  );
  assert.equal(csv.status, 201);
  const csvAsset = (await csv.json()).asset;
  assert.match(
    (await json('/api/assets/' + csvAsset.id + '/text', { session: sessions['asset-user-a'] }))
      .text,
    /Synthetic, quoted\tline one\nline two/
  );
  assert.equal((await upload('bad.csv', Buffer.from('"unterminated'), 'text/csv')).status, 422);
  for (const [name, mime] of [
    ['encrypted.pdf', 'application/pdf'],
    ['encrypted.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['encrypted.xls', 'application/vnd.ms-excel']
  ])
    assert.equal((await upload(name, await fixture(name), mime)).status, 422);
  const blank = await upload('blank.pdf', await fixture('blank.pdf'), 'application/pdf');
  assert.equal(blank.status, 201);
  assert.equal((await blank.json()).asset.textStatus, 'unavailable');
});
test('PNG/JPEG originals are really validated and can be viewed, without claiming OCR', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
  const jpg = jpeg.encode(
    { data: Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]), width: 2, height: 1 },
    80
  ).data;
  for (const [name, mime, bytes] of [
    ['pixel.png', 'image/png', png],
    ['pixel.jpg', 'image/jpeg', jpg]
  ]) {
    const response = await upload(name, bytes, mime);
    assert.equal(response.status, 201, await response.clone().text());
    const { asset } = await response.json();
    assert.equal(asset.textStatus, 'unavailable');
    assert.equal(asset.previewKind, 'image');
    assert.equal(
      (await json('/api/assets/' + asset.id + '/text', { session: sessions['asset-user-a'] })).text,
      ''
    );
    const preview = await req('/api/assets/' + asset.id + '/preview', {
      session: sessions['asset-user-a']
    });
    assert.equal(preview.headers.get('content-type'), mime);
    assert.equal(preview.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), bytes);
    const corrupt = bytes.subarray(0, Math.floor(bytes.length / 2));
    assert.equal((await upload('corrupt.' + name.split('.').at(-1), corrupt, mime)).status, 422);
    assert.equal(
      (
        await upload(
          'fake.' + name.split('.').at(-1),
          Buffer.from('<script>bad image</script>'),
          mime
        )
      ).status,
      422
    );
  }
});
test('case/customer association validates ownership, version conflicts and keeps original after case deletion', async () => {
  const a = sessions['asset-user-a'],
    b = sessions['asset-user-b'];
  const client = (
    await json(
      '/api/clients',
      { session: a, method: 'POST', body: { displayName: 'Synthetic asset customer' } },
      201
    )
  ).client;
  const casePayload = {
    title: 'Synthetic asset case',
    sourceText: '',
    fields: [],
    draftType: 'followup',
    draftText: '',
    clientId: client.id
  };
  const record = (await json('/api/cases', { session: a, method: 'POST', body: casePayload }, 201))
    .case;
  const response = await upload('case.txt', Buffer.from('case-associated original'), 'text/plain', {
    query: '?caseId=' + record.id
  });
  assert.equal(response.status, 201);
  const asset = (await response.json()).asset;
  assert.equal(asset.clientId, client.id);
  assert.equal(
    (await json('/api/assets?clientId=' + client.id, { session: a })).assets[0].id,
    asset.id
  );
  await json('/api/assets?caseId=' + record.id, { session: b }, 404);
  assert.equal(
    (
      await upload('foreign.txt', Buffer.from('foreign'), 'text/plain', {
        session: b,
        query: '?caseId=' + record.id
      })
    ).status,
    404
  );
  await json(
    '/api/assets/' + asset.id,
    { session: a, method: 'PATCH', body: { caseId: null, expectedVersion: 2 } },
    409
  );
  await json('/api/cases/' + record.id, {
    session: a,
    method: 'DELETE',
    body: { expectedVersion: record.version }
  });
  const retained = (await json('/api/assets/' + asset.id, { session: a })).asset;
  assert.equal(retained.caseId, null);
  assert.equal(retained.clientId, client.id);
  assert.equal(retained.version, 2);
});
test('process restart retains metadata/text/originals; altered files fail closed without leaking paths', async () => {
  const uploaded = await upload('restart.txt', Buffer.from('Synthetic restart retained'));
  const { asset } = await uploaded.json();
  await stop();
  await start();
  const a = sessions['asset-user-a'];
  assert.equal(
    (await json('/api/assets/' + asset.id + '/text', { session: a })).text,
    'Synthetic restart retained'
  );
  const response = await req('/api/assets/' + asset.id + '/download', { session: a });
  assert.equal(await response.text(), 'Synthetic restart retained');
  await writeFile(join(dir, 'assets', asset.id + '.blob'), 'changed');
  const failure = await json('/api/assets/' + asset.id + '/download', { session: a }, 503);
  assert.equal(failure.code, 'ASSET_INTEGRITY_FAILED');
  assert.ok(!JSON.stringify(failure).includes(dir));
});

test('HTTP file-count quota rejects the next upload without deleting or overwriting originals', async () => {
  const store = openStorage({ filename });
  try {
    store.createTrialUser({ username: 'asset-quota-user', passwordHash: hash(password) });
  } finally {
    store.close();
  }
  const login = await req('/api/login', {
    method: 'POST',
    body: { username: 'asset-quota-user', password }
  });
  assert.equal(login.status, 200);
  const data = await login.json(),
    session = { cookie: login.headers.get('set-cookie').split(';')[0], csrf: data.csrfToken };
  let first;
  for (let i = 0; i < 200; i++) {
    const response = await upload(
      'quota-' + i + '.txt',
      Buffer.from('Synthetic quota record ' + i),
      'text/plain',
      { session }
    );
    assert.equal(response.status, 201);
    if (i === 0) first = (await response.json()).asset;
    else await response.arrayBuffer();
  }
  const failure = await upload(
    'over-quota.txt',
    Buffer.from('Rejected next original'),
    'text/plain',
    { session }
  );
  assert.equal(failure.status, 409);
  assert.equal((await failure.json()).code, 'ASSET_QUOTA_EXCEEDED');
  const result = await json('/api/assets?limit=1', { session });
  assert.equal(result.total, 200);
  assert.equal(result.assets.length, 1);
  assert.equal(
    await (await req('/api/assets/' + first.id + '/download', { session })).text(),
    'Synthetic quota record 0'
  );
});

test('cancelled real streaming uploads release both processing slots and never create partial originals', async () => {
  const session = sessions['asset-user-b'];
  const before = (await json('/api/assets', { session })).total;
  const held = [];
  try {
    for (let i = 0; i < 2; i++) {
      const pending = http.request(origin + '/api/assets', {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: session.cookie,
          'X-CSRF-Token': session.csrf,
          'Content-Type': 'text/plain',
          'X-Asset-Consent': 'persist-private',
          'X-Asset-Filename': 'cancelled-' + i + '.txt',
          'Content-Length': '1000'
        }
      });
      pending.on('error', () => {});
      held.push(pending);
      pending.write('partial unfinished bytes');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    const busy = await upload('while-busy.txt', Buffer.from('would be saved'), 'text/plain', {
      session
    });
    assert.equal(busy.status, 429);
    assert.equal((await busy.json()).code, 'BUSY');
    for (const pending of held) pending.destroy();
    const deadline = Date.now() + 2000;
    let accepted;
    while (Date.now() < deadline) {
      const response = await upload(
        'after-cancel.txt',
        Buffer.from('Complete after cancellation'),
        'text/plain',
        { session }
      );
      if (response.status === 201) {
        accepted = (await response.json()).asset;
        break;
      }
      assert.equal(response.status, 429);
      await response.arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(accepted, 'Cancelled streams must release their upload reservations');
    assert.equal((await json('/api/assets', { session })).total, before + 1);
    const download = await req('/api/assets/' + accepted.id + '/download', { session });
    assert.equal(await download.text(), 'Complete after cancellation');
  } finally {
    for (const pending of held) pending.destroy();
  }
});
