import { test, expect, signInCustomer, apiWrite, getJson } from './customer-case-support.js';
import { navigate, screenshot, watchBrowser } from './support.js';
import { newCasePayload } from '../../frontend/features/chat/logic.js';

// Actual Chromium + HTTP + SQLite. No intercepted responses, provider or model calls.
test('chat lookup is read-only, requires an exact case choice, and protects unsaved work', async ({ page, customerApp: app }, testInfo) => {
  const assertClean = await watchBrowser(page);
  await signInCustomer(page, app);
  const clientResponse = await apiWrite(page, app, '/api/clients', 'POST', { displayName: 'Synthetic lookup customer' });
  expect(clientResponse.status()).toBe(201); const client = (await clientResponse.json()).client;
  const records = [];
  for (let index = 0; index < 2; index++) {
    const response = await apiWrite(page, app, '/api/cases', 'POST', { ...newCasePayload('Synthetic matching case'), clientId: client.id });
    expect(response.status()).toBe(201); records.push((await response.json()).case);
  }
  const mutations = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    // Existing privacy-safe journey telemetry is independent of record mutations.
    if (path.startsWith('/api/') && !path.startsWith('/api/workflows') && request.method() !== 'GET') mutations.push(request.url());
  });
  const chat = page.locator('[data-feature="chat"]');
  const lookup = page.locator('.wb-rail').getByRole('region', { name: 'Find a saved customer or case', exact: true });
  await lookup.getByLabel('Customer name or case title', { exact: true }).fill('Synthetic lookup');
  await lookup.getByRole('button', { name: 'Find saved records', exact: true }).click();
  await expect(lookup.getByRole('button', { name: 'Choose a customer case', exact: true })).toBeVisible();
  await lookup.getByRole('button', { name: 'Choose a customer case', exact: true }).click();
  const choice = record => lookup.getByRole('button', { name: `Open case: ${record.title} · ${record.id}`, exact: true });
  await expect(choice(records[0])).toBeVisible(); await expect(choice(records[1])).toBeVisible();
  await expect(chat).not.toHaveAttribute('data-case-id',records[0].id);
  await chat.locator('.chat-input').fill('Keep this unsent synthetic question');
  page.once('dialog', dialog => dialog.dismiss());
  await choice(records[1]).click();
  await expect(lookup).toContainText('Your unsaved work was kept');
  await expect(chat.locator('.chat-input')).toHaveValue('Keep this unsent synthetic question');
  page.once('dialog', dialog => dialog.accept());
  await choice(records[1]).click();
  await expect(chat).toHaveAttribute('data-case-id',records[1].id);
  await expect(chat.locator('.chat-input')).toHaveValue('');
  await navigate(page, 'Materials & facts');
  await expect(page.getByLabel('Case name', { exact: true })).toHaveValue(records[1].title);
  await page.getByLabel('Case source text', { exact: true }).fill('Keep this material edit');
  await navigate(page, 'Conversation');
  await lookup.getByLabel('Customer name or case title', { exact: true }).fill('Synthetic matching');
  await lookup.getByRole('button', { name: 'Find saved records', exact: true }).click();
  const first = lookup.locator(`[data-source-id]`).filter({ hasText: records[0].id });
  await expect(first.getByRole('button', { name: 'Open case', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await first.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(lookup).toContainText('Your unsaved work was kept');
  await navigate(page, 'Materials & facts');
  await expect(page.getByLabel('Case source text', { exact: true })).toHaveValue('Keep this material edit');
  await navigate(page, 'Conversation');
  await lookup.getByLabel('Customer name or case title', { exact: true }).fill('No such synthetic record');
  await lookup.getByRole('button', { name: 'Find saved records', exact: true }).click();
  await expect(lookup).toContainText('No matching saved customers or cases.');
  expect((await getJson(page, app, '/api/cases')).cases).toHaveLength(2);
  expect(mutations).toEqual([]);
  await screenshot(page, testInfo, 'chat-read-only-lookup-desktop');
  await assertClean();
});
