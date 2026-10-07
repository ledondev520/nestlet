// CI smoke only. Run inside the built container; never supplies a real credential.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, constants, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4173';
assert.notEqual(process.getuid(), 0, 'Runtime must not run as root');
assert.equal(spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).status, 0);
assert.equal(spawnSync('prlimit', ['--version'], { stdio: 'ignore' }).status, 0);
await assert.rejects(writeFile('/app/public/.ci-write-check', 'must fail'), { code: 'EROFS' });
for (const path of ['/app/.env', '/app/.git/config', '/app/test/server.test.js']) {
  await assert.rejects(access(path, constants.F_OK), { code: 'ENOENT' });
}
// The bundled user-run helper must resolve its support module and reject non-TTY use.
for (const path of ['/app/scripts/setup-operator.js', '/app/scripts/operator-setup.js', '/app/scripts/setup-trial-user.js', '/app/scripts/trial-user-setup.js']) {
  await access(path, constants.R_OK);
  assert.equal(spawnSync(process.execPath, ['--check', path]).status, 0);
}
const nonInteractiveSetup = spawnSync(process.execPath, ['scripts/setup-operator.js', '/runtime/runtime.env'], { encoding: 'utf8' });
assert.equal(nonInteractiveSetup.status, 1);
assert.match(nonInteractiveSetup.stderr, /interactive terminal/u);
assert.equal(nonInteractiveSetup.stdout, '');
const health = await fetch(base + '/api/health');
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true });
const statusResponse = await fetch(base + '/api/status');
assert.equal(statusResponse.status, 200);
const text = await statusResponse.text();
assert.ok(!text.includes('ci-public-nonsecret-sentinel'), 'Status must not echo the key');
const status = JSON.parse(text);
assert.equal(status.authConfigured, false);
assert.equal(status.registrationEnabled, false);
assert.equal(process.env.NESTLET_DB_PATH, '/data/nestlet.sqlite');
assert.equal(status.caseStorageEnabled, true);
assert.equal(status.authenticated, false);
assert.equal(status.liveEnabled, false);
assert.equal(status.pdfEnabled, true);
assert.equal(status.workbookEnabled, true);
assert.equal(status.libraryRetrievalEnabled, true);
assert.deepEqual(status.libraryLimits, { rounds: 3, calls: 6, resultChars: 24000, timeoutMs: 90000 });
await access('/app/agent-library-tools.js', constants.R_OK);
assert.equal(spawnSync(process.execPath, ['--check', '/app/agent-library-tools.js']).status, 0);
assert.equal(status.csrfToken, undefined);
for (const [path, method] of [['/api/register', 'POST'], ['/api/workflows', 'POST'], ['/api/admin/telemetry', 'GET'], ['/api/cases', 'GET'], ['/api/cases', 'POST'], ['/api/settings', 'GET'], ['/api/settings', 'POST'], ['/api/settings/test', 'POST'], ['/api/extract', 'POST'], ['/api/chat', 'POST'], ['/api/document', 'POST'], ['/api/workbook', 'POST']]) {
  const response = await fetch(base + path, {
    method,
    headers: { Origin: 'https://nestlet.invalid', 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
  assert.equal(response.status, 503, path + ' must fail without operator setup');
  const body = await response.json();
  assert.equal(body.code, 'OPERATOR_SETUP_REQUIRED', path);
}
console.log('Built-container checks passed: non-root/read-only, parser dependencies, sanitized status, and unauthenticated API rejection. No live provider request tested.');
