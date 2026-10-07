/** Explicit local operator backup/recovery/export. No network, scheduling, deletion or live-path overwrite. */
import { DatabaseSync, backup } from 'node:sqlite';
import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  lstatSync,
  readSync,
  writeSync,
  fsyncSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  existsSync
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { preparePrivateDirectory, openAssetVault } from '../private-assets.js';
import { assetId, ASSET_LIMITS } from '../asset-domain.js';
const APPLICATION_ID = 0x4e53544c;
const SUPPORTED_SCHEMAS = [1, 2, 3, 4, 5];
const schemaVersion = (db) => db.prepare('PRAGMA user_version').get().user_version;
const fail = (message) => {
  throw new Error(message);
};
function privateDescriptor(path) {
  preparePrivateDirectory(dirname(path), { create: false });
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
    info = fstatSync(fd);
  const uid = process.geteuid?.() ?? process.getuid?.();
  if (
    !info.isFile() ||
    info.nlink !== 1 ||
    (info.mode & 0o777) !== 0o600 ||
    (uid !== undefined && info.uid !== uid)
  ) {
    closeSync(fd);
    fail('Private regular file required.');
  }
  return fd;
}
// Bound metadata while accommodating the full 101-account × 200-file inventory.
function privateRead(path, max = 64 * 1024 * 1024) {
  const fd = privateDescriptor(path);
  try {
    const size = fstatSync(fd).size;
    if (size > max) fail('Backup metadata exceeds its safety limit.');
    const bytes = Buffer.alloc(size);
    let at = 0,
      n;
    while (at < size && (n = readSync(fd, bytes, at, size - at, null))) at += n;
    if (at !== size) fail('Incomplete private file.');
    return bytes;
  } finally {
    closeSync(fd);
  }
}
function fileDigest(path) {
  const fd = privateDescriptor(path),
    hash = createHash('sha256'),
    buffer = Buffer.alloc(1024 * 1024);
  try {
    let n;
    while ((n = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n));
    return hash.digest('hex');
  } finally {
    closeSync(fd);
  }
}
function privateWrite(path, bytes) {
  const fd = openSync(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600
  );
  try {
    let at = 0;
    while (at < bytes.length) at += writeSync(fd, bytes, at, bytes.length - at);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function separateOutput(output, sourceDirectory) {
  if (
    resolve(output) === resolve(sourceDirectory) ||
    resolve(output).startsWith(resolve(sourceDirectory) + sep)
  )
    fail('Output must be outside the source originals or backup directory.');
}
function newOutput(output) {
  if (typeof output !== 'string' || resolve(output) !== output)
    fail('Output must be a new absolute private directory.');
  preparePrivateDirectory(dirname(output));
  mkdirSync(output, { mode: 0o700 });
  preparePrivateDirectory(output);
  privateWrite(
    join(output, 'INCOMPLETE'),
    Buffer.from('Operation not yet verified. Do not restore this directory.\n')
  );
}
function complete(output) {
  unlinkSync(join(output, 'INCOMPLETE'));
  const fd = openSync(output, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const parent = openSync(
    dirname(output),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}
function openDatabase(filename) {
  const fd = privateDescriptor(filename);
  closeSync(fd);
  const db = new DatabaseSync(filename, {
    readOnly: true,
    allowExtension: false,
    enableForeignKeyConstraints: true,
    // Bound native lock contention, including the asynchronous backup's first
    // read-lock attempt. A zero-timeout source can fail on a brief real writer
    // lock before copying any page; this is not a retry of backup/file writes.
    timeout: 5000
  });
  try {
    db.exec('PRAGMA trusted_schema=OFF;');
    if (
      db.prepare('PRAGMA application_id').get().application_id !== APPLICATION_ID ||
      !SUPPORTED_SCHEMAS.includes(schemaVersion(db))
    )
      fail('Only a recognized Nestlet schema1–5 database is supported.');
    if (
      db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length
    )
      fail('SQLite integrity verification failed.');
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}
const assetColumns =
  'id,owner_user_id AS ownerUserId,case_id AS caseId,client_id AS clientId,original_filename AS originalFilename,mime_type AS mimeType,size_bytes AS sizeBytes,sha256,created_at AS createdAt';
function records(db, userId) {
  // Earlier releases did not retain original assets. Reading a snapshot never migrates it.
  if (schemaVersion(db) < 4) return [];
  const rows =
    userId === undefined
      ? db.prepare(`SELECT ${assetColumns} FROM assets ORDER BY id`).all()
      : db
          .prepare(
            `SELECT ${assetColumns},extracted_text AS text,text_status AS textStatus,text_truncated AS textTruncated,warnings_json AS warningsJson FROM assets WHERE owner_user_id=? ORDER BY id`
          )
          .all(userId);
  return rows.map((row) => ({ ...row }));
}
function validateRecords(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (
      !assetId(row.id) ||
      ids.has(row.id) ||
      !Number.isSafeInteger(row.sizeBytes) ||
      row.sizeBytes < 1 ||
      row.sizeBytes > ASSET_LIMITS.fileBytes ||
      !/^[0-9a-f]{64}$/u.test(row.sha256)
    )
      fail('Invalid asset inventory.');
    ids.add(row.id);
  }
}
function expectedContents(directory, names) {
  const seen = readdirSync(directory);
  if (seen.some((name) => !names.includes(name)) || names.some((name) => !seen.includes(name)))
    fail('Snapshot contains unexpected or missing files.');
}
// SQLite backup inherits the source journal mode. Normalize only the new,
// task-owned copy so read-only verification cannot create WAL sidecars or miss
// committed pages. Never change the live source or loosen the strict manifest.
function finalizeDatabaseCopy(filename) {
  const fd = privateDescriptor(filename);
  closeSync(fd);
  const db = new DatabaseSync(filename, {
    allowExtension: false,
    enableForeignKeyConstraints: true,
    timeout: 5000
  });
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL;');
    if (db.prepare('PRAGMA journal_mode=DELETE').get().journal_mode !== 'delete')
      fail('Copied database could not be finalized.');
  } finally {
    db.close();
  }
  const finalized = privateDescriptor(filename);
  try {
    fsyncSync(finalized);
  } finally {
    closeSync(finalized);
  }
}
export async function backupPrivateData({ filename, assetsDirectory, output }) {
  separateOutput(output, assetsDirectory);
  const source = openDatabase(filename);
  let sourceVault, sourceVersion;
  const snapshot = join(output, 'nestlet.sqlite');
  try {
    sourceVersion = schemaVersion(source);
    if (sourceVersion === 4 || existsSync(assetsDirectory)) {
      preparePrivateDirectory(assetsDirectory, { create: false });
      sourceVault = openAssetVault({ directory: assetsDirectory });
    }
    newOutput(output);
    privateWrite(snapshot, Buffer.alloc(0));
    await backup(source, snapshot);
  } finally {
    source.close();
  }
  finalizeDatabaseCopy(snapshot);
  const copied = openDatabase(snapshot);
  let rows;
  try {
    rows = records(copied);
  } finally {
    copied.close();
  }
  validateRecords(rows);
  const destination = openAssetVault({ directory: join(output, 'assets') });
  for (const asset of rows) destination.write(asset.id, sourceVault.read(asset));
  const known = new Set(rows.map((asset) => asset.id + '.blob'));
  const unreferencedFiles = sourceVault
    ? readdirSync(assetsDirectory).filter((name) => !known.has(name)).length
    : 0;
  const manifest = {
    format: 'nestlet-private-backup',
    version: 1,
    schemaVersion: sourceVersion,
    createdAt: new Date().toISOString(),
    databaseSha256: fileDigest(snapshot),
    assetCount: rows.length,
    assets: rows
  };
  privateWrite(
    join(output, 'manifest.json'),
    Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  );
  verifyPrivateBackup({ input: output, allowIncomplete: true });
  complete(output);
  return {
    output,
    schemaVersion: sourceVersion,
    assetCount: rows.length,
    unreferencedFiles,
    verified: true
  };
}
export function verifyPrivateBackup({ input, allowIncomplete = false }) {
  preparePrivateDirectory(input, { create: false });
  if (existsSync(join(input, 'INCOMPLETE')) && !allowIncomplete) fail('Snapshot is incomplete.');
  expectedContents(input, [
    'assets',
    'nestlet.sqlite',
    'manifest.json',
    ...(allowIncomplete ? ['INCOMPLETE'] : [])
  ]);
  let manifest;
  try {
    manifest = JSON.parse(privateRead(join(input, 'manifest.json')).toString('utf8'));
  } catch {
    fail('Backup manifest could not be read.');
  }
  if (
    manifest?.format !== 'nestlet-private-backup' ||
    manifest.version !== 1 ||
    !SUPPORTED_SCHEMAS.includes(manifest.schemaVersion) ||
    !Array.isArray(manifest.assets) ||
    manifest.assetCount !== manifest.assets.length
  )
    fail('Unsupported backup manifest.');
  const filename = join(input, 'nestlet.sqlite');
  if (fileDigest(filename) !== manifest.databaseSha256) fail('Backup database digest mismatch.');
  const db = openDatabase(filename);
  let rows;
  try {
    if (schemaVersion(db) !== manifest.schemaVersion)
      fail('Snapshot schema differs from its manifest.');
    rows = records(db);
  } finally {
    db.close();
  }
  validateRecords(rows);
  if (JSON.stringify(rows) !== JSON.stringify(manifest.assets))
    fail('Database and manifest inventory differ.');
  const vault = openAssetVault({ directory: join(input, 'assets') });
  expectedContents(
    vault.directory,
    rows.map((asset) => asset.id + '.blob')
  );
  for (const asset of rows) vault.read(asset);
  return {
    verified: true,
    schemaVersion: manifest.schemaVersion,
    assetCount: rows.length,
    manifest
  };
}
export async function restorePrivateBackup({ input, output }) {
  separateOutput(output, input);
  const checked = verifyPrivateBackup({ input });
  newOutput(output);
  const filename = join(output, 'nestlet.sqlite');
  privateWrite(filename, Buffer.alloc(0));
  const source = openDatabase(join(input, 'nestlet.sqlite'));
  try {
    await backup(source, filename);
  } finally {
    source.close();
  }
  finalizeDatabaseCopy(filename);
  const original = openAssetVault({ directory: join(input, 'assets') }),
    target = openAssetVault({ directory: join(output, 'assets') });
  for (const asset of checked.manifest.assets) target.write(asset.id, original.read(asset));
  const restored = openDatabase(filename);
  try {
    if (schemaVersion(restored) !== checked.schemaVersion)
      fail('Restored schema differs from its snapshot.');
    const rows = records(restored);
    if (JSON.stringify(rows) !== JSON.stringify(checked.manifest.assets))
      fail('Restored asset inventory differs.');
    for (const asset of rows) target.read(asset);
  } finally {
    restored.close();
  }
  complete(output);
  return {
    verified: true,
    filename,
    assetsDirectory: target.directory,
    schemaVersion: checked.schemaVersion,
    assetCount: checked.assetCount
  };
}
export function exportUserAssets({ filename, assetsDirectory, userId, output }) {
  separateOutput(output, assetsDirectory);
  preparePrivateDirectory(assetsDirectory, { create: false });
  if (userId !== 'owner' && !assetId(userId)) fail('An explicit exact user ID is required.');
  const source = openDatabase(filename);
  let rows;
  try {
    source.exec('BEGIN');
    if (!source.prepare('SELECT 1 FROM users WHERE id=?').get(userId)) fail('User not found.');
    rows = records(source, userId);
    source.exec('COMMIT');
  } finally {
    source.close();
  }
  validateRecords(rows);
  newOutput(output);
  const original = openAssetVault({ directory: assetsDirectory }),
    target = openAssetVault({ directory: join(output, 'assets') });
  for (const asset of rows) {
    target.write(asset.id, original.read(asset));
    target.read(asset);
  }
  const assets = rows.map(({ warningsJson, textTruncated, ...row }) => ({
    ...row,
    textTruncated: Boolean(textTruncated),
    warnings: JSON.parse(warningsJson)
  }));
  privateWrite(
    join(output, 'manifest.json'),
    Buffer.from(
      JSON.stringify(
        {
          format: 'nestlet-user-assets-export',
          version: 1,
          userId,
          createdAt: new Date().toISOString(),
          assets
        },
        null,
        2
      ) + '\n'
    )
  );
  complete(output);
  return { output, assetCount: assets.length, verified: true };
}
