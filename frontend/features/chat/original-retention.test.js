// Synthetic image bytes and controlled API fixtures. Not browser/provider evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { findSavedChatOriginal, matchesChatOriginal, prepareChatOriginal, uploadChatOriginal } from './original-retention.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const image = () => ({ id: randomUUID(), mimeType: 'image/png', originalFilename: 'Synthetic chat original.png', originalFile: new File([png], 'Synthetic chat original.png', { type: 'image/png' }) });
const saved = (original, caseId) => ({ id: randomUUID(), caseId, originalFilename: original.originalFilename, mimeType: original.mimeType, sizeBytes: original.sizeBytes, sha256: original.sha256, previewKind: 'image' });

test('original adapter uploads the exact File bytes with explicit retention consent and same-case association', async () => {
  const attached = image(), original = await prepareChatOriginal(attached), caseId = randomUUID(), asset = saved(original, caseId);
  const requests = [];
  const api = { upload: async (path, file, options) => { requests.push({ path, file, options }); return { asset }; } };
  assert.deepEqual(await uploadChatOriginal(api, original, caseId), asset);
  assert.equal(requests.length, 1); assert.equal(requests[0].file, attached.originalFile);
  assert.deepEqual(Buffer.from(await requests[0].file.arrayBuffer()), png);
  assert.equal(requests[0].path, `/api/assets?caseId=${caseId}`);
  assert.deepEqual(requests[0].options, { contentType: 'image/png', filename: attached.originalFilename, assetConsent: true, signal: undefined });
});

test('matching requires same case, exact name/type/size/hash and a valid saved-image ID', async () => {
  const original = await prepareChatOriginal(image()), caseId = randomUUID(), asset = saved(original, caseId);
  assert.equal(matchesChatOriginal(asset, original, caseId), true);
  for (const changed of [{ caseId: randomUUID() }, { id: 'bad' }, { originalFilename: 'different.png' }, { mimeType: 'image/jpeg' }, { sizeBytes: png.length + 1 }, { sha256: '0'.repeat(64) }, { previewKind: 'text' }])
    assert.equal(matchesChatOriginal({ ...asset, ...changed }, original, caseId), false);
  await assert.rejects(uploadChatOriginal({ upload: async () => ({ asset: { ...asset, caseId: randomUUID() } }) }, original, caseId), { code: 'INVALID_RESPONSE' });
});

test('bounded reconciliation reads a second page without creating an asset and rejects foreign-case responses', async () => {
  const original = await prepareChatOriginal(image()), caseId = randomUUID(), asset = saved(original, caseId), calls = [];
  const other = Array.from({ length: 100 }, () => ({ ...asset, id: randomUUID(), originalFilename: 'Other.png' }));
  const api = { get: async path => { calls.push(path); return { assets: calls.length === 1 ? other : [asset], total: 101 }; } };
  assert.deepEqual(await findSavedChatOriginal(api, original, caseId), asset); assert.equal(calls.length, 2);
  assert.match(calls[1], /offset=100$/);
  await assert.rejects(findSavedChatOriginal({ get: async () => ({ assets: [{ ...asset, caseId: randomUUID() }], total: 1 }) }, original, caseId), { code: 'INVALID_RESPONSE' });
  await assert.rejects(findSavedChatOriginal({ get: async () => ({ assets: [], total: 201 }) }, original, caseId), { code: 'INVALID_RESPONSE' });
});

test('metadata and historical previews are not substitutes for original bytes, and cancellation stops before upload', async () => {
  await assert.rejects(prepareChatOriginal({ id: randomUUID(), mimeType: 'image/png', data: png.toString('base64'), preview: 'blob:synthetic' }), { code: 'ORIGINAL_UNAVAILABLE' });
  const attached = image(); attached.originalFilename = '../private.png';
  await assert.rejects(prepareChatOriginal(attached), { code: 'ORIGINAL_FILENAME_INVALID' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(prepareChatOriginal(image(), { signal: controller.signal }), { name: 'AbortError' });
});
