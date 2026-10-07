#!/usr/bin/env node
// The user enters and submits the credential here, never through chat or command arguments.
import { inspectTrialDatabase, setTrialUserPassword } from './trial-user-setup.js';
if (!process.stdin.isTTY || !process.stderr.isTTY || process.argv.length !== 4) {
  process.stderr.write('Run privately: node scripts/setup-trial-user.js /absolute/path/nestlet.sqlite username\n');
  process.exit(1);
}
const prompt = (label, hidden = false) => new Promise((resolve, reject) => {
  let value = '';
  const finish = error => { process.stdin.off('data', onData); process.stdin.pause(); process.stderr.write('\n'); error ? reject(error) : resolve(value); };
  const onData = data => {
    for (const character of data) {
      if (character === '\u0003' || character === '\u0004') return finish(new Error('Cancelled; no credential was changed.'));
      if (character === '\r' || character === '\n') return finish();
      if (character === '\u007f' || character === '\b') { if (value) { value = [...value].slice(0, -1).join(''); if (!hidden) process.stderr.write('\b \b'); } }
      else if (character >= ' ') {
        if (value.length + character.length > 256) return finish(new Error('Input is too long; no credential was changed.'));
        value += character; if (!hidden) process.stderr.write(character);
      }
    }
  };
  process.stdin.on('data', onData); process.stdin.resume(); process.stderr.write(label);
});
const oldRaw = Boolean(process.stdin.isRaw);
const restore = () => { try { process.stdin.setRawMode(oldRaw); } catch {} process.stdin.pause(); };
const interrupt = () => { restore(); process.exit(130); };
process.once('SIGTERM', interrupt); process.once('SIGHUP', interrupt);
try {
  process.stdin.setRawMode(true); process.stdin.setEncoding('utf8');
  const prepared = await inspectTrialDatabase(process.argv[2], process.argv[3]);
  process.stderr.write(`Trial user: ${prepared.username}\nPrivate database: ${prepared.path}\n`);
  process.stderr.write(prepared.exists ? 'This rotates the trial password and revokes existing trial sessions. Existing cases remain with this user.\n' : 'This creates one named trial identity with access only to its own cases.\n');
  process.stderr.write('Choose a unique password. Do not reuse the owner password. No provider settings access is granted.\n');
  const password = await prompt('Trial password (6–256 characters; hidden): ', true);
  const passwordConfirmation = await prompt('Confirm trial password (hidden): ', true);
  if (password !== passwordConfirmation || password.length < 6) throw new Error('Passwords must match and contain at least 6 characters.');
  const answer = await prompt('Type SET TRIAL USER to create or rotate only this trial credential: ');
  if (answer !== 'SET TRIAL USER') throw new Error('Cancelled; no credential was changed.');
  await setTrialUserPassword({ target: prepared.path, username: prepared.username, password, passwordConfirmation, confirmed: true, expectedIdentity: prepared.identity });
  process.stdout.write(`Trial credential updated privately for ${prepared.username}. No password or hash was printed.\n`);
} catch (error) { process.stderr.write(error.code ? `Trial setup failed (${error.code}); verify the private database and username.\n` : error.message + '\n'); process.exitCode = 1; }
finally { restore(); process.off('SIGTERM', interrupt); process.off('SIGHUP', interrupt); }
