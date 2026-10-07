/** Private immutable bytes. No names/paths supplied by a browser are used for disk access. */
import {
  constants,
  closeSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  writeSync,
  unlinkSync
} from 'node:fs';
import { resolve, parse, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ASSET_LIMITS, ASSET_TYPES, assetFail, assetId, assetFilename } from './asset-domain.js';
const uid = () => process.geteuid?.() ?? process.getuid?.();
const owned = (info) => uid() === undefined || info.uid === uid();
export function preparePrivateDirectory(input, { create = true } = {}) {
  if (typeof input !== 'string' || !input || input.includes('\0') || resolve(input) !== input)
    assetFail('ASSET_PATH_INVALID', 500);
  const root = parse(input).root;
  let ancestor = root;
  for (const part of ['', ...input.slice(root.length).split(sep).filter(Boolean)]) {
    if (part) ancestor = resolve(ancestor, part);
    let info;
    try {
      info = lstatSync(ancestor);
    } catch (e) {
      if (e.code !== 'ENOENT' || !create) throw e;
      mkdirSync(ancestor, { mode: 0o700 });
      info = lstatSync(ancestor);
    }
    const sticky = ancestor !== input && info.uid === 0 && Boolean(info.mode & 0o1000);
    if (!info.isDirectory() || (!owned(info) && info.uid !== 0) || (info.mode & 0o022 && !sticky))
      assetFail('ASSET_PATH_INVALID', 500);
    if (ancestor === input && (!owned(info) || (info.mode & 0o777) !== 0o700))
      assetFail('ASSET_PATH_INVALID', 500);
  }
  return input;
}
function privateFile(info) {
  return info.isFile() && info.nlink === 1 && owned(info) && (info.mode & 0o777) === 0o600;
}
export const assetDigest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function openAssetVault({ directory }) {
  const root = preparePrivateDirectory(directory),
    initial = lstatSync(root);
  function checkRoot() {
    preparePrivateDirectory(root, { create: false });
    const now = lstatSync(root);
    if (now.ino !== initial.ino || now.dev !== initial.dev) assetFail('ASSET_PATH_INVALID', 500);
  }
  function path(id) {
    if (!assetId(id)) assetFail('ASSET_NOT_FOUND', 404);
    return resolve(root, id + '.blob');
  }
  return {
    directory: root,
    write(id, bytes) {
      checkRoot();
      const filename = path(id);
      let fd, createdInfo;
      try {
        fd = openSync(
          filename,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          0o600
        );
        createdInfo = fstatSync(fd);
        if (!privateFile(createdInfo)) assetFail('ASSET_PATH_INVALID', 500);
        let at = 0;
        while (at < bytes.length) at += writeSync(fd, bytes, at, bytes.length - at);
        fsyncSync(fd);
        const dirFd = openSync(
          root,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
        );
        try {
          fsyncSync(dirFd);
        } finally {
          closeSync(dirFd);
        }
      } catch (error) {
        // Clean only the inode created by this unsuccessful write. Never touch a pre-existing UUID.
        if (createdInfo) {
          try {
            const current = lstatSync(filename);
            if (
              current.isFile() &&
              current.nlink === 1 &&
              current.ino === createdInfo.ino &&
              current.dev === createdInfo.dev
            )
              unlinkSync(filename);
          } catch {
            /* A failed cleanup leaves an unreferenced file for explicit operator review. */
          }
        }
        throw error;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    },
    read(asset) {
      checkRoot();
      let fd;
      try {
        fd = openSync(
          path(asset.id),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
        );
        const info = fstatSync(fd);
        if (!privateFile(info)) assetFail('ASSET_FILE_UNSAFE', 503);
        if (info.size !== asset.sizeBytes || info.size > ASSET_LIMITS.fileBytes)
          assetFail('ASSET_INTEGRITY_FAILED', 503);
        const bytes = Buffer.alloc(asset.sizeBytes);
        let at = 0,
          n;
        while (at < bytes.length && (n = readSync(fd, bytes, at, bytes.length - at, null))) at += n;
        const after = fstatSync(fd);
        if (
          at !== asset.sizeBytes ||
          after.size !== asset.sizeBytes ||
          !privateFile(after) ||
          assetDigest(bytes) !== asset.sha256
        )
          assetFail('ASSET_INTEGRITY_FAILED', 503);
        return bytes;
      } catch (e) {
        if (e.code === 'ENOENT') assetFail('ASSET_FILE_MISSING', 503);
        if (e.code === 'ELOOP') assetFail('ASSET_FILE_UNSAFE', 503);
        throw e;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    },
    discardUncommitted(id) {
      checkRoot();
      const filename = path(id);
      try {
        const info = lstatSync(filename);
        if (!privateFile(info)) assetFail('ASSET_FILE_UNSAFE', 503);
        unlinkSync(filename);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
  };
}
// Validate PNG structure, CRCs and bounded image stream; never decode or execute ancillary payloads.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function validatePng(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    assetFail('ASSET_IMAGE_INVALID', 422);
  let at = 8,
    header = false,
    ended = false,
    idats = [],
    width,
    height,
    depth,
    color,
    interlace;
  while (at + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(at),
      end = at + 12 + size;
    if (end > bytes.length) assetFail('ASSET_IMAGE_INVALID', 422);
    const kind = bytes.toString('ascii', at + 4, at + 8),
      data = bytes.subarray(at + 8, at + 8 + size);
    if (crc32(bytes.subarray(at + 4, at + 8 + size)) !== bytes.readUInt32BE(at + 8 + size))
      assetFail('ASSET_IMAGE_INVALID', 422);
    if (!header && kind !== 'IHDR') assetFail('ASSET_IMAGE_INVALID', 422);
    if (kind === 'IHDR') {
      if (header || size !== 13) assetFail('ASSET_IMAGE_INVALID', 422);
      header = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      interlace = data[12];
      if (
        !width ||
        !height ||
        width * height > 16000000 ||
        width > 16000 ||
        height > 16000 ||
        data[10] ||
        data[11] ||
        ![0, 1].includes(interlace) ||
        !{ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[
          color
        ]?.includes(depth)
      )
        assetFail('ASSET_IMAGE_INVALID', 422);
    }
    if (kind === 'IDAT') idats.push(data);
    if (kind === 'IEND') {
      if (size || end !== bytes.length) assetFail('ASSET_IMAGE_INVALID', 422);
      ended = true;
      break;
    }
    at = end;
  }
  if (!ended || !idats.length) assetFail('ASSET_IMAGE_INVALID', 422);
  try {
    const decoded = inflateSync(Buffer.concat(idats), { maxOutputLength: 128 * 1024 * 1024 });
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
    if (
      !decoded.length ||
      (!interlace && decoded.length !== (Math.ceil((width * channels * depth) / 8) + 1) * height)
    )
      assetFail('ASSET_IMAGE_INVALID', 422);
  } catch {
    assetFail('ASSET_IMAGE_INVALID', 422);
  }
}
function validateJpeg(bytes) {
  if (
    bytes.length < 12 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    assetFail('ASSET_IMAGE_INVALID', 422);
  let at = 2,
    frame = false,
    scan = false;
  while (at < bytes.length - 2) {
    if (bytes[at++] !== 255) assetFail('ASSET_IMAGE_INVALID', 422);
    while (bytes[at] === 255) at++;
    const marker = bytes[at++];
    if (marker === 217) break;
    if (marker === 0 || marker === 216) assetFail('ASSET_IMAGE_INVALID', 422);
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (at + 2 > bytes.length) assetFail('ASSET_IMAGE_INVALID', 422);
    const size = bytes.readUInt16BE(at);
    if (size < 2 || at + size > bytes.length - 2) assetFail('ASSET_IMAGE_INVALID', 422);
    if ([192, 193, 194].includes(marker)) {
      if (frame || size < 8) assetFail('ASSET_IMAGE_INVALID', 422);
      const h = bytes.readUInt16BE(at + 3),
        w = bytes.readUInt16BE(at + 5);
      if (!w || !h || w * h > 16000000 || w > 16000 || h > 16000)
        assetFail('ASSET_IMAGE_INVALID', 422);
      frame = true;
    }
    at += size;
    if (marker === 218) {
      scan = true;
      while (at < bytes.length - 2) {
        if (bytes[at++] !== 255) continue;
        while (bytes[at] === 255) at++;
        if (bytes[at] === 0 || (bytes[at] >= 208 && bytes[at] <= 215)) {
          at++;
          continue;
        }
        at--;
        break;
      }
    }
  }
  if (!frame || !scan || at !== bytes.length - 2) assetFail('ASSET_IMAGE_INVALID', 422);
}
export function validateImageStructure(bytes, mimeType) {
  if (mimeType === 'image/png') validatePng(bytes);
  else if (mimeType === 'image/jpeg') validateJpeg(bytes);
  else assetFail('ASSET_IMAGE_INVALID', 422);
}
const imageParserEnvironment = {
  PATH: process.env.PATH || '/usr/bin:/bin',
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8'
};
const limitImages =
  process.platform === 'linux' &&
  spawnSync('prlimit', ['--version'], {
    timeout: 3000,
    stdio: 'ignore',
    env: imageParserEnvironment
  }).status === 0;
function validateImage(bytes, mimeType, signal) {
  return new Promise((resolve, reject) => {
    const args = [
      '--jitless',
      '--max-old-space-size=128',
      fileURLToPath(new URL('./asset-image-worker.js', import.meta.url)),
      mimeType
    ];
    const child = limitImages
      ? spawn('prlimit', ['--as=1073741824', '--cpu=10', '--', process.execPath, ...args], {
          stdio: ['pipe', 'pipe', 'ignore'],
          env: imageParserEnvironment
        })
      : spawn(process.execPath, args, {
          stdio: ['pipe', 'pipe', 'ignore'],
          env: imageParserEnvironment
        });
    let done = false,
      output = '';
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      child.kill('SIGKILL');
      if (error) reject(error);
      else resolve();
    };
    const invalid = () => {
      try {
        assetFail('ASSET_IMAGE_INVALID', 422);
      } catch (e) {
        finish(e);
      }
    };
    const cancel = () => {
      try {
        assetFail('REQUEST_CANCELLED', 499);
      } catch (e) {
        finish(e);
      }
    };
    const timer = setTimeout(invalid, 10000);
    signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.length > 1024) invalid();
    });
    child.stdin.on('error', () => {});
    child.on('error', invalid);
    child.on('close', (code) => {
      if (done) return;
      try {
        if (code !== 0 || JSON.parse(output).ok !== true) return invalid();
        finish();
      } catch {
        invalid();
      }
    });
    if (signal?.aborted) cancel();
    else child.stdin.end(bytes);
  });
}
function parseCsv(text) {
  let quote = false,
    afterQuote = false,
    field = '',
    row = [],
    rows = [],
    atStart = true;
  const flush = () => {
    row.push(field);
    field = '';
    afterQuote = false;
    atStart = true;
    if (row.length > 200) assetFail('ASSET_CSV_TOO_COMPLEX', 422);
  };
  const endRow = () => {
    flush();
    rows.push(row);
    row = [];
    if (rows.length > 10000) assetFail('ASSET_CSV_TOO_COMPLEX', 422);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quote = false;
          afterQuote = true;
        }
      } else field += c;
      continue;
    }
    if (c === ',') {
      flush();
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      continue;
    }
    if (afterQuote) assetFail('ASSET_CSV_INVALID', 422);
    if (c === '"') {
      if (!atStart) assetFail('ASSET_CSV_INVALID', 422);
      quote = true;
      atStart = false;
      continue;
    }
    field += c;
    atStart = false;
  }
  if (quote) assetFail('ASSET_CSV_INVALID', 422);
  if (field || row.length || afterQuote) endRow();
  return rows.map((r) => r.join('\t')).join('\n');
}
export async function parseAsset(
  bytes,
  { originalFilename, mimeType, signal, pdfText, workbookPreview, pdfEnabled, workbookEnabled }
) {
  assetFilename(originalFilename, mimeType);
  if (!bytes.length) assetFail('ASSET_EMPTY', 422);
  if (bytes.length > ASSET_LIMITS.fileBytes) assetFail('ASSET_TOO_LARGE', 413);
  let text = '',
    warnings = [],
    textStatus = 'ready',
    boundedPreview = false;
  if (mimeType === 'application/pdf') {
    if (!pdfEnabled) assetFail('PDF_UNAVAILABLE', 503);
    if (!bytes.subarray(0, 8).includes(Buffer.from('%PDF-'))) assetFail('INVALID_PDF', 422);
    try {
      text = await pdfText(bytes, signal);
    } catch (e) {
      if (e.code !== 'OCR_REQUIRED') throw e;
      textStatus = 'unavailable';
      warnings.push('Image-only PDF stored; text search and OCR are unavailable.');
    }
    warnings.push(
      'PDF text reading order may differ from the original. Review against the original.'
    );
  } else if (mimeType.includes('spreadsheetml') || mimeType === 'application/vnd.ms-excel') {
    if (!workbookEnabled) assetFail('WORKBOOK_UNAVAILABLE', 503);
    const preview = await workbookPreview(bytes, signal);
    text = preview.sheets
      .filter((s) => !s.hidden)
      .map((s) => s.name + '\n' + s.rows.map((r) => r.join('\t')).join('\n'))
      .join('\n\n');
    warnings.push(...preview.warnings);
    boundedPreview = preview.sheets.some((s) => s.truncated);
    if (boundedPreview) warnings.push('Text indexing includes only the bounded workbook preview.');
  } else if (mimeType.startsWith('image/')) {
    await validateImage(bytes, mimeType, signal);
    textStatus = 'unavailable';
    warnings.push('Original image stored. OCR and image text search are unavailable.');
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      assetFail('ASSET_TEXT_INVALID', 422);
    }
    if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/u.test(text))
      assetFail('ASSET_TEXT_INVALID', 422);
    if (mimeType === 'text/csv') {
      text = parseCsv(text);
      warnings.push(
        'CSV formula-like values are untrusted text. Spreadsheet software may interpret them when the original is opened.'
      );
    }
  }
  const textTruncated = boundedPreview || text.length > ASSET_LIMITS.textChars;
  if (text.length > ASSET_LIMITS.textChars)
    warnings.push(
      'Text indexing is limited to the first 50,000 characters. The original file is preserved.'
    );
  return {
    originalFilename,
    mimeType,
    sizeBytes: bytes.length,
    sha256: assetDigest(bytes),
    text: text.slice(0, ASSET_LIMITS.textChars),
    textStatus,
    textTruncated,
    previewKind: ASSET_TYPES[mimeType].previewKind,
    warnings
  };
}
