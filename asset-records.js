/** Authenticated private-file routes. The server supplies the verified session; client identity is never accepted. */
import {
  ASSET_LIMITS,
  AssetError,
  assetFail,
  assetKeys,
  assetId,
  assetFilename
} from './asset-domain.js';
import { parseAsset } from './private-assets.js';
let activeUploads = 0;
export function isAssetRecordsPath(path) {
  return path === '/api/assets' || path.startsWith('/api/assets/');
}
function query(url, allowed) {
  if (
    [...url.searchParams.keys()].some(
      (k) => !allowed.includes(k) || url.searchParams.getAll(k).length !== 1
    )
  )
    assetFail('ASSET_INVALID');
}
function linksFromQuery(url) {
  query(url, ['caseId', 'clientId']);
  return Object.fromEntries([...url.searchParams]);
}
const disposition = (kind, filename) =>
  `${kind}; filename="download.${filename
    .split('.')
    .at(-1)
    .replace(
      /[^a-z0-9]/gi,
      ''
    )}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
export async function handleAssetRecords({
  request,
  response,
  url,
  session,
  storage,
  vault,
  readBody,
  readJson,
  json,
  signal,
  parsers
}) {
  const userId = session.userId,
    method = request.method;
  if (url.pathname === '/api/assets') {
    if (method === 'GET') {
      query(url, ['q', 'caseId', 'clientId', 'limit', 'offset']);
      const options = Object.fromEntries(url.searchParams);
      for (const k of ['limit', 'offset'])
        if (Object.hasOwn(options, k)) {
          if (!/^\d+$/u.test(options[k])) assetFail('ASSET_INVALID');
          options[k] = Number(options[k]);
        }
      return json(200, storage.listAssets(userId, options));
    }
    if (method === 'POST') {
      const links = linksFromQuery(url);
      storage.validateAssetLinks(userId, links);
      if (request.headers['x-asset-consent'] !== 'persist-private')
        assetFail('ASSET_CONSENT_REQUIRED');
      let originalFilename;
      try {
        originalFilename = decodeURIComponent(request.headers['x-asset-filename'] ?? '');
      } catch {
        assetFail('ASSET_FILENAME_INVALID');
      }
      const mimeType = (request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      assetFilename(originalFilename, mimeType);
      const usage = storage.assetUsage(userId);
      if (usage.count >= ASSET_LIMITS.filesPerUser || usage.bytes >= ASSET_LIMITS.userBytes)
        assetFail('ASSET_QUOTA_EXCEEDED', 409);
      if (activeUploads >= 2) assetFail('BUSY', 429);
      activeUploads++;
      let pendingId = null,
        committed = false;
      try {
        let bytes;
        try {
          bytes = await readBody(request, ASSET_LIMITS.fileBytes);
        } catch (e) {
          if (e.status === 413) assetFail('ASSET_TOO_LARGE', 413);
          throw e;
        }
        if (usage.bytes + bytes.length > ASSET_LIMITS.userBytes)
          assetFail('ASSET_QUOTA_EXCEEDED', 409);
        const parsed = await parseAsset(bytes, { originalFilename, mimeType, signal, ...parsers });
        if (signal.aborted) assetFail('REQUEST_CANCELLED', 499);
        const asset = storage.createAsset(userId, parsed, links, (id) => {
          vault.write(id, bytes);
          pendingId = id;
        });
        committed = true;
        return json(201, { asset });
      } finally {
        activeUploads--;
        if (pendingId && !committed) vault.discardUncommitted(pendingId);
      }
    }
    assetFail('ASSET_METHOD_NOT_ALLOWED', 405);
  }
  const route = /^\/api\/assets\/([^/]+)(?:\/(text|preview|download))?$/u.exec(url.pathname);
  if (!route || !assetId(route[1])) assetFail('ASSET_NOT_FOUND', 404);
  query(url, []);
  const asset = storage.getAsset(userId, route[1]);
  if (!asset) assetFail('ASSET_NOT_FOUND', 404);
  const action = route[2];
  if (method === 'PATCH' && !action) {
    const body = await readJson(request, 4096);
    assetKeys(body, ['caseId', 'clientId', 'expectedVersion'], ['expectedVersion']);
    if (!Object.hasOwn(body, 'caseId') && !Object.hasOwn(body, 'clientId'))
      assetFail('ASSET_INVALID');
    const { expectedVersion, ...links } = body;
    const updated = storage.updateAssetLinks(userId, asset.id, links, expectedVersion);
    if (!updated) assetFail('ASSET_NOT_FOUND', 404);
    return json(200, { asset: updated });
  }
  if (method !== 'GET') assetFail('ASSET_METHOD_NOT_ALLOWED', 405);
  if (!action) return json(200, { asset });
  if (action === 'text') return json(200, { asset, text: storage.getAssetText(userId, asset.id) });
  const bytes = vault.read(asset);
  if (action === 'download') {
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': bytes.length,
      'Content-Disposition': disposition('attachment', asset.originalFilename),
      'Content-Security-Policy': "default-src 'none'; sandbox; frame-ancestors 'none'"
    });
    return response.end(bytes);
  }
  // Browser PDF/image viewers receive only same-origin authenticated bytes. Never use external viewer URLs.
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; sandbox; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
  );
  const textPreview = asset.previewKind === 'text',
    body = textPreview ? Buffer.from(storage.getAssetText(userId, asset.id), 'utf8') : bytes;
  response.writeHead(200, {
    'Content-Type': textPreview ? 'text/plain; charset=utf-8' : asset.mimeType,
    'Content-Length': body.length,
    'Content-Disposition': disposition(
      'inline',
      textPreview ? asset.originalFilename + '.txt' : asset.originalFilename
    )
  });
  return response.end(body);
}
export { AssetError };
