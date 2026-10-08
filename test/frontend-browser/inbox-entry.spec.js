import { randomUUID } from 'node:crypto';
import { test, expect, signInCustomer, apiWrite } from './customer-case-support.js';
import { english, navigate, noHorizontalOverflow, watchBrowser, screenshot } from './support.js';

for (const {width,lang} of [1280,390,320].flatMap(width=>['en','zh'].map(lang=>({width,lang})))) test(`real Inbox entry preserves dirty guards and mounted editors (${width}/${lang})`,async({page,customerApp:app},testInfo)=>{
 await page.setViewportSize({width,height:900});const clean=await watchBrowser(page);const session=await signInCustomer(page,app);let selectedRecord;
 for(const title of ['Synthetic Inbox A','Synthetic Inbox B']){const response=await apiWrite(page,app,'/api/cases','POST',{title,sourceText:'',fields:[],draftType:'followup',draftText:''});expect(response.status()).toBe(201);selectedRecord=(await response.json()).case;}
 const conversationResponse=await apiWrite(page,app,`/api/cases/${selectedRecord.id}/conversations`,'POST',{title:'Synthetic saved conversation'});expect(conversationResponse.status()).toBe(201);const {conversation}=await conversationResponse.json();
 app.withDatabase(db=>{for(const [index,role,content] of [[1,'user','Please prepare a follow-up from these synthetic materials.'],[2,'assistant','Synthetic saved conversation. The recipient and sender contact still need confirmation. No message has been sent. '+ 'Keep the source linked and review the facts before finalizing. '.repeat(8)]])db.prepare('INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),session.userId,conversation.id,index,role,content,'complete',null,null,'[]',new Date().toISOString());});
 const artifactResponse=await apiWrite(page,app,`/api/cases/${selectedRecord.id}/artifacts`,'POST',{kind:'followup',title:'Synthetic follow-up draft',status:'draft',content:'Dear Synthetic Intake Team,\n\nPlease confirm the current status and any remaining documentation. This is an authored synthetic draft, not an official form or a sent message.\n\nSynthetic Sender',expectedCaseVersion:selectedRecord.version});expect(artifactResponse.status()).toBe(201);const {artifact}=await artifactResponse.json();
 await page.reload();await english(page);if(lang==='zh')await page.getByRole('button',{name:'切换界面为中文'}).click();await expect(page.locator('.wb')).toBeVisible();
 const toggle=page.getByRole('button',{name:lang==='zh'?'打开客户与事项列表':'Open customers and cases',exact:true});
 const rail=page.locator('.wb-rail');
 if(width<960)await toggle.click();
 await rail.getByRole('button',{name:'Synthetic Inbox A',exact:true}).click();
 const composer=page.locator('.chat-input');await composer.fill('Keep this unsent draft');
 await navigate(page,lang==='zh'?'材料与事实':'Materials & facts');const materialsUrl=page.url();await page.locator('.inbox-skip').focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(materialsUrl);await expect(page.locator('main')).toBeFocused();await navigate(page,lang==='zh'?'对话':'Conversation');await expect(composer).toHaveValue('Keep this unsent draft');
 if(width<960)await toggle.click();
 page.once('dialog',dialog=>dialog.dismiss());await rail.getByRole('button',{name:'Synthetic Inbox B',exact:true}).click();
 await expect(composer).toHaveValue('Keep this unsent draft');
 if(width<960)await expect(rail).toHaveAttribute('aria-modal','true');
 page.once('dialog',dialog=>dialog.accept());await rail.getByRole('button',{name:'Synthetic Inbox B',exact:true}).click();
 await expect(composer).toHaveValue('');await expect(page.locator('[data-feature="chat"]')).toContainText('Synthetic Inbox B');
 if(width<960){await expect(rail).toHaveAttribute('inert','');await expect(page.locator('main')).toBeFocused();}
 await expect(page.locator('[data-feature="chat"]')).toContainText('Synthetic saved conversation.');
 await noHorizontalOverflow(page);await screenshot(page,testInfo,`real-inbox-${width}-${lang}-populated`);
 if(width<960)await page.getByRole('button',{name:lang==='zh'?'打开案例上下文':'Open case context',exact:true}).click();
 await expect(page.locator('.wb-context')).toContainText('Synthetic follow-up draft');await screenshot(page,testInfo,`real-inbox-${width}-${lang}-context`);if(width<960)await page.keyboard.press('Escape');
 await navigate(page,lang==='zh'?'文档':'Documents');await page.locator(`[data-artifact-id="${artifact.id}"]`).getByRole('button').click();await expect(page.locator('#document-body')).toHaveValue(/Dear Synthetic Intake Team/);await screenshot(page,testInfo,`real-inbox-${width}-${lang}-document`);await clean();
});

for(const lang of ['en','zh'])test(`Inbox drawers contain focus, close safely and never open from desktop state (${lang})`,async({page,customerApp:app})=>{
 await page.setViewportSize({width:1280,height:900});await signInCustomer(page,app);if(lang==='zh')await page.getByRole('button',{name:'切换界面为中文'}).click();
 await page.setViewportSize({width:390,height:844});await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
 const open=page.getByRole('button',{name:lang==='zh'?'打开案例上下文':'Open case context',exact:true});await open.click();const dialog=page.getByRole('dialog',{name:lang==='zh'?'案例上下文':'Case context',exact:true});await expect(dialog).toBeVisible();
 for(const key of ['Tab','Shift+Tab','Tab','Tab']){await page.keyboard.press(key);expect(await page.evaluate(()=>!!document.activeElement.closest('[aria-modal="true"]'))).toBe(true);}
 await page.keyboard.press('Escape');await expect(open).toBeFocused();await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
 await open.click();await page.locator('.wb-scrim').click({position:{x:3,y:3}});await expect(open).toBeFocused();
 await open.click();await page.setViewportSize({width:1280,height:900});await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);await expect(page.locator('main')).not.toHaveAttribute('inert');
});

test('first-use permission takes sole modal ownership after a delayed read while a drawer is open',async({page,customerApp:app})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/status',async route=>{const response=await route.fetch();const data=await response.json();await route.fulfill({response,json:{...data,liveEnabled:data.authenticated===true}});});
 let release,received;const waiting=new Promise(resolve=>{received=resolve;});let chats=0;
 await page.route('**/api/library-permission',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch();received();await new Promise(resolve=>{release=resolve;});await route.fulfill({response});});
 await page.route('**/api/chat',async route=>{chats++;await route.fulfill({status:503,json:{code:'LIVE_DISABLED'}});});
 await signInCustomer(page,app);await page.locator('.chat-input').fill('Synthetic delayed permission question');await page.getByRole('button',{name:'Send',exact:true}).click();await waiting;
 await page.getByRole('button',{name:'Open case context',exact:true}).click();await expect(page.locator('.wb [aria-modal="true"]')).toHaveCount(1);release();
 await expect(page.locator('.wb [aria-modal="true"]')).toHaveCount(0);const permission=page.getByRole('dialog');await expect(permission).toContainText('DeepSeek');
 for(const key of ['Tab','Shift+Tab','Tab']){await page.keyboard.press(key);expect(await page.evaluate(()=>!!document.activeElement.closest('[role="dialog"][aria-modal="true"]')&&!document.activeElement.closest('.wb'))).toBe(true);}
 await page.keyboard.press('Escape');await expect(permission).toHaveCount(0);await expect(page.locator('.chat-input')).toHaveValue('Synthetic delayed permission question');expect(chats).toBe(0);await expect(page.locator('.wb [aria-modal="true"]')).toHaveCount(0);
});
