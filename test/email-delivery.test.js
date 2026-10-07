// ADAPTER UNIT CONTRACT ONLY: all fetch implementations and receipts below are fake.
// Synthetic .invalid addresses and public fake credentials never reach a mail provider.
// These checks do not establish real-provider acceptance or inbox delivery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createEmailDelivery } from '../email-delivery.js';

const NOW = Date.parse('2026-10-07T12:00:00.123Z');
const fixtureEnv = () => ({
  ALIBABA_CLOUD_ACCESS_KEY_ID: 'public-fake-unit-test-id',
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'public-fake-unit-test-secret',
  NESTLET_EMAIL_FROM: 'nestlet-unit-test@example.invalid',
});
const message = Object.freeze({
  email: 'synthetic-recipient@example.invalid',
  link: 'https://nestlet.example.invalid/verify-email#public-fake-single-use-token',
  purpose: 'verify',
});
const receipt = () => ({ RequestId: 'fake-unit-request', EnvId: 'fake-unit-envelope' });
const fakeResponse = (data = receipt(), options = {}) => new Response(JSON.stringify(data), options);
const makeDelivery = (fetchImpl, env = fixtureEnv()) => createEmailDelivery({ env, fetchImpl, now: () => NOW });
function isSanitized(error) {
  assert.equal(error.code, 'EMAIL_DELIVERY_UNAVAILABLE');
  assert.equal(error.status, 503);
  assert.equal(error.message, 'Email delivery is unavailable or unconfirmed.');
  assert.equal(error.cause, undefined);
  for (const secret of [...Object.values(fixtureEnv()), message.email, message.link, 'PRIVATE_PROVIDER_BODY']) {
    assert.equal(JSON.stringify(error).includes(secret), false);
    assert.equal(error.stack.includes(secret), false);
  }
  return true;
}
// Independent byte-level RFC3986 encoder, separate from the transport implementation.
const rfc3986 = input => [...Buffer.from(input, 'utf8')].map(byte => {
  const char = String.fromCharCode(byte);
  return /^[A-Za-z0-9_.~-]$/.test(char) ? char : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
}).join('');

test('fake-fetch contract: explicit Nestlet sender and both cloud keys are required; status is sanitized', async t => {
  for (const missing of ['ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET', 'NESTLET_EMAIL_FROM']) {
    await t.test(missing, async () => {
      const env = { ...fixtureEnv(), [missing]: '  ', JIESONG_EMAIL_FROM: 'other-app@example.invalid' };
      let calls = 0;
      const delivery = makeDelivery(async () => { calls++; return fakeResponse(); }, env);
      assert.equal(delivery.configured, false);
      assert.deepEqual(delivery.status(), { configured: false, lastAttemptStatus: 'never-attempted' });
      await assert.rejects(delivery.send(message), isSanitized);
      assert.equal(calls, 0);
      assert.deepEqual(delivery.status(), { configured: false, lastAttemptStatus: 'not-configured', lastAttemptAt: new Date(NOW).toISOString() });
    });
  }
  const env = fixtureEnv();
  const delivery = makeDelivery(async () => fakeResponse(), env);
  assert.equal(delivery.configured, true);
  const status = delivery.status();
  status.lastAttemptStatus = 'provider-accepted';
  assert.equal(delivery.status().lastAttemptStatus, 'never-attempted');
  env.NESTLET_EMAIL_FROM = 'bad\r\nBcc: another@example.invalid';
  assert.equal(delivery.configured, false);
});

test('fake-fetch contract: fixed RPC endpoint, parameters, sender, canonical signature and unique nonce', async () => {
  const env = {
    ...fixtureEnv(), ALIBABA_CLOUD_ACCESS_KEY_ID: ' public-fake-id+!~ ',
    ALIBABA_CLOUD_ACCESS_KEY_SECRET: " public-fake-secret&'() ",
    ALIBABA_CLOUD_SECURITY_TOKEN: " public-fake-sts+!*'()~ token ",
    NESTLET_EMAIL_FROM: ' nestlet-unit-test@example.invalid ',
    JIESONG_EMAIL_FROM: 'wrong-app@example.invalid', NESTLET_EMAIL_ENDPOINT: 'https://wrong.example.invalid',
  };
  const nonces = new Set();
  const specialLink = "https://nestlet.example.invalid/verify?encoded=%2F&punctuation=!'()*~+#fake-token";
  const delivery = makeDelivery(async (endpoint, options) => {
    assert.equal(endpoint, 'https://dm.aliyuncs.com/');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    const params = Object.fromEntries(new URLSearchParams(options.body));
    for (const [key, expected] of Object.entries({
      AccessKeyId: env.ALIBABA_CLOUD_ACCESS_KEY_ID.trim(), Action: 'SingleSendMail',
      Version: '2015-11-23', RegionId: 'cn-hangzhou', Format: 'JSON',
      SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', Timestamp: '2026-10-07T12:00:00Z',
      AccountName: 'nestlet-unit-test@example.invalid', AddressType: '1', ReplyToAddress: 'false',
      FromAlias: 'Nestlet', ToAddress: message.email, SecurityToken: env.ALIBABA_CLOUD_SECURITY_TOKEN.trim(),
    })) assert.equal(params[key], expected, key);
    assert.equal(Object.keys(params).length, 18);
    assert.match(params.SignatureNonce, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.equal(nonces.has(params.SignatureNonce), false);
    nonces.add(params.SignatureNonce);
    assert.match(params.Subject, /Nestlet.*Verify/);
    assert.ok(params.TextBody.includes(specialLink));
    assert.equal(params.HtmlBody, undefined);
    const actualSignature = params.Signature;
    delete params.Signature;
    const canonical = Object.entries(params).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => `${rfc3986(key)}=${rfc3986(entry)}`).join('&');
    const expectedSignature = createHmac('sha1', `${env.ALIBABA_CLOUD_ACCESS_KEY_SECRET.trim()}&`)
      .update(`POST&%2F&${rfc3986(canonical)}`).digest('base64');
    assert.equal(actualSignature, expectedSignature);
    assert.equal(options.body.includes(env.ALIBABA_CLOUD_ACCESS_KEY_SECRET.trim()), false);
    return fakeResponse();
  }, env);
  for (let i = 0; i < 2; i++) assert.deepEqual(await delivery.send({ ...message, link: specialLink }), { accepted: true });
  assert.equal(nonces.size, 2);
  assert.deepEqual(delivery.status(), { configured: true, lastAttemptStatus: 'provider-accepted', lastAttemptAt: new Date(NOW).toISOString() });
});

test('fake-fetch contract: reset purpose is distinct and blank STS is omitted', async () => {
  const delivery = makeDelivery(async (_, options) => {
    const params = new URLSearchParams(options.body);
    assert.equal(params.has('SecurityToken'), false);
    assert.match(params.get('Subject'), /Nestlet.*Reset/);
    assert.match(params.get('TextBody'), /ends existing sign-in sessions/);
    assert.ok(params.get('TextBody').includes(message.link));
    return fakeResponse();
  }, { ...fixtureEnv(), ALIBABA_CLOUD_SECURITY_TOKEN: ' ' });
  assert.deepEqual(await delivery.send({ ...message, purpose: 'reset' }), { accepted: true });
});

test('fake-fetch contract: invalid recipient, link and purpose fail closed before network', async t => {
  const cases = [
    { email: 'one@example.invalid,two@example.invalid' }, { email: 'one@example.invalid\r\nBcc:x@example.invalid' },
    { email: 'missing-at-sign' }, { email: `${'a'.repeat(250)}@example.invalid` },
    { link: 'javascript:alert(1)' }, { link: 'http://public.example.invalid/reset' },
    { link: 'https://user:password@example.invalid/reset' }, { link: 'https://example.invalid/\nreset' },
    { link: `https://example.invalid/${'a'.repeat(4096)}` }, { purpose: 'arbitrary-bulk-mail' },
  ];
  for (const [index, invalid] of cases.entries()) {
    await t.test(String(index), async () => {
      const delivery = makeDelivery(async () => assert.fail('invalid input must never call even fake fetch'));
      await assert.rejects(delivery.send({ ...message, ...invalid }), isSanitized);
      assert.equal(delivery.status().lastAttemptStatus, 'provider-unconfirmed');
    });
  }
  for (const absent of [undefined, null, false, 'invalid-input']) {
    const delivery = makeDelivery(async () => assert.fail('absent input must not call even fake fetch'));
    await assert.rejects(delivery.send(absent), isSanitized);
  }
});

test('fake-fetch contract: only a well-shaped receipt without any Code field means provider acceptance', async t => {
  const invalid = [null, [], {}, { RequestId: 'fake' }, { EnvId: 'fake' },
    { RequestId: {}, EnvId: 'fake' }, { RequestId: 'fake', EnvId: 123 },
    { RequestId: ' ', EnvId: 'fake' }, { RequestId: 'fake', EnvId: '' },
    { ...receipt(), Code: 'InvalidAccessKeyId' }, { ...receipt(), Code: '' }, { ...receipt(), Code: null }];
  for (const [index, data] of invalid.entries()) {
    await t.test(String(index), async () => {
      let calls = 0;
      const delivery = makeDelivery(async () => { calls++; return fakeResponse(data); });
      await assert.rejects(delivery.send(message), isSanitized);
      assert.equal(delivery.status().lastAttemptStatus, 'provider-unconfirmed');
      assert.equal(calls, 1, 'no automatic retries');
    });
  }
});

test('fake-fetch contract: provider/network/JSON/body errors are sanitized and never retried or logged', async t => {
  const error = `PRIVATE_PROVIDER_BODY ${Object.values(fixtureEnv()).join(' ')} ${message.email} ${message.link}`;
  const errorLog = t.mock.method(console, 'error', () => {});
  const warningLog = t.mock.method(console, 'warn', () => {});
  const infoLog = t.mock.method(console, 'log', () => {});
  for (const fakeFetch of [
    async () => { throw new Error(error); },
    async () => new Response(error, { status: 503 }),
    async () => new Response(error, { status: 302, headers: { location: 'https://wrong.example.invalid' } }),
    async () => new Response(error),
    async () => new Response(null),
    async () => new Response(new Uint8Array([0xff, 0xfe])),
    async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(error)); } })),
  ]) {
    let calls = 0;
    const delivery = makeDelivery(async (...args) => { calls++; return fakeFetch(...args); });
    await assert.rejects(delivery.send(message), isSanitized);
    assert.equal(delivery.status().lastAttemptStatus, 'provider-unconfirmed');
    assert.equal(calls, 1);
  }
  assert.equal(errorLog.mock.callCount() + warningLog.mock.callCount() + infoLog.mock.callCount(), 0);
});

test('fake-fetch contract: response cap counts bytes, accepts exactly 64 KiB, and cancels excess streams', async () => {
  const base = JSON.stringify({ ...receipt(), padding: '' });
  const exact = JSON.stringify({ ...receipt(), padding: 'x'.repeat(65_536 - Buffer.byteLength(base)) });
  assert.equal(Buffer.byteLength(exact), 65_536);
  assert.deepEqual(await makeDelivery(async () => new Response(exact)).send(message), { accepted: true });
  for (const payload of [exact + ' ', JSON.stringify({ ...receipt(), padding: '汉'.repeat(22_000) })]) {
    assert.ok(Buffer.byteLength(payload) > 65_536);
    await assert.rejects(makeDelivery(async () => new Response(payload)).send(message), isSanitized);
  }
  let canceled = false;
  let chunks = 0;
  const oversized = new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(8192)); },
    cancel() { canceled = true; },
  });
  await assert.rejects(makeDelivery(async () => new Response(oversized)).send(message), isSanitized);
  assert.equal(canceled, true);
  assert.ok(chunks <= 10, 'stop reading immediately at the byte cap, allowing one stream-prefetched chunk');
});

test('fake-fetch contract: oversized declared response is rejected before body reads', async () => {
  let canceled = false;
  let read = false;
  const delivery = makeDelivery(async () => ({
    ok: true, headers: new Headers({ 'content-length': '65537' }),
    body: { getReader() { read = true; assert.fail('must not read declared oversized body'); }, async cancel() { canceled = true; } },
  }));
  await assert.rejects(delivery.send(message), isSanitized);
  assert.equal(read, false);
  assert.equal(canceled, true);
});

test('fake-fetch contract: 10-second timeout bounds even a fetch that ignores abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  let calls = 0;
  const delivery = makeDelivery(async (_, options) => {
    calls++; signal = options.signal; return new Promise(() => {});
  });
  const pending = delivery.send(message);
  const rejected = assert.rejects(pending, isSanitized);
  t.mock.timers.tick(9999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  assert.equal(delivery.status().lastAttemptStatus, 'provider-unconfirmed');
});

test('fake-fetch contract: 10-second deadline includes body streaming and cancels stalled bodies', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let canceled = false;
  const delivery = makeDelivery(async () => new Response(new ReadableStream({ cancel() { canceled = true; } })));
  const pending = delivery.send(message);
  const rejected = assert.rejects(pending, isSanitized);
  await new Promise(setImmediate);
  t.mock.timers.tick(10_000);
  await rejected;
  assert.equal(canceled, true);
});

test('fake-fetch contract: successful calls clear their deadline; latest initiated attempt owns status', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const resolvers = [];
  const signals = [];
  let clock = NOW;
  const delivery = createEmailDelivery({ env: fixtureEnv(), now: () => clock, fetchImpl: async (_, options) => {
    signals.push(options.signal);
    return new Promise(resolve => resolvers.push(resolve));
  } });
  const first = delivery.send(message);
  clock += 1000;
  const second = delivery.send(message);
  const secondRejected = assert.rejects(second, isSanitized);
  resolvers[1](new Response('PRIVATE_PROVIDER_BODY', { status: 500 }));
  await secondRejected;
  resolvers[0](fakeResponse());
  assert.deepEqual(await first, { accepted: true });
  assert.deepEqual(delivery.status(), { configured: true, lastAttemptStatus: 'provider-unconfirmed', lastAttemptAt: new Date(clock).toISOString() });
  t.mock.timers.tick(20_000);
  assert.ok(signals.every(signal => signal.aborted === false), 'both completed calls cleared their timer');
});
