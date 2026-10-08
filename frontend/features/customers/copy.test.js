import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copy } from './copy.js';
import { assetCopy } from './assets-copy.js';
import { savedCasesCopy } from './saved-cases-copy.js';

const catalogs = { customers: copy, originals: assetCopy, savedCases: savedCasesCopy };
function leaves(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) => item && typeof item === 'object'
    ? leaves(item, `${prefix}${key}.`)
    : [[`${prefix}${key}`, item]]);
}

test('customer copy keeps the bilingual catalog contract and limits Chinese descriptions to 20 characters per line', () => {
  for (const [name, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(leaves(catalog.zh).map(([key]) => key), leaves(catalog.en).map(([key]) => key), name);
    for (const [key, value] of leaves(catalog.zh)) {
      if (typeof value !== 'string') continue;
      for (const line of value.split('\n')) assert.ok([...line].length <= 20, `${name}.${key}: ${line}`);
      assert.doesNotMatch(value, /／/, `${name}.${key} renders separate lines, not editorial separators`);
    }
  }
});

test('approved customer, case and original actions use the short Chinese labels', () => {
  assert.deepEqual(
    [copy.zh.title, copy.zh.createCustomer, copy.zh.rename, copy.zh.save, copy.zh.createCase, copy.zh.documents, copy.zh.reloadLatest],
    ['客户', '新建客户', '改称呼', '保存称呼', '新建事项', '已存文档', '刷新称呼']
  );
  assert.deepEqual(
    [savedCasesCopy.zh.title, savedCasesCopy.zh.search, savedCasesCopy.zh.open, savedCasesCopy.zh.refresh, savedCasesCopy.zh.recent],
    ['已存事项', '搜索事项', '打开事项', '刷新列表', '最近十项']
  );
  assert.deepEqual(
    [assetCopy.zh.title, assetCopy.zh.search, assetCopy.zh.textPreview, assetCopy.zh.closeText, assetCopy.zh.retryText],
    ['客户原件', '搜索原件', '查看文字', '关闭预览', '刷新文字']
  );
  assert.deepEqual(copy.zh.kinds, { followup: '跟进信', 'missing-documents': '资料确认', 'status-summary': '进度摘要' });
  assert.equal(copy.zh.final, '完成版');
});

test('short copy preserves uncertain saves, conflicts, historical versions and numeric limits', () => {
  assert.equal(copy.zh.saveUncertain, '尚未确认是否保存，请勿重复新建。\n请先刷新并检查记录，再决定是否重试。');
  assert.equal(copy.zh.conflict, '称呼已在别处更新，输入仍保留。\n请读取最新称呼，核对后再保存。');
  assert.equal(copy.zh.staleHint, '事项已更新，此版保留作历史记录。\n完成版需重新生成。');
  assert.equal(copy.zh.errors.CASE_LIMIT_REACHED, '本账号已有100个事项，已达上限。\n请先整理已有事项。');
  assert.equal(assetCopy.zh.extractionLimited, '仅显示部分文字。\n完整内容请下载原件查看。');
  assert.equal(savedCasesCopy.zh.recentHint, '显示搜索结果中最近更新的10项。\n其余记录请选「全部事项」查看。');
});

test('archive totals remain complete and readable at the current storage limits', () => {
  assert.equal(assetCopy.zh.page(4, 50, 200), '第 4 页\n本页 50 个，共 200 个');
  assert.equal(savedCasesCopy.zh.count(10, 90, 100), '本页 10 项\n当前范围 90 项\n账号共 100 项');
  for (const text of [assetCopy.zh.page(4, 50, 200), savedCasesCopy.zh.count(10, 90, 100)]) {
    for (const line of text.split('\n')) assert.ok([...line].length <= 20);
  }
});
