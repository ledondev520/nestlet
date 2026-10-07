// Pure helpers and DOM construction only; this does not certify a browser, provider call or deployment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { confirmationBody, issueChange, hasUnreviewedCJK, printableFilename, fillPrintDocument } from './helpers.js';
import { COPY, documentErrorText } from './copy.js';

test('one explicit confirmation separates core facts from document details and retains expected version', () => {
  const result = confirmationBody({property:' 128 Example Lane ', recipientName:{value:'Example Intake Team'}, attachments:{value:'',notApplicable:true}, adminRole:'owner'}, {version:7});
  assert.deepEqual(result, {changes:{recipientName:{value:'Example Intake Team'},attachments:{value:'',notApplicable:true}}, factChanges:{property:{value:'128 Example Lane'}}, confirm:true, expectedVersion:7});
  assert.equal(confirmationBody({senderName:'   '}, {version:7}), null);
  assert.deepEqual(confirmationBody({}, {version:7}, true), {changes:{},confirm:true,expectedVersion:7,namesVerified:true});
});

test('case questions require an explicit valid status and a resolution before resolved', () => {
  assert.equal(issueChange({question:'Question',resolution:'',status:'resolved'}), null);
  assert.equal(issueChange({}), null);
  assert.equal(issueChange({question:'Question',resolution:'Answer',status:'approved'}), null);
  assert.deepEqual(issueChange({id:'known-id',question:' Question ',resolution:' Confirmed answer ',status:'resolved',sourceMessageId:'message-id'}),
    {id:'known-id',question:'Question',resolution:'Confirmed answer',status:'resolved',sourceMessageId:'message-id'});
});

test('English prose checks preserve only source-supported confirmed proper names', () => {
  const record = {namesVerified:true,fields:[{key:'property',value:'示例街128号',source:'Synthetic source',confirmed:true,conflict:false}], documentContext:{recipientName:{value:'示例机构',source:'User answer',confirmed:true}}};
  assert.equal(hasUnreviewedCJK('To: 示例机构\nProperty: 示例街128号\nPlease confirm the instructions.',record), false);
  assert.equal(hasUnreviewedCJK('To: 示例机构\n这是未确认的正文。',record), true);
  assert.equal(hasUnreviewedCJK('To: 示例机构',{...record,namesVerified:false}), true);
  assert.equal(hasUnreviewedCJK('To: 示例机构',{...record,documentContext:{recipientName:{value:'示例机构',source:'Model suggestion',confirmed:false}}}), true);
});

test('print preparation preserves exact text and never interprets artifact text as HTML', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'https://nestlet.invalid/'});
  const content = 'Supplementary correspondence; not an official agency form.\n<article><script>not executable</script></article>\nExample & evidence';
  const link = fillPrintDocument(dom.window,content,'https://nestlet.invalid/next/index.css','Nestlet final');
  assert.equal(dom.window.document.body.textContent,content);
  assert.equal(dom.window.document.querySelectorAll('script').length,0);
  assert.equal(dom.window.document.querySelectorAll('style').length,0);
  assert.equal(dom.window.document.body.children.length,1);
  assert.equal(dom.window.document.body.firstChild.className,'print-document');
  assert.equal(link.href,'https://nestlet.invalid/next/index.css');
  assert.equal(dom.window.document.documentElement.lang,'en');
  dom.window.close();
});

test('version filenames are bounded English metadata and cannot insert paths or new draft wrappers', () => {
  assert.equal(printableFilename({kind:'followup',status:'final',version:4}),'nestlet-followup-v4-final.txt');
  assert.equal(printableFilename({kind:'../../private',status:'approved',version:-1}),'nestlet-document-draft.txt');
});

test('every explicit feature error has bilingual copy and arbitrary exception prose is never rendered', () => {
  assert.deepEqual(Object.keys(COPY.zh.errors).sort(),Object.keys(COPY.en.errors).sort());
  for (const [code,message] of Object.entries(COPY.en.errors)) {
    assert.doesNotMatch(message,/[\p{Script=Han}]/u,code);
    assert.ok(COPY.zh.errors[code]);
  }
  assert.equal(documentErrorText({code:'UNKNOWN_CODE',message:'PRIVATE_BACKEND_STACK'},'en'),COPY.en.generic);
  assert.equal(documentErrorText({code:'CASE_ISSUE_NOT_FOUND'},'zh'),COPY.zh.errors.CASE_ISSUE_NOT_FOUND);
});
