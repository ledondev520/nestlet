import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import { test, expect, signInCustomer, apiWrite, getJson, responseFor } from './customer-case-support.js';
import { saveCase, navigate, downloadedBytes, watchBrowser, screenshot } from './support.js';

// Desktop Chromium + actual HTTP/SQLite. No provider calls or response mocks.
test('direct PDF download saves the exact final and edited literal draft, repeats, and rejects stale finals', async ({page, context, customerApp:app}, testInfo) => {
  const delayedReadiness = false;
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
    // This page installs only the readiness handler. Drain its callbacks before
    // disabling interception so pending routes are not continued twice.
    if (delayedReadiness) await page.unrouteAll({behavior:'wait'});
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
  async function savePdf(expected, label) {
    const pending=page.waitForEvent('download');
    await documents.getByRole('button',{name:'Download PDF',exact:true}).click();
    const download=await pending, file=testInfo.outputPath(label+'.pdf');
    await download.saveAs(file);
    expect(await download.failure()).toBeNull();
    const bytes=await readFile(file);
    expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
    const text=execFileSync('pdftotext',['-raw',file,'-'],{encoding:'utf8'});
    expect(text.replace(/\s/g,'')).toBe(expected.content.replace(/\s/g,''));
    expect(text).not.toMatch(/Download PDF|Save new version|Print \/ Save PDF/);
    expect(download.suggestedFilename()).toBe(`nestlet-followup-v${expected.version}-${expected.status}.pdf`);
    await testInfo.attach(label,{path:file,contentType:'application/pdf'});
    execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to','1400','-png',file,testInfo.outputPath(label)]);
    await testInfo.attach(label+'-page1',{path:testInfo.outputPath(label+'.png'),contentType:'image/png'});
  }
  await savePdf(artifact,'final-download-1'); await savePdf(artifact,'final-download-2');
  const edited=artifact.content+'\nLiteral <script>alert(1)</script> & <img src=x> end.';
  await body.fill(edited);
  await expect(documents.getByRole('button',{name:'Download PDF',exact:true})).toBeDisabled();
  const saved=responseFor(page,`/api/cases/${record.id}/artifacts`,'POST');
  await documents.getByRole('button',{name:'Save new version',exact:true}).click();
  const savedResponse=await saved;expect(savedResponse.status()).toBe(201);
  const draft=(await savedResponse.json()).artifact;
  await savePdf(draft,'literal-draft-download');
  await body.fill(draft.content+' Unsupported symbol: 😀');
  const unsupportedSaved=responseFor(page,`/api/cases/${record.id}/artifacts`,'POST');
  await documents.getByRole('button',{name:'Save new version',exact:true}).click();
  expect((await unsupportedSaved).status()).toBe(201);
  const pdfFailure=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/pdf'));
  await documents.getByRole('button',{name:'Download PDF',exact:true}).click();
  expect((await pdfFailure).status()).toBe(422);
  await expect(documents.getByRole('alert')).toContainText('Some characters cannot be represented faithfully');
  await documents.locator(`[data-artifact-id="${artifact.id}"]`).getByRole('button',{name:'Open',exact:true}).click();
  await expect(body).toHaveValue(artifact.content);
  const current=(await getJson(page,app,`/api/cases/${record.id}`)).case;
  const changed=await apiWrite(page,app,`/api/cases/${record.id}/document-context`,'PATCH',{changes:{recipientName:{value:'Updated synthetic recipient'}},confirm:true,expectedVersion:current.version});
  expect(changed.status()).toBe(200);
  const stale=responseFor(page,`/api/artifacts/${artifact.id}/pdf`,'GET');
  let unexpectedDownloads=0;page.on('download',()=>unexpectedDownloads++);
  await documents.getByRole('button',{name:'Download PDF',exact:true}).click();
  expect((await stale).status()).toBe(409);
  await expect(documents.getByRole('alert')).toContainText('historical final');
  expect(unexpectedDownloads).toBe(0);
  await screenshot(page,testInfo,'direct-pdf-stale-guard');await assertClean();
});
