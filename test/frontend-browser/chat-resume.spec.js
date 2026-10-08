import {test,expect} from '@playwright/test';
import {startLegacyReviewFixture,LEGACY_FIXTURE_PASSWORD,LEGACY_REVIEW_REQUEST} from '../helpers/legacy-review-browser-fixture.mjs';
import {english,openSavedCase,screenshot} from './support.js';

for(const width of [1440,390])test(`existing conversation recovers stale tab credentials without replaying the model turn (${width})`,async({page},testInfo)=>{
 const app=await startLegacyReviewFixture();
 const calls=[];const onRequest=request=>{if(new URL(request.url()).pathname==='/api/chat')calls.push(request.postDataJSON());};
 page.on('request',onRequest);
 try{
  testInfo.annotations.push({type:'chat-resume-evidence',description:'Current built frontend with real auth/HTTP/SQLite; a second real login rotates this browser context cookie while the existing page holds its old CSRF. Provider transport is a fail-closed synthetic fixture, never a real model.'});
  await page.setViewportSize({width,height:1000});await page.goto(app.origin+'/');await english(page);
  await page.getByLabel('Email or existing username',{exact:true}).fill('owner');await page.getByLabel('Password',{exact:true}).fill(LEGACY_FIXTURE_PASSWORD);
  const login=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/login');await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();expect((await login).status()).toBe(200);
  await openSavedCase(page,app.record.title);
  const chat=page.locator('[data-feature="chat"]'),input=chat.locator('.chat-input');
  await expect(input).toBeEnabled();await expect(chat.getByRole('combobox',{name:'Saved conversations',exact:true})).toHaveValue(app.conversation.id);
  // The browser's shared cookie changes; do not reload or alter the original tab.
  const rotated=await page.request.post(app.origin+'/api/login',{headers:{Origin:app.origin},data:{username:'owner',password:LEGACY_FIXTURE_PASSWORD}});expect(rotated.status()).toBe(200);
  await input.fill(LEGACY_REVIEW_REQUEST);
  const send=async()=>{
   await chat.getByRole('button',{name:'Send',exact:true}).click();
   const consent=page.getByRole('dialog',{name:'Use your saved library?',exact:true});await expect(consent).toBeVisible();
   await consent.getByRole('button',{name:'Continue without library',exact:true}).click();
  };
  const rejected=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat');await send();expect((await rejected).status()).toBe(403);
  await expect(chat.getByText('Connection refreshed. Your question is kept.',{exact:true})).toBeVisible();
  await expect(input).toHaveValue(LEGACY_REVIEW_REQUEST);await expect(chat.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
  expect(calls).toHaveLength(1);expect(app.requests).toHaveLength(0);expect(app.messages()).toEqual([]);app.assertUnchanged();
  await expect(chat.getByRole('combobox',{name:'Saved conversations',exact:true})).toHaveValue(app.conversation.id);
  await send();await app.waitForProvider();expect(calls).toHaveLength(2);expect(app.requests).toHaveLength(1);
  app.release();await expect(input).toBeEnabled();await expect(chat.getByTestId('conversation-action-review')).toHaveCount(1);
  expect(app.messages().map(message=>message.role)).toEqual(['user','assistant']);expect(app.messages()[0].content).toBe(LEGACY_REVIEW_REQUEST);
  expect(app.messages()[1].state).toBe('complete');app.assertUnchanged();app.assertHealthy();
  await screenshot(page,testInfo,`existing-conversation-recovered-${width}`);
 }finally{page.off('request',onRequest);await app.stop();}
});
