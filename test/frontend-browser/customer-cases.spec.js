import { test, expect, CUSTOMER_USERS, signInCustomer, getJson, apiWrite, responseFor, createCustomer,
  customerRecord, selectCustomer, createLinkedCase, openLinkedCase, saveLinkedMaterial, createEmptyConversation } from './customer-case-support.js';
import { ENTRY_PATH, SOURCE, english, navigate, reload, logout, downloadedBytes, screenshot, watchBrowser } from './support.js';

test('customer → two cases → resolved question and document versions → real server restart → empty conversations → role isolation', async ({ page, customerApp: app }, testInfo) => {
  test.setTimeout(150000);
  const assertClean = await watchBrowser(page);
  await signInCustomer(page, app);
  const label = 'Synthetic Johnny 100%_case';
  const otherLabel = 'Synthetic Élodie';
  const client = await createCustomer(page, label);
  await createCustomer(page, otherLabel);

  await test.step('Search real customer records literally, including Unicode and wildcard characters', async () => {
    for (const [query, expected] of [['johnny', label], ['%', label], ['_', label], ['élodie', otherLabel]]) {
      const pending = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/clients' && url.searchParams.get('search') === query;
      });
      await page.getByLabel('Search customers', { exact: true }).fill(query);
      expect((await pending).status()).toBe(200);
      const rows = page.getByRole('list', { name: 'Customer directory', exact: true }).getByRole('button');
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(expected);
    }
  });

  await selectCustomer(page, label);
  let first = await createLinkedCase(page, client, 'Synthetic customer case one');
  const originalName = 'synthetic-customer-linked-original.txt';
  const originalBytes = Buffer.from(SOURCE + '\r\n', 'utf8');
  await navigate(page, 'Materials & facts');
  await page.getByLabel('Choose materials', { exact: true }).setInputFiles({ name: originalName, mimeType: 'text/plain', buffer: originalBytes });
  const uploading = responseFor(page, '/api/assets', 'POST');
  await page.getByRole('button', { name: 'Save privately and process', exact: true }).click();
  const uploaded = await uploading;
  expect(uploaded.status()).toBe(201);
  const original = (await uploaded.json()).asset;
  expect(original).toMatchObject({ originalFilename: originalName, caseId: first.id, clientId: client.id });
  await expect(page.getByLabel('Case source text', { exact: true })).toHaveValue(/Property: 128 Example Lane Unit B/u);
  first = await saveLinkedMaterial(page, first, SOURCE, { review: true });
  let final, draft, finalText, draftText;
  const question = 'Which synthetic contact should receive the follow-up?';
  const resolution = 'Use the reviewed synthetic recipient department.';

  await test.step('Resolve a question, confirm required details once, generate final and save an edited draft separately', async () => {
    await navigate(page, 'Documents');
    const documents = page.getByTestId('documents-page');
    await documents.getByRole('button', { name: 'Add a question', exact: true }).click();
    await documents.getByLabel('Question', { exact: true }).fill(question);
    await documents.getByLabel('Status', { exact: true }).selectOption('resolved');
    await documents.getByLabel('Answer / resolution', { exact: true }).fill(resolution);
    const issue = responseFor(page, `/api/cases/${first.id}/issues`, 'PATCH');
    await documents.getByRole('button', { name: 'Save question', exact: true }).click();
    expect((await issue).status()).toBe(200);
    await expect(documents.getByText(resolution, { exact: true })).toBeVisible();
    for (const [name, value] of [
      ['Recipient / department', 'Synthetic recipient department'], ['Recipient contact/address', 'recipient@example.invalid'],
      ['Sender name', 'Synthetic case operator'], ['Sender contact', 'operator@example.invalid']
    ]) await documents.getByLabel(name, { exact: true }).fill(value);
    const generated = responseFor(page, `/api/cases/${first.id}/artifacts/generate`, 'POST');
    await documents.getByRole('button', { name: 'Save answers & generate final', exact: true }).click();
    const response = await generated;
    expect(response.status()).toBe(201);
    final = (await response.json()).artifact;
    expect(final).toMatchObject({ caseId: first.id, status: 'final', kind: 'followup' });
    finalText = final.content;
    await expect(documents.getByLabel('English document body', { exact: true })).toHaveValue(finalText);
    expect(finalText).not.toContain(label); // A customer label is never a legal party.
    draftText = finalText + '\n\nSynthetic operator note retained for review.';
    await documents.getByLabel('English document body', { exact: true }).fill(draftText);
    await documents.getByLabel('Version title', { exact: true }).fill('Synthetic edited review version');
    await documents.getByLabel('New version status', { exact: true }).selectOption('draft');
    const edited = responseFor(page, `/api/cases/${first.id}/artifacts`, 'POST');
    await documents.getByRole('button', { name: 'Save new version', exact: true }).click();
    const editedResponse = await edited;
    expect(editedResponse.status()).toBe(201);
    draft = (await editedResponse.json()).artifact;
    expect(draft).toMatchObject({ caseId: first.id, status: 'draft', content: draftText, version: final.version + 1 });
    await expect(documents.getByText('Saved.', { exact: true })).toBeVisible();
    await expect(documents.getByRole('button', { name: 'Download TXT', exact: true })).toBeEnabled();
  });

  // There is intentionally no provider-enabled Send. These are genuine empty
  // API-created conversations, not synthetic messages presented as live output.
  const conversations = [];
  for (const title of ['Synthetic intake discussion', 'Synthetic follow-up discussion']) {
    conversations.push(await createEmptyConversation(page, app, first, title));
  }
  await selectCustomer(page, label);
  let second = await createLinkedCase(page, client, 'Synthetic customer case two');
  const secondSource = 'Synthetic second case source. Keep this separate from the first case.';
  second = await saveLinkedMaterial(page, second, secondSource);
  const secondConversation = await createEmptyConversation(page, app, second, 'Synthetic second-case discussion');

  await test.step('Restart the real server on the same SQLite/assets without a repeated sign-in', async () => {
    const priorPid = app.child.pid;
    const before = await getJson(page, app, '/api/status');
    await app.restart();
    expect(app.child.pid).not.toBe(priorPid);
    expect((await page.request.get(app.origin + `/api/cases/${first.id}`)).status()).toBe(200);
    const resumed = await getJson(page, app, '/api/status');
    expect(resumed).toMatchObject({ authenticated: true, userId: before.userId, csrfToken: before.csrfToken });
    await reload(page);
    await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).not.toBeVisible();
  });

  await test.step('Reopen both cases without mixing sources, original bytes, facts, questions or artifact versions', async () => {
    await selectCustomer(page, label);
    const detail = customerRecord(page);
    await expect(detail.getByRole('button', { name: /^Open case:/u })).toHaveCount(2);
    await expect(detail.getByText('2 document versions', { exact: true })).toBeVisible();
    await screenshot(page, testInfo, 'customer-two-cases-two-document-versions');
    await openLinkedCase(page, label, first.title);
    const chat = page.locator('[data-feature="chat"]');
    const selector = chat.getByRole('combobox', { name: 'Saved conversations', exact: true });
    await expect(selector.locator('option')).toHaveCount(3);
    for (const conversation of conversations) {
      await selector.selectOption(conversation.id);
      await expect(selector).toHaveValue(conversation.id);
      await expect(chat.getByRole('heading', { name: 'What would you like to work on?', exact: true })).toBeVisible();
      await expect(chat.getByRole('log').locator('article')).toHaveCount(0);
    }
    await navigate(page, 'Materials & facts');
    await expect(page.getByLabel('Case source text', { exact: true })).toHaveValue(SOURCE);
    const originalDownload = await downloadedBytes(page, () => page.getByRole('link', { name: 'Download original', exact: true }).click());
    expect(originalDownload.name).toBe(originalName);
    expect(originalDownload.bytes).toEqual(originalBytes);
    const checks = page.getByRole('checkbox', { name: 'I reviewed this fact or its unknown status', exact: true });
    await expect(checks).toHaveCount(5);
    for (const check of await checks.all()) await expect(check).toBeChecked();
    await navigate(page, 'Documents');
    const documents = page.getByTestId('documents-page');
    await expect(documents.getByText(resolution, { exact: true })).toBeVisible();
    await expect(documents.getByText('The essential details are ready.', { exact: true })).toBeVisible();
    await expect(documents.getByLabel('Recipient / department', { exact: true })).toHaveCount(0);
    for (const [artifact, content] of [[final, finalText], [draft, draftText]]) {
      await documents.locator(`[data-artifact-id="${artifact.id}"]`).getByRole('button', { name: 'Open', exact: true }).click();
      await expect(documents.getByLabel('English document body', { exact: true })).toHaveValue(content);
      const downloaded = await downloadedBytes(page, () => documents.getByRole('button', { name: 'Download TXT', exact: true }).click());
      expect(downloaded.bytes.toString('utf8')).toBe(content);
      expect((await getJson(page, app, `/api/artifacts/${artifact.id}`)).artifact.content).toBe(content);
    }
    await screenshot(page, testInfo, 'customer-reopened-question-and-edited-draft');
    await openLinkedCase(page, label, second.title);
    await expect(chat.getByRole('combobox', { name: 'Saved conversations', exact: true })).toHaveValue(secondConversation.id);
    await expect(chat).not.toContainText(conversations[0].title);
    await navigate(page, 'Materials & facts');
    await expect(page.getByLabel('Case source text', { exact: true })).toHaveValue(secondSource);
    await navigate(page, 'Documents');
    await expect(documents.getByText('No saved document versions yet.', { exact: true })).toBeVisible();
    await expect(documents.getByText('No saved questions for this case.', { exact: true })).toBeVisible();
    const saved = (await getJson(page, app, `/api/cases/${first.id}`)).case;
    expect(saved.caseIssues).toEqual([expect.objectContaining({ question, resolution, status: 'resolved' })]);
    expect(saved.documentContext.recipientName).toMatchObject({ value: 'Synthetic recipient department', confirmed: true });
  });

  await test.step('Ordinary account and system owner see their own empty UI and cannot read or mutate another user’s records', async () => {
    for (const username of [CUSTOMER_USERS[1], 'owner']) {
      await logout(page);
      await signInCustomer(page, app, username);
      await navigate(page, 'Customers');
      await expect(page.getByRole('heading', { name: 'No saved cases yet', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No customer records yet', exact: true })).toBeVisible();
      for (const marker of [label, first.title, second.title, finalText, draftText, resolution, originalName]) await expect(page.locator('body')).not.toContainText(marker);
      for (const path of [`/api/clients/${client.id}`, `/api/clients/${client.id}/cases`, `/api/clients/${client.id}/artifacts`,
        `/api/cases/${first.id}`, `/api/cases/${second.id}`, `/api/cases/${first.id}/conversations`,
        `/api/assets/${original.id}`, `/api/assets/${original.id}/text`, `/api/assets/${original.id}/download`,
        ...[...conversations, secondConversation].map(row => `/api/conversations/${row.id}`),
        ...[final, draft].flatMap(row => [`/api/artifacts/${row.id}`, `/api/artifacts/${row.id}/download`])]) {
        expect((await page.request.get(app.origin + path)).status(), path).toBe(404);
      }
      expect((await apiWrite(page, app, `/api/clients/${client.id}`, 'PUT', { displayName: 'Forbidden rename', expectedVersion: client.version })).status()).toBe(404);
      expect((await apiWrite(page, app, `/api/cases/${first.id}`, 'DELETE', { expectedVersion: first.version })).status()).toBe(404);
      await page.getByRole('button', { name: 'Account and settings', exact: true }).click();
      await expect(page.getByTestId('account-access')).toBeVisible();
      await expect(page.getByTestId('account-access')).toHaveText(username === 'owner' ? 'Owner' : 'Ordinary user');
      await expect(page.getByRole('button', { name: 'Model settings', exact: true })).toHaveCount(username === 'owner' ? 1 : 0);
      expect((await page.request.get(app.origin + '/api/settings')).status()).toBe(username === 'owner' ? 200 : 403);
      await navigate(page, 'Customers');
    }
    await logout(page);
    await signInCustomer(page, app);
    await openLinkedCase(page, label, first.title);
    await navigate(page, 'Documents');
    const documents = page.getByTestId('documents-page');
    await documents.locator(`[data-artifact-id="${final.id}"]`).getByRole('button', { name: 'Open', exact: true }).click();
    await expect(documents.getByLabel('English document body', { exact: true })).toHaveValue(finalText);
    expect((await getJson(page, app, `/api/clients/${client.id}`)).client.displayName).toBe(label);
  });
  await assertClean();
});

test('two real tabs reject stale case saves, preserve both sources, and require explicit reconciliation', async ({ page, context, customerApp: app }, testInfo) => {
  const assertClean = await watchBrowser(page);
  await signInCustomer(page, app);
  const client = await createCustomer(page, 'Synthetic concurrent case customer');
  let record = await createLinkedCase(page, client, 'Synthetic concurrent case');
  record = await saveLinkedMaterial(page, record, 'Synthetic original source.');
  const stale = await context.newPage();
  const assertStaleClean = await watchBrowser(stale);
  try {
    await stale.goto(app.origin + ENTRY_PATH); await english(stale);
    await openLinkedCase(stale, client.displayName, record.title);
    await navigate(stale, 'Materials & facts');
    await expect(stale.getByLabel('Case source text', { exact: true })).toHaveValue(record.sourceText);
    const local = 'Synthetic local source preserved after conflict.';
    const remote = 'Synthetic newer remote source preserved after conflict.';
    const newTitle = 'Synthetic reconciled case title';
    await stale.getByLabel('Case name', { exact: true }).fill(newTitle);
    await stale.getByLabel('Case source text', { exact: true }).fill(local);
    const newer = await saveLinkedMaterial(page, record, remote);
    const conflict = responseFor(stale, `/api/cases/${record.id}`, 'PUT');
    await stale.getByRole('button', { name: 'Save case', exact: true }).click();
    const rejected = await conflict;
    expect(rejected.status()).toBe(409);
    expect((await rejected.json()).code).toBe('CASE_CONFLICT');
    expect(rejected.request().postDataJSON().expectedVersion).toBe(record.version);
    await expect(stale.getByLabel('Case source text', { exact: true })).toHaveValue(local);
    await expect(stale.getByLabel('Case name', { exact: true })).toHaveValue(newTitle);
    await expect(stale.getByRole('button', { name: 'Save case', exact: true })).toBeDisabled();
    expect((await getJson(page, app, `/api/cases/${record.id}`)).case).toMatchObject({ sourceText: remote, version: newer.version });
    await stale.getByRole('button', { name: 'Read latest to compare', exact: true }).click();
    await expect(stale.getByRole('button', { name: 'Reconcile and review', exact: true })).toBeVisible();
    await expect(stale.getByLabel('Case source text', { exact: true })).toHaveValue(local);
    await stale.getByRole('button', { name: 'Reconcile and review', exact: true }).click();
    const merged = await stale.getByLabel('Case source text', { exact: true }).inputValue();
    expect(merged).toContain(local); expect(merged).toContain(remote);
    expect((await getJson(page, app, `/api/cases/${record.id}`)).case.version).toBe(newer.version);
    const saved = responseFor(stale, `/api/cases/${record.id}`, 'PUT');
    await stale.getByRole('button', { name: 'Save case', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect((await response.json()).case).toMatchObject({ title: newTitle, sourceText: merged, clientId: client.id, version: newer.version + 1 });
    await reload(stale);
    await openLinkedCase(stale, client.displayName, newTitle);
    await navigate(stale, 'Materials & facts');
    await expect(stale.getByLabel('Case source text', { exact: true })).toHaveValue(merged);
    await screenshot(stale, testInfo, 'case-conflict-reconciled-and-reopened');
    await assertStaleClean();
  } finally { await stale.close(); }
  await assertClean();
});

test('two real tabs preserve a rejected customer rename until latest-version review and explicit save', async ({ page, context, customerApp: app }) => {
  const assertClean = await watchBrowser(page);
  await signInCustomer(page, app);
  const client = await createCustomer(page, 'Synthetic rename original');
  const stale = await context.newPage();
  const assertStaleClean = await watchBrowser(stale);
  try {
    await stale.goto(app.origin + ENTRY_PATH); await english(stale);
    await selectCustomer(stale, client.displayName);
    for (const tab of [page, stale]) await customerRecord(tab).getByRole('button', { name: 'Rename', exact: true }).click();
    const localName = 'Synthetic locally proposed label';
    const remoteName = 'Synthetic label saved elsewhere';
    await stale.getByLabel('Customer label', { exact: true }).fill(localName);
    await page.getByLabel('Customer label', { exact: true }).fill(remoteName);
    const save = responseFor(page, `/api/clients/${client.id}`, 'PUT');
    await page.getByRole('button', { name: 'Save name', exact: true }).click();
    expect((await save).status()).toBe(200);
    const conflict = responseFor(stale, `/api/clients/${client.id}`, 'PUT');
    await stale.getByRole('button', { name: 'Save name', exact: true }).click();
    expect((await conflict).status()).toBe(409);
    await expect(stale.getByLabel('Customer label', { exact: true })).toHaveValue(localName);
    await expect(stale.getByRole('button', { name: 'Save name', exact: true })).toBeDisabled();
    await stale.getByRole('button', { name: 'Load latest name', exact: true }).click();
    await expect(stale.getByText(`Currently saved label: ${remoteName}`, { exact: false })).toBeVisible();
    await expect(stale.getByLabel('Customer label', { exact: true })).toHaveValue(localName);
    expect((await getJson(page, app, `/api/clients/${client.id}`)).client).toMatchObject({ displayName: remoteName, version: client.version + 1 });
    await stale.getByRole('form', { name: 'Rename', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(customerRecord(stale).getByRole('heading', { name: remoteName, exact: true })).toBeVisible();
    const rename = customerRecord(stale).getByRole('button', { name: 'Rename', exact: true });
    await expect(rename).toBeFocused();
    await rename.press('Enter');
    await expect(stale.getByLabel('Customer label', { exact: true })).toHaveValue(remoteName);
    await stale.getByLabel('Customer label', { exact: true }).fill(localName);
    const saved = responseFor(stale, `/api/clients/${client.id}`, 'PUT');
    await stale.getByRole('button', { name: 'Save name', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect((await response.json()).client).toMatchObject({ displayName: localName, version: client.version + 2 });
    await reload(stale); await selectCustomer(stale, localName);
    await assertStaleClean();
  } finally { await stale.close(); }
  await assertClean();
});

test('offline save preserves edits, explicit retry persists once, and cancelled case/conversation switches keep unsent input', async ({ page, context, customerApp: app }, testInfo) => {
  const assertClean = await watchBrowser(page);
  await signInCustomer(page, app);
  const client = await createCustomer(page, 'Synthetic interrupted-work customer');
  let first = await createLinkedCase(page, client, 'Synthetic interrupted-work case');
  first = await saveLinkedMaterial(page, first, 'Synthetic saved source before interruption.');
  await selectCustomer(page, client.displayName);
  const second = await createLinkedCase(page, client, 'Synthetic other case');
  await openLinkedCase(page, client.displayName, first.title);
  await navigate(page, 'Materials & facts');
  const pendingText = 'Synthetic unsaved source survives unavailable network.';
  await page.getByLabel('Case source text', { exact: true }).fill(pendingText);
  await context.setOffline(true);
  try {
    await page.getByRole('button', { name: 'Save case', exact: true }).click();
    await expect(page.getByText('Cannot connect right now. Your edits remain; try again later.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Case source text', { exact: true })).toHaveValue(pendingText);
    await expect(page.getByRole('button', { name: 'Save case', exact: true })).toBeEnabled();
  } finally { await context.setOffline(false); }
  expect((await getJson(page, app, `/api/cases/${first.id}`)).case).toMatchObject({ sourceText: first.sourceText, version: first.version });
  await selectCustomer(page, client.displayName);
  const interrupted = page.waitForEvent('dialog');
  const switchCase = customerRecord(page).getByRole('button', { name: `Open case: ${second.title}`, exact: true }).click();
  const warning = await interrupted;
  expect(warning.message()).toContain('Switching cases clears unsaved input');
  await warning.dismiss(); await switchCase;
  await navigate(page, 'Materials & facts');
  await expect(page.getByLabel('Case source text', { exact: true })).toHaveValue(pendingText);
  const saved = responseFor(page, `/api/cases/${first.id}`, 'PUT');
  await page.getByRole('button', { name: 'Save case', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect((await response.json()).case).toMatchObject({ sourceText: pendingText, version: first.version + 1 });
  await reload(page);
  await openLinkedCase(page, client.displayName, first.title);
  const composer = page.getByLabel('What would you like to work on?', { exact: true });
  const question = 'Synthetic unsent question must not become a saved message.';
  await composer.fill(question);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  for (const accept of [false, true]) {
    const pending = page.waitForEvent('dialog');
    const click = page.getByRole('button', { name: 'New conversation', exact: true }).click();
    const dialog = await pending;
    expect(dialog.message()).toContain('Switching conversations stops the current reply');
    await (accept ? dialog.accept() : dialog.dismiss()); await click;
    await expect(composer).toHaveValue(accept ? '' : question);
  }
  expect((await getJson(page, app, `/api/cases/${first.id}/conversations`)).conversations).toEqual([]);
  await navigate(page, 'Materials & facts');
  await expect(page.getByLabel('Case source text', { exact: true })).toHaveValue(pendingText);
  await screenshot(page, testInfo, 'offline-edit-explicitly-saved-and-reopened');
  await assertClean();
});
