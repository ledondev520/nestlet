import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chatCopy } from './copy.js';
import { originalRetentionCopy } from './original-retention-copy.js';
import { sourceNavigationCopy } from './source-navigation.js';

test('Chinese chat copy keeps short actions and separate readable description lines', () => {
  for (const [scope, copy] of Object.entries({chat:chatCopy.zh,original:originalRetentionCopy.zh,source:sourceNavigationCopy.zh})) {
    for (const [key,value] of Object.entries(copy)) {
      assert.doesNotMatch(value,/／|多条写法待确认|说明：/u,`${scope}.${key}`);
      for (const line of value.split('\n')) assert.ok([...line].length<=20,`${scope}.${key}: ${line}`);
    }
  }
  for (const key of ['conversation','newConversation','send','stop','attach','remove','retry','reload','copy','checkConnection','checkSavedReply','retryOpening','refreshService','chooseConversation']) {
    assert.ok([...chatCopy.zh[key]].length>=2&&[...chatCopy.zh[key]].length<=4,key);
  }
  assert.equal(chatCopy.zh.attach,'添加附件'); // The existing picker routes documents as well as accepting images.
});

test('short copy retains recovery, source limits and original-retention boundaries', () => {
  assert.match(chatCopy.zh.resetAsk,/未发送文字、图片和未保存回复会清空/u);
  assert.match(chatCopy.zh.resetAsk,/已保存消息仍保留/u);
  assert.match(chatCopy.zh.replyRestored,/尚未确认保存/u);
  assert.match(chatCopy.zh.replyRestored,/保留当前页面.*复制文字/u);
  assert.match(chatCopy.zh.librarySourcesNote,/不代表已完整审查资料库/u);
  assert.match(originalRetentionCopy.zh.boundary,/仅发送消息不会保存原图/u);
  assert.match(originalRetentionCopy.zh.boundary,/未识别图中文字/u);
  assert.match(sourceNavigationCopy.zh.historical,/现有修改不会被替换/u);
});

test('permission wording retains recipient, future scope, revocation and one-time fallback meaning', async () => {
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},logLevel:'error'});
  try {
    const {permissionCopy}=await vite.ssrLoadModule('/features/chat/library-permission.jsx');
    const copy=permissionCopy('zh');
    for(const value of Object.values(copy))for(const line of value.split('\n'))assert.ok([...line].length<=20,line);
    assert.match(copy.detail,/客户、事项、文件和文档/u);
    assert.match(copy.detail,/发给DeepSeek/u);
    assert.match(copy.detail,/账号之后的对话/u);
    assert.match(copy.detail,/随时在「设置」中关闭/u);
    assert.match(copy.ordinary,/消息文字和附图.*DeepSeek/u);
    assert.match(copy.ordinary,/部分当前事项资料和对话记录/u);
    assert.match(copy.onceHint,/这次不使用资料库，直接发送/u);
    const source=await readFile(new URL('./library-permission.jsx',import.meta.url),'utf8');
    assert.match(source,/aria-describedby=\{onceHintId\}/u);
    assert.match(source,/id=\{onceHintId\}/u);
  } finally {await vite.close();}
});

test('short starter labels do not replace the existing full message payload or historical title recognition', async () => {
  const source=await readFile(new URL('./opening.jsx',import.meta.url),'utf8');
  assert.match(source,/\['帮我整理手头的材料','帮我准备一份英文跟进草稿'\]/u);
  assert.match(source,/onClick=\{\(\)=>onPrompt\(prompt\)\}/u);
  assert.match(source,/\['整理材料','跟进草稿'\]\[index\]/u);
  const chat=await readFile(new URL('./index.jsx',import.meta.url),'utf8');
  assert.match(chat,/className="chat-keyboard-hint whitespace-pre-line"/u);
  assert.match(chat,/\['Conversation','Case conversation','案例会话','新对话','New conversation','对话'\]/u);
});
