import { test, expect, signInCustomer, apiWrite, getJson, responseFor } from './customer-case-support.js';
import { saveCase, navigate, downloadedBytes, watchBrowser, screenshot } from './support.js';

// Desktop Chromium + actual HTTP/SQLite. No provider calls or response mocks.
for (const delayedReadiness of [false, true]) test(`desktop document review gates, repeated exports and literal print rendering${delayedReadiness ? ' with delayed readiness' : ''}`, async ({page, context, customerApp:app}, testInfo) => {
  await page.setViewportSize({width:1440,height:1000});
  const assertClean = await watchBrowser(page);
  await signInCustomer(page,app);
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:app.origin});
  // Gate only transport timing; the server still supplies the actual readiness response.
  let releaseReadiness;
  const readinessGate = new Promise(resolve => { releaseReadiness = resolve; });
  const readinessPattern = '**/api/cases/*/readiness?*';
  const holdReadiness = async route => { await readinessGate; await route.continue(); };
  if (delayedReadiness) await page.route(readinessPattern, holdReadiness);
  let record;
  const documents=page.getByTestId('documents-page');
  try {
    record = await saveCase(page,'Synthetic desktop export case',{review:false});
    const rejected = await apiWrite(page,app,`/api/cases/${record.id}/artifacts/generate`,'POST',{kind:'followup',status:'final',expectedCaseVersion:record.version});
    expect(rejected.status()).toBe(409);
    expect((await getJson(page,app,`/api/cases/${record.id}/artifacts`)).artifacts).toEqual([]);
    await navigate(page,'Conversation');
    await page.getByTestId('chat-case-workflow').getByRole('button',{name:'Finish and preview English document',exact:true}).click();
    await expect(documents.getByText('No saved document versions yet.',{exact:true})).toBeVisible();
    if (delayedReadiness) await expect(documents.locator('#document-answer-property')).toHaveCount(0);
  } finally {
    releaseReadiness();
    if (delayedReadiness) await page.unroute(readinessPattern, holdReadiness);
  }
  // Artifact loading can finish before readiness. Never treat an input not yet
  // rendered as an already-reviewed fact and silently skip it in the fill loop.
  await expect(documents.locator('#document-answer-property')).toBeVisible();
  for(const [key,value] of Object.entries({property:'128 Example Lane Unit B',owner:'Synthetic Property LLC',pha:'Synthetic Housing Office',caseReference:'SYN-BROWSER-104',rent:'$2100',recipientName:'Synthetic recipient',recipientContact:'recipient@example.invalid',senderName:'Synthetic operator',senderContact:'operator@example.invalid'})) {
    const field=documents.locator(`#document-answer-${key}`);
    if(await field.count()) await field.fill(value);
  }
  const generated=responseFor(page,`/api/cases/${record.id}/artifacts/generate`,'POST');
  await documents.getByRole('button',{name:'Save answers & generate final',exact:true}).click();
  const generatedResponse=await generated;expect(generatedResponse.status()).toBe(201);
  const artifact=(await generatedResponse.json()).artifact;
  expect(artifact.status).toBe('final');expect(artifact.content).not.toMatch(/\[insert|TBD/iu);
  const body=documents.getByLabel('English document body',{exact:true});
  await expect(body).toHaveValue(artifact.content);
  for(let attempt=0;attempt<2;attempt++) {
    await documents.getByRole('button',{name:'Copy text',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(artifact.content);
    const download=await downloadedBytes(page,()=>documents.getByRole('button',{name:'Download TXT',exact:true}).click());
    expect(download.name).toBe(`nestlet-followup-v${artifact.version}-final.txt`);
    expect(download.bytes.toString('utf8')).toBe(artifact.content);
  }
  const edited=artifact.content+'\nLiteral fixture: <img src=x onerror=alert(1)> & text.\n';
  await body.fill(edited);
  await expect(documents.getByRole('button',{name:'Download TXT',exact:true})).toBeDisabled();
  await expect(documents.getByRole('button',{name:'Print / Save PDF',exact:true})).toBeDisabled();
  await expect(documents.getByLabel('New version status',{exact:true})).toHaveValue('draft');
  const saved=responseFor(page,`/api/cases/${record.id}/artifacts`,'POST');
  await documents.getByRole('button',{name:'Save new version',exact:true}).click();
  expect((await saved).status()).toBe(201);
  const draft=(await getJson(page,app,`/api/cases/${record.id}/artifacts`)).artifacts.find(value=>value.status==='draft');
  const draftText=await body.inputValue();
  expect(draftText).toContain('Literal fixture: <img src=x onerror=alert(1)> & text.');
  const draftDownload=await downloadedBytes(page,()=>documents.getByRole('button',{name:'Download TXT',exact:true}).click());
  expect(draftDownload.name).toBe(`nestlet-followup-v${draft.version}-draft.txt`);
  expect(draftDownload.bytes.toString('utf8')).toBe(draftText);
  for(let attempt=0;attempt<2;attempt++) {
    const popupPending=page.waitForEvent('popup');
    await documents.getByRole('button',{name:'Print / Save PDF',exact:true}).click();
    const popup=await popupPending;
    await expect(popup.locator('article.print-document')).toHaveText(draftText);
    await expect.poll(()=>popup.evaluate(()=>Boolean(document.querySelector('link[rel=stylesheet]')?.sheet))).toBe(true);
    await popup.emulateMedia({media:'print'});
    expect(await popup.locator('article').evaluate(element=>getComputedStyle(element).whiteSpace)).toBe('pre-wrap');
    expect(await popup.locator('img,script').count()).toBe(0);
    const pdf=await popup.pdf({format:'A4'});
    expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
    await testInfo.attach(`synthetic-print-${attempt+1}.pdf`,{body:pdf,contentType:'application/pdf'});
    await popup.close();
  }
  await body.fill(draftText+'Unsaved local correction.');
  const open=documents.locator(`[data-artifact-id="${artifact.id}"]`).getByRole('button',{name:'Open',exact:true});
  page.once('dialog',dialog=>dialog.dismiss());await open.click();
  await expect(body).toHaveValue(draftText+'Unsaved local correction.');
  page.once('dialog',dialog=>dialog.accept());await open.click();await expect(body).toHaveValue(artifact.content);
  const current=(await getJson(page,app,`/api/cases/${record.id}`)).case;
  const changed=await apiWrite(page,app,`/api/cases/${record.id}/document-context`,'PATCH',{changes:{recipientName:{value:'Updated synthetic recipient'}},confirm:true,expectedVersion:current.version});
  expect(changed.status()).toBe(200);
  const stale=responseFor(page,`/api/artifacts/${artifact.id}/download`,'GET');
  await documents.getByRole('button',{name:'Download TXT',exact:true}).click();
  expect((await stale).status()).toBe(409);
  await expect(documents.getByRole('alert')).toContainText('historical final');
  await expect(body).toHaveValue(artifact.content);
  await screenshot(page,testInfo,'desktop-document-stale-gate');
  await assertClean();
});
