import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {startBrowserFixture} from '../helpers/browser-fixture.mjs';
import {signInCustomer,createCustomer,createLinkedCase,apiWrite,getJson,responseFor} from './customer-case-support.js';
import {watchBrowser,screenshot,noHorizontalOverflow} from './support.js';
import {newCasePayload} from '../../frontend/features/chat/logic.js';

// Official Chromium UI + real disposable authentication/prepare/apply/SQLite.
// Provider output, stream timing and saved source messages are explicitly authored
// synthetic fixtures. No live key, model request or provider acceptance is involved.
test('conversational review: ordinary composer, conflict correction, undo, lost-response reconciliation and mobile input preservation',async({page},testInfo)=>{
 const app=await startBrowserFixture({legacyUsers:['synthetic-customer-a']});
 testInfo.annotations.push({type:'proposal-provider-fixture',description:'Controlled browser ReadableStream replaces only chat provider output; status liveEnabled is a UI-only fixture. Source messages are authored in disposable SQLite. Prepare/apply, authentication, ownership, version checks and all rendered UI are real. No provider call or live key.'});
 let session,record;const turns=new Map();
 const append=(conversationId,role,content,requestId,clientMessageId=null)=>{
  const id=randomUUID();app.withDatabase(db=>{
   const sequence=db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM messages WHERE conversation_id=?').get(conversationId).next;
   db.prepare('INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,session.userId,conversationId,sequence,role,content,'complete',requestId,clientMessageId,'[]',new Date().toISOString());
  });return id;
 };
 try{
  await page.setViewportSize({width:1440,height:1000});
  const assertClean=await watchBrowser(page);
  await page.exposeFunction('__nestletPrepareSyntheticTurn',async payload=>{
   expect(payload.actionConsent).toBe(true);expect(payload.caseId).toBe(record.id);
   const history=await getJson(page,app,`/api/conversations/${payload.conversationId}`);expect(history.conversation.caseId).toBe(record.id);
   const requestId=randomUUID(),userMessageId=append(payload.conversationId,'user',payload.messages[0].content,requestId,payload.clientMessageId);
   const latest=(await getJson(page,app,`/api/cases/${record.id}`)).case;
   const response=await apiWrite(page,app,`/api/cases/${record.id}/conversation-actions/prepare`,'POST',{action:'prepare_case_suggestion',expectedVersion:latest.version,sourceConversationId:payload.conversationId,sourceMessageId:userMessageId,factChanges:{property:{value:'128 Synthetic Proposal Lane'}}});
   expect(response.status()).toBe(200);const {proposal}=await response.json();
   turns.set(requestId,{conversationId:payload.conversationId,finished:false});
   return {requestId,userMessageId,conversationId:payload.conversationId,proposal};
  });
  await page.exposeFunction('__nestletFinishSyntheticTurn',requestId=>{
   const turn=turns.get(requestId);expect(turn).toBeTruthy();expect(turn.finished).toBe(false);turn.finished=true;
   const assistantMessageId=append(turn.conversationId,'assistant','Synthetic provider fixture: review the proposed property before applying.',requestId);
   return {requestId,conversationId:turn.conversationId,assistantMessageId};
  });
  await page.addInitScript(()=>{
   const originalFetch=window.fetch.bind(window);
   window.fetch=async(input,options={})=>{
    const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
    if(path==='/api/chat'){
     const packet=await window.__nestletPrepareSyntheticTurn(JSON.parse(options.body));
     const frame=(name,value)=>new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
     return new Response(new ReadableStream({start(controller){
      controller.enqueue(frame('conversation',{conversationId:packet.conversationId,userMessageId:packet.userMessageId}));
      controller.enqueue(frame('proposal',{requestId:packet.requestId,proposal:packet.proposal}));
      controller.enqueue(frame('delta',{text:'Synthetic provider fixture: review the proposed property before applying.'}));
      window.__completeSyntheticChat=async()=>{const done=await window.__nestletFinishSyntheticTurn(packet.requestId);controller.enqueue(frame('done',done));controller.close();window.__completeSyntheticChat=null;};
     }}),{headers:{'Content-Type':'text/event-stream'}});
    }
    const response=await originalFetch(input,options);
    if(path.endsWith('/reply')&&response.ok&&window.__dropReviewResponse){window.__dropReviewResponse=false;throw new TypeError('Synthetic interrupted response after commit');}
    if(path==='/api/status'&&response.ok){const status=await response.json();return new Response(JSON.stringify({...status,liveEnabled:status.authenticated===true}),{status:response.status,headers:response.headers});}
    return response;
   };
  });
  session=await signInCustomer(page,app);
  const client=await createCustomer(page,'Synthetic proposal customer');record=await createLinkedCase(page,client,'Synthetic desktop proposal case');
  const chat=page.locator('[data-feature="chat"]'),cards=chat.getByTestId('conversation-action-review');
  const apply=()=>cards.getByRole('button',{name:'Apply as unreviewed suggestions',exact:true});
  const consent=chat.getByRole('checkbox',{name:'Prepare reviewable case updates or English drafts for this message',exact:true});
  const writes=[];
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='PATCH'&&path===`/api/cases/${record.id}/document-context`||request.method()==='POST'&&path===`/api/cases/${record.id}/artifacts`)writes.push(path);});
  const send=async text=>{
   await chat.locator('.chat-input').fill(text);await consent.check();await chat.getByRole('button',{name:'Send',exact:true}).click();
   await expect(cards).toBeVisible();await expect(consent).not.toBeChecked();await expect(apply()).toBeDisabled();
   await expect(cards).toContainText('Wait for the complete saved answer');
  };
  const finish=async()=>{await page.evaluate(()=>window.__completeSyntheticChat());await expect(chat.getByRole('button',{name:'New conversation',exact:true})).toBeEnabled();};
  await send('Please prepare this synthetic property fact.');await finish();
  await chat.locator('.chat-input').fill('confirm');await chat.getByRole('button',{name:'Send',exact:true}).click();
  await expect(cards).toContainText('Saved as reviewed');await expect(chat.locator('.chat-input')).toHaveValue('');
  let saved=(await getJson(page,app,`/api/cases/${record.id}`)).case;
  expect(saved.version).toBe(record.version+1);expect(saved.fields.find(row=>row.key==='property')).toMatchObject({confirmed:true,value:'128 Synthetic Proposal Lane'});expect(turns.size).toBe(1);
  await screenshot(page,testInfo,'desktop-conversation-confirmed');
  await cards.getByRole('button',{name:'Undo this review',exact:true}).click();await expect(cards).toContainText('Review withdrawn');
  saved=(await getJson(page,app,`/api/cases/${record.id}`)).case;expect(saved.fields).toEqual([]);
  await send('Please prepare a synthetic address again.');await finish();
  await chat.locator('.chat-input').fill('change to 256 Synthetic Corrected Lane');await chat.getByRole('button',{name:'Send',exact:true}).click();await expect(cards).toContainText('Saved as reviewed');
  saved=(await getJson(page,app,`/api/cases/${record.id}`)).case;expect(saved.fields.find(row=>row.key==='property')).toMatchObject({confirmed:true,value:'256 Synthetic Corrected Lane'});
  await send('Please compare the differing synthetic address.');await finish();await expect(cards).toContainText('Conflicting evidence needs review');
  await page.setViewportSize({width:390,height:844});await chat.locator('.chat-input').fill('Keep this unsent next question.');
  await page.evaluate(()=>window.__dropReviewResponse=true);
  await cards.getByRole('button',{name:'Correct, save these facts',exact:true}).click();await expect(cards.getByRole('button',{name:'Check saved answer',exact:true})).toBeVisible();
  const uncertain=(await getJson(page,app,`/api/cases/${record.id}`)).case;
  await cards.getByRole('button',{name:'Check saved answer',exact:true}).click();await expect(cards).toContainText('Saved as reviewed');
  const reconciled=(await getJson(page,app,`/api/cases/${record.id}`)).case;expect(reconciled.version).toBe(uncertain.version);expect(reconciled.fields.find(row=>row.key==='property').value).toBe('128 Synthetic Proposal Lane');
  await expect(chat.locator('.chat-input')).toHaveValue('Keep this unsent next question.');expect(turns.size).toBe(3);
  await noHorizontalOverflow(page);await screenshot(page,testInfo,'mobile-conversation-reconciled');await assertClean();
 }finally{await app.stop();}
});
