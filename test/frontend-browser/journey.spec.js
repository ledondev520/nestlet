import { test, expect } from '@playwright/test';
import { ENTRY_PATH, screenshot, noHorizontalOverflow, PASSWORD, SOURCE, ORIGINAL_NAME, ORIGINAL_BYTES, legacyLogin, login, navigate, reload, logout, saveCase, openSavedCase, openOriginals, downloadedBytes, watchBrowser } from './support.js';

test('legacy six-character account → standalone original → unassigned case → final document → logout isolation', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const assertBrowserClean = await watchBrowser(page);
  const username = 'synthetic-journey-a';
  const title = 'Synthetic unassigned browser case';
  let original, record, artifact, content;
  await page.goto(ENTRY_PATH);

  await test.step('Sign in to the privately seeded legacy fixture using the six-character boundary', async () => {
    expect(PASSWORD).toHaveLength(6);
    await legacyLogin(page, username);
    expect((await (await page.request.get('/api/cases')).json()).cases).toEqual([]);
    expect((await (await page.request.get('/api/clients')).json()).clients).toEqual([]);
    await screenshot(page, testInfo, 'desktop-home-conversation');
  });

  await test.step('Save an original before any case exists; reload, discover, preview, and download exact bytes', async () => {
    await navigate(page, 'Materials & facts');
    await page.getByLabel('Choose materials', { exact: true }).setInputFiles({ name: ORIGINAL_NAME, mimeType: 'text/plain', buffer: ORIGINAL_BYTES });
    const upload = page.waitForResponse(value => new URL(value.url()).pathname === '/api/assets' && value.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save privately and process', exact: true }).click();
    const response = await upload;
    expect(response.status()).toBe(201);
    original = (await response.json()).asset;
    expect(original).toMatchObject({ originalFilename: ORIGINAL_NAME, caseId: null, clientId: null });
    await expect(page.getByLabel('Case source text', { exact: true })).toHaveValue(/Synthetic standalone original/u);
    await reload(page);
    await navigate(page, 'Customers');
    await expect(page.getByRole('heading', { name: 'No saved cases yet', exact: true })).toBeVisible();
    const originals = await openOriginals(page);
    await originals.getByLabel('Search original materials', { exact: true }).fill(ORIGINAL_NAME);
    await expect(originals.getByText('No customer or case linked', { exact: true })).toBeVisible();
    const preview = originals.getByRole('button', { name: `Text preview: ${ORIGINAL_NAME}`, exact: true });
    await preview.click();
    await expect(originals.locator('pre')).toContainText('<img src=x onerror=alert(1)>');
    await expect(originals.locator('img')).toHaveCount(0);
    const close = originals.getByRole('button', { name: 'Close text preview', exact: true });
    await expect(close).toBeFocused();
    await close.press('Enter');
    await expect(preview).toBeFocused();
    const downloaded = await downloadedBytes(page, () => originals.getByRole('link', { name: `Download original: ${ORIGINAL_NAME}`, exact: true }).click());
    expect(downloaded.name).toBe(ORIGINAL_NAME);
    expect(downloaded.bytes).toEqual(ORIGINAL_BYTES);
    await screenshot(page, testInfo, 'desktop-standalone-original-archive');
  });

  await test.step('Save manual reviewed material as an unassigned case and reopen after a full reload', async () => {
    record = await saveCase(page, title, { review: true });
    await reload(page);
    await navigate(page, 'Customers');
    await expect(page.getByRole('button', { name: `Open saved case: ${title}`, exact: true })).toBeVisible();
    await openOriginals(page);
    await expect(page.getByRole('link', { name: `Download original: ${ORIGINAL_NAME}`, exact: true })).toBeVisible();
    await screenshot(page, testInfo, 'desktop-saved-case-and-original-archive');
    await openSavedCase(page, title);
    await navigate(page, 'Materials & facts');
    await expect(page.getByLabel('Case name', { exact: true })).toHaveValue(title);
    await expect(page.getByLabel('Case source text', { exact: true })).toHaveValue(SOURCE);
    const restoredFacts = page.locator('main > section:not([hidden])').getByRole('checkbox', { name: 'I reviewed this fact or its unknown status', exact: true });
    await expect(restoredFacts).toHaveCount(5);
    for (const checkbox of await restoredFacts.all()) await expect(checkbox).toBeChecked();
    expect((await (await page.request.get('/api/clients')).json()).clients).toEqual([]);
  });

  await test.step('Answer genuine missing details, generate an English final, and download the displayed saved content', async () => {
    await navigate(page, 'Documents');
    const documents = page.getByTestId('documents-page');
    await expect(documents.getByText('A few details to finish', { exact: true })).toBeVisible();
    await expect(documents.getByRole('button', { name: 'Generate final document', exact: true })).toHaveCount(0);
    await documents.getByLabel('Recipient / department', { exact: true }).fill('Synthetic recipient department');
    await documents.getByLabel('Recipient contact/address', { exact: true }).fill('recipient@example.invalid');
    await documents.getByLabel('Sender name', { exact: true }).fill('Synthetic browser operator');
    await documents.getByLabel('Sender contact', { exact: true }).fill('operator@example.invalid');
    const generated = page.waitForResponse(value => new URL(value.url()).pathname === `/api/cases/${record.id}/artifacts/generate` && value.request().method() === 'POST');
    await documents.getByRole('button', { name: 'Save answers & generate final', exact: true }).click();
    const response = await generated;
    expect(response.status()).toBe(201);
    artifact = (await response.json()).artifact;
    expect(artifact).toMatchObject({ status: 'final', caseId: record.id, kind: 'followup' });
    await expect(documents.getByText('Final document saved.', { exact: true })).toBeVisible();
    content = await documents.getByLabel('English document body', { exact: true }).inputValue();
    expect(content).toBe(artifact.content);
    expect(content).toContain('128 Example Lane Unit B');
    expect(content).toContain('Synthetic browser operator');
    expect(content).not.toMatch(/\[To be confirmed\]|\b(?:TBD|TODO)\b|\{\{/u);
    const download = await downloadedBytes(page, () => documents.getByRole('button', { name: 'Download TXT', exact: true }).click());
    expect(download.name).toMatch(/^nestlet-followup-v\d+-final\.txt$/u);
    expect(download.bytes.toString('utf8')).toBe(content);
    await screenshot(page, testInfo, 'desktop-final-document');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await noHorizontalOverflow(page);
      await screenshot(page, testInfo, `mobile-${width}-en-final-document`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  await test.step('Cancel sign-out, then sign out and prove another ordinary account cannot discover or read any record', async () => {
    await logout(page, { cancel: true });
    await expect(page.getByLabel('English document body', { exact: true })).toHaveValue(content);
    await logout(page);
    await expect(page.locator('body')).not.toContainText(title);
    expect((await page.request.get(`/api/cases/${record.id}`)).status()).toBe(401);
    await legacyLogin(page, 'synthetic-journey-b');
    await navigate(page, 'Customers');
    await expect(page.getByRole('heading', { name: 'No saved cases yet', exact: true })).toBeVisible();
    const originals = await openOriginals(page);
    await expect(originals.getByRole('heading', { name: 'No saved originals yet', exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(title);
    await expect(page.locator('body')).not.toContainText(ORIGINAL_NAME);
    for (const path of [`/api/cases/${record.id}`, `/api/assets/${original.id}/text`, `/api/assets/${original.id}/download`, `/api/artifacts/${artifact.id}`, `/api/artifacts/${artifact.id}/download`]) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
    expect((await page.request.get('/api/settings')).status()).toBe(403);
    await navigate(page, 'Conversation');
    await expect(page.getByLabel('What would you like to work on?', { exact: true })).toHaveValue('');
    await logout(page);
  });

  await test.step('Sign back in with six characters and recover the saved final without asking confirmed details again', async () => {
    await login(page, username);
    await openSavedCase(page, title);
    await navigate(page, 'Documents');
    const documents = page.getByTestId('documents-page');
    await expect(documents.getByText('The essential details are ready.', { exact: true })).toBeVisible();
    await expect(documents.getByLabel('Recipient / department', { exact: true })).toHaveCount(0);
    await documents.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(documents.getByLabel('English document body', { exact: true })).toHaveValue(content);
    const download = await downloadedBytes(page, () => documents.getByRole('button', { name: 'Download TXT', exact: true }).click());
    expect(download.bytes.toString('utf8')).toBe(content);
  });
  await assertBrowserClean();
});
