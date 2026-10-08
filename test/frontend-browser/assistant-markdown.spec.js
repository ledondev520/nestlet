import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { startBrowserFixture } from '../helpers/browser-fixture.mjs';
import { signInCustomer, createCustomer, createLinkedCase, createEmptyConversation, openLinkedCase, getJson } from './customer-case-support.js';
import { watchBrowser, screenshot, noHorizontalOverflow } from './support.js';

// Authored saved-message fixture; real Chromium, authentication, HTTP history and
// clipboard. This is renderer evidence, not live-provider or end-to-end AI evidence.
const markdown = '# Synthetic review\n\n**Confirmed** and *unknown*\n\n1. Check source\n   - Keep provenance\n\n| Field | Value | Status | Evidence |\n| --- | --- | --- | --- |\n| Owner | Synthetic owner | **Unknown** | Human review required |\n\n```html\n<script>alert("never execute")</script>\n```\n\n[Reference](https://example.invalid/source)\n\n![No tracking](https://tracker.invalid/pixel)\n\n[Unsafe](javascript:alert%281%29)\n\n<img src="https://tracker.invalid/raw" onerror="alert(1)">';

test('assistant Markdown is safe, accessible, mobile-scrollable and copied verbatim', async ({ page, context }, testInfo) => {
  const app = await startBrowserFixture({ legacyUsers: ['synthetic-customer-a'] });
  testInfo.annotations.push({ type: 'markdown-fixture', description: 'Synthetic assistant/user messages seeded in disposable SQLite. Real HTTP, UI, mobile layout and clipboard. No model invocation.' });
  try {
    const assertClean = await watchBrowser(page);
    const requests = []; page.on('request', request => { if (request.url().includes('tracker.invalid')) requests.push(request.url()); });
    const session = await signInCustomer(page, app);
    const client = await createCustomer(page, 'Synthetic Markdown customer');
    const record = await createLinkedCase(page, client, 'Synthetic Markdown case');
    const conversation = await createEmptyConversation(page, app, record, 'Synthetic Markdown messages');
    const userText = '**Keep my literal text** <script>never execute</script>';
    app.withDatabase(db => {
      for (const [i, role, content] of [[1, 'user', userText], [2, 'assistant', markdown]]) {
        db.prepare('INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), session.userId, conversation.id, i, role, content, 'complete', randomUUID(), null, '[]', new Date().toISOString());
      }
    });
    await openLinkedCase(page, client.displayName, record.title);
    // The case remains mounted; API-created fixture history requires the real reload control.
    await page.getByRole('button', {name:'Reload conversation',exact:true}).click();
    await expect(page.getByRole('combobox',{name:'Saved conversations',exact:true})).toHaveValue(conversation.id);
    const assistant = page.locator('.chat-message--assistant');
    await expect(assistant.locator('strong').first()).toHaveText('Confirmed');
    await expect(assistant.locator('ol ul li')).toHaveText('Keep provenance');
    await expect(assistant.locator('table th')).toHaveCount(4);
    await expect(assistant.locator('pre code')).toContainText('<script>');
    await expect(assistant.locator('img,script,iframe')).toHaveCount(0);
    await expect(assistant.locator('a')).toHaveCount(1);
    const user = page.locator('.chat-message--user');
    await expect(user.locator('strong,script')).toHaveCount(0);
    await expect(user).toContainText(userText);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.origin });
    await assistant.getByRole('button', { name: 'Copy reply', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(markdown);
    expect((await getJson(page, app, `/api/conversations/${conversation.id}`)).messages[1].content).toBe(markdown);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await noHorizontalOverflow(page);
      const table = assistant.getByRole('region', { name: 'Response table (scroll horizontally)' });
      await table.evaluate(element=>element.scrollIntoView({block:'center',inline:'nearest'}));
      await table.focus(); await expect(table).toBeFocused();
      const captureTable=async name=>{
        const tableBox=await table.boundingBox(), historyBox=await page.locator('.chat-thread').boundingBox(), composerBox=await page.locator('.chat-composer').boundingBox();
        expect(tableBox.y).toBeGreaterThanOrEqual(historyBox.y-1);
        expect(tableBox.y+tableBox.height).toBeLessThanOrEqual(Math.min(historyBox.y+historyBox.height,composerBox.y)+1);
        await screenshot(page,testInfo,name);
      };
      if (width <= 390) {
        expect(await table.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
        for(let key=0;key<12;key++) await table.press('ArrowLeft');
        await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBe(0);
        await captureTable(`assistant-markdown-${width}-table-left`);
        for(let key=0;key<8;key++) await table.press('ArrowRight');
        await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
        await captureTable(`assistant-markdown-${width}-table-right`);
      } else await captureTable(`assistant-markdown-${width}`);
    }
    expect(requests).toEqual([]);
    await assertClean();
  } finally { await app.stop(); }
});

test('complex full-length assistant text falls back safely and copies without truncation', async ({page,context},testInfo) => {
  const app=await startBrowserFixture({legacyUsers:['synthetic-customer-a']});
  const content='['.repeat(30000)+']'.repeat(30000);
  try {
    const assertClean=await watchBrowser(page);
    const session=await signInCustomer(page,app);
    const client=await createCustomer(page,'Synthetic complexity customer');
    const record=await createLinkedCase(page,client,'Synthetic complexity case');
    const conversation=await createEmptyConversation(page,app,record,'Synthetic complexity message');
    app.withDatabase(db=>db.prepare('INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(),session.userId,conversation.id,1,'assistant',content,'complete',randomUUID(),null,'[]',new Date().toISOString()));
    await openLinkedCase(page,client.displayName,record.title);
    await page.getByRole('button',{name:'Reload conversation',exact:true}).click();
    await expect(page.getByRole('combobox',{name:'Saved conversations',exact:true})).toHaveValue(conversation.id);
    const assistant=page.locator('.chat-message--assistant');
    await expect(assistant.locator('[data-markdown-fallback]')).toHaveText(content);
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:app.origin});
    await assistant.getByRole('button',{name:'Copy reply',exact:true}).click();
    expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(content);
    expect((await getJson(page,app,`/api/conversations/${conversation.id}`)).messages[0].content).toBe(content);
    await page.setViewportSize({width:320,height:900});
    await noHorizontalOverflow(page);
    await expect(assistant.locator('script,img,a')).toHaveCount(0);
    await assertClean();
  } finally {await app.stop();}
});
