import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {startBrowserFixture} from '../helpers/browser-fixture.mjs';
import {signInCustomer,createCustomer,createLinkedCase,apiWrite,getJson} from './customer-case-support.js';
import {watchBrowser,screenshot,noHorizontalOverflow} from './support.js';
import {newReviewReceipt,reviewResultText} from '../../review-operation.js';

// Official Chromium UI + real disposable authentication, prepare API and SQLite.
// Only chat SSE and the UI's liveEnabled status are authored browser fixtures.
// Saved messages and provider receipts below are synthetic, not live acceptance.
const test=base.extend({
 groundedReview:async({page},use,testInfo)=>{
  const app=await startBrowserFixture({legacyUsers:['synthetic-customer-a']});
  testInfo.annotations.push({type:'grounded-review-fixture',description:'Controlled atomic chat SSE and synthetic saved messages; real disposable authentication, prepare API, SQLite, history refresh and rendered UI. liveEnabled is UI-only. No live key or provider request.'});
  let session,record;const turns=new Map(),writes=[];
  const append=(conversationId,role,content,requestId,clientMessageId=null,id=randomUUID())=>{
   app.withDatabase(db=>{
    const sequence=db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM messages WHERE conversation_id=?').get(conversationId).next;
    db.prepare('INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,session.userId,conversationId,sequence,role,content,'complete',requestId,clientMessageId,'[]',new Date().toISOString());
   });return id;
  };
  try{
   await page.setViewportSize({width:1440,height:1000});
   const assertClean=await watchBrowser(page);
   await page.exposeFunction('__prepareGroundedReview',async({payload,kind})=>{
    expect(['prepared','no_preview']).toContain(kind);
    expect(payload).toMatchObject({actionConsent:true,reviewResultVersion:1,caseId:record.id,locale:'en'});
    const history=await getJson(page,app,`/api/conversations/${payload.conversationId}`);
    expect(history.conversation.caseId).toBe(record.id);
    const requestId=randomUUID(),userMessageId=append(payload.conversationId,'user',payload.messages[0].content,requestId,payload.clientMessageId);
    const proposals=[];
    if(kind==='prepared'){
     const latest=(await getJson(page,app,`/api/cases/${record.id}`)).case;
     const response=await apiWrite(page,app,`/api/cases/${record.id}/conversation-actions/prepare`,'POST',{
      action:'prepare_case_suggestion',expectedVersion:latest.version,sourceConversationId:payload.conversationId,
      sourceMessageId:userMessageId,factChanges:{property:{value:'128 Synthetic Review Lane'}}
     });
     expect(response.status()).toBe(200);
     proposals.push((await response.json()).proposal);
    }
    const receipt={...newReviewReceipt(requestId),providerRequests:1,toolCalls:proposals.length,prepareCalls:proposals.length,
     validatedProposals:proposals.length,emittedProposals:proposals.length,finishReason:proposals.length?'tool_calls':'stop',outcome:kind,reason:proposals.length?'prepared':'no_tool'};
    const done={requestId,assistantMessageId:randomUUID(),conversationId:payload.conversationId,
     reviewResult:{text:reviewResultText(proposals,payload.locale),proposals,receipt}};
    turns.set(requestId,{done,persisted:false});
    return {requestId,userMessageId,conversationId:payload.conversationId,done};
   });
   await page.exposeFunction('__persistGroundedReview',requestId=>{
    const turn=turns.get(requestId);expect(turn).toBeTruthy();expect(turn.persisted).toBe(false);
    const done=turn.done;
    append(done.conversationId,'assistant',done.reviewResult.text,requestId,null,done.assistantMessageId);
    turn.persisted=true;
    return done;
   });
   await page.addInitScript(()=>{
    const originalFetch=window.fetch.bind(window);
    const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
    window.fetch=async(input,options={})=>{
     const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
     if(path==='/api/chat'){
      const packet=await window.__prepareGroundedReview({payload:JSON.parse(options.body),kind:window.__groundedReviewKind||'prepared'});
      let controller;
      const control={packet,closed:false,cancelled:false,partial:false,persisted:false};
      const enqueue=text=>controller.enqueue(new TextEncoder().encode(text));
      const close=()=>{controller.close();control.closed=true;};
      const persist=async()=>{
       if(!control.persisted){await window.__persistGroundedReview(packet.requestId);control.persisted=true;}
       return packet.done;
      };
      control.complete=async()=>{
       if(control.closed||control.cancelled||options.signal?.aborted)return false;
       const done=await persist();
       if(control.cancelled||options.signal?.aborted)return false;
       enqueue(control.partial?'\n\n':frame('done',done));close();return true;
      };
      control.savedPartial=async()=>{
       const done=await persist();
       // All JSON is present, but the SSE frame boundary has not arrived.
       enqueue(frame('done',done).slice(0,-2));control.partial=true;
      };
      control.endWithoutDone=close;
      control.incompleteEnvelope=()=>{
       const done=structuredClone(packet.done);delete done.reviewResult.receipt;
       enqueue(frame('done',done));close();
      };
      const stream=new ReadableStream({
       start(value){controller=value;enqueue(frame('conversation',{conversationId:packet.conversationId,userMessageId:packet.userMessageId}));},
       cancel(){control.cancelled=true;}
      });
      window.__groundedReviewControl=control;
      return new Response(stream,{headers:{'Content-Type':'text/event-stream'}});
     }
     const response=await originalFetch(input,options);
     if(path==='/api/status'&&response.ok){
      const status=await response.json();
      return new Response(JSON.stringify({...status,liveEnabled:status.authenticated===true,libraryRetrievalEnabled:false}),{status:response.status,headers:response.headers});
     }
     return response;
    };
   });
   session=await signInCustomer(page,app);
   const client=await createCustomer(page,'Synthetic grounded-review customer');
   record=await createLinkedCase(page,client,'Synthetic atomic review case');
   const chat=page.locator('[data-feature="chat"]'),cards=chat.getByTestId('conversation-action-review');
   const settled=async()=>{
    await expect(chat.getByRole('button',{name:'New conversation',exact:true})).toBeEnabled();
    await expect(chat.locator('.chat-input')).toBeEnabled();
   };
   // Wait for case/conversation hydration before starting a controlled stream.
   await settled();
   const before=(await getJson(page,app,`/api/cases/${record.id}`)).case;
   const artifacts=(await getJson(page,app,`/api/cases/${record.id}/artifacts`)).artifacts;
   page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    if(!['GET','HEAD'].includes(request.method())&&(path===`/api/cases/${record.id}`||path===`/api/cases/${record.id}/document-context`||path===`/api/cases/${record.id}/artifacts`||path.startsWith(`/api/cases/${record.id}/conversation-reviews`)))writes.push(`${request.method()} ${path}`);
   });
   const begin=async(kind='prepared')=>{
    await settled();
    await page.evaluate(value=>{window.__groundedReviewKind=value;window.__groundedReviewControl=null;},kind);
    await chat.locator('.chat-input').fill('Property address: 128 Synthetic Review Lane. Could you prepare a review preview?');
    const send=chat.getByRole('button',{name:'Send',exact:true});await expect(send).toBeEnabled();await send.click();
    await expect.poll(()=>page.evaluate(()=>Boolean(window.__groundedReviewControl)),{message:'Controlled review stream is ready',timeout:10000}).toBe(true);
    await expect(chat.getByRole('button',{name:'Stop reply',exact:true})).toBeVisible();
    const packet=await page.evaluate(()=>window.__groundedReviewControl.packet);
    await expect(cards).toHaveCount(0);
    await expect(chat.getByText(packet.done.reviewResult.text,{exact:true})).toHaveCount(0);
    expect(turns.get(packet.requestId).persisted).toBe(false);
    return packet;
   };
   const unchanged=async()=>{
    expect(writes,'No case, fact-review or artifact mutation request').toEqual([]);
    expect((await getJson(page,app,`/api/cases/${record.id}`)).case).toEqual(before);
    expect((await getJson(page,app,`/api/cases/${record.id}/artifacts`)).artifacts).toEqual(artifacts);
   };
   const savedAssistant=async packet=>{
    const history=await getJson(page,app,`/api/conversations/${packet.conversationId}`);
    return history.messages.filter(message=>message.role==='assistant'&&message.requestId===packet.requestId);
   };
   await use({chat,cards,begin,settled,unchanged,savedAssistant,turns});
   await assertClean();
  }finally{await app.stop();}
 }
});

test('atomic saved review reveals the canonical card only on completion; explicit cancel changes nothing',async({page,groundedReview:review},testInfo)=>{
 const packet=await review.begin();
 await review.unchanged();expect(await review.savedAssistant(packet)).toEqual([]);
 expect(await page.evaluate(()=>window.__groundedReviewControl.complete())).toBe(true);
 await review.settled();
 await expect(review.cards).toHaveCount(1);
 await expect(review.cards).toContainText('128 Synthetic Review Lane');
 await expect(review.cards).toContainText(packet.done.reviewResult.proposals[0].sourceMessageId);
 await expect(review.cards).toContainText(`Case version ${packet.done.reviewResult.proposals[0].expectedVersion}`);
 await expect(review.cards.getByRole('button',{name:'Apply as unreviewed suggestions',exact:true})).toBeEnabled();
 await expect(review.chat.getByText(packet.done.reviewResult.text,{exact:true})).toBeVisible();
 expect(await review.savedAssistant(packet)).toMatchObject([{id:packet.done.assistantMessageId,state:'complete',content:packet.done.reviewResult.text}]);
 await noHorizontalOverflow(page);await screenshot(page,testInfo,'grounded-review-complete');
 await review.cards.getByRole('button',{name:'Cancel proposal',exact:true}).click();
 await expect(review.cards).toHaveCount(0);await review.unchanged();
});

for(const [name,method] of [['missing completion','endWithoutDone'],['incomplete result envelope','incompleteEnvelope']]){
 test(`${name} exposes no review card or success text`,async({page,groundedReview:review})=>{
  const packet=await review.begin();
  await page.evaluate(action=>window.__groundedReviewControl[action](),method);
  await review.settled();
  await expect(review.chat.getByText('The reply was interrupted. Try again.',{exact:true})).toBeVisible();
  await expect(review.cards).toHaveCount(0);
  await expect(review.chat.getByText(packet.done.reviewResult.text,{exact:true})).toHaveCount(0);
  expect(await review.savedAssistant(packet)).toEqual([]);await review.unchanged();
 });
}

test('truncated saved completion restores neutral history text without inventing a current card',async({page,groundedReview:review})=>{
 const packet=await review.begin();
 expect(packet.done.reviewResult.text).not.toMatch(/\b(?:cards?|click|confirm|cancel)\b/iu);
 await page.evaluate(()=>window.__groundedReviewControl.savedPartial());
 expect(await review.savedAssistant(packet)).toMatchObject([{id:packet.done.assistantMessageId,state:'complete',content:packet.done.reviewResult.text}]);
 await expect(review.cards).toHaveCount(0);
 await expect(review.chat.getByText(packet.done.reviewResult.text,{exact:true})).toHaveCount(0);
 await page.evaluate(()=>window.__groundedReviewControl.endWithoutDone());
 await review.settled();
 await expect(review.chat.getByText('The reply was interrupted. Try again.',{exact:true})).toBeVisible();
 await expect(review.chat.getByText(packet.done.reviewResult.text,{exact:true})).toBeVisible();
 await expect(review.cards).toHaveCount(0);
 // Use the real history endpoint again; saved prose must not recreate cards.
 await review.chat.getByRole('button',{name:'Reload conversation',exact:true}).click();
 await expect(review.chat.getByText('Conversation restored from the server',{exact:true})).toBeVisible();
 await review.settled();
 await expect(review.chat.getByText(packet.done.reviewResult.text,{exact:true})).toBeVisible();
 await expect(review.cards).toHaveCount(0);await review.unchanged();
});

test('saved no-preview completion gives a clear result and no review card',async({page,groundedReview:review})=>{
 const packet=await review.begin('no_preview');
 expect(packet.done.reviewResult.proposals).toEqual([]);
 expect(await page.evaluate(()=>window.__groundedReviewControl.complete())).toBe(true);
 await review.settled();
 await expect(review.chat.getByText(reviewResultText([],'en'),{exact:true})).toBeVisible();
 await expect(review.chat).toContainText('No review card was prepared');
 await expect(review.cards).toHaveCount(0);
 expect(await review.savedAssistant(packet)).toMatchObject([{id:packet.done.assistantMessageId,state:'complete',content:reviewResultText([],'en')}]);
 await review.unchanged();
});

test('stopping before final persistence cannot leave or revive a usable review card',async({page,groundedReview:review})=>{
 const packet=await review.begin();
 await review.chat.getByRole('button',{name:'Stop reply',exact:true}).click();
 await review.settled();
 await expect(review.chat.getByText('Reply stopped',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.__groundedReviewControl.cancelled)).toBe(true);
 expect(await page.evaluate(()=>window.__groundedReviewControl.complete())).toBe(false);
 expect(review.turns.get(packet.requestId).persisted).toBe(false);
 await expect(review.cards).toHaveCount(0);
 await expect(review.chat.getByText(packet.done.reviewResult.text,{exact:true})).toHaveCount(0);
 expect(await review.savedAssistant(packet)).toEqual([]);await review.unchanged();
});
