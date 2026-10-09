import { accountSettings, switchLanguage } from './support.js';
import { randomUUID } from 'node:crypto';
import { test, expect, signInCustomer, apiWrite } from './customer-case-support.js';
import { english, navigate, noHorizontalOverflow, watchBrowser, screenshot } from './support.js';

for (const {width,lang} of [1280,390,320].flatMap(width=>['en','zh'].map(lang=>({width,lang})))) test(`real Inbox entry preserves dirty guards and mounted editors (${width}/${lang})`,async({page,customerApp:app},testInfo)=>{
 await page.setViewportSize({width,height:900});const clean=await watchBrowser(page);
 testInfo.annotations.push({type:'visual-fixture',description:'Viewport-only real-entry screenshots with authored synthetic messages/artifact and UI-only liveEnabled capability. No model requests.'});
 await page.route('**/api/status',async route=>{const response=await route.fetch();const value=await response.json();await route.fulfill({response,json:{...value,liveEnabled:value.authenticated===true}});});const session=await signInCustomer(page,app);let selectedRecord,firstConversation;
 for(const title of ['Synthetic Inbox A','Synthetic Inbox B']){const response=await apiWrite(page,app,'/api/cases','POST',{title,sourceText:'',fields:[],draftType:'followup',draftText:''});expect(response.status()).toBe(201);selectedRecord=(await response.json()).case;if(!firstConversation){const result=await apiWrite(page,app,`/api/cases/${selectedRecord.id}/conversations`,'POST',{title:'Synthetic first conversation'});expect(result.status()).toBe(201);firstConversation=(await result.json()).conversation;}}
 const conversationResponse=await apiWrite(page,app,`/api/cases/${selectedRecord.id}/conversations`,'POST',{title:'Synthetic saved conversation'});expect(conversationResponse.status()).toBe(201);const {conversation}=await conversationResponse.json();
 app.withDatabase(db=>{for(const [index,role,content] of [[1,'user','Please prepare a follow-up from these synthetic materials.'],[2,'assistant','Synthetic saved conversation. The recipient and sender contact still need confirmation. No message has been sent. '+ 'Keep the source linked and review the facts before finalizing. '.repeat(20)]])db.prepare('INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),session.userId,conversation.id,index,role,content,'complete',null,null,'[]',new Date().toISOString());});
 const artifactResponse=await apiWrite(page,app,`/api/cases/${selectedRecord.id}/artifacts`,'POST',{kind:'followup',title:'Synthetic follow-up draft',status:'draft',content:'Dear Synthetic Intake Team,\n\nPlease confirm the current status and any remaining documentation. This is an authored synthetic draft, not an official form or a sent message.\n\nSynthetic Sender',expectedCaseVersion:selectedRecord.version});expect(artifactResponse.status()).toBe(201);const {artifact}=await artifactResponse.json();
 await page.reload();await english(page);if(lang==='zh')await switchLanguage(page,'zh');await expect(page.locator('.wb')).toBeVisible();
 const toggle=page.getByRole('button',{name:lang==='zh'?"打开列表":'Open conversations',exact:true});
 const rail=page.locator('.wb-rail');
 if(width<960)await toggle.click();
 await expect(rail.locator(`a[href="#chat?conversation=${conversation.id}"]`)).toBeVisible();
 if(width>=960){const row=rail.locator('.chat-record-search-row');const inputBox=await row.locator('input').boundingBox(),buttonBox=await row.locator('button').boundingBox();expect(Math.abs(inputBox.y-buttonBox.y)).toBeLessThanOrEqual(5);expect(buttonBox.x).toBeGreaterThan(inputBox.x);await expect(rail).not.toContainText('Read-only · No AI');}
 if(width>=960)await expect(page.locator('.wb-topbar nav[aria-label]')).toHaveCount(1);
 if(width>=960)await screenshot(page,testInfo,`unified-welcome-${width}-${lang}`,false);
 await rail.locator(`a[href="#chat?conversation=${firstConversation.id}"]`).click();
 const composer=page.locator('.chat-input');await composer.fill('Keep this unsent draft');
 await navigate(page,lang==='zh'?"材料":'Materials & facts');const materialsUrl=page.url();await page.locator('.inbox-skip').focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(materialsUrl);await expect(page.locator('main')).toBeFocused();await navigate(page,lang==='zh'?'对话':'Conversation');await expect(composer).toHaveValue('Keep this unsent draft');
 if(width<960)await toggle.click();
 page.once('dialog',dialog=>dialog.dismiss());await rail.locator(`a[href="#chat?conversation=${conversation.id}"]`).click();
 await expect(composer).toHaveValue('Keep this unsent draft');
 if(width<960)await expect(rail).toHaveAttribute('aria-modal','true');
 page.once('dialog',dialog=>dialog.accept());await rail.locator(`a[href="#chat?conversation=${conversation.id}"]`).click();
 await expect(composer).toHaveValue('');await expect(page.locator('[data-feature="chat"]')).toHaveAttribute('data-case-id',selectedRecord.id);await expect(page.locator('[data-feature="chat"]')).toHaveAttribute('data-conversation-id',conversation.id);
 if(width<960){await expect(rail).toHaveAttribute('inert','');await expect(page.locator('main')).toBeFocused();}
 await expect(page.locator('[data-feature="chat"]')).toContainText('Synthetic saved conversation.');
 const thread=page.locator('.chat-thread');await thread.focus();await page.keyboard.press('End');
 await expect.poll(()=>thread.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
 await composer.fill('Synthetic next message ready to review');
 const send=page.locator('.chat-composer-actions button[type="submit"]');await expect(send).toBeEnabled();
 const assertComposer=async()=>{for(const target of [composer,send]){const box=await target.boundingBox();expect(box).not.toBeNull();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize().height+1);}expect(await page.evaluate(()=>window.scrollY)).toBe(0);};
 await assertComposer();await expect(page.locator(".wb-center nav[aria-label=\"Workspace navigation\"],.wb-center nav[aria-label=\"页面导航\"]")).toHaveCount(0);if(width<960)expect((await page.locator('.wb-topbar').boundingBox()).height).toBeLessThanOrEqual(64);
 // Open the authoritative material editor from this exact conversation's context,
 // save there, and return without promoting chat text or replacing the thread.
 if(width<960)await page.getByRole('button',{name:lang==='zh'?"打开详情":'Open case context',exact:true}).click();
 await page.locator('[data-testid="chat-case-workflow"]').getByRole('button',{name:lang==='zh'?"核对材料":'Review facts and materials',exact:true}).click();
 const canonicalSource=page.getByLabel(lang==='zh'?"材料原文":'Case source text',{exact:true});
 await expect(canonicalSource).toHaveValue('');await canonicalSource.fill('Synthetic material edit from the exact saved conversation.');
 const savedCase=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/cases/${selectedRecord.id}`&&response.request().method()==='PUT');
 await page.getByRole('button',{name:lang==='zh'?"保存事项":'Save case',exact:true}).click();expect((await savedCase).status()).toBe(200);
 await navigate(page,lang==='zh'?'对话':'Conversation');await expect(page.locator('[data-feature="chat"]')).toHaveAttribute('data-conversation-id',conversation.id);await expect(composer).toHaveValue('Synthetic next message ready to review');
 const returnUrl=page.url(),scrollBeforeSettings=await thread.evaluate(node=>node.scrollTop);
 await accountSettings(page);await expect(page.locator('section[aria-label="'+(lang==='zh'?"设置":'Account and settings')+'"]:not([hidden])')).toBeVisible();
 if(width>=960){await expect(page.locator('[data-account-settings]')).toHaveAttribute('aria-current','page');const topbar=page.locator('.wb-topbar');const language=await topbar.getByRole('button',{name:lang==='zh'?'Switch interface to English':'切换界面为中文',exact:true}).boundingBox();const logout=await topbar.getByRole('button',{name:lang==='zh'?"退出登录":'Sign out',exact:true}).boundingBox();expect(language.x).toBeLessThan(logout.x);}
 await screenshot(page,testInfo,`unified-settings-${width}-${lang}`,false);
 await page.getByRole('button',{name:lang==='zh'?"返回":'Back to workspace',exact:true}).click();
 await expect(page).toHaveURL(returnUrl);await expect(composer).toHaveValue('Synthetic next message ready to review');await expect(page.locator('[data-feature="chat"]')).toHaveAttribute('data-conversation-id',conversation.id);expect(Math.abs(await thread.evaluate(node=>node.scrollTop)-scrollBeforeSettings)).toBeLessThanOrEqual(2);
 await noHorizontalOverflow(page);await screenshot(page,testInfo,`real-inbox-${width}-${lang}-populated`,false);
 await page.setViewportSize({width,height:560});await composer.focus();await page.keyboard.press('ArrowLeft');await assertComposer();await screenshot(page,testInfo,`real-inbox-${width}-${lang}-keyboard-resize`,false);await page.setViewportSize({width,height:900});

 if(width<960)await page.getByRole('button',{name:lang==='zh'?"打开详情":'Open case context',exact:true}).click();
 await expect(page.locator('.wb-context')).toContainText('Synthetic follow-up draft');await screenshot(page,testInfo,`real-inbox-${width}-${lang}-context`,false);if(width<960)await page.keyboard.press('Escape');
 await navigate(page,lang==='zh'?'文档':'Documents');await page.locator(`[data-artifact-id="${artifact.id}"]`).getByRole('button').click();await expect(page.locator('#document-body')).toHaveValue(/Dear Synthetic Intake Team/);await screenshot(page,testInfo,`real-inbox-${width}-${lang}-document`,false);await clean();
});

for(const lang of ['en','zh'])test(`Inbox drawers contain focus, close safely and never open from desktop state (${lang})`,async({page,customerApp:app})=>{
 await page.setViewportSize({width:1280,height:900});await signInCustomer(page,app);if(lang==='zh')await switchLanguage(page,'zh');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
 const open=page.getByRole('button',{name:lang==='zh'?"打开详情":'Open case context',exact:true});await open.click();const dialog=page.getByRole('dialog',{name:lang==='zh'?"事项详情":'Case context',exact:true});await expect(dialog).toBeVisible();
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
