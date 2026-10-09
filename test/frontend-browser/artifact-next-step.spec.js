import { test, expect, signInCustomer, apiWrite, getJson } from './customer-case-support.js';
import { saveCase, navigate, downloadedBytes, switchLanguage, screenshot } from './support.js';

test('saved final is the next step, manual version/edits survive navigation, and lookup never claims a reply', async ({page, customerApp:app},testInfo) => {
  const modelCalls=[];page.on('request',request=>{if(/\/api\/(chat|extract)(\?|$)/u.test(new URL(request.url()).pathname))modelCalls.push(request.url());});
  await page.setViewportSize({width:1280,height:900});await signInCustomer(page,app);
  const record=await saveCase(page,'Synthetic next-step case',{review:false});
  const confirmed=await apiWrite(page,app,`/api/cases/${record.id}/document-context`,'PATCH',{
    expectedVersion:record.version,confirm:true,
    factChanges:Object.fromEntries(Object.entries({property:'128 Synthetic Lane',owner:'Synthetic LLC',pha:'Synthetic Housing Office',caseReference:'SYN-NEXT',rent:'$2100'}).map(([key,value])=>[key,{value}])),
    changes:Object.fromEntries(Object.entries({recipientName:'Synthetic recipient',recipientContact:'recipient@example.invalid',senderName:'Synthetic sender',senderContact:'sender@example.invalid'}).map(([key,value])=>[key,{value}]))
  });expect(confirmed.status()).toBe(200);const saved=(await confirmed.json()).case;
  const generated=await apiWrite(page,app,`/api/cases/${record.id}/artifacts/generate`,'POST',{kind:'followup',status:'final',expectedCaseVersion:saved.version});expect(generated.status()).toBe(201);const final=(await generated.json()).artifact;
  const draftResponse=await apiWrite(page,app,`/api/cases/${record.id}/artifacts`,'POST',{kind:'followup',title:'Newer synthetic draft',status:'draft',content:'DRAFT — Synthetic text still needing review.',expectedCaseVersion:saved.version});expect(draftResponse.status()).toBe(201);const draft=(await draftResponse.json()).artifact;
  await navigate(page,'Conversation');const workflow=page.getByTestId('chat-case-workflow');
  await expect(workflow).toContainText('A final document matches the saved case.');await expect(workflow).toContainText('A newer draft is also saved');
  await expect(workflow).not.toContainText('Saved details are ready for document generation.');
  await workflow.getByRole('button',{name:'View saved documents',exact:true}).click();
  const documents=page.getByTestId('documents-page'),next=page.getByTestId('document-next-step'),body=documents.getByLabel('English document body',{exact:true});
  await expect(next).toContainText('A final document matches');await expect(documents.getByRole('button',{name:'Generate another document',exact:true})).toBeVisible();
  await next.getByRole('button',{name:'Open current final',exact:true}).click();await expect(body).toHaveValue(final.content);
  const txt=await downloadedBytes(page,()=>documents.getByRole('button',{name:'Download TXT',exact:true}).click());expect(txt.bytes.toString('utf8')).toBe(final.content);
  const pdf=await downloadedBytes(page,()=>documents.getByRole('button',{name:'Download PDF',exact:true}).click());expect(pdf.bytes.subarray(0,5).toString()).toBe('%PDF-');expect(pdf.name).toBe(`nestlet-followup-v${final.version}-final.pdf`);
  await documents.locator(`[data-artifact-id="${draft.id}"]`).getByRole('button',{name:'Open',exact:true}).click();await expect(body).toHaveValue(draft.content);
  await navigate(page,'Conversation');await navigate(page,'Documents');await expect(body).toHaveValue(draft.content); // no automatic selection on return
  await body.fill(draft.content+'\nUnsaved operator edit.');
  page.once('dialog',dialog=>dialog.dismiss());await next.getByRole('button',{name:'Open current final',exact:true}).click();await expect(body).toHaveValue(draft.content+'\nUnsaved operator edit.');
  page.once('dialog',dialog=>dialog.accept());await next.getByRole('button',{name:'Open current final',exact:true}).click();await expect(body).toHaveValue(final.content);
  await screenshot(page,testInfo,'existing-final-preferred');
  await navigate(page,'Conversation');const search=page.getByRole('searchbox',{name:'Customer name or case title',exact:true});await search.fill('Synthetic next-step');await page.getByRole('button',{name:'Find saved records',exact:true}).click();
  const results=page.getByRole('region',{name:'Saved search results',exact:true});await expect(results).toContainText('No reply was sent and no record was changed.');await expect(results).not.toContainText('reply status');
  await switchLanguage(page,'zh'); // rerender keeps the explicit result origin
  await expect(page.getByRole('region',{name:'查找结果',exact:true})).toContainText('未发送对话，也未修改记录。');
  await expect(page.getByRole('region',{name:'查找结果',exact:true})).not.toContainText('引用已附');
  await screenshot(page,testInfo,'lookup-status-zh');await switchLanguage(page,'en');
  const changed=await apiWrite(page,app,`/api/cases/${record.id}/document-context`,'PATCH',{expectedVersion:saved.version,confirm:true,changes:{recipientName:{value:'Changed synthetic recipient'}}});expect(changed.status()).toBe(200);
  await navigate(page,'Documents');await navigate(page,'Conversation');await expect(workflow).toContainText('Saved documents use older case details');await expect(workflow).not.toContainText('A final document matches');
  await navigate(page,'Documents');await expect(next).toContainText('Saved documents use older case details');await expect(next.getByRole('button',{name:'Open current final',exact:true})).toHaveCount(0);
  await expect(body).toHaveValue(final.content);await expect(documents).toContainText('Historical'); // explicit prior selection remains, correctly stale
  const versions=(await getJson(page,app,`/api/cases/${record.id}/artifacts`)).artifacts;expect(versions).toHaveLength(2);expect(modelCalls).toEqual([]);
});
