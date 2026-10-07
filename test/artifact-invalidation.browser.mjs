// Actual headless Chromium + HTTP + SQLite regression. Synthetic data; no provider calls.
// Playwright is a test-runner dependency, not a production dependency. See the validation note.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,scryptSync} from 'node:crypto';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {openStorage} from '../storage.js';
const {chromium}=await import(process.env.NESTLET_PLAYWRIGHT_MODULE || 'playwright');

test('a saved final can be invalidated, saved unknown, completed again, and regenerated without a phantom unsaved edit', {timeout:45000}, async context=>{
  const directory=await mkdtemp(join(await realpath(tmpdir()),'nestlet-artifact-browser-'));
  const filename=join(directory,'nestlet.sqlite'),storage=openStorage({filename});
  const confirmedAt=new Date().toISOString();
  const confirmed=value=>({value,source:'Synthetic user-confirmed fixture',confirmed:true,confirmedAt,notApplicable:false,sourceMessageId:null});
  const record=storage.createCase('owner',{title:'Synthetic artifact lifecycle',sourceText:'Property: 128 Example Lane',draftType:'followup',draftText:'',
    fields:['property','owner','pha','caseReference','rent'].map(key=>({key,value:key==='property'?'128 Example Lane':'',source:'Synthetic fixture',confirmed:true,conflict:false})),
    documentContext:{recipientName:confirmed('Example Intake Team'),recipientContact:confirmed('intake@example.invalid'),senderName:confirmed('Example Sender'),senderContact:confirmed('sender@example.invalid')}});
  storage.close();
  const password='public-artifact-browser-fixture',salt=randomBytes(16),hash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,32).toString('base64url')}`;
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:'',NESTLET_DB_PATH:filename,NESTLET_OPERATOR_USERNAME:'owner',NESTLET_OPERATOR_PASSWORD_HASH:hash,DEEPSEEK_API_KEY:'',ENABLE_LIVE_AI:'false',DEEPSEEK_MODEL:'deepseek-flash'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  context.after(async()=>{if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});await rm(directory,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(output)),5000);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});child.stdout.on('data',data=>{if(data.toString().includes('Nestlet available')){clearTimeout(timer);resolve();}});});
  const browser=await chromium.launch({headless:true,...(process.env.NESTLET_CHROMIUM_EXECUTABLE?{executablePath:process.env.NESTLET_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
  context.after(()=>browser.close());
  const browserContext=await browser.newContext(), page=await browserContext.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const login=await browserContext.request.post(base+'/api/login',{data:{password},headers:{Origin:base}});assert.equal(login.status(),200);
  await page.goto(base+'/legacy/');await page.locator('#language').click();
  await page.locator('#case-manager > summary').click();await page.locator('#saved-case').selectOption(record.id);await page.locator('#open-case').click();
  await page.locator('#generate-final').click();await page.locator('#draft').waitFor({state:'visible'});
  const original=await page.locator('#draft').inputValue();assert.match(original,/128 Example Lane/);assert.doesNotMatch(original,/\bDRAFT\b|NOT FOR SUBMISSION/u);
  const originalVersions=(await(await browserContext.request.get(`${base}/api/cases/${record.id}/artifacts`)).json()).artifacts;
  assert.equal(originalVersions.length,1);const firstId=originalVersions[0].id;
  await page.locator('#draft-back').click();await page.locator('#field-0').fill('');await page.locator('#confirm-0').check();
  const savedUnknown=page.waitForResponse(response=>response.url()===`${base}/api/cases/${record.id}`&&response.request().method()==='PUT');
  await page.locator('#save-case').click();assert.equal((await savedUnknown).status(),200);
  await page.waitForFunction(()=>document.querySelector('#case-save-status')?.textContent==='Saved');
  const currentVersions=(await(await browserContext.request.get(`${base}/api/cases/${record.id}/artifacts`)).json()).artifacts;
  assert.equal(currentVersions[0].id,firstId);assert.equal(currentVersions[0].isStale,true);
  const historical=(await(await browserContext.request.get(`${base}/api/artifacts/${firstId}`)).json()).artifact;
  assert.equal(historical.content,original);
  await page.locator('[data-readiness="property"]').fill('256 Example Lane');
  const completed=page.waitForResponse(response=>response.url().endsWith('/document-context')&&response.request().method()==='PATCH');
  await page.locator('#readiness-confirm').click();assert.equal((await completed).status(),200);
  await page.waitForFunction(()=>document.querySelector('#field-0')?.value==='256 Example Lane');
  await page.locator('#generate-final').click();await page.locator('#draft').waitFor({state:'visible'});
  const regenerated=await page.locator('#draft').inputValue();assert.match(regenerated,/256 Example Lane/);assert.doesNotMatch(regenerated,/128 Example Lane/);
  const nextVersions=(await(await browserContext.request.get(`${base}/api/cases/${record.id}/artifacts`)).json()).artifacts;
  assert.equal(nextVersions.length,2);assert.equal(nextVersions.find(item=>item.id===firstId).isStale,true);

  // A real edited document remains dirty until its own version is saved; fact edits must not erase it.
  const unsaved=regenerated+'\nUNSAVED HUMAN EDIT TO PRESERVE';
  await page.locator('#draft').fill(unsaved);await page.locator('#draft-back').click();
  await page.locator('#field-1').fill('Example Updated Owner');await page.locator('#confirm-1').check();
  const saveFacts=page.waitForResponse(response=>response.url()===`${base}/api/cases/${record.id}`&&response.request().method()==='PUT');
  await page.locator('#save-case').click();assert.equal((await saveFacts).status(),200);
  await page.locator('[data-stage="2"]').click();assert.equal(await page.locator('#draft').inputValue(),unsaved);
  assert.equal(await page.locator('#case-save-status').textContent(),'Unsaved changes');
  await page.locator('#save-artifact').click();await page.waitForFunction(()=>document.querySelector('#case-save-status')?.textContent==='Saved');
  const finalVersions=(await(await browserContext.request.get(`${base}/api/cases/${record.id}/artifacts`)).json()).artifacts;
  const edited=(await(await browserContext.request.get(`${base}/api/artifacts/${finalVersions[0].id}`)).json()).artifact;
  assert.equal(edited.status,'draft');assert.match(edited.content,/UNSAVED HUMAN EDIT TO PRESERVE/);
  assert.equal((await(await browserContext.request.get(`${base}/api/artifacts/${firstId}`)).json()).artifact.content,original);
  assert.deepEqual(errors,[]);
});
