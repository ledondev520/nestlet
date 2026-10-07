#!/usr/bin/env node
/** Run explicitly on the private server. This command never schedules or uploads backups. */
import {
  backupPrivateData,
  verifyPrivateBackup,
  restorePrivateBackup,
  exportUserAssets
} from './private-data-operations.js';
const usage =
  'Usage: node scripts/private-data.js backup --db /private/nestlet.sqlite --assets /private/assets --output /private/new-backup\n       node scripts/private-data.js verify --input /private/backup\n       node scripts/private-data.js restore --input /private/backup --output /private/new-restored-data\n       node scripts/private-data.js export --db /private/nestlet.sqlite --assets /private/assets --user <exact-user-id> --output /private/new-export';
try {
  const [command, ...args] = process.argv.slice(2),
    values = {};
  if (args.length % 2) throw Error(usage);
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || Object.hasOwn(values, args[i])) throw Error(usage);
    values[args[i]] = args[i + 1];
  }
  const allowed = {
    backup: ['--db', '--assets', '--output'],
    verify: ['--input'],
    restore: ['--input', '--output'],
    export: ['--db', '--assets', '--user', '--output']
  }[command];
  if (!allowed || Object.keys(values).length !== allowed.length || allowed.some((k) => !values[k]))
    throw Error(usage);
  const oldMask = process.umask(0o077);
  let result;
  try {
    if (command === 'backup')
      result = await backupPrivateData({
        filename: values['--db'],
        assetsDirectory: values['--assets'],
        output: values['--output']
      });
    if (command === 'verify') {
      const checked = verifyPrivateBackup({ input: values['--input'] });
      result = {
        verified: checked.verified,
        schemaVersion: checked.schemaVersion,
        assetCount: checked.assetCount
      };
    }
    if (command === 'restore')
      result = await restorePrivateBackup({ input: values['--input'], output: values['--output'] });
    if (command === 'export')
      result = exportUserAssets({
        filename: values['--db'],
        assetsDirectory: values['--assets'],
        userId: values['--user'],
        output: values['--output']
      });
  } finally {
    process.umask(oldMask);
  }
  // CLI output may be captured by deployment logs: no private paths, filenames, IDs or manifest contents.
  const summary = Object.fromEntries(
    ['verified', 'schemaVersion', 'assetCount', 'unreferencedFiles']
      .filter((key) => Object.hasOwn(result, key))
      .map((key) => [key, result[key]])
  );
  process.stdout.write(JSON.stringify(summary) + '\n');
} catch (error) {
  process.stderr.write(
    'Private data operation failed: ' + (error?.code || error.message || 'Unknown failure') + '\n'
  );
  process.exitCode = 1;
}
