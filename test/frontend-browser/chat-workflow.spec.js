import { PNG } from 'pngjs';
import { test, expect, signInCustomer, getJson, responseFor } from './customer-case-support.js';
import { SOURCE, navigate, screenshot, watchBrowser } from './support.js';

// Official CI browser gate. Actual UI + HTTP + SQLite, no request interception,
// seeded assistant replies, model calls, or email delivery claims.
test('chat case bridge preserves the composer, saves a chosen original, and continues through reviewed English generation', async ({page, customerApp:app}, testInfo) => {
  testInfo.annotations.push({type:'chat-bridge-evidence',description:'Actual browser/HTTP/SQLite; no model output. Source-message draft/append actions have separate real HTTP/DOM evidence.'});
  const assertClean=await watchBrowser(page);
  await signInCustomer(page,app);
  const chat=page.locator('[data-feature="chat"]');
  await chat.locator('.chat-input').fill('Unsent synthetic question preserved across this workflow');
  const png=new PNG({width:2,height:2});png.data.fill(255);const bytes=PNG.sync.write(png),filename='synthetic-chat-original.png';
  await chat.locator('input[type=file]').setInputFiles({name:filename,mimeType:'image/png',buffer:bytes});
  const retain=chat.getByRole('region',{name:'Save chat originals'});
  // The region is a labelled section; it retains exact original bytes only on this action.
  const created=responseFor(page,'/api/cases','POST'),uploaded=responseFor(page,'/api/assets','POST');
  await chat.getByRole('button',{name:'Save this original',exact:true}).click();
  const caseResponse=await created;expect(caseResponse.status()).toBe(201);const record=(await caseResponse.json()).case;
  const assetResponse=await uploaded;expect(assetResponse.status()).toBe(201);const asset=(await assetResponse.json()).asset;
  expect(asset).toMatchObject({caseId:record.id,originalFilename:filename,mimeType:'image/png',textStatus:'unavailable'});
  await expect(retain).toContainText('Original saved to this case’s Materials');
  await expect(chat.locator('.chat-input')).toHaveValue('Unsent synthetic question preserved across this workflow');
  const downloaded=await page.request.get(app.origin+`/api/assets/${asset.id}/download`);expect(downloaded.status()).toBe(200);expect(Buffer.compare(await downloaded.body(),bytes)).toBe(0);
  await page.getByTestId('chat-case-workflow').getByRole('button',{name:'Review facts and materials',exact:true}).click();
  await expect(page).toHaveURL(/#intake$/u);
  await expect(page.getByLabel('Case source text',{exact:true})).toHaveValue('');
  await page.getByLabel('Case name',{exact:true}).fill('Synthetic chat bridge browser case');
  await page.getByLabel('Case source text',{exact:true}).fill(SOURCE);
  await page.getByRole('button',{name:'Organize explicit labels',exact:true}).click();
  for(const check of await page.getByRole('checkbox',{name:'I reviewed this fact or its unknown status',exact:true}).all())await check.check();
  await navigate(page,'Conversation');
  await page.getByTestId('chat-case-workflow').getByRole('button',{name:'Finish and preview English document',exact:true}).click();
  await expect(page).toHaveURL(/#intake$/u); // Pending material is finished first.
  await expect(page.getByLabel('Case source text',{exact:true})).toHaveValue(SOURCE);
  const saved=responseFor(page,`/api/cases/${record.id}`,'PUT');await page.getByRole('button',{name:'Save case',exact:true}).click();expect((await saved).status()).toBe(200);
  await navigate(page,'Conversation');
  await expect(page.getByTestId('chat-case-workflow')).toContainText('Already confirmed in this case');
  await page.getByTestId('chat-case-workflow').getByRole('button',{name:'Finish and preview English document',exact:true}).click();
  await expect(page).toHaveURL(/#documents$/u);
  const documents=page.getByTestId('documents-page');
  await expect(documents.locator('#document-answer-property')).toHaveCount(0);
  for(const[label,value]of [['Recipient / department','Synthetic recipient'],['Recipient contact/address','recipient@example.invalid'],['Sender name','Synthetic operator'],['Sender contact','operator@example.invalid']])await documents.getByLabel(label,{exact:true}).fill(value);
  const generated=responseFor(page,`/api/cases/${record.id}/artifacts/generate`,'POST');await documents.getByRole('button',{name:'Save answers & generate final',exact:true}).click();
  const generatedResponse=await generated;expect(generatedResponse.status()).toBe(201);const artifact=(await generatedResponse.json()).artifact;
  expect(artifact.status).toBe('final');expect(artifact.content).toContain('128 Example Lane Unit B');expect(artifact.content).not.toMatch(/\[insert|TBD/iu);
  await expect(documents.getByLabel('English document body',{exact:true})).toHaveValue(artifact.content);
  await documents.getByLabel('English document body',{exact:true}).fill(artifact.content+'\nPending human edit to keep.');
  await navigate(page,'Conversation');await expect(chat.locator('.chat-input')).toHaveValue('Unsent synthetic question preserved across this workflow');
  await page.getByTestId('chat-case-workflow').getByRole('button',{name:'View saved documents',exact:true}).click();
  await expect(documents.getByLabel('English document body',{exact:true})).toHaveValue(artifact.content+'\nPending human edit to keep.');
  expect((await getJson(page,app,`/api/cases/${record.id}/artifacts`)).artifacts).toHaveLength(1);
  expect((await getJson(page,app,`/api/assets?caseId=${record.id}&limit=100`)).assets).toHaveLength(1);
  await page.setViewportSize({width:390,height:844});await navigate(page,'Conversation');
  await page.getByRole('button',{name:'Open case context',exact:true}).click();
  await expect(page.getByTestId('chat-case-workflow').getByRole('button',{name:'Review facts and materials',exact:true})).toBeVisible();
  await screenshot(page,testInfo,'chat-case-bridge-mobile390');
  await assertClean();
});
