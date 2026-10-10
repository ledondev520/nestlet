import {test,expect} from '@playwright/test';
import {startLegacyReviewFixture,LEGACY_FIXTURE_PASSWORD} from '../helpers/legacy-review-browser-fixture.mjs';
import {english,openSavedCase,navigate} from './support.js';

test('real clipboard paste of long Chinese text updates the composer and send state',async({page,context})=>{
 const app=await startLegacyReviewFixture();
 try{
  await page.goto(app.origin+'/');await english(page);
  await page.getByLabel('Email or existing username',{exact:true}).fill('owner');await page.getByLabel('Password',{exact:true}).fill(LEGACY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();await openSavedCase(page,app.record.title);
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:app.origin});
  const chat=page.locator('[data-feature="chat"]'),input=chat.locator('.chat-input');await expect(input).toBeEnabled();
  for(const width of [1440,390])for(const length of [3000,7999,8000,9000]){
   await page.setViewportSize({width,height:900});
   const text='合成材料仅供测试。'.repeat(1000).slice(0,length);
   await input.fill('');await page.evaluate(value=>navigator.clipboard.writeText(value),text);await input.focus();await page.keyboard.press('ControlOrMeta+V');
   await expect(input).toHaveValue(text.slice(0,8000));await expect(chat.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
  }
  await navigate(page,'Materials & facts');await navigate(page,'Conversation');
  await expect(input).toHaveValue('合成材料仅供测试。'.repeat(1000).slice(0,8000));await expect(chat.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
  expect(app.requests).toHaveLength(0);
 }finally{await app.stop();}
});

test('a delayed real 401 after same-account login in another tab keeps the draft and current conversation',async({page})=>{
 const app=await startLegacyReviewFixture();let release;
 try{
  await page.goto(app.origin+'/');await english(page);
  await page.getByLabel('Email or existing username',{exact:true}).fill('owner');await page.getByLabel('Password',{exact:true}).fill(LEGACY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();await openSavedCase(page,app.record.title);
  const chat=page.locator('[data-feature="chat"]'),input=chat.locator('.chat-input');await expect(input).toBeEnabled();
  await input.fill('Synthetic unsent draft across a renewed cookie');
  const status=await (await page.request.get(app.origin+'/api/status')).json();
  const logout=await page.request.post(app.origin+'/api/logout',{headers:{Origin:app.origin,'X-CSRF-Token':status.csrfToken},data:{}});expect(logout.status()).toBe(200);
  let reached;const started=new Promise(done=>reached=done),gate=new Promise(done=>release=done);let held=false;
  await page.route('**/api/**',async route=>{
   const response=await route.fetch();
   // Hold every old-session denial, including parallel case-context reads.
   // All 401s are real server responses; the transport only delays delivery.
   if(response.status()===401){if(!held){held=true;reached();}await gate;}
   await route.fulfill({response});
  });
  await chat.getByRole('button',{name:'Reload conversation',exact:true}).click();await started;
  const renewed=await page.request.post(app.origin+'/api/login',{headers:{Origin:app.origin},data:{username:'owner',password:LEGACY_FIXTURE_PASSWORD}});expect(renewed.status()).toBe(200);release();
  await expect(input).toBeEnabled();await expect(input).toHaveValue('Synthetic unsent draft across a renewed cookie');
  await expect(chat).toHaveAttribute('data-conversation-id',app.conversation.id);
  expect(app.requests).toHaveLength(0);
 }finally{release?.();await page.unrouteAll({behavior:'wait'});await app.stop();}
});

test('a reopened saved reply keeps Chinese prose outside the link destination',async({page})=>{
 const app=await startLegacyReviewFixture();
 try{
  const target=app.origin+'/api/health',text=`合成资料：${target}。下一步请核对。`;
  app.withDatabase(db=>db.prepare("INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?, 'owner', ?, 1, 'assistant', ?, 'complete', NULL, NULL, '[]', ?)").run(crypto.randomUUID(),app.conversation.id,text,new Date().toISOString()));
  await page.goto(app.origin+'/');await english(page);
  await page.getByLabel('Email or existing username',{exact:true}).fill('owner');await page.getByLabel('Password',{exact:true}).fill(LEGACY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();await openSavedCase(page,app.record.title);
  await page.reload();await openSavedCase(page,app.record.title);
  const chat=page.locator('[data-feature="chat"]'),link=chat.getByRole('link',{name:target,exact:true});
  await expect(link).toHaveAttribute('href',target);await expect(chat).toContainText('。下一步请核对。');
  const popup=page.waitForEvent('popup');await link.click();const opened=await popup;await opened.waitForLoadState();expect(opened.url()).toBe(target);await expect(opened.locator('body')).toContainText('"ok":true');await opened.close();
  expect(app.messages()[0].content).toBe(text);expect(app.requests).toHaveLength(0);
 }finally{await app.stop();}
});
