import { randomUUID } from 'node:crypto';
import { test, expect, signInCustomer, apiWrite } from './customer-case-support.js';
import { accountSettings, navigate, noHorizontalOverflow, screenshot, switchLanguage } from './support.js';

for(const {width,lang} of [{width:1280,lang:'en'},{width:390,lang:'zh'},{width:320,lang:'zh'}])test(`generic history stays identifiable and resumes at the latest message (${width}/${lang})`,async({page,customerApp:app},testInfo)=>{
 testInfo.annotations.push({type:'synthetic-history',description:'Authored saved-message fixtures exercise navigation only. No live provider, real user content or generated-title acceptance.'});
 await page.setViewportSize({width,height:800});const session=await signInCustomer(page,app);
 const rows=[];
 for(const [index,topic] of ['Synthetic Elm Street follow-up','Synthetic Oak Street facts'].entries()){
  const result=await apiWrite(page,app,'/api/cases','POST',{title:topic,sourceText:'',fields:[],draftType:'followup',draftText:''});expect(result.status()).toBe(201);const record=(await result.json()).case;
  const response=await apiWrite(page,app,`/api/cases/${record.id}/conversations`,'POST',{title:'案例会话'});expect(response.status()).toBe(201);const conversation=(await response.json()).conversation;rows.push({...conversation,topic});
  app.withDatabase(db=>{
   for(let sequence=1;sequence<=12;sequence++)db.prepare('INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),session.userId,conversation.id,sequence,sequence%2?'user':'assistant',sequence===12?topic+' latest saved reply':`Synthetic earlier message ${sequence}. `+'Earlier source-linked notes. '.repeat(40),'complete',null,null,'[]','2026-10-09T01:00:00.000Z');
   db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run('2026-10-09T01:00:00.000Z',conversation.id);
  });
 }
 let providerRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')providerRequests++;});
 await page.reload();await switchLanguage(page,lang);
 const opening=page.locator('[data-conversation-opening]');await expect(opening).toBeVisible();
 for(const row of rows){const link=opening.locator(`a[href="#chat?conversation=${row.id}"]`);await expect(link).toContainText('案例会话');await expect(link).toContainText(row.displayId);await expect(link).toContainText(row.topic);await expect(link).toContainText('2026');}
 await screenshot(page,testInfo,`history-identifiable-${width}-${lang}`,false);
 await opening.locator(`a[href="#chat?conversation=${rows[0].id}"]`).click();
 const thread=page.locator('.chat-thread'),latest=thread.getByText(rows[0].topic+' latest saved reply',{exact:true});
 await expect(latest).toBeInViewport();
 await expect.poll(()=>thread.evaluate(node=>node.scrollHeight-node.clientHeight-node.scrollTop)).toBeLessThan(3);
 await thread.evaluate(node=>{node.scrollTop=180;node.dispatchEvent(new Event('scroll'));});
 const top=await thread.evaluate(node=>node.scrollTop);expect(top).toBeGreaterThan(0);
 await navigate(page,lang==='zh'?'材料':'Materials & facts');await navigate(page,lang==='zh'?'对话':'Conversation');
 await expect.poll(()=>thread.evaluate(node=>node.scrollTop)).toBe(top);
 await accountSettings(page);await page.getByRole('button',{name:lang==='zh'?'返回':'Back to workspace',exact:true}).click();
 await expect.poll(()=>thread.evaluate(node=>node.scrollTop)).toBe(top);
 if(width<960)await page.getByRole('button',{name:lang==='zh'?'打开列表':'Open conversations',exact:true}).click();
 const rail=page.locator('.wb-rail');const active=rail.locator(`a[href="#chat?conversation=${rows[0].id}"]`);await expect(active).toContainText(rows[0].topic);await active.click();
 await expect.poll(()=>thread.evaluate(node=>node.scrollTop)).toBe(top);
 if(width<960)await page.getByRole('button',{name:lang==='zh'?'打开列表':'Open conversations',exact:true}).click();
 await rail.locator(`a[href="#chat?conversation=${rows[1].id}"]`).click();
 await expect(thread.getByText(rows[1].topic+' latest saved reply',{exact:true})).toBeInViewport();
 await noHorizontalOverflow(page);await screenshot(page,testInfo,`history-resumed-${width}-${lang}`,false);
 expect(providerRequests).toBe(0);
});
