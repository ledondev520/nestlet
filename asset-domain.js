/** Shared server-only asset limits and validation. Stored content is always untrusted data. */
export const ASSET_LIMITS = Object.freeze({
  fileBytes: 5 * 1024 * 1024,
  userBytes: 256 * 1024 * 1024,
  filesPerUser: 200,
  textChars: 50000
});
export const ASSET_TYPES = Object.freeze({
  'application/pdf': { extensions: ['pdf'], previewKind: 'pdf' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    extensions: ['xlsx'],
    previewKind: 'text'
  },
  'application/vnd.ms-excel': { extensions: ['xls'], previewKind: 'text' },
  'text/plain': { extensions: ['txt'], previewKind: 'text' },
  'text/csv': { extensions: ['csv'], previewKind: 'text' },
  'image/png': { extensions: ['png'], previewKind: 'image' },
  'image/jpeg': { extensions: ['jpg', 'jpeg'], previewKind: 'image' }
});
export class AssetError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'AssetError';
    this.code = code;
    this.status = status;
  }
}
export const assetFail = (code, status = 400) => {
  throw new AssetError(code, status);
};
export const assetId = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
export function assetKeys(value, allowed, required = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k)) ||
    required.some((k) => !Object.hasOwn(value, k))
  )
    assetFail('ASSET_INVALID');
}
export const normalizeAssetSearch = (value) => value.normalize('NFC').toLowerCase();
export function assetFilename(value, mimeType) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 240 ||
    Buffer.byteLength(value, 'utf8') > 720 ||
    /[\u0000-\u001f\u007f/\\\u202a-\u202e\u2066-\u2069]/u.test(value) ||
    value === '.' ||
    value === '..'
  )
    assetFail('ASSET_FILENAME_INVALID');
  if (
    !Object.hasOwn(ASSET_TYPES, mimeType) ||
    !ASSET_TYPES[mimeType].extensions.includes(value.split('.').at(-1).toLowerCase())
  )
    assetFail('ASSET_TYPE_UNSUPPORTED', 415);
  return value;
}
export function assetAssociation(value) {
  assetKeys(value, ['caseId', 'clientId']);
  for (const name of ['caseId', 'clientId'])
    if (value[name] !== undefined && value[name] !== null && !assetId(value[name]))
      assetFail('ASSET_INVALID');
  return value;
}
