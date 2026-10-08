// Test artifact only. Compile the entire unmodified pre-review-result frontend,
// never the current parser with its capability flag disabled.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LEGACY_REVIEW_COMMIT = '090d08ee4823c041b1f835d4ac307e7963b6fb93';
export const LEGACY_REVIEW_BUILD = fileURLToPath(new URL('../../artifacts/legacy-review-browser/', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const files = ['index.html', 'app.js', 'index.css'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: repository, maxBuffer: 32 * 1024 * 1024 });

export async function buildLegacyReviewBrowser() {
  assert.equal(git('rev-parse', `${LEGACY_REVIEW_COMMIT}^{commit}`).toString().trim(), LEGACY_REVIEW_COMMIT);
  const lock = git('show', `${LEGACY_REVIEW_COMMIT}:package-lock.json`);
  // Sharing installed dependencies is valid only while the exact lock is equal.
  // A future dependency upgrade must deliberately update this build strategy.
  assert.equal(sha256(await readFile(join(repository, 'package-lock.json'))), sha256(lock), 'Legacy build requires the baseline dependency lock, not an approximate current toolchain');
  const source = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-pinned-frontend-'));
  try {
    // Include shared domain modules imported by that frontend as well. Every
    // source file comes from the same tree; no current-worktree import leaks in.
    const archive = git('archive', '--format=tar', LEGACY_REVIEW_COMMIT);
    execFileSync('tar', ['-xf', '-', '-C', source], { input: archive });
    await symlink(join(repository, 'node_modules'), join(source, 'node_modules'), 'dir');
    execFileSync(process.execPath, [join(repository, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: source, stdio: 'inherit' });
    await mkdir(LEGACY_REVIEW_BUILD, { recursive: true });
    const hashes = {};
    for (const file of files) {
      const path = join(source, 'public/next', file);
      hashes[file] = sha256(await readFile(path));
      await cp(path, join(LEGACY_REVIEW_BUILD, file));
    }
    const manifest = {
      sourceCommit: LEGACY_REVIEW_COMMIT,
      frontendTree: git('rev-parse', `${LEGACY_REVIEW_COMMIT}:frontend`).toString().trim(),
      dependencyLockSha256: sha256(lock),
      buildCommand: 'node node_modules/vite/bin/vite.js build (unchanged baseline vite.config.js)',
      hashes,
    };
    await writeFile(join(LEGACY_REVIEW_BUILD, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  } finally { await rm(source, { recursive: true, force: true }); }
}

export async function loadLegacyReviewBrowser() {
  const manifest = JSON.parse(await readFile(join(LEGACY_REVIEW_BUILD, 'manifest.json'), 'utf8'));
  assert.equal(manifest.sourceCommit, LEGACY_REVIEW_COMMIT, 'Run the pinned legacy build before browser acceptance');
  assert.equal(manifest.frontendTree, git('rev-parse', `${LEGACY_REVIEW_COMMIT}:frontend`).toString().trim());
  assert.equal(manifest.dependencyLockSha256, sha256(git('show', `${LEGACY_REVIEW_COMMIT}:package-lock.json`)));
  const assets = {};
  for (const file of files) {
    assets[file] = await readFile(join(LEGACY_REVIEW_BUILD, file));
    assert.equal(sha256(assets[file]), manifest.hashes[file], `Pinned legacy ${file} integrity`);
  }
  return { manifest, assets };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await buildLegacyReviewBrowser(), null, 2));
}
