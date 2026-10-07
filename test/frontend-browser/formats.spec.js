import { test, expect } from '@playwright/test';
import { ENTRY_PATH, register, navigate, reload, openSavedCase, downloadedBytes, watchBrowser, screenshot } from './support.js';
import { FORMAT_SOURCE_REVISION, SYNTHETIC_VALUES, publicFormat, blockedWorkbook, PIXEL, BAD_CSV, BAD_PDF, sha256 } from './format-fixtures.js';

// One extra ordinary account keeps the complete suite within the real five-account
// registration budget. No retry, preseeded successful parse, or mocked API is used.
test('real CSV/PDF/XLSX/XLS parsing, mapping, exact originals, image honesty, and rejected-input preservation', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  testInfo.annotations.push({ type: 'fixture-source-revision', description: FORMAT_SOURCE_REVISION });
  const assertBrowserClean = await watchBrowser(page);
  const writes = [], externalRequests = [], providerRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (['/api/chat','/api/extract'].includes(url.pathname)) providerRequests.push(url.pathname);
    if (url.pathname === '/api/assets' && request.method() === 'POST') writes.push(url.pathname);
    if (url.hostname === 'untrusted.invalid') externalRequests.push(url.href);
  });
  await page.goto(ENTRY_PATH);
  await register(page, 'synthetic-file-formats');
  const status = await (await page.request.get('/api/status')).json();
  expect(status.liveEnabled).toBe(false);
  // Ordinary status intentionally omits administrator parser capabilities. The
  // successful real uploads below establish availability without a fake fallback.

  await test.step('Real file chooser decodes an image preview, rejects invalid bytes, and preserves unsent text without library permission or provider requests', async () => {
    const chat = page.locator('[data-feature="chat"]');
    const composer = chat.getByLabel('What would you like to work on?', { exact: true });
    await composer.fill('Synthetic unsent question must remain intact.');
    const chooserEvent = page.waitForEvent('filechooser');
    await chat.getByRole('button', { name: 'Attach', exact: true }).click();
    await (await chooserEvent).setFiles(PIXEL);
    const preview = chat.getByRole('img', { name: 'Question with images', exact: true });
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate(image => image.complete && image.naturalWidth === 1 && image.naturalHeight === 1)).toBe(true);
    await expect(chat.getByRole('checkbox', { name: /^For this send only: allow AI/u })).not.toBeChecked();
    await expect(chat.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await screenshot(page, testInfo, 'file-formats-chat-local-image-preview');
    await chat.getByRole('button', { name: 'Remove image', exact: true }).click();
    await expect(preview).toHaveCount(0);
    await chat.locator('input[type="file"]').setInputFiles({ name: 'synthetic-corrupt.png', mimeType: 'image/png', buffer: Buffer.from('Not PNG bytes') });
    await expect(chat.getByRole('alert')).toContainText('The image cannot be read');
    await expect(composer).toHaveValue('Synthetic unsent question must remain intact.');
    expect(writes).toEqual([]);
    // Explicitly clear the disposable composer before changing workspaces.
    await composer.fill('');
  });

  await navigate(page, 'Materials & facts');
  const materials = page.locator('main > section:not([hidden])');
  const source = materials.getByLabel('Case source text', { exact: true });
  const title = 'Synthetic real-format browser case';
  await materials.getByLabel('Case name', { exact: true }).fill(title);
  await source.fill('Synthetic operator note: preserve this input through every import.');
  const originals = [];

  async function upload(file, { workbook = false, status: expectedStatus = 201 } = {}) {
    const priorWrites = writes.length;
    await materials.getByLabel('Choose materials', { exact: true }).setInputFiles(file);
    await expect(materials.getByRole('list', { name: 'Files to process', exact: true }).getByText(file.name, { exact: true })).toBeVisible();
    // Selection is not a private save; only the explicit button may persist bytes.
    expect(writes.length).toBe(priorWrites);
    const stored = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assets' && response.request().method() === 'POST');
    const parsed = workbook ? page.waitForResponse(response => new URL(response.url()).pathname === '/api/workbook' && response.request().method() === 'POST') : null;
    await materials.getByRole('button', { name: 'Save privately and process', exact: true }).click();
    const response = await stored;
    expect(response.status()).toBe(expectedStatus);
    if (expectedStatus !== 201) return response.json();
    const { asset } = await response.json();
    expect(asset.originalFilename).toBe(file.name);
    expect(asset.sizeBytes).toBe(file.buffer.length);
    originals.push({ asset, file });
    if (parsed) {
      const result = await parsed;
      expect(result.status()).toBe(200);
      return { asset, workbook: await result.json() };
    }
    return { asset };
  }
  async function verifyOriginal(file) {
    const archive = materials.locator('[data-slot="card"]').filter({ has: page.getByText('Original case materials', { exact: true }) });
    const row = archive.getByRole('listitem').filter({ has: page.getByText(file.name, { exact: true }) });
    const download = await downloadedBytes(page, () => row.getByRole('link', { name: 'Download original', exact: true }).click());
    expect(download.name).toBe(file.name);
    expect(sha256(download.bytes)).toBe(sha256(file.buffer));
    expect(download.bytes).toEqual(file.buffer);
  }

  await test.step('Public CSV imports all quoted fields through the real UI and retains exact bytes', async () => {
    const file = await publicFormat('csv');
    const { asset } = await upload(file);
    expect(asset.textStatus).toBe('ready');
    await expect(source).toHaveValue(/Property: 128 Example Lane, Unit B \(fictional\)/u);
    expect(await source.inputValue()).toContain('Proposed rent: $2,100 per month');
    await materials.getByRole('button', { name: 'Organize explicit labels', exact: true }).click();
    await expect(materials.getByLabel('Property address', { exact: true })).toHaveValue(SYNTHETIC_VALUES[0]);
    await expect(materials.getByLabel('Housing authority', { exact: true })).toHaveValue('');
    await verifyOriginal(file);
  });

  await test.step('Text PDF is really parsed by Poppler and adds readable text without replacing existing input', async () => {
    const before = await source.inputValue();
    const file = await publicFormat('pdf');
    const { asset } = await upload(file);
    expect(asset).toMatchObject({ textStatus: 'ready', previewKind: 'pdf' });
    await expect(source).toHaveValue(/Nestlet import practice/u);
    expect(await source.inputValue()).toContain(before);
    expect(await source.inputValue()).toContain('No tenant details, contact information, identity records or real case data are included.');
    await verifyOriginal(file);
  });

  for (const extension of ['xlsx', 'xls']) await test.step(`Real ${extension.toUpperCase()} sheet/row preview, duplicate-column rejection, human mapping, provenance, and original download`, async () => {
    const before = await source.inputValue();
    const file = await publicFormat(extension);
    const parsed = await upload(file, { workbook: true });
    expect(parsed.workbook.sheets[0].rows[1]).toEqual(SYNTHETIC_VALUES);
    const mapping = materials.locator('[data-slot="card"]').filter({ has: page.getByText('Choose one worksheet and row', { exact: true }) });
    await expect(mapping.getByLabel('Worksheet', { exact: true })).toHaveValue('0');
    await expect(mapping.getByLabel('Data row', { exact: true })).toHaveValue('1');
    await expect(mapping.getByRole('table')).toContainText(SYNTHETIC_VALUES[0]);
    await expect(source).toHaveValue(before);
    await mapping.getByLabel('Property address · Mapped column', { exact: true }).selectOption({ value: '0' });
    await mapping.getByLabel('Owner · Mapped column', { exact: true }).selectOption({ value: '0' });
    await mapping.getByRole('button', { name: 'Append this row and review facts', exact: true }).click();
    await expect(mapping.getByRole('alert')).toContainText('Map at least one field to distinct valid columns');
    await expect(source).toHaveValue(before);
    const labels = ['Property address', 'Owner', 'Housing authority', 'Case reference', 'Proposed rent'];
    for (const [index, label] of labels.entries()) await mapping.getByLabel(`${label} · Mapped column`, { exact: true }).selectOption({ value: String(index) });
    await screenshot(page, testInfo, `file-formats-${extension}-real-mapping-preview`);
    await mapping.getByRole('button', { name: 'Append this row and review facts', exact: true }).click();
    await expect(mapping).toHaveCount(0);
    expect((await source.inputValue()).length).toBeGreaterThan(before.length);
    expect(await source.inputValue()).toContain(before);
    await expect(materials.getByLabel('Property address', { exact: true })).toHaveValue(SYNTHETIC_VALUES[0]);
    await expect(materials.getByLabel('Source / excerpt', { exact: true }).first()).toHaveValue('Synthetic case!A2: ' + SYNTHETIC_VALUES[0]);
    const reviewGates = materials.getByRole('checkbox', { name: 'I reviewed this fact or its unknown status', exact: true });
    await expect(reviewGates).toHaveCount(5);
    for (const checkbox of await reviewGates.all()) await expect(checkbox).not.toBeChecked();
    await verifyOriginal(file);
  });

  for (const extension of ['xlsx', 'xls']) await test.step(`${extension.toUpperCase()} blocked cells/hidden sheet are unavailable; closing mapping preserves text and the saved original`, async () => {
    const before = await source.inputValue();
    const file = await blockedWorkbook(extension);
    await upload(file, { workbook: true });
    const mapping = materials.locator('[data-slot="card"]').filter({ has: page.getByText('Choose one worksheet and row', { exact: true }) });
    await expect(mapping.getByLabel('Worksheet', { exact: true }).locator('option[value="1"]')).toBeDisabled();
    const dataRow = mapping.getByLabel('Data row', { exact: true });
    // String selectors match value OR label. Label 2 is value 1 here; explicitly
    // select value 2 (the third row) before asserting its blocked cells.
    expect(await dataRow.selectOption({ value: '2' })).toEqual(['2']);
    await expect(dataRow).toHaveValue('2');
    await expect(mapping.locator('caption')).toHaveText('Visible cases · Data row 3');
    const columns = mapping.getByLabel('Property address · Mapped column', { exact: true });
    for (const column of (extension === 'xlsx' ? [1, 2, 3, 4] : [2, 3, 4])) await expect(columns.locator(`option[value="${column}"]`)).toBeDisabled();
    if (extension === 'xlsx') await expect(mapping.getByRole('table')).not.toContainText('CACHED VALUE MUST NOT IMPORT');
    // The documented XLS writer drops formula metadata; that cell is a literal.
    else await expect(mapping.getByRole('table')).toContainText('CACHED VALUE MUST NOT IMPORT');
    await expect(mapping.getByRole('table')).not.toContainText('LINK MUST NOT BE FOLLOWED');
    await mapping.getByRole('button', { name: 'Close mapping (keep original)', exact: true }).click();
    await expect(mapping).toHaveCount(0);
    await expect(source).toHaveValue(before);
    await verifyOriginal(file);
  });

  await test.step('A real image original remains downloadable and honestly has no OCR text', async () => {
    const before = await source.inputValue();
    const { asset } = await upload(PIXEL);
    expect(asset).toMatchObject({ textStatus: 'unavailable', previewKind: 'image' });
    const queuedImage = materials.getByRole('list', { name: 'Files to process', exact: true }).getByRole('listitem').filter({ hasText: PIXEL.name });
    await expect(queuedImage).toContainText('Original saved. No text was extracted; add it below.');
    await expect(source).toHaveValue(before);
    const text = await (await page.request.get(`/api/assets/${asset.id}/text`)).json();
    expect(text.text).toBe('');
    await verifyOriginal(PIXEL);
  });

  await test.step('Malformed CSV/PDF produce real errors without replacing input or retaining a false original', async () => {
    const before = await source.inputValue();
    for (const file of [BAD_CSV, BAD_PDF]) {
      const failure = await upload(file, { status: 422 });
      expect(failure.code).toBe(file === BAD_CSV ? 'ASSET_CSV_INVALID' : 'INVALID_PDF');
      const item = materials.getByRole('list', { name: 'Files to process', exact: true }).getByRole('listitem').filter({ hasText: file.name });
      await expect(item.getByRole('alert')).toBeVisible();
      await expect(source).toHaveValue(before);
      await item.getByRole('button', { name: `Remove: ${file.name}`, exact: true }).click();
    }
    const listed = await (await page.request.get('/api/assets?limit=100')).json();
    expect(listed.total).toBe(originals.length);
  });

  await test.step('Real parser requests without document consent are denied; reviewed page input remains intact', async () => {
    const before = await source.inputValue();
    const origin = new URL(page.url()).origin;
    for (const [endpoint, file] of [['/api/document', await publicFormat('pdf')], ['/api/workbook', await publicFormat('xlsx')]]) {
      const response = await page.request.post(endpoint, { data: file.buffer, headers: { Origin: origin, 'X-CSRF-Token': status.csrfToken, 'Content-Type': file.mimeType } });
      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe('DOCUMENT_CONSENT_REQUIRED');
      await expect(source).toHaveValue(before);
    }
    expect(providerRequests).toEqual([]);
    await expect(materials.getByRole('button', { name: 'Extract with DeepSeek', exact: true })).toBeDisabled();
  });

  await test.step('Save the parsed material and real originals, then recover them after a full reload', async () => {
    const expectedSource = await source.inputValue();
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cases' && response.request().method() === 'POST');
    await materials.getByRole('button', { name: 'Save case', exact: true }).click();
    expect((await saved).status()).toBe(201);
    await expect(materials.getByText('Case saved.', { exact: true })).toBeVisible();
    await reload(page);
    await openSavedCase(page, title);
    await navigate(page, 'Materials & facts');
    await expect(source).toHaveValue(expectedSource);
    for (const { file } of originals) await verifyOriginal(file);
    await screenshot(page, testInfo, 'file-formats-reopened-parsed-case-and-originals');
  });
  expect(externalRequests, 'Workbook hyperlinks must never be followed').toEqual([]);
  await assertBrowserClean();
});
