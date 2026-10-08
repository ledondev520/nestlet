import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COPY } from './copy.js';
import { documentReadiness } from '../../../document-context.js';
import { GUIDANCE_COPY } from '../../../public/agency-guidance.js';

function strings(value) {
  return typeof value === 'string' ? [value] : Object.values(value).flatMap(strings);
}

test('Chinese document controls stay brief while warnings retain source, consent and export meaning', () => {
  for (const key of ['title', 'reload', 'missingTitle', 'confirm', 'confirmContinue', 'kind', 'generate', 'confirmedDetails', 'source', 'editDetails', 'addAnswer', 'issues', 'addIssue', 'saveIssue', 'sourceMessage', 'versions', 'preview', 'content', 'saveVersion', 'saveStatus', 'copy', 'download', 'print']) {
    assert.match(COPY.zh[key], /^[\p{Script=Han}]{2,4}$/u, key);
  }
  for (const value of strings(COPY.zh)) for (const line of value.split('\n')) assert.ok([...line].length <= 20, line);
  assert.equal(COPY.zh.fields.rent, '申请租金');
  assert.equal(COPY.zh.reviewed, '已核对');
  assert.deepEqual(COPY.zh.statuses, ['待补充', '已确认', '已解决']);
  assert.match(COPY.zh.notApplicableHelp, /已确认没有/);
  assert.match(COPY.zh.aiConsent, /同意[\s\S]*DeepSeek/);
  assert.match(COPY.zh.importConsent, /虚构[\s\S]*去除身份信息[\s\S]*同意上传/);
  assert.equal(COPY.zh.downloadPdf, '下载 PDF');
  assert.match(COPY.zh.errors.PDF_EXPORT_UNSUPPORTED_TEXT, /准确显示[\s\S]*TXT[\s\S]*打印/);
  assert.match(COPY.zh.errors.ARTIFACT_STALE, /旧资料[\s\S]*重新生成[\s\S]*下载或打印/);
});

test('Chinese readiness questions preserve missing, conflict, source and English-review requirements', () => {
  const base = { draftType: 'status-summary', fields: [{ key: 'property', value: 'Synthetic Lane', source: 'Synthetic fixture', confirmed: true, conflict: false }] };
  for (const [change, reason, expected] of [
    [{ value: '' }, 'missing', /请提供「房屋地址」和出处。\n并确认可用于这份文档。/],
    [{ confirmed: false }, 'unconfirmed', /请核对「房屋地址」及其出处。/],
    [{ conflict: true }, 'conflict', /「房屋地址」信息不一致。\n请确认正确内容和出处。/],
    [{ value: '示例地址' }, 'english_review', /请确认「房屋地址」的英文写法。\n不会自动翻译或猜测。/]
  ]) {
    const record = {...base, fields: [{...base.fields[0], ...change}]};
    const zh = documentReadiness(record, { locale: 'zh' });
    const en = documentReadiness(record, { locale: 'en' });
    const question = zh.missing.find(item => item.key === 'property');
    assert.equal(question.reason, reason); assert.match(question.question, expected);
    assert.ok(question.question.split('\n').every(line => [...line].length <= 20));
    assert.deepEqual(zh.missing.map(item => [item.key, item.reason]), en.missing.map(item => [item.key, item.reason]));
    assert.doesNotMatch(en.missing[0].question, /[\p{Script=Han}]/u);
  }
});

test('official references remain advisory and preserve accepted-version uncertainty', () => {
  const copy = GUIDANCE_COPY.zh;
  assert.equal(copy.title, '官方参考');
  assert.match(copy.scope, /辅助文档[\s\S]*不代表负责[\s\S]*不代表官方材料齐全[\s\S]*不会修改事项信息/);
  assert.match(copy.acceptance, /尚未确认/);
  assert.match(copy.versionCaution, /不能判断是否有效[\s\S]*确认受理版本[\s\S]*不得修改/);
  for (const value of strings(copy)) for (const line of value.split('\n')) assert.ok([...line].length <= 20, line);
});
