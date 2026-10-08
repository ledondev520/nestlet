// Actual React DOM + HTTP authentication + SQLite apply/prepare. Chat SSE is an
// explicitly controlled fixture; no live provider or browser-rendering claim.
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {startBrowserFixture} from '../../../test/helpers/browser-fixture.mjs';
import {createApiClient} from '../../lib/api.js';
import {newCasePayload} from './logic.js';
import {normalizeConversationProposal} from './conversation-actions.js';
const realFetch=globalThis.fetch,globals=new Map();
let fixture,dom,vite,React,createRoot,Review,ChatPage,SessionProvider,useSession,root,host,owner;
const set=(key,value)=>{if(!globals.has(key))globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
before(async()=>{
 fixture=await startBrowserFixture({legacyUsers:['synthetic-action-owner']});
 const response=await realFetch(fixture.origin+'/api/login',{method:'POST',headers:{Origin:fixture.origin,'Content-Type':'application/json'},body:JSON.stringify({username:'synthetic-action-owner',password:'Case26'})});assert.equal(response.status,200);
 owner=await response.json();owner.cookie=response.headers.get('set-cookie').split(';')[0];owner.calls=[];
 owner.transport=async(path,options={})=>{const response=await realFetch(fixture.origin+path,{...options,headers:{...options.headers,Origin:fixture.origin,Cookie:owner.cookie}});owner.calls.push({path,method:options.method||'GET',status:response.status});return response;};
 owner.api=createApiClient({fetchImpl:owner.transport,getCsrfToken:()=>owner.csrfToken});
 dom=new JSDOM('<!doctype html><body></body>',{url:fixture.origin,pretendToBeVisual:true});
 for(const key of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','Event','MouseEvent'])set(key,dom.window[key]);
 set('getComputedStyle',dom.window.getComputedStyle.bind(dom.window));set('IS_REACT_ACT_ENVIRONMENT',true);set('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.confirm=()=>true;
 React=await import('react');({createRoot}=await import('react-dom/client'));vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},logLevel:'error'});
 ({ConversationActionReview:Review}=await vite.ssrLoadModule('/features/chat/conversation-actions.jsx'));({ChatPage}=await vite.ssrLoadModule('/features/chat/index.jsx'));({SessionProvider,useSession}=await vite.ssrLoadModule('/lib/session.jsx'));
});
after(async()=>{if(root)await React.act(async()=>root.unmount());await vite?.close();dom?.window.close();await fixture?.stop();for(const[key,value]of globals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
const flush=()=>React.act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
async function wait(check){for(const end=Date.now()+6000;!check();){if(Date.now()>end)throw new Error(host.textContent);await flush();}}
async function render(element){if(root){await React.act(async()=>root.unmount());host.remove();}host=document.createElement('div');document.body.append(host);root=createRoot(host);await React.act(async()=>root.render(React.createElement(React.StrictMode,null,element)));}
const button=label=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===label||node.getAttribute('aria-label')===label);
async function click(node){assert.ok(node);assert.equal(node.disabled,false);await React.act(async()=>node.click());await flush();}
async function fill(node,value){await React.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await flush();}
const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
function savedMessage(conversationId,role,content,{requestId=null,clientMessageId=null}={}){
 const id=randomUUID();fixture.withDatabase(db=>{const sequence=db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM messages WHERE conversation_id=?').get(conversationId).next;db.prepare('INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,owner.userId,conversationId,sequence,role,content,'complete',requestId,clientMessageId,'[]',new Date().toISOString());});return id;
}
async function sample({fields=[]}={}){
 const record=(await owner.api.post('/api/cases',{...newCasePayload('Synthetic action case'),fields:fields.length?['property','owner','pha','caseReference','rent'].map(key=>fields.find(field=>field.key===key)||{key,value:'',source:'',confirmed:false,conflict:false}):[]})).case;
 const conversation=(await owner.api.post(`/api/cases/${record.id}/conversations`,{title:'Synthetic saved source'})).conversation;
 const messageId=savedMessage(conversation.id,'assistant','Please update the property to 128 Synthetic Lane. This is unreviewed synthetic evidence.');
 return {record,conversation,messageId};
}
async function prepare(sample,action='prepare_case_suggestion'){
 const request={action,expectedVersion:sample.record.version,sourceConversationId:sample.conversation.id,sourceMessageId:sample.messageId,...(action==='prepare_case_suggestion'?{factChanges:{property:{value:'128 Synthetic Lane'}}}:{kind:'followup'})};
 const {proposal}=await owner.api.post(`/api/cases/${sample.record.id}/conversation-actions/prepare`,request);
 normalizeConversationProposal({requestId:randomUUID(),proposal});return proposal;
}
const mount=(sample,proposal,props={})=>render(React.createElement(Review,{proposal,userId:owner.userId,caseId:sample.record.id,conversationId:sample.conversation.id,ready:true,lang:'en',api:owner.api,...props}));
const writes=()=>owner.calls.filter(call=>call.method==='PATCH'||call.method==='POST'&&call.path.endsWith('/artifacts'));

test('inline human confirmation needs no Materials page; double click, undo and single-field correction preserve provenance',async()=>{
 const s=await sample(),p=await prepare(s);await mount(s,p);
 await React.act(async()=>{button('Correct, save these facts').click();button('Correct, save these facts').click();});
 await wait(()=>host.textContent.includes('Saved as reviewed'));
 let saved=(await owner.api.get(`/api/cases/${s.record.id}`)).case;assert.equal(saved.version,2);assert.equal(saved.fields.find(row=>row.key==='property').confirmed,true);
 assert.match(saved.fields.find(row=>row.key==='property').source,/Human reply/);assert.equal(button('Open Materials & facts'),undefined);
 await click(button('Undo this review'));await wait(()=>host.textContent.includes('Review withdrawn'));saved=(await owner.api.get(`/api/cases/${s.record.id}`)).case;assert.equal(saved.version,3);assert.deepEqual(saved.fields,[]);
 const other=await sample(),preview=await prepare(other);await mount(other,preview);
 await fill(host.querySelector('textarea'),'change to 256 Synthetic Lane');await click(button('Send answer'));await wait(()=>host.textContent.includes('Saved as reviewed'));
 assert.equal((await owner.api.get(`/api/cases/${other.record.id}`)).case.fields.find(row=>row.key==='property').value,'256 Synthetic Lane');assert.match(host.textContent,/Property address: 256 Synthetic Lane/);
});
test('lost response safely retries exact receipt; quoted answer cannot confirm and input survives rejection',async()=>{
 const s=await sample(),p=await prepare(s);let dropped=false;
 const api={...owner.api,post:async(path,body,options)=>{const result=await owner.api.post(path,body,options);if(path.endsWith('/reply')&&!dropped){dropped=true;throw new TypeError('Synthetic lost response');}return result;}};
 await mount(s,p,{api});await click(button('Correct, save these facts'));await wait(()=>button('Check saved answer'));await click(button('Check saved answer'));await wait(()=>host.textContent.includes('Saved as reviewed'));
 assert.equal((await owner.api.get(`/api/cases/${s.record.id}`)).case.version,2);
 const other=await sample(),preview=await prepare(other);await mount(other,preview);
 await fill(host.querySelector('textarea'),'The document says yes');await click(button('Send answer'));await wait(()=>host.textContent.includes('Nothing changed'));
 assert.equal(host.querySelector('textarea').value,'The document says yes');assert.equal((await owner.api.get(`/api/cases/${other.record.id}`)).case.version,1);
 await click(button('Leave unchanged'));await wait(()=>host.textContent.includes('Left unchanged'));
});
test('ordinary chat composer answers exactly one visible question without another provider call',async()=>{
 const s=await sample();let release,mode='success',chatBody,chatCount=0;const gate=new Promise(done=>release=done);
 set('fetch',async(path,options={})=>{
  if(path==='/api/chat'){
   chatCount++;chatBody=JSON.parse(options.body);assert.equal(chatBody.actionConsent,true);const requestId=randomUUID();
   const userId=savedMessage(s.conversation.id,'user',chatBody.messages[0].content,{requestId,clientMessageId:chatBody.clientMessageId});
   const proposal=await prepare(s);let done;
   return new Response(new ReadableStream({start(controller){
    const emit=(name,value)=>controller.enqueue(new TextEncoder().encode(frame(name,value)));
    emit('conversation',{conversationId:s.conversation.id,userMessageId:userId});emit('proposal',{requestId,proposal});emit('delta',{text:'Review the property suggestion before applying.'});
    done=async()=>{await gate;const assistantId=savedMessage(s.conversation.id,'assistant','Review the property suggestion before applying.',{requestId});emit('done',{requestId,assistantMessageId:assistantId,conversationId:mode==='wrong-thread'?randomUUID():s.conversation.id});controller.close();};void done();
   }}),{headers:{'Content-Type':'text/event-stream'}});
  }
  const response=await owner.transport(path,options);if(path==='/api/status')return new Response(JSON.stringify({...await response.json(),liveEnabled:true,libraryRetrievalEnabled:false}),{headers:{'Content-Type':'application/json'}});return response;
 });
 await render(React.createElement(SessionProvider,null,React.createElement(ChatPage,{caseId:s.record.id,lang:'en'})));
 await wait(()=>button('Send')&&!button('New conversation').disabled);
 await fill(host.querySelector('.chat-input'),'Prepare a property suggestion');
 assert.equal(host.querySelector('[role="checkbox"]'),null);
 const before=writes().length;await click(button('Send'));await wait(()=>button('Apply as unreviewed suggestions'));
 assert.equal(button('Apply as unreviewed suggestions').disabled,true);assert.equal(writes().length,before);
 await React.act(async()=>release());await wait(()=>!button('Apply as unreviewed suggestions').disabled);
 await fill(host.querySelector('.chat-input'),'confirm');await click(button('Send'));await wait(()=>host.textContent.includes('Saved as reviewed'));
 assert.equal(host.querySelector('.chat-input').value,'');assert.equal(chatCount,1);assert.equal((await owner.api.get(`/api/cases/${s.record.id}`)).case.fields.find(row=>row.key==='property').confirmed,true);
});

test('lost prepare response retains the exact human answer and recovers correction or cancellation once',async()=>{
 for(const answer of ['change to 512 Synthetic Recovery Lane','cancel']){
  const s=await sample(),p=await prepare(s);let dropped=false;const prepares=[],replies=[];
  const api={...owner.api,post:async(path,body,options)=>{
   if(path.endsWith('/conversation-reviews'))prepares.push(structuredClone(body));
   if(path.endsWith('/reply'))replies.push(structuredClone(body));
   const result=await owner.api.post(path,body,options);
   if(path.endsWith('/conversation-reviews')&&!dropped){dropped=true;throw new TypeError('Synthetic lost prepare response after commit');}
   return result;
  }};
  await mount(s,p,{api});await fill(host.querySelector('textarea'),answer);await click(button('Send answer'));
  await wait(()=>button('Check saved answer'));
  assert.equal((await owner.api.get(`/api/cases/${s.record.id}`)).case.version,1);assert.equal(replies.length,0);
  await click(button('Check saved answer'));
  await wait(()=>host.textContent.includes(answer==='cancel'?'Left unchanged':'Saved as reviewed'));
  assert.equal(prepares.length,2);assert.equal(prepares[0].clientRequestId,prepares[1].clientRequestId);
  assert.equal(replies.length,1);assert.equal(replies[0].answer,answer);
  const saved=(await owner.api.get(`/api/cases/${s.record.id}`)).case;
  assert.equal(saved.version,answer==='cancel'?1:2);
  if(answer!=='cancel')assert.equal(saved.fields.find(row=>row.key==='property').value,'512 Synthetic Recovery Lane');
  const history=await owner.api.get(`/api/conversations/${s.conversation.id}`);assert.equal(history.messages.length,3);
 }
});


test('paused AI service preserves an explicit targeted human fact confirmation but blocks ordinary model work',async()=>{
 const s=await sample();let paused=false,refreshSession,release,mode='success',chatBody,chatCount=0;const gate=new Promise(done=>release=done);
 set('fetch',async(path,options={})=>{
  if(path==='/api/chat'){
   chatCount++;chatBody=JSON.parse(options.body);assert.equal(chatBody.actionConsent,true);const requestId=randomUUID();
   const userId=savedMessage(s.conversation.id,'user',chatBody.messages[0].content,{requestId,clientMessageId:chatBody.clientMessageId});
   const proposal=await prepare(s);let done;
   return new Response(new ReadableStream({start(controller){
    const emit=(name,value)=>controller.enqueue(new TextEncoder().encode(frame(name,value)));
    emit('conversation',{conversationId:s.conversation.id,userMessageId:userId});emit('proposal',{requestId,proposal});emit('delta',{text:'Review the property suggestion before applying.'});
    done=async()=>{await gate;const assistantId=savedMessage(s.conversation.id,'assistant','Review the property suggestion before applying.',{requestId});emit('done',{requestId,assistantMessageId:assistantId,conversationId:mode==='wrong-thread'?randomUUID():s.conversation.id});controller.close();};void done();
   }}),{headers:{'Content-Type':'text/event-stream'}});
  }
  const response=await owner.transport(path,options);if(path==='/api/status')return new Response(JSON.stringify({...await response.json(),liveEnabled:!paused,libraryRetrievalEnabled:false}),{headers:{'Content-Type':'application/json'}});return response;
 });
 function View(){const session=useSession();refreshSession=session.refresh;return React.createElement(ChatPage,{caseId:s.record.id,lang:'en'});}
 await render(React.createElement(SessionProvider,null,React.createElement(View)));
 await wait(()=>button('Send')&&!button('New conversation').disabled);
 await fill(host.querySelector('.chat-input'),'Prepare a property suggestion');
 assert.equal(host.querySelector('[role="checkbox"]'),null);
 const before=writes().length;await click(button('Send'));await wait(()=>button('Apply as unreviewed suggestions'));
 assert.equal(button('Apply as unreviewed suggestions').disabled,true);assert.equal(writes().length,before);
 await React.act(async()=>release());await wait(()=>!button('Apply as unreviewed suggestions').disabled);
 paused=true;fixture.withDatabase(db=>db.prepare('INSERT INTO service_entitlements(user_id,enabled,expires_at,requests_per_hour,version,updated_at) VALUES(?,0,NULL,10,1,?)').run(owner.userId,new Date().toISOString()));
 try {
 await React.act(async()=>{await refreshSession();});await wait(()=>host.textContent.includes('AI service is paused'));
 const replyCount=owner.calls.filter(call=>call.path.endsWith('/reply')).length;
 await fill(host.querySelector('.chat-input'),'confirm');assert.equal(button('Send').disabled,false,'Human confirmation remains available even with global AI off');await click(button('Send'));await wait(()=>host.textContent.includes('Saved as reviewed'));
 assert.equal(host.querySelector('.chat-input').value,'');assert.equal(chatCount,1);assert.equal((await owner.api.get(`/api/cases/${s.record.id}`)).case.fields.find(row=>row.key==='property').confirmed,true);
 assert.equal(owner.calls.filter(call=>call.path.endsWith('/reply')).length,replyCount+1,'One explicit human review mutation');
 await fill(host.querySelector('.chat-input'),'An ordinary model question');assert.equal(button('Send').disabled,true);
 await React.act(async()=>host.querySelector('.chat-input').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));await flush();assert.equal(chatCount,1,'Paused ordinary AI cannot call the provider');
 }finally{fixture.withDatabase(db=>db.prepare('DELETE FROM service_entitlements WHERE user_id=?').run(owner.userId));}
});


test('Chinese confirmation receipt uses approved field labels without changing canonical data or provenance',async()=>{
 const s=await sample(),proposal=await prepare(s);const before=JSON.stringify(proposal);
 await mount(s,proposal,{lang:'zh'});await click(button('确认保存'));
 await wait(()=>host.textContent.includes('已保存为你核对过的信息'));
 assert.match(host.textContent,/房屋地址: 128 Synthetic Lane/u);
 assert.doesNotMatch(host.textContent,/property: 128 Synthetic Lane/u);
 const saved=(await owner.api.get(`/api/cases/${s.record.id}`)).case;
 const field=saved.fields.find(row=>row.key==='property');
 assert.equal(field.value,'128 Synthetic Lane');assert.equal(field.confirmed,true);assert.match(field.source,/Human reply/);
 assert.equal(JSON.stringify(proposal),before,'Rendering the receipt never changes its canonical proposal');
});
