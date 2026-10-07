/** Actual React DOM with local fetch fixtures; neither a browser nor a provider test. */
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let server, React, createRoot, SessionProvider, SettingsPage, AccountControls, AuthPanel, root, host;
const originalFetch=globalThis.fetch;
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fixture.invalid',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','Event','getComputedStyle']) Object.defineProperty(globalThis,key,{value: key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key],configurable:true,writable:true});
// Layout is deliberately outside this DOM fixture; real browser verification is separate.
globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
before(async()=>{
  React=await import('react');({createRoot}=await import('react-dom/client'));
  server=await createServer({configFile:'vite.config.js',server:{middlewareMode:true,hmr:false,watch:null,ws:false},appType:'custom'});
  ({SessionProvider}=await server.ssrLoadModule('/lib/session.jsx'));
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
   if(path==='/api/settings' && options.method==='POST') {if(failSave){body={error:'Synthetic secret must never show',code:'PROVIDER_UNAVAILABLE'};code=503;}else{body={...settings,configured:true};}}
   if(path==='/api/register'){body={accepted:true,authenticated:false,next:'check-email-if-eligible',retryAfter:60};code=202;}
   if(path==='/api/login'){status={...owner,role:'trial',canManageSettings:false,username:JSON.parse(options.body).username};body=status;}
   if(path==='/api/settings/test')body={ok:true,model:'deepseek-flash',check:'model-access',chatCompletionTested:false,verifiedAt:'2026-10-07T00:00:00.000Z'};
   if(path==='/api/logout'){status={authenticated:false};body={ok:true};}
   return new Response(JSON.stringify(body),{status:code,headers:{'content-type':'application/json'}});
 };
 return calls;
}
async function render(Component){host=document.createElement('div');document.body.append(host);root=createRoot(host);await React.act(async()=>root.render(React.createElement(SessionProvider,null,React.createElement(Component,{lang:'en'}))));}
async function click(button){await React.act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));}
async function input(element,value){await React.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}));});}
test('ordinary account never mounts provider controls or reads owner settings',async()=>{
 const calls=fixture({...owner,role:'trial',canManageSettings:false,username:'fixture-trial'});
 await render(SettingsPage);
 assert.equal(calls.filter(c=>c.path==='/api/settings').length,0);
 assert.equal(host.querySelector('input[type=password]'),null);
 assert.doesNotMatch(host.textContent,/DeepSeek|API Key/);
});
test('owner key stays blank on read, edits do not post, explicit save clears input',async()=>{
 const calls=fixture(owner,{configured:true,liveEnabled:false,secureSettings:true,keyStorage:'server-memory',apiKey:'unexpected-response-secret'});
 await render(SettingsPage);
 const field=host.querySelector('input[type=password]');assert.ok(field);assert.equal(field.value,'');
 assert.doesNotMatch(host.innerHTML,/unexpected-response-secret/);
 await input(field,'synthetic-key-123456');
 assert.equal(calls.filter(c=>c.method==='POST').length,0);
 await React.act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.deepEqual(calls.find(c=>c.method==='POST').body,{enableLive:false,apiKey:'synthetic-key-123456'});
 assert.equal(host.querySelector('input[type=password]').value,'');
 assert.doesNotMatch(host.innerHTML,/synthetic-key-123456/);
 assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);
});
test('ambiguous save failure clears secret and requires fresh read',async()=>{
 const calls=fixture(owner,undefined,true);await render(SettingsPage);
 await input(host.querySelector('input[type=password]'),'synthetic-key-123456');
 await React.act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls.filter(c=>c.method==='POST').length,1);
 assert.ok(host.querySelector('[role=alert]'));
 assert.equal(host.querySelector('input[type=password]'),null);
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
test('model-access action is explicit and does not claim chat generation passed',async()=>{
 const calls=fixture(owner,{configured:true,liveEnabled:false,secureSettings:true,keyStorage:'server-memory'});await render(SettingsPage);
 assert.equal(calls.filter(c=>c.path==='/api/settings/test').length,0);
 await click([...host.querySelectorAll('button')].find(button=>button.textContent==='Verify model access'));
 assert.deepEqual(calls.find(c=>c.path==='/api/settings/test').body,{});
 assert.match(host.textContent,/Chat generation has not been tested/);
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
