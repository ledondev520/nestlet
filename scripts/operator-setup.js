/** Private-file setup seam. Callers must obtain the operator's final confirmation. */
import { constants } from 'node:fs';
import { open, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { normalizeOperatorUsername } from '../auth.js';

const derive = promisify(scrypt);
const KEY = 'NESTLET_OPERATOR_PASSWORD_HASH';
const USERNAME_KEY = 'NESTLET_OPERATOR_USERNAME';
const declaration = /^(?:export[ \t]+)?NESTLET_OPERATOR_PASSWORD_HASH[ \t]*=/u;
const usernameDeclaration = /^(?:export[ \t]+)?NESTLET_OPERATOR_USERNAME[ \t]*=/u;
const fail = message => { throw new Error(message); };

async function readTarget(target) {
  if (typeof target !== 'string' || !isAbsolute(target) || target !== resolve(target) ||
      basename(target) !== 'runtime.env' || /[\u0000-\u001f\u007f]/u.test(target)) {
    fail('Specify the absolute, normalized path of an existing runtime.env file.');
  }
  let current = dirname(target);
  const owner = process.geteuid?.();
  while (true) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('The target path must not contain symlinks or non-directory parents.');
    // Reject writable ancestors too: an attacker could otherwise replace a private subtree.
    // Only root-owned sticky /tmp may contain a trusted private test directory.
    const trustedStickyTemp = current === '/tmp' && current !== dirname(target) && stat.uid === 0 && Boolean(stat.mode & 0o1000);
    if ((stat.mode & 0o022) && !trustedStickyTemp) fail('The runtime.env directory chain must not be group- or world-writable.');
    if (owner !== undefined && stat.uid !== owner && stat.uid !== 0) fail('The target directory chain must be owned by the current user or root.');
    if (current === dirname(current)) break;
    current = dirname(current);
  }
  if (await realpath(target) !== target) fail('The runtime.env target must not be a symlink.');
  const link = await lstat(target);
  if (!link.isFile() || link.isSymbolicLink() || link.nlink !== 1) fail('The target must be a regular runtime.env file with no symlink or hard-link aliases.');
  if ((link.mode & 0o777) !== 0o600) fail('runtime.env must have private mode 0600 before setup.');
  if (owner !== undefined && link.uid !== owner) fail('Run setup as the owner of runtime.env (use sudo for a root-owned file).');
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (stat.dev !== link.dev || stat.ino !== link.ino || !stat.isFile() || stat.size > 65536) fail('runtime.env changed or exceeds the 64 KiB setup limit.');
    const bytes = await handle.readFile();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { fail('runtime.env must contain valid UTF-8 text.'); }
    if (/\r(?!\n)/u.test(text) || text.includes('\u0000')) fail('runtime.env must use ordinary LF or CRLF text without NUL characters.');
    // Do not mistake a declaration inside a multiline secret for an actual environment key.
    for (const line of text.split(/\r?\n/u)) {
      const quoted = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(['"`])/u.exec(line);
      if (quoted) {
        const remainder = line.slice(quoted[0].length);
        let closing = false;
        for (let index = 0; index < remainder.length; index++) {
          if (remainder[index] === '\\' && quoted[1] !== "'") { index++; continue; }
          if (remainder[index] === quoted[1]) { closing = true; break; }
        }
        if (!closing) fail('Multiline environment values require private manual configuration; no file was changed.');
      }
    }
    const version = `${stat.dev}:${stat.ino}:${createHash('sha256').update(bytes).digest('hex')}`;
    const definitions = text.split(/\r?\n/u).filter(line => declaration.test(line.trimStart()));
    if (definitions.length > 1) fail('runtime.env contains duplicate operator-password declarations. Resolve them privately before setup.');
    if (text.split(/\r?\n/u).filter(line => usernameDeclaration.test(line.trimStart())).length > 1)
      fail('runtime.env contains duplicate administrator-username declarations. Resolve them privately before setup.');
    return { text, version, mode: stat.mode, configured: definitions.some(line => !/^\s*(?:export\s+)?NESTLET_OPERATOR_PASSWORD_HASH\s*=\s*(?:''|""|)\s*(?:#.*)?$/u.test(line)), path: target };
  } finally { await handle.close(); }
}

/** Returns only nonsecret preparation metadata; never returns the file contents or hash. */
export async function inspectOperatorTarget(target) {
  const { path, version, configured } = await readTarget(target);
  return { path, version, configured };
}

/** Only test fixtures or an explicitly confirmed user-run CLI should call this seam. */
export async function setOperatorPassword({ target, username, password, passwordConfirmation, confirmed, expectedVersion }) {
  if (confirmed !== true) fail('Setup was not confirmed; no file was changed.');
  const operatorUsername = username === undefined ? undefined : normalizeOperatorUsername(username);
  if (username !== undefined && (!operatorUsername || typeof username !== 'string' || !username.trim()))
    fail('Use an administrator username of 3 to 64 ASCII letters, digits, dots, underscores or hyphens, starting with a letter or digit.');
  if (typeof password !== 'string' || password.length < 6 || password.length > 256 || /[\u0000-\u001f\u007f]/u.test(password)) fail('Use an operator password containing 6 to 256 characters and no control characters.');
  if (password !== passwordConfirmation) fail('Passwords do not match; no file was changed.');
  const before = await readTarget(target);
  if (typeof expectedVersion !== 'string' || before.version !== expectedVersion) fail('runtime.env changed after the setup prompt. Restart setup; no file was changed.');
  const salt = randomBytes(16);
  const key = await derive(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const assignment = `${KEY}='scrypt$${salt.toString('base64url')}$${key.toString('base64url')}'`;
  // Preserve all unrelated bytes, line endings, whitespace, comments and key values.
  const newline = before.text.includes('\r\n') ? '\r\n' : '\n';
  const updates = [
    { declaration, assignment, replaced: false },
    ...(operatorUsername === undefined ? [] : [{ declaration: usernameDeclaration, assignment: `${USERNAME_KEY}='${operatorUsername}'`, replaced: false }]),
  ];
  let next = before.text.replace(/^[^\r\n]*(?:\r\n|\n|$)/gmu, line => {
    const update = updates.find(item => item.declaration.test(line.trimStart()));
    if (!update) return line;
    update.replaced = true;
    const ending = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : '';
    return (line.startsWith('\uFEFF') ? '\uFEFF' : '') + update.assignment + ending;
  });
  for (const update of updates) if (!update.replaced)
    next += (next && !next.endsWith('\n') ? newline : '') + update.assignment + newline;
  const temporary = join(dirname(target), `.runtime.env.setup-${randomBytes(12).toString('hex')}.tmp`);
  let temporaryExists = false;
  try {
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    temporaryExists = true;
    try { await handle.writeFile(next, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    const current = await readTarget(target);
    if (current.version !== before.version) fail('runtime.env changed during setup. Nothing was replaced; restart setup.');
    await rename(temporary, target);
    temporaryExists = false;
    try {
      const directory = await open(dirname(target), constants.O_RDONLY);
      try { await directory.sync(); } finally { await directory.close(); }
    } catch { fail('The operator password was written, but durable directory sync could not be confirmed. Inspect the private configuration before restarting or repeating setup.'); }
    return { path: target, updated: true, restartRequired: true };
  } finally {
    if (temporaryExists) await unlink(temporary).catch(() => {});
  }
}
