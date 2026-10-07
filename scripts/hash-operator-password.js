#!/usr/bin/env node
// Run privately in a terminal. This prints only a password hash, never the password.
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
if (!process.stdin.isTTY) {
  process.stderr.write('Run this command in an interactive terminal. Do not put your password in command arguments or chat.\n');
  process.exit(1);
}
const hiddenPrompt = prompt => new Promise((resolve, reject) => {
  process.stderr.write(prompt);
  let value = '';
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  const finish = (error) => {
    process.stdin.off('data', onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stderr.write('\n');
    if (error) reject(error); else resolve(value);
  };
  const onData = data => {
    for (const character of data) {
      if (character === '\u0003') return finish(new Error('Cancelled'));
      if (character === '\r' || character === '\n') return finish();
      if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
      else if (character >= ' ' && value.length < 256) value += character;
    }
  };
  process.stdin.on('data', onData);
});
try {
  const password = await hiddenPrompt('Choose an operator password (12+ characters, hidden): ');
  const confirm = await hiddenPrompt('Confirm operator password (hidden): ');
  if (password !== confirm || password.length < 12) throw new Error('Passwords must match and contain at least 12 characters.');
  const salt = randomBytes(16);
  const key = await promisify(scrypt)(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  process.stdout.write(`NESTLET_OPERATOR_PASSWORD_HASH='scrypt$${salt.toString('base64url')}$${key.toString('base64url')}'\n`);
} catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
