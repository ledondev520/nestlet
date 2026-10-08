// Development DOM diagnostics with controlled HTTP/SSE responses. NOT real provider or browser acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
const identity={userId:randomUUID(),authenticated:true,role:'trial',csrfToken:'public-test-csrf',liveEnabled:true};
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function mount({caseId=null,fetchHandler,status=identity,recovery=null,guidanceAgency='unknown',permissionDecision='allow',permissionHandler,statusHandler}={}){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/next/',pretendToBeVisual:true});
  const original=new Map(); const set=(key,value)=>{original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
  for(const key of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','Event','CustomEvent','MouseEvent','NodeFilter','HTMLInputElement'])set(key,dom.window[key]);
  set('getComputedStyle',dom.window.getComputedStyle.bind(dom.window));set('IS_REACT_ACT_ENVIRONMENT',true);
  set('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  dom.window.confirm=()=>true;dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const requests=[];let permissionFixture={decision:permissionDecision,version:permissionDecision==='unset'?0:1,provider:{id:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash'},policyVersion:'library-retrieval-v1',category:'saved-library-excerpts',updatedAt:null};
  set('fetch',async(path,options={})=>{requests.push({path,options});if(path==='/api/status')return statusHandler?statusHandler(options):response(status);if(path==='/api/library-permission'){if(permissionHandler)return permissionHandler(options);if(options.method==='PUT'){const body=JSON.parse(options.body);assert.equal(body.expectedVersion,permissionFixture.version);permissionFixture={...permissionFixture,decision:body.decision,version:permissionFixture.version+1};}return response(permissionFixture);}return fetchHandler(path,options);});
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},logLevel:'error'});
  const React=await import('react');const {createRoot}=await import('react-dom/client');
  const {SessionProvider,useSession}=await vite.ssrLoadModule('/lib/session.jsx');const {ChatPage}=await vite.ssrLoadModule('/features/chat/index.jsx');
  const {DraftWorkspaceProvider}=await vite.ssrLoadModule('/lib/suspended-draft.jsx');
  const {draftVault}=await vite.ssrLoadModule('/lib/draft-vault.js');const workspaceKey=randomUUID();
  if(recovery){draftVault.verifyUser(status.userId);assert.equal(draftVault.write({userId:status.userId,workspaceKey,feature:'chat'},recovery),true);draftVault.suspend(status.userId);}
  const root=createRoot(dom.window.document.getElementById('root'));
  let selected=caseId,sessionApi,dirty=false;const markDirty=value=>{dirty=value;};
  function Workspace(){const session=useSession();sessionApi=session;return session.status.authenticated?React.createElement(DraftWorkspaceProvider,{userId:session.status.userId,workspaceKey},React.createElement(ChatPage,{lang:'en',caseId:selected,guidanceAgency,onDirtyChange:markDirty,onCaseChange:id=>{selected=id;root.render(render());}})):null;}
  const render=()=>React.createElement(SessionProvider,null,React.createElement(Workspace));
  await React.act(async()=>{root.render(render());await tick();});
  const flush=async()=>{await React.act(async()=>{await tick();});};
  const setCase=async id=>{selected=id;await React.act(async()=>{root.render(render());await tick();});};
  const button=text=>[...dom.window.document.querySelectorAll('button')].find(node=>node.textContent===text||node.getAttribute('aria-label')===text);
  const click=async element=>{assert.ok(element,'Expected control');await React.act(async()=>{element.click();await tick();});};
  const type=async text=>{const input=dom.window.document.querySelector('textarea');assert.ok(input);await React.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await tick();});};
  const close=async()=>{await React.act(async()=>{root.unmount();await tick();});await React.act(async()=>{await tick();});await vite.close();dom.window.close();for(const[key,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
  return{dom,requests,flush,isDirty:()=>dirty,setCase,setStatus:async next=>{status=next;await React.act(async()=>{await sessionApi.refresh();await tick();});},button,click,type,close,readDraft:()=>draftVault.read({userId:status.userId,workspaceKey,feature:'chat'})};
}

test('development React: failed case creation retains composer and cannot fall back to transient chat',async context=>{
  const app=await mount({fetchHandler:async(path)=>path==='/api/cases'?response({code:'CASE_CONFLICT'},409):response({},500)});context.after(app.close);
  await app.type('Synthetic question retained after failed creation');

  await app.click(app.button('Send'));await app.flush();
  assert.equal(app.requests.filter(item=>item.path==='/api/cases'&&item.options.method==='POST').length,1);
  assert.equal(app.requests.some(item=>item.path==='/api/chat'),false);
  assert.equal(app.dom.window.document.querySelector('textarea').value,'Synthetic question retained after failed creation');
  assert.match(app.dom.window.document.body.textContent,/updated elsewhere/);
});

test('development React: a same-workspace saved-case binding keeps the unsent composer',async context=>{
  const id=randomUUID();const app=await mount({fetchHandler:async(path)=>path.endsWith('/conversations')?response({conversations:[]}):response({case:{id,title:'Synthetic newly saved case'}})});context.after(app.close);
  await app.type('Do not replace this unsent question');await app.setCase(id);await app.flush();
  assert.equal(app.dom.window.document.querySelector('textarea').value,'Do not replace this unsent question');
  assert.equal(app.dom.window.document.querySelector('.chat-toolbar [data-slot="card-title"]').textContent,'Conversation');
});

test('development React: a late prior-case conversation read cannot populate the selected case',async context=>{
  const first=randomUUID(),second=randomUUID(),conversation=randomUUID(),late=deferred();
  const app=await mount({caseId:first,fetchHandler:async(path)=>{
    if(path===`/api/cases/${first}`)return response({case:{id:first,title:'First synthetic case'}});
    if(path===`/api/cases/${first}/conversations`)return response({conversations:[{id:conversation,caseId:first,title:'Old conversation'}]});
    if(path===`/api/conversations/${conversation}`)return late.promise;
    if(path===`/api/cases/${second}`)return response({case:{id:second,title:'Second synthetic case'}});
    if(path===`/api/cases/${second}/conversations`)return response({conversations:[]});
    return response({},500);
  }});context.after(app.close);
  await app.flush();await app.setCase(second);await app.flush();
  late.resolve(response({conversation:{id:conversation,caseId:first},messages:[{id:randomUUID(),role:'assistant',content:'OLD PRIVATE TEXT MUST NOT REAPPEAR',state:'complete'}]}));await app.flush();
  assert.equal(app.dom.window.document.querySelector('.chat-toolbar [data-slot="card-title"]').textContent,'Conversation');
  assert.doesNotMatch(app.dom.window.document.body.textContent,/OLD PRIVATE TEXT MUST NOT REAPPEAR/);
});

test('development React: first send persists case and conversation, then sends only the new user turn',async context=>{
  const caseId=randomUUID(),conversationId=randomUUID(),userMessageId=randomUUID(),assistantMessageId=randomUUID(),requestId=randomUUID();let clientMessageId;
  const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
  const app=await mount({guidanceAgency:'sfha',fetchHandler:async(path,options)=>{
    if(path==='/api/cases'&&options.method==='POST')return response({case:{id:caseId,title:'Synthetic stored case'}});
    if(path===`/api/cases/${caseId}/conversations`&&options.method==='POST')return response({conversation:{id:conversationId,caseId,title:'Synthetic conversation'}});
    if(path==='/api/chat'){
      const payload=JSON.parse(options.body);clientMessageId=payload.clientMessageId;
      const text=frame('conversation',{conversationId,userMessageId})+frame('delta',{text:'Authored stream fixture; not a live provider result.'})+frame('done',{requestId,assistantMessageId,conversationId});
      return new Response(text,{headers:{'Content-Type':'text/event-stream'}});
    }
    if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:[{id:userMessageId,clientMessageId,requestId,role:'user',content:'Only this new question',state:'complete'},{id:assistantMessageId,requestId,role:'assistant',content:'Authored stream fixture; not a live provider result.',state:'complete'}]});
    return response({},500);
  }});context.after(app.close);
  await app.type('Only this new question');await app.click(app.button('Send'));await app.flush();
  const posts=app.requests.filter(item=>item.options.method==='POST');assert.equal(posts.filter(item=>item.path==='/api/workflows').length,1,'Case observation starts at most one metadata workflow');
  const calls=posts.filter(item=>item.path!=='/api/workflows');assert.deepEqual(calls.map(item=>item.path),['/api/cases',`/api/cases/${caseId}/conversations`,'/api/chat']);
  const payload=JSON.parse(calls.at(-1).options.body);assert.equal(payload.caseId,caseId);assert.equal(payload.conversationId,conversationId);assert.deepEqual(payload.messages,[{role:'user',content:'Only this new question'}]);assert.ok(payload.clientMessageId);
  assert.equal(payload.guidanceAgency,'sfha');assert.equal('guidanceSources' in payload,false);
  const savedCase=JSON.parse(calls[0].options.body);assert.deepEqual(savedCase.fields,[]);assert.equal('guidanceAgency' in savedCase,false);
  assert.equal(app.dom.window.document.querySelector('textarea').value,'');assert.match(app.dom.window.document.body.textContent,/Authored stream fixture; not a live provider result/);
  assert.equal(app.requests.some(item=>item.options.method==='PUT'),false);
});

test('development React: stream errors keep received text visibly incomplete after saved-history refresh',async context=>{
  const caseId=randomUUID(),conversationId=randomUUID(),userId=randomUUID(),assistantId=randomUUID(),requestId=randomUUID();let sent=false,clientMessageId;
  const app=await mount({caseId,fetchHandler:async(path,options)=>{
    if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic case'}});
    if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic thread'}]});
    if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:sent?[{id:userId,clientMessageId,requestId,role:'user',content:'Question before interrupted fixture',state:'complete'},{id:assistantId,requestId,role:'assistant',content:'Retained partial fixture',state:'failed'}]:[]});
    if(path==='/api/chat'){sent=true;clientMessageId=JSON.parse(options.body).clientMessageId;return new Response('event: delta\ndata: {"text":"Retained partial fixture"}\n\nevent: error\ndata: {"code":"CHAT_INCOMPLETE"}\n\n',{headers:{'Content-Type':'text/event-stream'}});}
    return response({},500);
  }});context.after(app.close);
  await app.flush();await app.type('Question before interrupted fixture');await app.click(app.button('Send'));await app.flush();
  assert.match(app.dom.window.document.body.textContent,/Retained partial fixture/);assert.match(app.dom.window.document.body.textContent,/Reply interrupted/);
  assert.equal(app.requests.filter(item=>item.path==='/api/chat').length,1);assert.ok(app.button('Edit this question again'));
});


test('development React: verified same-user recovery restores only text and keeps live edits recoverable',async context=>{
  const app=await mount({recovery:{input:'Unsent synthetic question recovered'},fetchHandler:async()=>response({},500)});context.after(app.close);
  assert.equal(app.dom.window.document.querySelector('textarea').value,'Unsent synthetic question recovered');
  assert.match(app.dom.window.document.body.textContent,/Reattach images/);
  assert.equal(app.dom.window.document.querySelectorAll('img').length,0);
  assert.equal(app.dom.window.document.querySelector('[role="checkbox"]'),null);
  await app.type('A revised question that is still unsent');
  assert.deepEqual(app.readDraft(),{input:'A revised question that is still unsent'});
});


test('development React: first-use library permission is explicit, versioned, and never stored in recovered drafts',async context=>{
  const caseId=randomUUID(),conversationId=randomUUID(),userMessageId=randomUUID(),assistantMessageId=randomUUID(),requestId=randomUUID();
  const status={...identity,libraryRetrievalEnabled:true};let streamController,clientMessageId,stored=false;
  const appendix='\n\nSources\n[S1] Synthetic saved draft; metadata only.';
  const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
  const app=await mount({caseId,status,permissionDecision:'unset',recovery:{input:'Find synthetic saved work'},fetchHandler:async(path,options)=>{
    if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic retrieval case'}});
    if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic thread'}]});
    if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:stored?[{id:userMessageId,clientMessageId,requestId,role:'user',content:'Find synthetic saved work',state:'complete'},{id:assistantMessageId,requestId,role:'assistant',content:'Synthetic response [S1]'+appendix,state:'complete'}]:[]});
    if(path==='/api/chat'){clientMessageId=JSON.parse(options.body).clientMessageId;return new Response(new ReadableStream({start(controller){streamController=controller;}}),{headers:{'Content-Type':'text/event-stream','X-Library-Retrieval':'enabled'}});}
    return response({},500);
  }});context.after(app.close);await app.flush();
  const boxes=()=>app.dom.window.document.querySelectorAll('[role="checkbox"]');
  assert.equal(boxes().length,0);
  await app.type('Find synthetic saved work');
  assert.equal('libraryConsent' in app.readDraft(),false);
  await app.click(app.button('Send'));
  assert.equal(app.requests.some(item=>item.path==='/api/chat'),false);
  await app.click(app.button('Allow saved-library search'));
  const request=app.requests.find(item=>item.path==='/api/chat');assert.equal(JSON.parse(request.options.body).libraryConsent,true);
  assert.equal(boxes().length,0);
  streamController.enqueue(new TextEncoder().encode(frame('activity',{phase:'searching',state:'completed',count:1,message:'PRIVATE TOOL PROSE',reasoning:'RAW REASONING'})));
  await app.flush();assert.match(app.dom.window.document.body.textContent,/Saved-record search finished/);assert.doesNotMatch(app.dom.window.document.body.textContent,/PRIVATE TOOL PROSE|RAW REASONING/);
  const refs={requestId,items:[{sourceId:'S1',kind:'artifact',id:randomUUID(),version:1,title:'<img src=x onerror=alert(1)>',titleTruncated:false,retrievalState:'metadata',status:'draft',isStale:true,url:'https://untrusted.invalid',snippet:'PRIVATE SNIPPET'}],appendix};
  streamController.enqueue(new TextEncoder().encode(frame('delta',{text:'Synthetic response [S1]'})+frame('sources',refs)));
  await app.flush();assert.match(app.dom.window.document.body.textContent,/Metadata only; body not read/);assert.match(app.dom.window.document.body.textContent,/Historical version; review again/);
  assert.equal(app.dom.window.document.querySelectorAll('a:not([href="#settings"]),img').length,0);assert.doesNotMatch(app.dom.window.document.body.textContent,/PRIVATE SNIPPET|untrusted.invalid/);
  stored=true;streamController.enqueue(new TextEncoder().encode(frame('done',{requestId,assistantMessageId,conversationId})));streamController.close();await app.flush();await app.flush();
  const assistant=app.dom.window.document.querySelector('article[aria-label="Assistant"]');assert.equal(assistant.textContent.split(appendix.trimStart()).length-1,1);
  await app.setStatus({...status,authenticated:false,userId:null});
  await app.setStatus(status);await app.flush();assert.equal(boxes().length,0);
  assert.equal(app.dom.window.document.querySelector('[aria-label="Sources for this request"]'),null);
});

test('development React: legacy capability absence disables retrieval while ordinary chat remains usable',async context=>{
  const app=await mount({fetchHandler:async()=>response({code:'CASE_CONFLICT'},409)});context.after(app.close);
  assert.equal(app.dom.window.document.querySelectorAll('[role="checkbox"]').length,0);
  await app.type('Ordinary synthetic question');assert.equal(app.button('Send').disabled,false);
});

test('development React: missing retrieval acknowledgement is an honest error with no false success',async context=>{
  const caseId=randomUUID(),conversationId=randomUUID();
  const app=await mount({caseId,status:{...identity,libraryRetrievalEnabled:true},fetchHandler:async(path)=>{
    if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic case'}});
    if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Thread'}]});
    if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:[]});
    if(path==='/api/chat')return new Response('event: delta\ndata: {"text":"FALSE RETRIEVAL SUCCESS"}\n\n',{headers:{'Content-Type':'text/event-stream'}});
    return response({},500);
  }});context.after(app.close);await app.flush();await app.type('Find saved synthetic work');
  for(const box of app.dom.window.document.querySelectorAll('[role="checkbox"]'))await app.click(box);
  await app.click(app.button('Send'));await app.flush();
  assert.match(app.dom.window.document.body.textContent,/does not support library retrieval/);assert.doesNotMatch(app.dom.window.document.body.textContent,/FALSE RETRIEVAL SUCCESS/);
  assert.equal(app.requests.filter(item=>item.path==='/api/chat').length,1);
});


test('development React: delayed retrieval from a former case/account cannot add sources or restore consent',async()=>{
  for(const transition of ['case','account']){
    const first=randomUUID(),second=randomUUID(),conversationId=randomUUID(),pending=deferred();
    const status={...identity,libraryRetrievalEnabled:true};
    const app=await mount({caseId:first,status,fetchHandler:async(path)=>{
      if(path.startsWith('/api/cases/')&&path.endsWith('/conversations'))return response({conversations:path.includes(first)?[{id:conversationId,caseId:first,title:'Synthetic old thread'}]:[]});
      if(path.startsWith('/api/cases/'))return response({case:{id:path.split('/').at(-1),title:'Synthetic current case'}});
      if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId:first},messages:[]});
      if(path==='/api/chat')return pending.promise;
      return response({},500);
    }});
    try{
      await app.flush();await app.type('Read synthetic old work');for(const box of app.dom.window.document.querySelectorAll('[role="checkbox"]'))await app.click(box);
      await app.click(app.button('Send'));
      if(transition==='case')await app.setCase(second);else await app.setStatus({...status,userId:randomUUID(),csrfToken:'new-public-csrf'});
      const id=randomUUID();const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
      pending.resolve(new Response(frame('activity',{phase:'reading',state:'completed',count:1})+frame('sources',{requestId:id,items:[{sourceId:'S1',kind:'case',id:first,version:1,title:'OLD SOURCE MUST NOT APPEAR',titleTruncated:false,retrievalState:'read'}],appendix:'OLD APPENDIX MUST NOT APPEAR'})+frame('done',{requestId:id,assistantMessageId:randomUUID()}),{headers:{'Content-Type':'text/event-stream','X-Library-Retrieval':'enabled'}}));
      await app.flush();await app.flush();
      assert.doesNotMatch(app.dom.window.document.body.textContent,/OLD SOURCE MUST NOT APPEAR|OLD APPENDIX MUST NOT APPEAR/);
      assert.equal(app.dom.window.document.querySelectorAll('[role="checkbox"]').length,0);
      assert.equal(app.requests.filter(item=>item.path==='/api/chat').length,1);
    }finally{await app.close();}
  }
});

test('development React: a capability change leaves ordinary chat available without library retrieval',async context=>{
  const status={...identity,libraryRetrievalEnabled:true};
  const app=await mount({status,fetchHandler:async()=>response({},500)});context.after(app.close);
  await app.type('Find synthetic work');for(const box of app.dom.window.document.querySelectorAll('[role="checkbox"]'))await app.click(box);
  await app.setStatus({...status,libraryRetrievalEnabled:false});await app.click(app.button('Send'));
  assert.equal(app.requests.some(item=>item.path==='/api/library-permission'||item.path==='/api/chat'),false);
  assert.equal(app.dom.window.document.querySelector('textarea').value,'Find synthetic work');
});


test('development React: empty conversation picker explains its disabled state without repeating introductory prose',async context=>{
  const app=await mount({fetchHandler:async()=>response({},500)});context.after(app.close);
  const select=app.dom.window.document.querySelector('select');assert.equal(select.disabled,true);
  assert.equal(select.options[0].textContent,'No saved conversations');assert.equal(select.options[0].disabled,true);
  assert.equal(app.dom.window.document.getElementById(select.getAttribute('aria-describedby')).textContent,'Your first send creates and saves a conversation.');
  assert.ok(app.button('New conversation'));
  const subtitle='Confirmed case details are reused as context. Chat input never replaces source material, reviewed facts, or documents.';
  assert.equal(app.dom.window.document.body.textContent.split(subtitle).length-1,0);
  const reload=app.button('Reload conversation');assert.equal(reload.getAttribute('data-variant'),'ghost');assert.equal(reload.tagName,'BUTTON');
  reload.focus();assert.equal(app.dom.window.document.activeElement,reload);
});

test('development React: new action clears the current view while the picker reopens retained saved history',async context=>{
  const caseId=randomUUID(),conversationId=randomUUID(),messageId=randomUUID();
  const app=await mount({caseId,fetchHandler:async path=>{
    if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic saved case'}});
    if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Saved synthetic thread'}]});
    if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId,title:'Saved synthetic thread'},messages:[{id:messageId,role:'assistant',content:'Retained synthetic history',state:'complete'}]});
    return response({},500);
  }});context.after(app.close);await app.flush();
  assert.match(app.dom.window.document.body.textContent,/Retained synthetic history/);
  await app.click(app.button('New conversation'));
  let select=app.dom.window.document.querySelector('select');assert.equal(select.disabled,false);assert.equal(select.value,'');
  assert.equal(select.options[0].textContent,'Choose a saved conversation');assert.equal(select.options[0].disabled,true);
  assert.equal(select.options[1].textContent,'Saved synthetic thread');
  assert.doesNotMatch(app.dom.window.document.body.textContent,/Retained synthetic history/);
  await import('react').then(React=>React.act(async()=>{select.value=conversationId;select.dispatchEvent(new app.dom.window.Event('change',{bubbles:true}));await tick();}));
  await app.flush();assert.match(app.dom.window.document.body.textContent,/Retained synthetic history/);
  assert.equal(app.requests.some(item=>['POST','PUT','DELETE'].includes(item.options.method)),false);
});

test('development React: source cards never claim persistence when assistant saving fails',async context=>{
  const caseId=randomUUID(),conversationId=randomUUID(),userMessageId=randomUUID(),requestId=randomUUID();let sent=false,clientMessageId;
  const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
  const appendix='\n\nSources\n[S1] Synthetic reference received before save failure.';
  const app=await mount({caseId,status:{...identity,libraryRetrievalEnabled:true},fetchHandler:async(path,options)=>{
    if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic source save failure'}});
    if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic thread'}]});
    if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:sent?[{id:userMessageId,clientMessageId,requestId,role:'user',content:'Read synthetic source',state:'complete'}]:[]});
    if(path==='/api/chat'){
      sent=true;clientMessageId=JSON.parse(options.body).clientMessageId;
      return new Response(frame('delta',{text:'A partial response [S1]'})+frame('sources',{requestId,items:[{sourceId:'S1',kind:'case',id:caseId,version:1,title:'Synthetic reference',titleTruncated:false,retrievalState:'read'}],appendix})+frame('error',{code:'CHAT_SAVE_FAILED',requestId}),{headers:{'Content-Type':'text/event-stream','X-Library-Retrieval':'enabled'}});
    }
    return response({},500);
  }});context.after(app.close);
  await app.flush();await app.type('Read synthetic source');for(const box of app.dom.window.document.querySelectorAll('[role="checkbox"]'))await app.click(box);
  await app.click(app.button('Send'));await app.flush();await app.flush();
  const sources=app.dom.window.document.querySelector('[aria-label="Sources for this request"]');assert.ok(sources);
  assert.match(sources.textContent,/check its save status/);assert.doesNotMatch(sources.textContent,/references are saved/i);
  assert.match(app.dom.window.document.body.textContent,/Save not confirmed|Could not confirm the saved reply/i);
  assert.match(app.dom.window.document.body.textContent,/Synthetic reference received before save failure/);
});

test('Enter sends once, while Shift+Enter and IME confirmation never send',async context=>{
  const app=await mount({fetchHandler:async()=>response({code:'CASE_CONFLICT'},409)});context.after(app.close);
  await app.type('Synthetic keyboard message');
  const React=await import('react'), input=app.dom.window.document.querySelector('textarea');
  const press=async options=>{await React.act(async()=>input.dispatchEvent(new app.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options})));await app.flush();};
  await press({shiftKey:true});await press({isComposing:true});await press({keyCode:229});
  assert.equal(app.requests.filter(item=>item.options.method==='POST').length,0);
  await press({});
  assert.equal(app.requests.filter(item=>item.path==='/api/cases'&&item.options.method==='POST').length,1);
});

test('development React: uncertain new-case creation preserves the composer and blocks a duplicate create',async context=>{
  const app=await mount({fetchHandler:async(path)=>{if(path==='/api/cases')throw new TypeError('Controlled lost case-create response');return response({},500);}});context.after(app.close);
  await app.type('Synthetic question retained until case save can be checked');await app.click(app.button('Send'));await app.flush();
  assert.match(app.dom.window.document.body.textContent,/new case may already be saved/);
  assert.equal(app.dom.window.document.querySelector('.chat-input').value,'Synthetic question retained until case save can be checked');
  await app.click(app.button('Send'));await app.flush();
  assert.equal(app.requests.filter(item=>item.path==='/api/cases'&&item.options.method==='POST').length,1);
  assert.equal(app.requests.some(item=>item.path==='/api/chat'),false);
});

test('development React: malformed 201 case-create response stays uncertain and cannot create twice',async context=>{
  const app=await mount({fetchHandler:async(path)=>path==='/api/cases'?new Response('{"case":',{status:201,headers:{'Content-Type':'application/json'}}):response({},500)});context.after(app.close);
  await app.type('Synthetic input retained after a truncated success');await app.click(app.button('Send'));await app.flush();
  assert.match(app.dom.window.document.body.textContent,/new case may already be saved/);
  await app.click(app.button('Send'));await app.flush();
  assert.equal(app.requests.filter(item=>item.path==='/api/cases'&&item.options.method==='POST').length,1);
  assert.equal(app.dom.window.document.querySelector('.chat-input').value,'Synthetic input retained after a truncated success');
});

test('development React: first-use cancel retains input without grants, cases or provider requests',async context=>{
  const app=await mount({status:{...identity,libraryRetrievalEnabled:true},permissionDecision:'unset',fetchHandler:async()=>response({},500)});context.after(app.close);
  await app.type('Synthetic unsent question');await app.click(app.button('Send'));
  assert.ok(app.dom.window.document.querySelector('[role="dialog"]'));
  assert.match(app.dom.window.document.body.textContent,/DeepSeek/);
  await app.click(app.button('Cancel'));
  assert.equal(app.dom.window.document.querySelector('[role="dialog"]'),null);
  assert.equal(app.dom.window.document.querySelector('textarea').value,'Synthetic unsent question');
  assert.equal(app.requests.some(item=>item.options.method==='PUT'||item.options.method==='POST'),false);
});

test('development React: declining library is remembered without blocking ordinary sends or repeating the prompt',async context=>{
  const app=await mount({status:{...identity,libraryRetrievalEnabled:true},permissionDecision:'unset',fetchHandler:async()=>response({code:'CASE_CONFLICT'},409)});context.after(app.close);
  await app.type('Synthetic ordinary question');await app.click(app.button('Send'));await app.click(app.button('Continue without library'));await app.flush();
  assert.equal(app.requests.filter(item=>item.path==='/api/library-permission'&&item.options.method==='PUT').length,1);
  assert.equal(JSON.parse(app.requests.find(item=>item.options.method==='PUT').options.body).decision,'deny');
  assert.equal(app.requests.filter(item=>item.path==='/api/cases'&&item.options.method==='POST').length,1);
  await app.click(app.button('Send'));await app.flush();
  assert.equal(app.dom.window.document.querySelector('[role="dialog"]'),null);
  assert.equal(app.requests.filter(item=>item.path==='/api/library-permission'&&item.options.method==='PUT').length,1);
  assert.equal(app.requests.filter(item=>item.path==='/api/cases'&&item.options.method==='POST').length,2);
});

test('development React: account change dismisses first-use prompt and cannot grant for a replacement identity',async context=>{
  const status={...identity,libraryRetrievalEnabled:true};
  const app=await mount({status,permissionDecision:'unset',fetchHandler:async()=>response({},500)});context.after(app.close);
  await app.type('Synthetic private old-account input');await app.click(app.button('Send'));
  assert.ok(app.dom.window.document.querySelector('[role="dialog"]'));
  await app.setStatus({...status,userId:randomUUID(),csrfToken:'public-other-account-token'});
  assert.equal(app.dom.window.document.querySelector('[role="dialog"]'),null);
  assert.equal(app.requests.some(item=>item.options.method==='PUT'),false);
  assert.equal(app.dom.window.document.querySelector('textarea').value,'');
});

test('development React: unavailable permission fails closed and only an explicit ordinary-only action continues',async context=>{
 const app=await mount({status:{...identity,libraryRetrievalEnabled:true},permissionHandler:async()=>response({code:'UNAVAILABLE'},503),fetchHandler:async()=>response({code:'CASE_CONFLICT'},409)});context.after(app.close);
 await app.type('Synthetic offline-policy question');await app.click(app.button('Send'));
 assert.ok(app.dom.window.document.querySelector('[role="dialog"]'));
 assert.equal(app.button('Allow saved-library search').disabled,true);
 assert.equal(app.requests.some(item=>item.options.method==='POST'||item.options.method==='PUT'),false);
 await app.click(app.button('Send without library this time'));await app.flush();
 assert.equal(app.requests.filter(item=>item.path==='/api/cases'&&item.options.method==='POST').length,1);
 assert.equal(app.requests.some(item=>item.options.method==='PUT'),false);
});

test('development React: changed provider endpoint cannot be approved under a DeepSeek disclosure',async context=>{
 const app=await mount({status:{...identity,libraryRetrievalEnabled:true},permissionHandler:async()=>response({decision:'unset',version:0,provider:{id:'deepseek',model:'deepseek-flash',endpoint:'https://different.example.invalid/chat/completions'},policyVersion:'library-retrieval-v1',category:'saved-library-excerpts',updatedAt:null}),fetchHandler:async()=>response({},500)});context.after(app.close);
 await app.type('Synthetic new-destination question');await app.click(app.button('Send'));
 assert.equal(app.button('Allow saved-library search').disabled,true);
 assert.equal(app.requests.some(item=>item.options.method==='POST'||item.options.method==='PUT'),false);
});


test('expired tab CSRF is refreshed without another login or an automatic chat retry',async context=>{
 const caseId=randomUUID(),conversationId=randomUUID();let statusReads=0,chatCalls=0;
 const current={...identity,csrfToken:'synthetic-current-session-csrf'};
 const app=await mount({caseId,statusHandler:()=>response(++statusReads===1?identity:current),fetchHandler:async(path,options)=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic existing case'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic saved conversation'}]});
  if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:[]});
  if(path==='/api/chat'){chatCalls++;assert.equal(options.headers['X-CSRF-Token'],chatCalls===1?identity.csrfToken:current.csrfToken);return response({code:chatCalls===1?'CSRF_REJECTED':'LIVE_DISABLED'},chatCalls===1?403:503);}
  return response({},500);
 }});context.after(app.close);
 await app.flush();await app.type('Continue this synthetic existing conversation');await app.click(app.button('Send'));await app.flush();await app.flush();
 assert.equal(chatCalls,1,'Session recovery must never replay a model POST');
 assert.equal(statusReads,2,'A stale CSRF rejection must check the actual current session once');
 assert.equal(app.dom.window.document.querySelector('textarea').value,'Continue this synthetic existing conversation');
 assert.equal(app.button('Send').disabled,false);
 assert.match(app.dom.window.document.body.textContent,/Connection refreshed/);
 assert.doesNotMatch(app.dom.window.document.body.textContent,/Sign in again|The reply was interrupted/);
 assert.equal(app.requests.some(item=>item.path==='/api/login'),false);
 await app.click(app.button('Send'));await app.flush();
 assert.equal(chatCalls,2,'Only a second explicit send starts another POST, using the refreshed token');
});

test('a received unsaved reply survives verified same-user reauthentication without replaying the turn',async context=>{
 const caseId=randomUUID(),conversationId=randomUUID(),userId=randomUUID(),requestId=randomUUID();let sent=false,expire=true,clientMessageId;
 const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
 const app=await mount({caseId,fetchHandler:async(path,options)=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic resume case'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic resume thread'}]});
  if(path===`/api/conversations/${conversationId}`){
   if(sent&&expire){expire=false;return response({code:'AUTH_REQUIRED'},401);}
   return response({conversation:{id:conversationId,caseId},messages:sent?[{id:userId,clientMessageId,requestId,role:'user',content:'Keep this synthetic question',state:'complete'}]:[]});
  }
  if(path==='/api/chat'){sent=true;clientMessageId=JSON.parse(options.body).clientMessageId;return new Response(frame('conversation',{conversationId,userMessageId:userId})+frame('delta',{text:'Unsaved synthetic answer worth keeping.'})+frame('error',{code:'CHAT_SAVE_FAILED',requestId}),{headers:{'Content-Type':'text/event-stream','X-Request-Id':requestId}});}
  return response({},500);
 }});context.after(app.close);
 await app.flush();await app.type('Keep this synthetic question');await app.click(app.button('Send'));await app.flush();
 assert.equal(app.dom.window.document.querySelector('textarea'),null,'An actual unauthorized history read shows sign-in, not an extended session');
 await app.setStatus(identity);await app.flush();await app.flush();
 assert.match(app.dom.window.document.body.textContent,/Unsaved synthetic answer worth keeping/);
 assert.match(app.dom.window.document.body.textContent,/Not confirmed saved|not yet confirmed saved|Save not confirmed/i);
 assert.equal(app.requests.filter(item=>item.path==='/api/chat').length,1,'Reauthentication must never repeat provider work');
});

for(const mode of ['refresh-fails','different-user','expired','origin-rejected'])test(`connection recovery ${mode} keeps its authority boundary and never replays chat`,async context=>{
 const caseId=randomUUID(),conversationId=randomUUID();let statusReads=0,chatCalls=0;
 const app=await mount({caseId,statusHandler:()=>{
  statusReads++;if(statusReads===1)return response(identity);
  if(mode==='refresh-fails')throw new Error('Synthetic offline status');
  if(mode==='expired')return response({authenticated:false});
  return response({...identity,userId:randomUUID(),csrfToken:'synthetic-other-session'});
 },fetchHandler:async(path,options)=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic existing case'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic saved conversation'}]});
  if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:[]});
  if(path==='/api/chat'){chatCalls++;return response({code:mode==='origin-rejected'?'ORIGIN_REJECTED':'CSRF_REJECTED'},403);}
  return response({},500);
 }});context.after(app.close);
 await app.flush();await app.type('Private synthetic old-account question');await app.click(app.button('Send'));await app.flush();await app.flush();
 assert.equal(chatCalls,1);assert.equal(statusReads,mode==='origin-rejected'?1:2);
 if(mode==='refresh-fails'){
  assert.equal(app.dom.window.document.querySelector('textarea').value,'Private synthetic old-account question');
  assert.match(app.dom.window.document.body.textContent,/Could not check the connection/);assert.ok(app.button('Check connection'));
 }else if(mode==='origin-rejected'){
  assert.match(app.dom.window.document.body.textContent,/connection security check failed/);assert.doesNotMatch(app.dom.window.document.body.textContent,/Sign in again/i);
 }else assert.doesNotMatch(app.dom.window.document.body.textContent,/Private synthetic old-account question/);
});

test('missing model capability can be checked in the current conversation without discarding text or sending a message',async context=>{
 let reads=0;
 const app=await mount({statusHandler:()=>response(++reads===1?{...identity,liveEnabled:false}:identity),fetchHandler:async()=>response({},500)});context.after(app.close);
 await app.type('Keep the newer draft while checking this connection');assert.equal(app.button('Send').disabled,true);
 await app.click(app.button('Check connection'));await app.flush();
 assert.equal(app.dom.window.document.querySelector('textarea').value,'Keep the newer draft while checking this connection');assert.equal(app.button('Send').disabled,false);
 assert.equal(app.requests.some(item=>item.path==='/api/chat'),false);
});

test('a completed server reply clears a stale save warning after read-only reconciliation',async context=>{
 const caseId=randomUUID(),conversationId=randomUUID(),userId=randomUUID(),assistantId=randomUUID(),requestId=randomUUID();let sent=false,clientMessageId;
 const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
 const app=await mount({caseId,fetchHandler:async(path,options)=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic confirmed-save case'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic confirmed-save thread'}]});
  if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:sent?[{id:userId,clientMessageId,requestId,role:'user',content:'Synthetic saved question',state:'complete'},{id:assistantId,requestId,role:'assistant',content:'Authoritatively saved synthetic answer.',state:'complete'}]:[]});
  if(path==='/api/chat'){sent=true;clientMessageId=JSON.parse(options.body).clientMessageId;return new Response(frame('conversation',{conversationId,userMessageId:userId})+frame('delta',{text:'Authoritatively saved synthetic answer.'})+frame('error',{code:'CHAT_SAVE_FAILED',requestId}),{headers:{'Content-Type':'text/event-stream','X-Request-Id':requestId}});}
  return response({},500);
 }});context.after(app.close);
 await app.flush();await app.type('Synthetic saved question');await app.click(app.button('Send'));await app.flush();await app.flush();
 assert.match(app.dom.window.document.body.textContent,/Authoritatively saved synthetic answer/);
 assert.doesNotMatch(app.dom.window.document.body.textContent,/Could not confirm the saved reply/);
 assert.equal(app.requests.filter(item=>item.path==='/api/chat').length,1);
 assert.equal(app.readDraft(),null,'Confirmed saved content no longer remains in the unconfirmed recovery cache');
});

for(const listed of ['different-conversation','empty-list'])test(`a recovered reply stays on its original unavailable conversation with ${listed}`,async context=>{
 const caseId=randomUUID(),originalId=randomUUID(),otherId=randomUUID(),gate=deferred();let originalReads=0;
 const pendingTurn={userMessageId:randomUUID(),clientMessageId:randomUUID(),question:'Original synthetic sent question',assistantMessageId:randomUUID(),reply:'Original unconfirmed synthetic reply',requestId:randomUUID()};
 const app=await mount({caseId,recovery:{input:pendingTurn.question,conversationId:originalId,pendingTurn},fetchHandler:async path=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic scoped recovery'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:listed==='empty-list'?[]:[{id:otherId,caseId,title:'Different synthetic conversation'}]});
  if(path===`/api/conversations/${otherId}`)assert.fail('Recovery must never load an alternate conversation');
  if(path===`/api/conversations/${originalId}`){
   if(++originalReads===1)return gate.promise;
   return response({conversation:{id:originalId,caseId,title:'Original saved conversation'},messages:[{id:pendingTurn.userMessageId,clientMessageId:pendingTurn.clientMessageId,requestId:pendingTurn.requestId,role:'user',content:pendingTurn.question,state:'complete'},{id:pendingTurn.assistantMessageId,requestId:pendingTurn.requestId,role:'assistant',content:'Confirmed saved synthetic reply',state:'complete'}]});
  }
  return response({},500);
 }});context.after(app.close);await app.flush();
 assert.equal(app.dom.window.document.querySelector('select').value,originalId);assert.match(app.dom.window.document.body.textContent,/Original unconfirmed synthetic reply/);
 await import('react').then(React=>React.act(async()=>{gate.resolve(response({code:'CONVERSATION_NOT_FOUND'},404));await tick();}));await app.flush();
 assert.equal(app.dom.window.document.querySelector('select').value,originalId);assert.equal(app.button('Send').disabled,true);
 assert.match(app.dom.window.document.body.textContent,/This conversation could not be opened/);
 await app.type('Keep this newer draft while the original conversation is unavailable');
 await import('react').then(React=>React.act(async()=>{app.dom.window.document.querySelector('textarea').dispatchEvent(new app.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();}));
 assert.equal(app.requests.some(item=>item.path==='/api/chat'),false);assert.deepEqual(app.readDraft().pendingTurn,pendingTurn);
 await app.click(app.button('Retry opening this conversation'));await app.flush();
 assert.equal(app.dom.window.document.querySelector('select').value,originalId);assert.equal(app.button('Send').disabled,false);
 assert.equal(app.dom.window.document.querySelector('textarea').value,'Keep this newer draft while the original conversation is unavailable');
 assert.match(app.dom.window.document.body.textContent,/Confirmed saved synthetic reply/);assert.doesNotMatch(app.dom.window.document.body.textContent,/Original unconfirmed synthetic reply|not yet confirmed saved/i);
 assert.equal(app.readDraft().pendingTurn,undefined);assert.equal(app.requests.some(item=>item.path==='/api/chat'),false);
});


test('already saved recovered reply removes the obsolete unconfirmed notice without clearing newer text',async context=>{
 const caseId=randomUUID(),conversationId=randomUUID();
 const pendingTurn={userMessageId:randomUUID(),clientMessageId:randomUUID(),question:'Synthetic earlier question',assistantMessageId:randomUUID(),reply:'Synthetic answer now confirmed saved',requestId:randomUUID()};
 const app=await mount({caseId,recovery:{input:'Newer draft must survive verification',conversationId,pendingTurn},fetchHandler:async path=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic proof case'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic proof thread'}]});
  if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:[{id:pendingTurn.userMessageId,clientMessageId:pendingTurn.clientMessageId,requestId:pendingTurn.requestId,role:'user',content:pendingTurn.question,state:'complete'},{id:pendingTurn.assistantMessageId,requestId:pendingTurn.requestId,role:'assistant',content:pendingTurn.reply,state:'complete'}]});
  return response({},500);
 }});context.after(app.close);await app.flush();
 assert.match(app.dom.window.document.body.textContent,/Synthetic answer now confirmed saved/);
 assert.doesNotMatch(app.dom.window.document.body.textContent,/not yet confirmed saved/i);
 assert.equal(app.dom.window.document.querySelector('textarea').value,'Newer draft must survive verification');assert.equal(app.readDraft().pendingTurn,undefined);
 assert.equal(app.requests.some(item=>item.path==='/api/chat'),false);
});

test('stopping a read-only connection check aborts it without changing draft or sending chat',async context=>{
 let reads=0,aborted=false;
 const app=await mount({statusHandler:options=>{
  if(++reads===1)return response({...identity,liveEnabled:false});
  return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Synthetic check cancelled','AbortError'));},{once:true}));
 },fetchHandler:async()=>response({},500)});context.after(app.close);
 await app.type('Preserve this draft during a cancelled connection check');await app.click(app.button('Check connection'));
 assert.match(app.dom.window.document.body.textContent,/Checking connection/);
 await app.click(app.button('Stop reply'));await app.flush();assert.equal(aborted,true);
 assert.equal(app.dom.window.document.querySelector('textarea').value,'Preserve this draft during a cancelled connection check');assert.equal(app.dom.window.document.querySelector('textarea').disabled,false);
 assert.equal(app.requests.some(item=>item.path==='/api/chat'),false);assert.equal(app.button('Check connection').disabled,false);
});

for(const code of ['SERVICE_PAUSED','SERVICE_EXPIRED','TRIAL_LIMIT_REACHED'])test(`${code} preserves the question without pretending sign-in or reply saving failed`,async context=>{
 const caseId=randomUUID(),conversationId=randomUUID();let historyReads=0,statusReads=0;
 const app=await mount({caseId,statusHandler:()=>{statusReads++;return response(identity);},fetchHandler:async path=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic service case'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic service conversation'}]});
  if(path===`/api/conversations/${conversationId}`){historyReads++;return response({conversation:{id:conversationId,caseId},messages:[]});}
  if(path==='/api/chat')return response({code},code==='TRIAL_LIMIT_REACHED'?429:403);
  return response({},500);
 }});context.after(app.close);await app.flush();await app.type('Retain this synthetic service-denied question');await app.click(app.button('Send'));await app.flush();
 assert.equal(app.dom.window.document.querySelector('textarea').value,'Retain this synthetic service-denied question');assert.equal(historyReads,1);assert.equal(statusReads,1);
 assert.doesNotMatch(app.dom.window.document.body.textContent,/sign.in.*expired|sign in again|could not confirm|could not read.*saved/i);
 assert.equal(app.requests.filter(item=>item.path==='/api/chat').length,1);
});

test('an unsaved received reply keeps the discard guard even after the composer is cleared',async context=>{
 const caseId=randomUUID(),conversationId=randomUUID();
 const pendingTurn={userMessageId:randomUUID(),clientMessageId:randomUUID(),question:'Synthetic question already saved',assistantMessageId:randomUUID(),reply:'Synthetic reply not confirmed saved',requestId:randomUUID()};
 const app=await mount({caseId,recovery:{input:'',conversationId,pendingTurn},fetchHandler:async path=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic unsaved guard'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic guard thread'}]});
  if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:[{id:pendingTurn.userMessageId,clientMessageId:pendingTurn.clientMessageId,requestId:pendingTurn.requestId,role:'user',content:pendingTurn.question,state:'complete'}]});
  return response({},500);
 }});context.after(app.close);await app.flush();await app.type('');assert.equal(app.isDirty(),true);
 let confirmations=0;app.dom.window.confirm=message=>{confirmations++;assert.match(message,/unsaved replies/);return false;};
 await app.click(app.button('New conversation'));assert.equal(confirmations,1);
 assert.equal(app.dom.window.document.querySelector('select').value,conversationId);assert.match(app.dom.window.document.body.textContent,/Synthetic reply not confirmed saved/);
 assert.equal(app.readDraft().pendingTurn.reply,pendingTurn.reply);assert.equal(app.requests.some(item=>item.path==='/api/chat'),false);
});

for(const rejection of ['CSRF_REJECTED','SERVICE_PAUSED'])test(`earlier unsaved reply survives newer ${rejection} and same-user reauthentication`,async context=>{
 const caseId=randomUUID(),conversationId=randomUUID();const old={userMessageId:randomUUID(),clientMessageId:randomUUID(),question:'Earlier saved synthetic question',assistantMessageId:randomUUID(),reply:'Earlier received synthetic reply remains unconfirmed',requestId:randomUUID()};
 const app=await mount({caseId,recovery:{input:'',conversationId,pendingTurn:old},fetchHandler:async path=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic multiple turn recovery'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic original conversation'}]});
  if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:[{id:old.userMessageId,clientMessageId:old.clientMessageId,requestId:old.requestId,role:'user',content:old.question,state:'complete'}]});
  if(path==='/api/chat')return response({code:rejection},403);return response({},500);
 }});context.after(app.close);await app.flush();await app.type('Newer explicit question denied before provider');await app.click(app.button('Send'));await app.flush();await app.flush();
 assert.equal(app.readDraft().pendingTurn.reply,old.reply);assert.equal(app.readDraft().input,'Newer explicit question denied before provider');
 await app.setStatus({authenticated:false});await app.setStatus(identity);await app.flush();
 assert.match(app.dom.window.document.body.textContent,/Earlier received synthetic reply remains unconfirmed/);assert.equal(app.dom.window.document.querySelector('textarea').value,'Newer explicit question denied before provider');
 assert.equal(app.requests.filter(item=>item.path==='/api/chat').length,1);
});

for(const outcome of ['complete','unsaved'])test(`a newer ${outcome} turn cannot erase an earlier unconfirmed reply`,async context=>{
 const caseId=randomUUID(),conversationId=randomUUID(),newUserId=randomUUID(),newAssistantId=randomUUID(),newRequestId=randomUUID();let sent=false,newClientId;
 const old={userMessageId:randomUUID(),clientMessageId:randomUUID(),question:'Earlier saved synthetic question',assistantMessageId:randomUUID(),reply:'Earlier unconfirmed synthetic answer',requestId:randomUUID()};
 const oldRow={id:old.userMessageId,clientMessageId:old.clientMessageId,requestId:old.requestId,role:'user',content:old.question,state:'complete'};
 const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
 const app=await mount({caseId,recovery:{input:'',conversationId,pendingTurn:old},fetchHandler:async(path,options)=>{
  if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic successive turns'}});
  if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Synthetic successive conversation'}]});
  if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:[oldRow,...(sent?[{id:newUserId,clientMessageId:newClientId,requestId:newRequestId,role:'user',content:'Newer explicit synthetic question',state:'complete'},...(outcome==='complete'?[{id:newAssistantId,requestId:newRequestId,role:'assistant',content:'Newer synthetic answer',state:'complete'}]:[])]:[])]});
  if(path==='/api/chat'){sent=true;newClientId=JSON.parse(options.body).clientMessageId;return new Response(frame('conversation',{conversationId,userMessageId:newUserId})+frame('delta',{text:'Newer synthetic answer'})+(outcome==='complete'?frame('done',{requestId:newRequestId,assistantMessageId:newAssistantId,conversationId}):frame('error',{code:'CHAT_SAVE_FAILED',requestId:newRequestId})),{headers:{'Content-Type':'text/event-stream','X-Request-Id':newRequestId}});}
  return response({},500);
 }});context.after(app.close);await app.flush();await app.type('Newer explicit synthetic question');await app.click(app.button('Send'));await app.flush();await app.flush();
 assert.match(app.dom.window.document.body.textContent,/Earlier unconfirmed synthetic answer/);assert.match(app.dom.window.document.body.textContent,/Newer synthetic answer/);assert.equal(app.isDirty(),true);
 const cache=app.readDraft();assert.equal(outcome==='complete'?cache.pendingTurn.reply:cache.earlierTurns[0].reply,old.reply);
 await app.setStatus({authenticated:false});await app.setStatus(identity);await app.flush();
 assert.match(app.dom.window.document.body.textContent,/Earlier unconfirmed synthetic answer/);assert.match(app.dom.window.document.body.textContent,/Newer synthetic answer/);assert.equal(app.requests.filter(item=>item.path==='/api/chat').length,1);
});

test('development React: only assistant Markdown is formatted and Copy preserves exact source bytes', async context => {
  const caseId=randomUUID(),conversationId=randomUUID();
  const source='**Bold**\r\n\r\n| Field | Value |\r\n| --- | --- |\r\n| Owner | Unknown |\r\n\r\n```html\r\n<script>no execution</script>\r\n```';
  const app=await mount({caseId,fetchHandler:async path=>{
    if(path===`/api/cases/${caseId}`)return response({case:{id:caseId,title:'Synthetic Markdown source'}});
    if(path===`/api/cases/${caseId}/conversations`)return response({conversations:[{id:conversationId,caseId,title:'Markdown'}]});
    if(path===`/api/conversations/${conversationId}`)return response({conversation:{id:conversationId,caseId},messages:[
      {id:randomUUID(),role:'user',content:source,state:'complete'},
      {id:randomUUID(),role:'assistant',content:source,state:'complete'},
    ]});
    return response({},500);
  }});context.after(app.close);await app.flush();
  const doc=app.dom.window.document,assistant=doc.querySelector('.chat-message--assistant'),user=doc.querySelector('.chat-message--user');
  assert.equal(assistant.querySelector('strong').textContent,'Bold');
  assert.equal(assistant.querySelectorAll('table').length,1);
  assert.equal(assistant.querySelectorAll('script,img').length,0);
  assert.equal(user.querySelectorAll('strong,table,script').length,0);
  assert.equal(user.querySelector('p').textContent,source);
  let copied;Object.defineProperty(app.dom.window.navigator,'clipboard',{configurable:true,value:{writeText:async value=>{copied=value;}}});
  await app.click([...assistant.querySelectorAll('button')].find(button=>button.textContent==='Copy reply'));
  assert.equal(copied,source);
});

for(const state of ['paused','expired','quota'])test(`known ${state} service preserves text and blocks all new AI scope writes until read-only refresh`,async context=>{
 const blocked={...identity,service:{userId:identity.userId,status:state==='quota'?'available':state,aiAllowed:state==='quota',remaining:state==='quota'?0:10}};let checks=0;
 const available={...identity,service:{userId:identity.userId,status:'available',aiAllowed:true,remaining:5}};
 const app=await mount({status:blocked,statusHandler:()=>response(++checks===1?blocked:available),fetchHandler:async()=>response({},500)});context.after(app.close);
 await app.type('Keep this draft while service is unavailable');assert.equal(app.button('Send').disabled,true);
 await import('react').then(React=>React.act(async()=>{app.dom.window.document.querySelector('form.chat-composer').dispatchEvent(new app.dom.window.Event('submit',{bubbles:true,cancelable:true}));app.dom.window.document.querySelector('textarea').dispatchEvent(new app.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}));await app.flush();
 assert.equal(app.requests.some(item=>item.options.method==='POST'||item.options.method==='PUT'),false,'No case, conversation, grant or model write while known unavailable');
 assert.doesNotMatch(app.dom.window.document.body.textContent,/Sign in again|Check connection|Connect DeepSeek/);
 await app.click(app.button('Refresh service status'));await app.flush();assert.equal(checks,2);assert.equal(app.button('Send').disabled,false);
 assert.equal(app.dom.window.document.querySelector('textarea').value,'Keep this draft while service is unavailable');assert.equal(app.requests.some(item=>item.options.method==='POST'||item.options.method==='PUT'),false,'Refresh is read-only and never resends');
});
