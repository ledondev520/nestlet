export const ASSET_PAGE_SIZE = 50;
export const ASSET_SEARCH_LENGTH = 200;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export function assetPath(id, action) {
  if (!uuid.test(id) || !['preview', 'download', 'text'].includes(action)) return null;
  return `/api/assets/${id}/${action}`;
}
export function assetSearchPath({ clientId, caseId = '', q = '', offset = 0 }) {
  const params = new URLSearchParams({ clientId, q: q.trim(), limit: String(ASSET_PAGE_SIZE), offset: String(offset) });
  if (caseId) params.set('caseId', caseId);
  return `/api/assets?${params}`;
}
export function validAssetPage(value) {
  return value && Array.isArray(value.assets) && Number.isSafeInteger(value.total) && value.total >= 0 && value.assets.length <= ASSET_PAGE_SIZE && value.assets.every(asset =>
    asset && typeof asset.id === 'string' && uuid.test(asset.id) && typeof asset.originalFilename === 'string' &&
    typeof asset.mimeType === 'string' && Number.isSafeInteger(asset.sizeBytes) && asset.sizeBytes >= 0 &&
    ['pdf', 'image', 'text'].includes(asset.previewKind));
}
export function sizeLabel(bytes, lang) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = bytes === 0 ? 0 : Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
  return `${new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: index === 0 ? 0 : 1 }).format(bytes / 1024 ** index)} ${units[index]}`;
}
export function assetsError(error, t, context = 'list') {
  if (error?.status === 401) return t.sessionExpired;
  if (['ASSET_NOT_FOUND', 'CASE_NOT_FOUND', 'CLIENT_NOT_FOUND'].includes(error?.code)) return t.notFound;
  if (['ASSET_STORAGE_UNAVAILABLE', 'ASSET_UNAVAILABLE', 'ASSET_FILE_MISSING', 'ASSET_FILE_UNSAFE', 'ASSET_INTEGRITY_FAILED'].includes(error?.code)) return t.unavailableStorage;
  if (error?.code === 'ASSET_INVALID') return t.invalid;
  return context === 'text' ? t.textError : t.loadError;
}
export const unavailableAssets = error => error?.status === 404 && !['ASSET_NOT_FOUND', 'CASE_NOT_FOUND', 'CLIENT_NOT_FOUND'].includes(error?.code);
