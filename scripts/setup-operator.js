#!/usr/bin/env node
// User-run private setup: passwords and password hashes never enter stdout/stderr.
import { inspectOperatorTarget, setOperatorPassword } from './operator-setup.js';
import { normalizeOperatorUsername } from '../auth.js';

if (!process.stdin.isTTY || !process.stderr.isTTY || ![3, 4].includes(process.argv.length)) {
  process.stderr.write('Run privately in an interactive terminal: npm run setup-operator -- /absolute/path/runtime.env [administrator-username]\n');
  process.exit(1);
}

const prompt = (label, hidden = false) => new Promise((resolve, reject) => {
  let value = '';
  const finish = error => {
    process.stdin.off('data', onData);
    process.stdin.pause();
    process.stderr.write('\n');
    if (error) reject(error); else resolve(value);
  };
  const onData = data => {
    for (const character of data) {
      if (character === '\u0003' || character === '\u0004') return finish(new Error('Cancelled; no file was changed.'));
      if (character === '\r' || character === '\n') return finish();
      if (character === '\u007f' || character === '\b') {
        if (value) { value = [...value].slice(0, -1).join(''); if (!hidden) process.stderr.write('\b \b'); }
      } else if (character >= ' ') {
        if (value.length + character.length > 256) return finish(new Error('Input is too long; no file was changed.'));
        value += character;
        if (!hidden) process.stderr.write(character);
      }
    }
  };
  process.stdin.on('data', onData);
  process.stdin.resume();
  process.stderr.write(label);
});

const previousRawMode = Boolean(process.stdin.isRaw);
const restoreTerminal = () => {
  try { process.stdin.setRawMode(previousRawMode); } catch {}
  process.stdin.pause();
};
const interrupted = () => { restoreTerminal(); process.exit(130); };
process.once('SIGTERM', interrupted);
process.once('SIGHUP', interrupted);

try {
  // Disable terminal echo before any prompt and keep it disabled between prompts.
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  const username = process.argv[3] === undefined ? undefined : normalizeOperatorUsername(process.argv[3]);
  if (username === null || (process.argv[3] !== undefined && !process.argv[3].trim()))
    throw new Error('Use an administrator username of 3 to 64 ASCII letters, digits, dots, underscores or hyphens, starting with a letter or digit.');
  const metadata = await inspectOperatorTarget(process.argv[2]);
  process.stderr.write(`Operator-password setup target: ${metadata.path}\n`);
  process.stderr.write(metadata.configured ? 'This replaces the existing operator password.\n' : 'This sets the initial operator password.\n');
  process.stderr.write(username === undefined ? 'The administrator login name and all other configuration stay unchanged.\n' :
    `This also sets the administrator login alias to ${username}. The internal owner identity and all unrelated configuration stay unchanged.\n`);
  const password = await prompt('New operator password (6–256 characters; hidden): ', true);
  const passwordConfirmation = await prompt('Confirm operator password (hidden): ', true);
  if (password !== passwordConfirmation) throw new Error('Passwords do not match; no file was changed.');
  if (password.length < 6) throw new Error('Use at least 6 characters; no file was changed.');
  const final = await prompt(`Type SET OPERATOR to update the operator-password hash${username === undefined ? '' : ' and administrator login alias'} in ${metadata.path}: `);
  if (final !== 'SET OPERATOR') throw new Error('Cancelled; no file was changed.');
  await setOperatorPassword({ target: metadata.path, username, password, passwordConfirmation, confirmed: true, expectedVersion: metadata.version });
  process.stdout.write(`Operator password updated privately in ${metadata.path}. Restart Nestlet to apply it, then sign in through HTTPS Settings.\n`);
} catch (error) {
  // Filesystem errors can include paths but never file contents, passwords or hashes.
  process.stderr.write((error.code ? `Setup failed (${error.code}); verify the target path, owner and permissions.` : error.message) + '\n');
  process.exitCode = 1;
} finally {
  restoreTerminal();
  process.off('SIGTERM', interrupted);
  process.off('SIGHUP', interrupted);
}
