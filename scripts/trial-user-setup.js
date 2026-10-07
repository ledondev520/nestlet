/** Private administrator fallback for named ordinary-account creation and password rotation. */
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { openStorage, normalizeUsername } from '../storage.js';
const derive = promisify(scrypt);
const fail = message => { throw new Error(message); };

async function verifyDatabasePath(target) {
  if (typeof target !== 'string' || !isAbsolute(target) || target !== resolve(target) || !target.endsWith('.sqlite') || /[\u0000-\u001f\u007f]/u.test(target)) fail('Specify the absolute normalized path of the existing private .sqlite database.');
  const owner = process.geteuid?.();
  for (let current = dirname(target); ; current = dirname(current)) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('The database directory chain must not contain symlinks.');
    const stickyTemp = current === '/tmp' && current !== dirname(target) && stat.uid === 0 && Boolean(stat.mode & 0o1000);
    if ((stat.mode & 0o022) && !stickyTemp) fail('The database directory chain must not be group- or world-writable.');
    if (owner !== undefined && stat.uid !== owner && stat.uid !== 0) fail('The database directory chain must be owned by the current user or root.');
    if (current === dirname(current)) break;
  }
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || await realpath(target) !== target) fail('The database must be an existing regular file without symlink or hard-link aliases.');
  if ((stat.mode & 0o777) !== 0o600) fail('The database must have private mode 0600.');
  if (owner !== undefined && stat.uid !== owner) fail('Run trial setup as the database file owner.');
  return `${stat.dev}:${stat.ino}`;
}

export async function inspectTrialDatabase(target, username) {
  const normalized = normalizeUsername(username);
  const identity = await verifyDatabasePath(target);
  const storage = openStorage({ filename: target });
  try { return { path: target, username: normalized, exists: Boolean(storage.findUserByUsername(normalized)), identity }; }
  finally { storage.close(); }
}

export async function setTrialUserPassword({ target, username, password, passwordConfirmation, confirmed, expectedIdentity }) {
  if (confirmed !== true) fail('Trial setup was not confirmed; no credential was changed.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 256 || /[\u0000-\u001f\u007f]/u.test(password)) fail('Use 12 to 256 password characters without control characters.');
  if (password !== passwordConfirmation) fail('Passwords do not match; no credential was changed.');
  const normalized = normalizeUsername(username);
  if (typeof expectedIdentity !== 'string' || await verifyDatabasePath(target) !== expectedIdentity) fail('The database file changed; restart trial setup.');
  const salt = randomBytes(16);
  const key = await derive(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const passwordHash = `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
  if (await verifyDatabasePath(target) !== expectedIdentity) fail('The database file changed; restart trial setup.');
  const storage = openStorage({ filename: target });
  try {
    const user = storage.upsertTrialUser({ username: normalized, passwordHash });
    return { path: target, username: user.username, userId: user.id, role: user.role, updated: true };
  } finally { storage.close(); }
}
