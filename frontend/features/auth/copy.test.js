import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authCopy, authErrorMessage } from './copy.js';
import { accountAdministrationCopy, operationalDiagnosticsCopy } from '../account-administration/copy.js';

test('Chinese auth and administrator copy uses separate short lines without proposal annotations', () => {
  for (const [scope, copy] of Object.entries({ auth: authCopy('zh'), administration: accountAdministrationCopy('zh'), diagnostics: operationalDiagnosticsCopy('zh') })) {
    for (const [key, value] of Object.entries(copy)) {
      assert.doesNotMatch(value, /／|弹窗明确|服务商标识|多条写法待确认/, `${scope}.${key}`);
      for (const line of value.split('\n')) assert.ok([...line].length <= 20, `${scope}.${key}: ${line}`);
    }
  }
});

test('authentication copy preserves security, time limits and uncertain results', () => {
  const copy = authCopy('zh');
  assert.match(copy.emailPrivacy, /10分钟/); assert.match(copy.emailPrivacy, /30分钟.*仅可用一次/);
  assert.match(copy.emailPrivacy, /请勿转发/);
  assert.match(copy.acceptedHint, /不说明账号是否存在/); assert.match(copy.acceptedHint, /不保证邮件已经送达/);
  assert.match(copy.verifyHint, /新账号会在本浏览器登录/); assert.match(copy.verifyHint, /已有账号只会更新邮箱验证状态/);
  assert.match(copy.verifyHint, /仅打开页面不会使用链接/);
  assert.match(copy.resetHint, /更改密码/); assert.match(copy.resetHint, /原有登录将失效/);
  assert.match(copy.bindingPending, /符合条件/); assert.match(copy.bindingPending, /绑定尚未完成/);
  assert.match(copy.signOutWarning, /保存或复制未保存的输入和回复/);
  assert.match(copy.signOutWarning, /退出后，这些内容会被清空/);
  assert.match(copy.bootstrapRecovery, /不能通过邮箱重设/); assert.match(copy.bootstrapRecovery, /私有服务器终端恢复/);
  assert.match(copy.bootstrapRecovery, /请勿在聊天中发送密码/);
  assert.match(authErrorMessage('REQUEST_FAILED'), /请勿发送密码或密钥/);
  assert.match(authErrorMessage('EMAIL_AUTH_RATE_LIMITED'), /60秒/); assert.match(authErrorMessage('EMAIL_AUTH_RATE_LIMITED'), /每小时最多5次/);
});
