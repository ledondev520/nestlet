import { accountSettings, switchLanguage } from './support.js';
import {test,expect,signInCustomer,getJson} from './customer-case-support.js';
import {navigate,screenshot} from './support.js';

for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:720}]){
 test(`saved-library first-use, decline, allow and revoke at ${viewport.width}px`,async({page,customerApp:app},testInfo)=>{
  await page.setViewportSize(viewport);
  testInfo.annotations.push({type:'provider-evidence',description:'Real browser, HTTP/SQLite and synthetic-account permission writes. Status capability is a fixture and chat returns a controlled LIVE_DISABLED error; no actual provider call or real-account grant.'});
  await page.route('**/api/status',async route=>{
   const response=await route.fetch();const value=await response.json();await route.fulfill({response,json:{...value,liveEnabled:value.authenticated===true}});
  });
  const chats=[];
  await page.route('**/api/chat',async route=>{chats.push(route.request().postDataJSON());await route.fulfill({status:503,json:{code:'LIVE_DISABLED'}});});
  await signInCustomer(page,app);
  const chat=page.locator('[data-feature="chat"]');
  await expect(chat.getByRole('checkbox')).toHaveCount(0);
  await chat.locator('.chat-input').fill('Synthetic question with no customer data.');
  await chat.getByRole('button',{name:'Send',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('DeepSeek');await expect(dialog).toContainText('future chats on this account');
  expect((await getJson(page,app,'/api/library-permission')).decision).toBe('unset');expect(chats).toHaveLength(0);
  await screenshot(page,testInfo,`library-first-use-${viewport.width}`);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(chat.locator('.chat-input')).toHaveValue('Synthetic question with no customer data.');
  expect((await getJson(page,app,'/api/library-permission')).decision).toBe('unset');
  await chat.getByRole('button',{name:'Send',exact:true}).click();await dialog.getByRole('button',{name:'Continue without library',exact:true}).click();
  await expect.poll(()=>chats.length).toBe(1);expect(chats[0].actionConsent).toBe(true);expect(chats[0].libraryConsent).toBeUndefined();
  expect((await getJson(page,app,'/api/library-permission')).decision).toBe('deny');
  await expect(chat.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
  await chat.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>chats.length).toBe(2);await expect(dialog).toHaveCount(0);
  await accountSettings(page);
  await page.getByRole('button',{name:'Allow saved-library search',exact:true}).click();await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Allow saved-library search',exact:true}).click();await expect(dialog).toHaveCount(0);
  const grant=await getJson(page,app,'/api/library-permission');expect(grant.decision).toBe('allow');
  await navigate(page,'Conversation');await chat.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>chats.length).toBe(3);
  expect(chats[2].libraryConsent).toBe(true);expect(chats[2].libraryPermissionVersion).toBe(grant.version);await expect(dialog).toHaveCount(0);
  await accountSettings(page);await page.getByRole('button',{name:'Turn off saved-library search',exact:true}).click();
  await expect(page.getByRole('button',{name:'Allow saved-library search',exact:true})).toBeEnabled();
  expect((await getJson(page,app,'/api/library-permission')).decision).toBe('deny');
  await navigate(page,'Conversation');await chat.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>chats.length).toBe(4);expect(chats[3].libraryConsent).toBeUndefined();
  await expect(chat.getByRole('checkbox')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}
