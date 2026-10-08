import { test, expect, signInCustomer, apiWrite } from './customer-case-support.js';
import { english, navigate, noHorizontalOverflow, watchBrowser, screenshot } from './support.js';

for (const width of [1280, 320]) test(`real Inbox entry preserves dirty guards and mounted editors (${width})`,async({page,customerApp:app},testInfo)=>{
 await page.setViewportSize({width,height:900});const clean=await watchBrowser(page);await signInCustomer(page,app);
 for(const title of ['Synthetic Inbox A','Synthetic Inbox B']){const response=await apiWrite(page,app,'/api/cases','POST',{title,sourceText:'',fields:[],draftType:'followup',draftText:''});expect(response.status()).toBe(201);}
 await page.reload();await english(page);await expect(page.locator('.wb')).toBeVisible();
 const toggle=page.getByRole('button',{name:'Open customers and cases',exact:true});
 const rail=page.locator('.wb-rail');
 if(width<960)await toggle.click();
 await rail.getByRole('button',{name:'Synthetic Inbox A',exact:true}).click();
 const composer=page.locator('.chat-input');await composer.fill('Keep this unsent draft');
 await navigate(page,'Materials & facts');await navigate(page,'Conversation');await expect(composer).toHaveValue('Keep this unsent draft');
 if(width<960)await toggle.click();
 page.once('dialog',dialog=>dialog.dismiss());await rail.getByRole('button',{name:'Synthetic Inbox B',exact:true}).click();
 await expect(composer).toHaveValue('Keep this unsent draft');
 if(width<960)await expect(rail).toHaveAttribute('aria-modal','true');
 page.once('dialog',dialog=>dialog.accept());await rail.getByRole('button',{name:'Synthetic Inbox B',exact:true}).click();
 await expect(composer).toHaveValue('');await expect(page.locator('[data-feature="chat"]')).toContainText('Synthetic Inbox B');
 if(width<960){await expect(rail).toHaveAttribute('inert','');await expect(page.locator('main')).toBeFocused();}
 await noHorizontalOverflow(page);await screenshot(page,testInfo,`real-inbox-${width}`);await clean();
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
