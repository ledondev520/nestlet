import { test as base, expect } from '@playwright/test';
import { startBrowserFixture } from '../helpers/browser-fixture.mjs';
import { ENTRY_PATH, PASSWORD, english, navigate, expectedCaseId } from './support.js';

export const CUSTOMER_USERS = ['synthetic-customer-a', 'synthetic-customer-b'];
export const OWNER_PASSWORD = 'public-browser-owner-fixture';
export const test = base.extend({
  customerApp: async ({}, use, testInfo) => {
    const app = await startBrowserFixture({ legacyUsers: CUSTOMER_USERS });
    testInfo.annotations.push({ type: 'customer-case-evidence', description: 'Real HTTP/SQLite and UI-created customer/case content. Empty conversations are created through the real API; no model, email, or seeded assistant messages.' });
    try { await use(app); } finally { await app.stop(); }
  }
});
export { expect };

export const responseFor = (page, path, method) => page.waitForResponse(response =>
  new URL(response.url()).pathname === path && response.request().method() === method);

export async function signInCustomer(page, app, username = CUSTOMER_USERS[0]) {
  await page.goto(app.origin + ENTRY_PATH);
  await english(page);
  await page.getByLabel('Email or existing username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(username === 'owner' ? OWNER_PASSWORD : PASSWORD);
  const pending = responseFor(page, '/api/login', 'POST');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await pending).status()).toBe(200);
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  const status = await getJson(page, app, '/api/status');
  expect(status).toMatchObject({ authenticated: true, username, liveEnabled: false,
    role: username === 'owner' ? 'owner' : 'trial', canManageSettings: username === 'owner' });
  return status;
}

export async function getJson(page, app, path) {
  const response = await page.request.get(app.origin + path);
  expect(response.status(), path).toBe(200);
  return response.json();
}

// Normal authenticated endpoints only. Never replace a product response or use
// private database writes to manufacture completed messages/provider evidence.
export async function apiWrite(page, app, path, method, data) {
  const { csrfToken } = await getJson(page, app, '/api/status');
  return page.request.fetch(app.origin + path, { method, data,
    headers: { Origin: app.origin, 'X-CSRF-Token': csrfToken } });
}

export async function createCustomer(page, label) {
  await navigate(page, 'Customers');
  await page.getByRole('button', { name: 'New customer', exact: true }).click();
  const form = page.getByRole('form', { name: 'New customer', exact: true });
  await form.getByLabel('Customer label', { exact: true }).fill(label);
  const pending = responseFor(page, '/api/clients', 'POST');
  await form.getByRole('button', { name: 'Create customer', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(201);
  const { client } = await response.json();
  expect(client.displayName).toBe(label);
  await expect(customerRecord(page).getByRole('heading', { name: label, exact: true })).toBeVisible();
  return client;
}

export const customerRecord = page => page.getByRole('region', { name: 'Customer record', exact: true });

export async function selectCustomer(page, label) {
  await navigate(page, 'Customers');
  await page.getByLabel('Search customers', { exact: true }).fill('');
  const directory = page.getByRole('list', { name: 'Customer directory', exact: true });
  await directory.getByRole('button').filter({ hasText: label }).click();
  await expect(customerRecord(page).getByRole('heading', { name: label, exact: true })).toBeVisible();
}

export async function createLinkedCase(page, client, title) {
  const detail = customerRecord(page);
  await detail.getByRole('button', { name: 'New case', exact: true }).click();
  const form = detail.getByRole('form', { name: 'New case', exact: true });
  await form.getByLabel('Case title', { exact: true }).fill(title);
  const pending = responseFor(page, '/api/cases', 'POST');
  await form.getByRole('button', { name: 'Create and open', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(201);
  const { case: record } = await response.json();
  expect(record).toMatchObject({ title, clientId: client.id, sourceText: '', draftText: '' });
  expect(record.fields.every(field => !field.value && !field.confirmed)).toBe(true);
  await expect(page).toHaveURL(/#chat$/u);
  await expect(page.locator('[data-feature="chat"]')).toHaveAttribute('data-case-id',record.id);
  return record;
}

export async function openLinkedCase(page, label, title) {
  await selectCustomer(page, label);
  const caseId=await expectedCaseId(page,title,{clientLabel:label});
  await customerRecord(page).getByRole('button', { name: `Open case: ${title}`, exact: true }).click();
  await expect(page).toHaveURL(/#chat$/u);
  await expect(page.locator('[data-feature="chat"]')).toHaveAttribute('data-case-id',caseId);
}

export async function saveLinkedMaterial(page, record, source, { review = false } = {}) {
  await navigate(page, 'Materials & facts');
  await expect(page.getByLabel('Case name', { exact: true })).toHaveValue(record.title);
  await page.getByLabel('Case source text', { exact: true }).fill(source);
  if (review) {
    await page.getByRole('button', { name: 'Organize explicit labels', exact: true }).click();
    const checks = page.getByRole('checkbox', { name: 'I reviewed this fact or its unknown status', exact: true });
    await expect(checks).toHaveCount(5);
    for (const checkbox of await checks.all()) await checkbox.check();
  }
  const pending = responseFor(page, `/api/cases/${record.id}`, 'PUT');
  await page.getByRole('button', { name: 'Save case', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const { case: saved } = await response.json();
  expect(saved).toMatchObject({ id: record.id, clientId: record.clientId, sourceText: source });
  await expect(page.getByText('Case saved.', { exact: true })).toBeVisible();
  return saved;
}

export async function createEmptyConversation(page, app, record, title) {
  const response = await apiWrite(page, app, `/api/cases/${record.id}/conversations`, 'POST', { title });
  expect(response.status()).toBe(201);
  const { conversation } = await response.json();
  expect(conversation).toMatchObject({ caseId: record.id, title });
  expect((await getJson(page, app, `/api/conversations/${conversation.id}`)).messages).toEqual([]);
  return conversation;
}
