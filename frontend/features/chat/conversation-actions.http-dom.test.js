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
let fixture,dom,vite,React,createRoot,Review,ChatPage,SessionProvider,root,host,owner;
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
 ({ConversationActionReview:Review}=await vite.ssrLoadModule('/features/chat/conversation-actions.jsx'));({ChatPage}=await vite.ssrLoadModule('/features/chat/index.jsx'));({SessionProvider}=await vite.ssrLoadModule('/lib/session.jsx'));
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

test('StrictMode preview/cancel writes nothing; double apply persists once with review false and provenance',async()=>{
 const s=await sample(),p=await prepare(s),before=writes().length;
 await mount(s,p,{ready:false});assert.equal(button('Apply as unreviewed suggestions').disabled,true);await click(button('Cancel proposal'));assert.equal(writes().length,before);
 await mount(s,p);await React.act(async()=>{button('Apply as unreviewed suggestions').click();button('Apply as unreviewed suggestions')?.click();});await wait(()=>host.textContent.includes('Suggestions saved as unreviewed'));
 assert.equal(writes().length,before+1);const record=(await owner.api.get(`/api/cases/${s.record.id}`)).case;
 const property=record.fields.find(field=>field.key==='property');assert.equal(property.value,'128 Synthetic Lane');assert.equal(property.confirmed,false);assert.match(property.source,new RegExp(s.messageId));
});
test('real reviewed and unconfirmed conflicts remain visible and cannot be applied',async()=>{
 for(const confirmed of [true,false]){
  const s=await sample({fields:[{key:'property',value:'Existing synthetic address',source:'Synthetic conflict',confirmed,conflict:!confirmed}]}),p=await prepare(s),before=writes().length;
  await mount(s,p);assert.equal(button('Apply as unreviewed suggestions').disabled,true);assert.match(host.textContent,/Conflicting evidence/);assert.equal(writes().length,before);
 }
});
test('English draft apply saves a draft only; stale version yields explicit conflict with no overwrite',async()=>{
 const s=await sample(),p=await prepare(s,'prepare_answer_draft');await mount(s,p);await click(button('Save unreviewed English draft'));await wait(()=>host.textContent.includes('English draft saved as unreviewed'));
 const artifacts=(await owner.api.get(`/api/cases/${s.record.id}/artifacts`)).artifacts;assert.equal(artifacts.length,1);assert.equal(artifacts[0].status,'draft');assert.equal(artifacts[0].sourceMessageId,s.messageId);
 const stale=await sample(),old=await prepare(stale);await owner.api.put(`/api/cases/${stale.record.id}`,{...newCasePayload('Changed elsewhere'),expectedVersion:stale.record.version});
 await mount(stale,old);await click(button('Apply as unreviewed suggestions'));await wait(()=>host.textContent.includes('Nothing was overwritten'));
 assert.equal(button('Apply as unreviewed suggestions'),undefined);assert.doesNotMatch(host.textContent,/Save status is uncertain/);
 const record=(await owner.api.get(`/api/cases/${stale.record.id}`)).case;assert.equal(record.title,'Changed elsewhere');assert.equal(record.fields.find(field=>field.key==='property')?.value||'','');
});
test('lost successful response is uncertain and cannot be replayed; stale identity suppresses late completion',async()=>{
 const s=await sample(),p=await prepare(s,'prepare_answer_draft'),before=writes().length;
 await mount(s,p,{api:{post:async(...args)=>{await owner.api.post(...args);throw {code:'NETWORK_ERROR'};}}});await click(button('Save unreviewed English draft'));await wait(()=>host.textContent.includes('Save status is uncertain'));
 assert.equal(button('Save unreviewed English draft'),undefined);assert.equal(writes().length,before+1);
 const pending=await sample(),proposal=await prepare(pending);let resolve;const gate=new Promise(done=>resolve=done);let applied=0;
 const props={proposal,userId:owner.userId,caseId:pending.record.id,conversationId:pending.conversation.id,ready:true,lang:'en',api:{patch:async()=>{await gate;return {case:{id:pending.record.id,version:2}};}},onApplied:()=>applied++};
 await render(React.createElement(Review,props));await click(button('Apply as unreviewed suggestions'));
 await React.act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Review,{...props,userId:'different-user'}))));
 await React.act(async()=>resolve());await flush();assert.equal(applied,0);assert.doesNotMatch(host.textContent,/Suggestions saved/);
});

test('actual chat defaults to read-only proposals; proposal waits for complete matching saved stream and preserves next input on apply',async()=>{
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
 await fill(host.querySelector('.chat-input'),'Unsent next question survives action');await click(button('Apply as unreviewed suggestions'));await wait(()=>host.textContent.includes('Suggestions saved as unreviewed'));
 assert.equal(host.querySelector('.chat-input').value,'Unsent next question survives action');assert.equal(chatCount,1);
 // A valid proposal followed by a mismatched terminal conversation never becomes actionable.
 const newer=(await owner.api.get(`/api/cases/${s.record.id}`)).case;s.record=newer;mode='wrong-thread';
 await fill(host.querySelector('.chat-input'),'Prepare again');await click(button('Send'));await wait(()=>chatCount===2&&!button('New conversation').disabled);
 assert.equal(button('Apply as unreviewed suggestions'),undefined);assert.equal(writes().length,before+1);
});
