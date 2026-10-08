import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intakeCopy } from './copy.js';

function strings(value) {
  return typeof value === 'string' ? [value] : Object.values(value).flatMap(strings);
}

test('Chinese material copy uses short labels and explicit short lines without losing boundaries', () => {
  const copy = intakeCopy.zh;
  for (const key of ['title', 'caseTitle', 'materialTitle', 'chooseFiles', 'queue', 'saveFiles', 'cancel', 'assets', 'archiveLink', 'sourceTitle', 'manual', 'aiTitle', 'aiExtract', 'factsTitle', 'fieldSource', 'resolve', 'save', 'documents', 'saveDocuments', 'readLatest', 'latest', 'reconcile', 'replaceLatest', 'workbookTitle', 'mapApply', 'mapCancel']) {
    assert.match(copy[key], /^[\p{Script=Han}]{2,4}$/u, key);
  }
  for (const value of strings(copy)) for (const line of value.split('\n')) assert.ok([...line].length <= 20, line);
  assert.equal(copy.fieldLabels.rent, '申请租金');
  assert.match(copy.saveFilesHelp, /仅当前账号可见/);
  assert.match(copy.aiProvider, /DeepSeek/);
  assert.match(copy.confirm, /内容或待确认状态/);
  assert.match(copy.conflictHelp, /不同出处[\s\S]*解决差异后才能确认/);
  assert.match(copy.uploadError, /尚未确认[\s\S]*避免重复上传/);
  assert.match(copy.errors.SENSITIVE_DATA, /敏感身份信息[\s\S]*尚未发送/);
  assert.match(copy.cancelNote, /已保存的原件仍保留[\s\S]*可能已有文件保存/);
});
