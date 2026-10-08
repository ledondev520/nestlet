// CI smoke only. Run inside the built container; never supplies a real credential.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, constants, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4173';
assert.notEqual(process.getuid(), 0, 'Runtime must not run as root');
assert.equal(spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).status, 0);
assert.equal(spawnSync('prlimit', ['--version'], { stdio: 'ignore' }).status, 0);
// Exercise the packaged PDF worker/font as the real read-only runtime user.
// A separate ordinary Node child avoids inheriting this stdin harness's --input-type.
const pdfSmoke = spawnSync(process.execPath, ['-e', `
  import('./document-pdf.js').then(async ({createDocumentPdf}) => {
    const {mkdtemp,writeFile,rm} = await import('node:fs/promises');
    const {tmpdir} = await import('node:os');
    const {join} = await import('node:path');
    const {execFileSync} = await import('node:child_process');
    const {default:assert} = await import('node:assert/strict');
    const directory = await mkdtemp(join(tmpdir(),'nestlet-ci-pdf-'));
    try {
      const content = 'Synthetic PDF export: Café — 张伟 李明.';
      const bytes = await createDocumentPdf({content,id:'synthetic-container-fixture',version:1,status:'draft'});
      assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
      const file = join(directory,'output.pdf'); await writeFile(file,bytes);
      assert.equal(execFileSync('pdftotext',['-raw',file,'-'],{encoding:'utf8'}).replace(/\\f/g,'').trim(),content);
      assert.match(execFileSync('pdffonts',[file],{encoding:'utf8'}),/NotoSansCJKsc-Regular/);
      console.log('Packaged local PDF worker and embedded CJK font passed.');
    } finally {await rm(directory,{recursive:true,force:true});}
  }).catch(error => {console.error(error);process.exitCode=1;});
`], {encoding:'utf8',timeout:20000});
assert.equal(pdfSmoke.status,0,pdfSmoke.stderr);
assert.match(pdfSmoke.stdout,/Packaged local PDF worker and embedded CJK font passed/);

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
await access('/app/library-consent-storage.js', constants.R_OK);
assert.equal(spawnSync(process.execPath, ['--check', '/app/library-consent-storage.js']).status, 0);
assert.equal(spawnSync(process.execPath, ['--check', '/app/agent-library-tools.js']).status, 0);
assert.equal(status.csrfToken, undefined);
for (const [path, method] of [['/api/library-permission', 'GET'], ['/api/library-permission', 'PUT'], ['/api/register', 'POST'], ['/api/workflows', 'POST'], ['/api/admin/telemetry', 'GET'], ['/api/admin/accounts', 'GET'], ['/api/admin/account-audit', 'GET'], ['/api/admin/diagnostics', 'GET'], ['/api/cases', 'GET'], ['/api/cases', 'POST'], ['/api/settings', 'GET'], ['/api/settings', 'POST'], ['/api/settings/test', 'POST'], ['/api/extract', 'POST'], ['/api/chat', 'POST'], ['/api/document', 'POST'], ['/api/workbook', 'POST']]) {
  const response = await fetch(base + path, {
    method,
    headers: { Origin: 'https://nestlet.invalid', 'Content-Type': 'application/json' },
    ...(['POST','PUT'].includes(method) ? { body: '{}' } : {}),
  });
  assert.equal(response.status, 503, path + ' must fail without operator setup');
  const body = await response.json();
  assert.equal(body.code, 'OPERATOR_SETUP_REQUIRED', path);
}
console.log('Built-container checks passed: non-root/read-only, parser dependencies, sanitized status, and unauthenticated API rejection. No live provider request tested.');
