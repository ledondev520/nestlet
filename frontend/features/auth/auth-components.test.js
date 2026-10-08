/** Actual React DOM with local fetch fixtures; neither a browser nor a provider test. */
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let ModelSettingsPopover, server, React, createRoot, SessionProvider, SettingsPage, AccountControls, AuthPanel, ModelSettingsForm, useSession, root, host;
const originalFetch=globalThis.fetch;
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fixture.invalid',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','Event','CustomEvent','NodeFilter','HTMLInputElement','getComputedStyle']) Object.defineProperty(globalThis,key,{value: key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key],configurable:true,writable:true});
// Layout is deliberately outside this DOM fixture; real browser verification is separate.
globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
before(async()=>{
  React=await import('react');({createRoot}=await import('react-dom/client'));
  server=await createServer({configFile:'vite.config.js',server:{middlewareMode:true,hmr:false,watch:null,ws:false},appType:'custom'});
  ({SessionProvider,useSession}=await server.ssrLoadModule('/lib/session.jsx'));
  ({ModelSettingsPopover}=await server.ssrLoadModule('/components/model-settings-popover.jsx'));
  ({ModelSettingsForm}=await server.ssrLoadModule('/features/auth/model-settings-form.jsx'));
  ({SettingsPage,AccountControls,AuthPanel}=await server.ssrLoadModule('/features/auth/index.js'));
});
afterEach(async()=>{if(root)await React.act(async()=>root.unmount());root=null;host?.remove();globalThis.fetch=originalFetch;});
after(async()=>{await server?.close();dom.window.close();});
const owner={authenticated:true,userId:'fixture-owner',username:'owner',role:'owner',canManageSettings:true,authConfigured:true,secureSettings:true,secureLogin:true,csrfToken:'fixture-csrf'};
function fixture(status,settings={configured:false,liveEnabled:false,secureSettings:true,keyStorage:null},failSave=false){
 const calls=[];
 globalThis.fetch=async(path,options={})=>{
   calls.push({path,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
   let body=path==='/api/status'?status:settings,code=200;
   if(path==='/api/settings' && options.method==='POST') {if(failSave){body={error:'Synthetic secret must never show',code:'PROVIDER_UNAVAILABLE'};code=503;}else{body={...settings,configured:true,liveEnabled:true,connectionVerifiedAt:'2026-10-08T00:00:00.000Z',check:'chat-completion',chatCompletionTested:true};}}
   if(path==='/api/register'){body={accepted:true,authenticated:false,next:'check-email-if-eligible',retryAfter:60};code=202;}
   if(path==='/api/login'){status={...owner,role:'trial',canManageSettings:false,username:JSON.parse(options.body).username};body=status;}
   if(path==='/api/settings/test')body={ok:true,model:'deepseek-flash',check:'model-access',chatCompletionTested:false,verifiedAt:'2026-10-07T00:00:00.000Z'};
   if(path==='/api/logout'){status={authenticated:false};body={ok:true};}
   return new Response(JSON.stringify(body),{status:code,headers:{'content-type':'application/json'}});
 };
 return calls;
}
async function render(Component,props={}){host=document.createElement('div');document.body.append(host);root=createRoot(host);await React.act(async()=>root.render(React.createElement(SessionProvider,null,React.createElement(Component,{lang:'en',...props}))));}
function FormHarness() { return React.createElement(ModelSettingsForm,{lang:'en',session:useSession()}); }
async function click(button){await React.act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));}
async function input(element,value){await React.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}));});}
test('ordinary account never mounts provider controls or reads owner settings',async()=>{
 const calls=fixture({...owner,role:'trial',canManageSettings:false,username:'fixture-trial'});
 await render(SettingsPage);
 assert.equal(calls.filter(c=>c.path==='/api/settings').length,0);
 assert.equal(host.querySelector('input[type=password]'),null);
 assert.equal(host.querySelector('[aria-label="Model settings"]'),null);
 assert.doesNotMatch(host.textContent,/API Key/);
});
test('owner key stays blank on read, edits do not post, explicit save clears input',async()=>{
 const calls=fixture(owner,{configured:true,liveEnabled:false,secureSettings:true,keyStorage:'server-memory',apiKey:'unexpected-response-secret'});
 await render(FormHarness);
 const field=host.querySelector('input[type=password]');assert.ok(field);assert.equal(field.value,'');
 assert.doesNotMatch(host.innerHTML,/unexpected-response-secret/);
 await input(field,'synthetic-key-123456');
 assert.equal(calls.filter(c=>c.method==='POST').length,0);
 await React.act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.deepEqual(calls.find(c=>c.method==='POST').body,{enableLive:true,apiKey:'synthetic-key-123456'});
 assert.equal(host.querySelector('input[type=password]').value,'');
 assert.doesNotMatch(host.innerHTML,/synthetic-key-123456/);
 assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);
});
test('ambiguous save failure clears secret and requires fresh read',async()=>{
 const calls=fixture(owner,undefined,true);await render(FormHarness);
 await input(host.querySelector('input[type=password]'),'synthetic-key-123456');
 await React.act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls.filter(c=>c.method==='POST').length,1);
 assert.ok(host.querySelector('[role=alert]'));
 assert.equal(host.querySelector('input[type=password]').value,'');
 assert.ok(calls.filter(c=>c.path==='/api/settings' && c.method==='GET').length>=2);
 assert.doesNotMatch(host.textContent,/Synthetic secret must never show|synthetic-key-123456/);
});
test('logout cancellation sends nothing; explicit confirmation sends logout once',async()=>{
 const calls=fixture(owner);await render(AccountControls);
 let prompt='';window.confirm=text=>{prompt=text;return false;};
 await click(host.querySelector('button'));assert.match(prompt,/unsaved/i);assert.equal(calls.filter(c=>c.method==='POST').length,0);
 window.confirm=()=>true;await click(host.querySelector('button'));
 assert.equal(calls.filter(c=>c.path==='/api/logout').length,1);assert.equal(host.textContent,'');
});

test('email registration requires confirmation and stays signed out on generic202',async()=>{
 const calls=fixture({authenticated:false,authConfigured:true,secureLogin:true,registrationEnabled:true,emailDeliveryConfigured:true});await render(AuthPanel);
 await click([...host.querySelectorAll('button')].find(button=>button.textContent==='Register'));
 await input(host.querySelector('[name=email]'),'synthetic@example.invalid');
 await input(host.querySelector('[name=password]'),'123456');
 await input(host.querySelector('[name=passwordConfirmation]'),'654321');
 await React.act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls.filter(c=>c.method==='POST').length,0);assert.ok(host.querySelector('[role=alert]'));
 await input(host.querySelector('[name=passwordConfirmation]'),'123456');
 await React.act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.deepEqual(calls.find(c=>c.path==='/api/register').body,{email:'synthetic@example.invalid',password:'123456',passwordConfirmation:'123456'});
 assert.equal(host.querySelector('input[type=password]'),null);assert.match(host.textContent,/Check your inbox if eligible/);assert.doesNotMatch(host.textContent,/Signed in/);assert.equal(calls.filter(c=>c.path==='/api/status').length,1);
});
test('model settings has only explicit Save and never calls the obsolete test endpoint',async()=>{
 const calls=fixture(owner,{configured:true,liveEnabled:false,secureSettings:true,keyStorage:'server-memory'});await render(FormHarness);
 assert.deepEqual([...host.querySelectorAll('button')].map(button=>button.textContent),['Save']);
 assert.equal(calls.filter(c=>c.method==='POST').length,0);
});

test('remembered login uses native autofill values and stores only username',async()=>{
 const calls=fixture({authenticated:false,authConfigured:true,secureLogin:true,registrationEnabled:true});await render(AuthPanel);
 const name=host.querySelector('[name=username]'), password=host.querySelector('[name=password]');
 assert.equal(name.autocomplete,'username');assert.equal(password.autocomplete,'current-password');
 // Password managers can fill native values without firing a React change event.
 Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(name,'synthetic-user');
 Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(password,'fixture-password');
 await click(host.querySelector('[role=checkbox]'));
 assert.equal(name.value,'synthetic-user');assert.equal(password.value,'fixture-password');
 await React.act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.deepEqual(calls.find(c=>c.path==='/api/login').body,{username:'synthetic-user',password:'fixture-password',rememberMe:true});
 assert.equal(window.localStorage.getItem('nestlet.remembered-account'),'synthetic-user');
 assert.doesNotMatch(JSON.stringify({...window.localStorage}),/fixture-password/);
 window.localStorage.clear();
});

 test('settings popover clears an unsaved key on Escape, close and navigation', async()=>{
  const calls=fixture(owner);
  await render(ModelSettingsPopover);
  const trigger=[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='Model settings');
  assert.ok(trigger); assert.equal(calls.filter(c=>c.path==='/api/settings').length,0);
  await click(trigger);
  let panel=document.querySelector('[role=dialog]'); assert.ok(panel);
  assert.equal(panel.querySelectorAll('input').length,1);
  await input(panel.querySelector('input'),'synthetic-key-123456');
  await React.act(async()=>panel.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('[role=dialog]'),null);
  await click(trigger); panel=document.querySelector('[role=dialog]'); assert.equal(panel.querySelector('input').value,'');
  await input(panel.querySelector('input'),'synthetic-key-123456');
  await click(panel.querySelector('[aria-label="Close model settings"]'));
  await click(trigger); panel=document.querySelector('[role=dialog]'); assert.equal(panel.querySelector('input').value,'');
  await input(panel.querySelector('input'),'synthetic-key-123456');
  await React.act(async()=>window.dispatchEvent(new window.Event('hashchange')));
  assert.equal(document.querySelector('[role=dialog]'),null);
  assert.equal(calls.filter(c=>c.method==='POST').length,0);
 });


test('Chinese login keeps the eight-hour limit and readable non-enumerating email warning', async()=>{
 const calls=fixture({authenticated:false,authConfigured:true,secureLogin:true,registrationEnabled:true,emailDeliveryConfigured:true});
 await render(AuthPanel,{lang:'zh'});
 assert.match(host.textContent,/欢迎回来/);
 const checkbox=host.querySelector('[role=checkbox]');
 assert.equal(document.getElementById(checkbox.getAttribute('aria-describedby')).textContent,'8小时内无需重新登录');
 await click([...host.querySelectorAll('button')].find(button=>button.textContent==='注册'));
 await input(host.querySelector('[name=email]'),'synthetic@example.invalid');
 await input(host.querySelector('[name=password]'),'123456');
 await input(host.querySelector('[name=passwordConfirmation]'),'123456');
 await React.act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 const warning=[...host.querySelectorAll('[data-slot=card-description]')].find(node=>node.textContent.includes('此提示不说明账号是否存在'));
 assert.ok(warning);assert.ok(warning.classList.contains('whitespace-pre-line'));
 assert.match(warning.textContent,/符合条件时，系统会发送邮件。\n此提示不说明账号是否存在。\n也不保证邮件已经送达。/);
 assert.match(host.textContent,/新账号验证后会自动登录/);
 assert.equal(calls.filter(c=>c.path==='/api/register').length,1);
});

test('Chinese model copy preserves provider identity, real-check quota and current-key failure meanings', async()=>{
 const calls=fixture(owner,{configured:true,liveEnabled:false,secureSettings:true,keyStorage:'server-memory'});
 function ChineseForm(){return React.createElement(ModelSettingsForm,{lang:'zh',session:useSession()});}
 await render(ChineseForm);
 assert.match(host.textContent,/助手设置/);assert.match(host.textContent,/填写DeepSeek API Key/);
 assert.match(host.textContent,/服务重启后，需重新填写密钥/);
 const detail=[...host.querySelectorAll('details p')].find(node=>node.textContent.includes('检查失败会保留原有密钥'));
 assert.equal(detail.textContent,'保存时会检查一次，成功后启用助手。\n检查失败会保留原有密钥。\n检查会消耗少量模型额度。');
 assert.ok(detail.classList.contains('whitespace-pre-line'));
 assert.equal(calls.filter(c=>c.method==='POST').length,0);
});
