import { CHAT_BOUNDS, imageDimensions, validateImageFile } from './logic.js';

/** Explicit original retention uses the existing authenticated asset API only. */
export class OriginalRetentionError extends Error {
  constructor(code) { super(code); this.name = 'OriginalRetentionError'; this.code = code; }
}
const fail = code => { throw new OriginalRetentionError(code); };
export const originalId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const check = signal => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };

export function originalFilename(image) {
  return image.originalFilename || image.originalFile?.name || '';
}

/** The original File, never a canvas/thumbnail or reconstructed base64, is uploaded. */
export async function prepareChatOriginal(image, { signal } = {}) {
  check(signal);
  const file = image?.originalFile, name = image && originalFilename(image);
  if (!file || typeof file.arrayBuffer !== 'function' || !originalId(image.id)) fail('ORIGINAL_UNAVAILABLE');
  validateImageFile(file);
  if (file.type !== image.mimeType || typeof name !== 'string' || !name.trim() || name.length > 240 ||
      new TextEncoder().encode(name).length > 720 || /[\u0000-\u001f\u007f/\\\u202a-\u202e\u2066-\u2069]/u.test(name) ||
      !(file.type === 'image/png' ? /\.png$/iu : /\.jpe?g$/iu).test(name)) fail('ORIGINAL_FILENAME_INVALID');
  const bytes = new Uint8Array(await file.arrayBuffer()); check(signal);
  if (bytes.byteLength !== file.size || bytes.byteLength > CHAT_BOUNDS.imageBytes) fail('ORIGINAL_UNAVAILABLE');
  imageDimensions(bytes, file.type);
  const digest = await crypto.subtle.digest('SHA-256', bytes); check(signal);
  return { file, originalFilename: name, mimeType: file.type, sizeBytes: bytes.byteLength,
    sha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') };
}

export function matchesChatOriginal(asset, original, caseId) {
  return Boolean(asset && originalId(asset.id) && asset.caseId === caseId &&
    asset.originalFilename === original.originalFilename && asset.mimeType === original.mimeType &&
    asset.sizeBytes === original.sizeBytes && asset.sha256 === original.sha256 && asset.previewKind === 'image');
}

/** At most 200 metadata records, matching the existing server's per-user cap. */
export async function findSavedChatOriginal(api, original, caseId, { signal } = {}) {
  if (!originalId(caseId)) fail('ORIGINAL_CASE_REQUIRED');
  for (let offset = 0; offset < 200; offset += 100) {
    check(signal);
    const page = await api.get(`/api/assets?caseId=${caseId}&limit=100&offset=${offset}`, { signal });
    check(signal);
    if (!page || !Array.isArray(page.assets) || page.assets.length > 100 || !Number.isSafeInteger(page.total) ||
        page.total < 0 || page.total > 200 || page.assets.some(asset => !asset || !originalId(asset.id) || asset.caseId !== caseId)) fail('INVALID_RESPONSE');
    const saved = page.assets.find(asset => matchesChatOriginal(asset, original, caseId));
    if (saved) return saved;
    if (offset + page.assets.length >= page.total) return null;
    if (page.assets.length !== 100) fail('INVALID_RESPONSE');
  }
  return null;
}

export async function uploadChatOriginal(api, original, caseId, { signal } = {}) {
  if (!originalId(caseId)) fail('ORIGINAL_CASE_REQUIRED');
  check(signal);
  const result = await api.upload(`/api/assets?caseId=${caseId}`, original.file, {
    contentType: original.mimeType, filename: original.originalFilename, assetConsent: true, signal
  });
  check(signal);
  if (!matchesChatOriginal(result?.asset, original, caseId)) fail('INVALID_RESPONSE');
  return result.asset;
}

// These server failures happen before an asset can be committed. Unknown/network
// outcomes must be checked, never automatically repeated as a new POST.
const rejectedCodes = new Set(['AUTH_REQUIRED', 'CSRF_REJECTED', 'HTTPS_REQUIRED', 'ORIGIN_REJECTED',
  'CASE_NOT_FOUND', 'CLIENT_NOT_FOUND', 'ASSET_CONSENT_REQUIRED', 'ASSET_FILENAME_INVALID',
  'ASSET_TYPE_UNSUPPORTED', 'ASSET_TOO_LARGE', 'ASSET_QUOTA_EXCEEDED', 'ASSET_INVALID',
  'ASSET_IMAGE_INVALID', 'ASSET_IMAGE_UNSUPPORTED', 'ASSET_STORAGE_UNAVAILABLE', 'BUSY']);
export const originalUploadDefinitelyRejected = error => rejectedCodes.has(error?.code) && error?.status >= 400 && error.status < 500;
