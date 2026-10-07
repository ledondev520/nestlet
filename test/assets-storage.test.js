// Genuine temporary SQLite and bytes. No production material, fake storage, provider mocks or credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  linkSync,
  unlinkSync,
  chmodSync,
  lstatSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openStorage } from '../storage.js';
import { openAssetVault, parseAsset, assetDigest } from '../private-assets.js';
import { ASSET_LIMITS } from '../asset-domain.js';
const payload = {
  title: 'Synthetic asset case',
  sourceText: '',
  fields: [],
  draftType: 'followup',
  draftText: ''
};
function setup(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'nestlet-assets-'));
  const filename = join(dir, 'records.sqlite');
  let store = openStorage({ filename });
  const vault = openAssetVault({ directory: join(dir, 'assets') });
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    filename,
    vault,
    get store() {
      return store;
    },
    reopen() {
      store.close();
      store = openStorage({ filename });
    }
  };
}
const meta = async (text = 'Synthetic résumé 中文 case', filename = 'original.txt') =>
  parseAsset(Buffer.from(text), { originalFilename: filename, mimeType: 'text/plain' });
async function save(f, body = 'Synthetic résumé 中文 case', links = {}) {
  const bytes = Buffer.from(body);
  return f.store.createAsset('owner', await meta(body), links, (id) => f.vault.write(id, bytes));
}
test('durable private original bytes, normalized literal search, association and restart', async (t) => {
  const f = setup(t),
    client = f.store.createClient('owner', { displayName: 'Synthetic client' }),
    record = f.store.createCase('owner', { ...payload, clientId: client.id });
  const asset = await save(f, 'Synthetic Résumé 中文 100%_ content', { caseId: record.id });
  assert.equal(asset.clientId, client.id);
  assert.equal(asset.version, 1);
  assert.ok(!('owner_user_id' in asset));
  assert.equal(f.vault.read(asset).toString(), 'Synthetic Résumé 中文 100%_ content');
  assert.equal(lstatSync(join(f.dir, 'assets', asset.id + '.blob')).mode & 0o777, 0o600);
  for (const q of ['résumé', 'RE\u0301SUME\u0301', '中文', '100%_', 'original.txt'])
    assert.equal(f.store.listAssets('owner', { q }).total, 1);
  assert.equal(f.store.listAssets('owner', { q: "' OR 1=1 --" }).total, 0);
  assert.equal(f.store.listAssets('owner', { caseId: record.id }).total, 1);
  f.reopen();
  assert.equal(f.store.getAsset('owner', asset.id).sha256, assetDigest(f.vault.read(asset)));
  assert.equal(f.store.getAssetText('owner', asset.id), 'Synthetic Résumé 中文 100%_ content');
  const second = f.store.createClient('owner', { displayName: 'Changed customer' });
  f.store.updateCase('owner', record.id, { ...payload, clientId: second.id }, record.version);
  const moved = f.store.getAsset('owner', asset.id);
  assert.equal(moved.clientId, second.id);
  assert.equal(moved.version, 2);
  assert.throws(
    () => f.store.updateAssetLinks('owner', asset.id, { caseId: null }, 1),
    (e) => e.code === 'ASSET_CONFLICT'
  );
  const current = f.store.getCase('owner', record.id);
  f.store.deleteCase('owner', record.id, current.version);
  const retained = f.store.getAsset('owner', asset.id);
  assert.equal(retained.caseId, null);
  assert.equal(retained.clientId, second.id);
  assert.equal(f.vault.read(retained).toString(), 'Synthetic Résumé 中文 100%_ content');
});
test('tampered size/digest, hardlinks and symlinks never return original bytes', async (t) => {
  const f = setup(t),
    asset = await save(f),
    path = join(f.dir, 'assets', asset.id + '.blob');
  writeFileSync(path, 'x', { mode: 0o600 });
  assert.throws(
    () => f.vault.read(asset),
    (e) => e.code === 'ASSET_INTEGRITY_FAILED'
  );
  unlinkSync(path);
  const source = join(f.dir, 'outside.txt');
  writeFileSync(source, 'outside', { mode: 0o600 });
  symlinkSync(source, path);
  assert.throws(
    () => f.vault.read(asset),
    (e) => e.code === 'ASSET_FILE_UNSAFE'
  );
  unlinkSync(path);
  linkSync(source, path);
  assert.throws(
    () => f.vault.read(asset),
    (e) => e.code === 'ASSET_FILE_UNSAFE'
  );
  unlinkSync(path);
  assert.throws(
    () => f.vault.read(asset),
    (e) => e.code === 'ASSET_FILE_MISSING'
  );
  assert.throws(
    () => openAssetVault({ directory: 'relative-directory' }),
    (e) => e.code === 'ASSET_PATH_INVALID'
  );
});
test('quotas use a locked SQL total and do not write rejected file bytes', async (t) => {
  const f = setup(t);
  const metadata = await meta();
  let calls = 0;
  for (let i = 0; i < ASSET_LIMITS.filesPerUser; i++)
    f.store.createAsset('owner', metadata, {}, (id) => {
      calls++;
      f.vault.write(id, Buffer.from('Synthetic résumé 中文 case'));
    });
  assert.equal(calls, ASSET_LIMITS.filesPerUser);
  assert.throws(
    () => f.store.createAsset('owner', metadata, {}, () => calls++),
    (e) => e.code === 'ASSET_QUOTA_EXCEEDED'
  );
  assert.equal(calls, ASSET_LIMITS.filesPerUser);
  assert.equal(f.store.assetUsage('owner').count, 200);
});
test('invalid association and metadata fail before writing; private directories reject links and insecure modes', async (t) => {
  const f = setup(t),
    metadata = await meta();
  let called = false;
  assert.throws(
    () =>
      f.store.createAsset(
        'owner',
        metadata,
        { caseId: '11111111-1111-4111-8111-111111111111' },
        () => (called = true)
      ),
    (e) => e.code === 'CASE_NOT_FOUND'
  );
  assert.equal(called, false);
  for (const name of ['../escape.txt', 'folder/name.txt', 'a\\b.txt', 'a\r\nb.txt', 'test.pdf'])
    await assert.rejects(
      parseAsset(Buffer.from('hello'), { originalFilename: name, mimeType: 'text/plain' })
    );
  const linked = join(f.dir, 'linked');
  symlinkSync(join(f.dir, 'assets'), linked);
  assert.throws(
    () => openAssetVault({ directory: linked }),
    (e) => e.code === 'ASSET_PATH_INVALID'
  );
  chmodSync(join(f.dir, 'assets'), 0o755);
  assert.throws(
    () => openAssetVault({ directory: join(f.dir, 'assets') }),
    (e) => e.code === 'ASSET_PATH_INVALID'
  );
});
test('actual large-byte uploads reach the byte quota before file count; overflow leaves no new original', async (t) => {
  const f = setup(t),
    bytes = Buffer.alloc(ASSET_LIMITS.fileBytes, 65),
    metadata = await parseAsset(bytes, { originalFilename: 'large.txt', mimeType: 'text/plain' });
  assert.equal(metadata.textTruncated, true);
  const accepted = Math.floor(ASSET_LIMITS.userBytes / bytes.length);
  for (let i = 0; i < accepted; i++)
    f.store.createAsset('owner', metadata, {}, (id) => f.vault.write(id, bytes));
  const before = f.store.assetUsage('owner');
  assert.equal(before.count, 51);
  assert.equal(before.bytes, 267386880);
  let wrote = false;
  assert.throws(
    () =>
      f.store.createAsset('owner', metadata, {}, (id) => {
        wrote = true;
        f.vault.write(id, bytes);
      }),
    (e) => e.code === 'ASSET_QUOTA_EXCEEDED'
  );
  assert.equal(wrote, false);
  assert.deepEqual(f.store.assetUsage('owner'), before);
});
test('an existing immutable UUID cannot be overwritten or removed by a failed second write', async (t) => {
  const f = setup(t),
    asset = await save(f, 'Original retained bytes');
  assert.throws(
    () => f.vault.write(asset.id, Buffer.from('Wrong replacement')),
    (e) => e.code === 'EEXIST'
  );
  assert.equal(f.vault.read(asset).toString(), 'Original retained bytes');
});
