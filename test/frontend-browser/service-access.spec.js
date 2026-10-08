import {test as base,expect} from '@playwright/test';
import {startBrowserFixture} from '../helpers/browser-fixture.mjs';
import {signInCustomer,getJson,responseFor,createCustomer,createLinkedCase} from './customer-case-support.js';
import {accountSettings,noHorizontalOverflow,screenshot,switchLanguage} from './support.js';
const USER='synthetic-service-browser';
const test=base.extend({serviceApp:async({},use,testInfo)=>{const app=await startBrowserFixture({legacyUsers:[USER]});testInfo.annotations.push({type:'service-acceptance',description:'Actual browser/HTTP/SQLite, synthetic local accounts only. No provider, mail, real grants, payment, or production migration.'});try{await use(app);}finally{await app.stop();}}});
test('manual service changes require explicit confirmation and preserve ordinary account data; stable IDs survive reload',async({page,browser,serviceApp:app},testInfo)=>{
 const ordinaryContext=await browser.newContext({viewport:{width:320,height:844}});
 try{
  const ordinary=await ordinaryContext.newPage();const ordinaryStatus=await signInCustomer(ordinary,app,USER);
  const client=await createCustomer(ordinary,'Synthetic service customer'),record=await createLinkedCase(ordinary,client,'Synthetic service case');
  expect(client.displayId).toMatch(/^KF\d{8}$/u);expect(record.displayId).toMatch(/^SX\d{8}$/u);
  await accountSettings(ordinary);await expect(ordinary.getByText('Service and usage',{exact:true})).toBeVisible();await expect(ordinary.getByRole('form',{name:'Configure AI service for an ordinary account'})).toHaveCount(0);
  await signInCustomer(page,app,'owner');await accountSettings(page);
  const form=page.getByRole('form',{name:'Configure AI service for an ordinary account',exact:true});await expect(form).toBeVisible();await expect(form.getByRole('option',{name:/synthetic-service-browser/u})).toHaveCount(1);
  await form.getByLabel('Choose an account',{exact:true}).selectOption(ordinaryStatus.userId);await form.getByLabel('Allow new AI requests',{exact:true}).uncheck();await form.getByRole('button',{name:'Review change',exact:true}).click();
  expect((await getJson(ordinary,app,'/api/service')).service.status).toBe('available');await form.getByRole('button',{name:'Cancel',exact:true}).click();expect((await getJson(ordinary,app,'/api/service')).service.status).toBe('available');
  await form.getByRole('button',{name:'Review change',exact:true}).click();const saved=responseFor(page,`/api/admin/accounts/${ordinaryStatus.userId}/service`,'PUT');await form.getByRole('button',{name:'Confirm service change',exact:true}).click();expect((await saved).status()).toBe(200);await expect(page.getByText('Service configuration saved',{exact:true})).toBeVisible();
  await ordinary.locator('[data-slot="card"]').filter({has:ordinary.getByText('Service and usage',{exact:true})}).getByRole('button',{name:'Refresh status',exact:true}).click();await expect(ordinary.getByText(/Paused ·/u)).toBeVisible();
  expect((await getJson(ordinary,app,`/api/cases/${record.id}`)).case).toMatchObject({id:record.id,displayId:record.displayId});expect((await getJson(ordinary,app,'/api/status')).role).toBe('trial');
  await ordinary.reload();await expect(ordinary.getByText(/Paused ·/u)).toBeVisible();await noHorizontalOverflow(ordinary);await screenshot(ordinary,testInfo,'service-paused-existing-data-320-en');
  await switchLanguage(page,'zh');await expect(page.getByText('服务与使用额度',{exact:true})).toBeVisible();await noHorizontalOverflow(page);await screenshot(page,testInfo,'owner-manual-service-zh');
 }finally{await ordinaryContext.close();}
});
