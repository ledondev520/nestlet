import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, ApiError } from '../frontend/lib/api.js';

test('frontend API client keeps requests same-origin and attaches current CSRF only on mutations', async () => {
  const calls = [];
  let csrf = 'test-csrf-not-a-secret';
  const api = createApiClient({ getCsrfToken: () => csrf, fetchImpl: async (...args) => {
    calls.push(args); return { ok: true, json: async () => ({ clients: [] }) };
  } });
  assert.deepEqual(await api.get('/api/clients?search=%E6%B5%8B%E8%AF%95'), { clients: [] });
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].headers['X-CSRF-Token'], undefined);
  await api.post('/api/clients', { displayName: 'Synthetic' });
  assert.equal(calls[1][1].headers['X-CSRF-Token'], csrf);
  assert.deepEqual(JSON.parse(calls[1][1].body), { displayName: 'Synthetic' });
  csrf = 'changed-public-test-csrf';
  await api.patch('/api/cases/test/document-context', { confirm: true });
  assert.equal(calls[2][1].headers['X-CSRF-Token'], csrf);
  for (const path of ['https://evil.invalid/api/clients', '//evil.invalid/api/clients', '/elsewhere', '/api/\\evil', '/api/../outside', '/api/%2e%2e/outside']) {
    await assert.rejects(api.get(path), error => error.code === 'INVALID_API_PATH');
  }
  assert.equal(calls.length, 3);
});

test('frontend API errors retain stable code and structured details, never server exception text', async () => {
  const details = { ready: false, missing: [{ key: 'senderName' }] };
  const api = createApiClient({ fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ code: 'DOCUMENT_DETAILS_REQUIRED', error: 'private implementation detail', details }) }) });
  await assert.rejects(api.post('/api/cases/test/artifacts', {}), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, 'DOCUMENT_DETAILS_REQUIRED');
    assert.equal(error.status, 409);
    assert.deepEqual(error.details, details);
    return true;
  });
});

test('session invalidation excludes a rejected login and aborts remain recognizable', async () => {
  let expired = 0;
  const api = createApiClient({ onUnauthorized: () => expired++, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ code: 'AUTH_REQUIRED' }) }) });
  await assert.rejects(api.post('/api/login', {}));
  assert.equal(expired, 0);
  await assert.rejects(api.get('/api/clients'));
  assert.equal(expired, 1);
  const cancelled = createApiClient({ fetchImpl: async () => { throw new DOMException('Aborted', 'AbortError'); } });
  await assert.rejects(cancelled.get('/api/status'), { name: 'AbortError' });
  const offline = createApiClient({ fetchImpl: async () => { throw new TypeError('fetch failed with private details'); } });
  await assert.rejects(offline.get('/api/status'), { message: 'NETWORK_ERROR', status: 0 });
});

test('invalid JSON fails closed without masquerading as an empty directory', async () => {
  const api = createApiClient({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('HTML response'); } }) });
  await assert.rejects(api.get('/api/clients'), { message: 'INVALID_RESPONSE' });
});

test('an aborted read or delayed old-session 401 cannot invalidate the new account', async () => {
  let finish, expired = 0, token = 'old-test-session';
  const json = new Promise(resolve => { finish = resolve; });
  const api = createApiClient({ getCsrfToken: () => token, onUnauthorized: () => expired++, fetchImpl: async () => ({ ok: false, status: 401, json: () => json }) });
  const request = api.get('/api/clients');
  token = 'new-test-session';
  finish({ code: 'AUTH_REQUIRED' });
  await assert.rejects(request, { code: 'AUTH_REQUIRED' });
  assert.equal(expired, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.get('/api/clients', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(expired, 0);
});

test('authorized private uploads send exact bytes, MIME, encoded filename and explicit consent', async () => {
  const calls = [];
  const api = createApiClient({ getCsrfToken: () => 'test-csrf', fetchImpl: async (...args) => { calls.push(args); return { ok: true, status: 201, json: async () => ({ asset: { id: 'synthetic-asset' } }) }; } });
  const file = new Blob(['Synthetic text'], { type: 'text/plain' });
  await api.upload('/api/assets?caseId=synthetic-case', file, { contentType: 'text/plain', filename: '虚构 示例.txt', assetConsent: true });
  assert.equal(calls[0][1].body, file);
  assert.equal(calls[0][1].headers['Content-Type'], 'text/plain');
  assert.equal(calls[0][1].headers['X-Asset-Filename'], encodeURIComponent('虚构 示例.txt'));
  assert.equal(calls[0][1].headers['X-Asset-Consent'], 'persist-private');
  assert.equal(calls[0][1].headers['X-CSRF-Token'], 'test-csrf');
  assert.equal(calls[0][1].credentials, 'same-origin');
  await api.upload('/api/document', file, { contentType: 'application/pdf', documentConsent: true });
  assert.equal(calls[1][1].headers['X-Document-Consent'], 'synthetic-or-deidentified');
  assert.equal(calls[1][1].headers['X-Asset-Consent'], undefined);
  await assert.rejects(api.upload('/api/settings', file, { contentType: 'text/plain' }), { code: 'INVALID_UPLOAD_PATH' });
  await assert.rejects(api.upload('/api/assets', file, { contentType: 'text/html' }), { code: 'INVALID_UPLOAD_TYPE' });
  assert.equal(calls.length, 2);
});
