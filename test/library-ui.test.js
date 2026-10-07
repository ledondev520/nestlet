// Development DOM diagnostics with explicit HTTP response doubles. Not browser/live-provider acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, deferred } from './ui-harness.js';

const clientId = '46e4bbd2-f413-4850-a646-880d57661111';
const caseId = '46e4bbd2-f413-4850-a646-880d57662222';
const artifactId = '46e4bbd2-f413-4850-a646-880d57663333';
const archiveId = '46e4bbd2-f413-4850-a646-880d57664444';
const customer = {id: clientId, displayName: 'Johnny', version: 1};
const finalContent = 'Supplementary correspondence; not an official agency form.\n\nTo: Example Intake Team\nProperty: 128 Example Lane\nThank you.';
const status = {authenticated: true, authConfigured: true, caseStorageEnabled: true, userId: 'owner', username: 'owner', role: 'owner', csrfToken: 'x'.repeat(43)};
const response = (body, code = 200) => ({ok: code >= 200 && code < 300, status: code, headers: {get: () => null}, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body)});
const settle = async app => { for (let i = 0; i < 8; i++) await app.flush(); };
const initialCase = () => ({id: caseId, clientId, title: 'Johnny lease-up', version: 1, sourceText: 'Synthetic source remains intact',
  fields: ['property','owner','pha','caseReference','rent'].map(key => ({key, value: '', source: '', confirmed: true, conflict: false})),
  draftType: 'followup', draftText: 'EARLIER EDITED DRAFT', namesVerified: false, documentContext: {}, caseIssues: [], extractionMode: 'manual'});

async function fixture(context, extra = {}) {
  let record = initialCase(), archive = [], patch;
  const account = {...status};
  const artifact = {id: artifactId, caseId, kind: 'followup', title: 'Johnny final letter', status: 'final', version: 1, content: finalContent, isStale: false};
  const app = await openApp({status: account, fetchHandler: async (url, options = {}) => {
    if (extra.handler) {const overridden = await extra.handler(url, options); if (overridden) return overridden;}
    if (url === '/api/cases' || url === `/api/clients/${clientId}/cases`) return response({cases: [{id: caseId, title: record.title, version: record.version}]});
    if (url.startsWith('/api/clients?')) return response({clients: [customer]});
    if (url === `/api/clients/${clientId}/artifacts`) return response({artifacts: [artifact]});
    if (url === `/api/cases/${caseId}`) return response({case: record});
    if (url === `/api/cases/${caseId}/conversations`) return response({conversations: []});
    if (url === `/api/cases/${caseId}/artifacts/generate`) {
      const body = JSON.parse(options.body); assert.equal(body.status, 'final'); assert.equal(body.expectedCaseVersion, record.version);
      return response({artifact}, 201);
    }
    if (url === `/api/cases/${caseId}/artifacts`) return response({artifacts: archive});
    if (url === `/api/artifacts/${artifactId}`) return response({artifact});
    if (url === `/api/artifacts/${artifactId}/download`) return response(finalContent);
    if (url === `/api/artifacts/${archiveId}`) return response({artifact: archive[0]});
    if (url.startsWith(`/api/cases/${caseId}/readiness?`)) return response(record.version === 1 ? {ready: false, missing: [{key: 'property', question: 'Property?'}, {key: 'recipientName', question: 'Recipient?'}]} : {ready: true, missing: []});
    if (url === `/api/cases/${caseId}/document-context`) {
      patch = JSON.parse(options.body);
      record = {...record, version: 2, sourceText: 'Complete source returned by PATCH', fields: record.fields.map(field => field.key === 'property' ? {...field, value: patch.factChanges.property.value, source: 'Direct user answer', confirmed: true} : field),
        documentContext: {recipientName: {value: patch.changes.recipientName.value, source: 'Direct user answer', confirmed: true, confirmedAt: '2026-10-07T09:00:00Z'}}, draftText: ''};
      archive = [{id: archiveId, caseId, kind: 'followup', title: 'Earlier edited draft', version: 1, status: 'draft', content: 'EARLIER EDITED DRAFT', isStale: true}];
      return response({case: record, readiness: {ready: true, missing: []}, archivedLegacyDraft: true});
    }
    if (url === '/api/logout') {account.authenticated = false; account.userId = null; account.role = null; account.csrfToken = ''; return response({authenticated: false});}
    if (url.startsWith('/api/workflows')) return response({workflowId: '46e4bbd2-f413-4850-a646-880d57665555'});
    throw new Error(`Unexpected fixture request: ${url}`);
  }});
  context.after(app.close);
  await settle(app);
  return {app, get patch() {return patch;}};
}
async function chooseJohnny(app) {
  app.type('customer-query', 'Johnny');
  app.get('customer-query').dispatchEvent(new app.window.Event('change', {bubbles: true}));
  await settle(app);
  app.document.querySelector('[data-customer]').click();
  await settle(app);
}

test('customer selection actually retrieves own cases and artifacts and opens the associated case', async context => {
  const {app} = await fixture(context);
  await chooseJohnny(app);
  assert.ok(app.requests.some(item => item.url === `/api/clients/${clientId}/cases`));
  assert.ok(app.requests.some(item => item.url === `/api/clients/${clientId}/artifacts`));
  assert.match(app.document.querySelector('.customer-cases').textContent, /Johnny lease-up/);
  app.document.querySelector('[data-case-open]').click(); await settle(app);
  assert.equal(app.get('material-input').value, 'Synthetic source remains intact');
  assert.equal(app.get('draft').value, 'EARLIER EDITED DRAFT');
});

test('one completion separates core facts, applies the complete returned case and retains the archived edited draft', async context => {
  const result = await fixture(context), app = result.app;
  await chooseJohnny(app); app.document.querySelector('[data-case-open]').click(); await settle(app);
  const property = app.document.querySelector('[data-readiness="property"]'); property.value = '128 Example Lane';
  const recipient = app.document.querySelector('[data-readiness="recipientName"]'); recipient.value = 'Example Intake Team';
  app.click('readiness-confirm'); await settle(app);
  assert.deepEqual(result.patch.factChanges, {property: {value: '128 Example Lane'}});
  assert.deepEqual(result.patch.changes, {recipientName: {value: 'Example Intake Team'}});
  assert.equal(result.patch.confirm, true);
  assert.equal(result.patch.expectedVersion, 1);
  assert.equal(app.get('material-input').value, 'Complete source returned by PATCH');
  assert.equal(app.get('field-0').value, '128 Example Lane');
  assert.equal(app.document.getElementById('draft'), null, 'Archived old draft is not mislabeled as the current result');
  assert.match(app.document.querySelector('.artifact-list').textContent, /Earlier edited draft/);
  assert.equal(app.document.querySelectorAll('[data-readiness]').length, 0, 'Confirmed answers are not requested again');
  app.click('generate-final'); await settle(app);
  assert.equal(app.get('draft').value, finalContent);
  assert.match(app.document.querySelector('.draft-tag').textContent, /FINAL/);
  app.click('copy'); await settle(app);
  assert.equal(app.clipboard.at(-1), finalContent);
  app.click('download'); await settle(app);
  assert.equal(await app.downloads.at(-1).blob.text(), finalContent);
  assert.match(app.downloads.at(-1).name, /final/);
  app.click('print'); assert.equal(app.prints, 1);
  assert.equal(app.document.querySelector('.print-text').textContent, finalContent);
  assert.doesNotMatch(app.clipboard.at(-1), /DRAFT|DE-IDENTIFIED|NOT FOR SUBMISSION/);
});

test('opening a customer artifact preserves its exact final body and shows its case instead of a disconnected preview', async context => {
  const {app} = await fixture(context); await chooseJohnny(app);
  app.document.querySelector('[data-artifact-open]').click(); await settle(app);
  assert.equal(app.get('case-title').value, 'Johnny lease-up');
  assert.equal(app.get('draft').value, finalContent);
  assert.match(app.document.querySelector('.draft-tag').textContent, /FINAL/);
});

test('late customer search responses cannot repopulate private results after logout', async context => {
  const late = deferred();
  const {app} = await fixture(context, {handler: (url) => url.startsWith('/api/clients?') ? late.promise : undefined});
  app.type('customer-query', 'Johnny'); app.get('customer-query').dispatchEvent(new app.window.Event('change', {bubbles: true}));
  app.click('settings'); app.click('logout'); await settle(app);
  late.resolve(response({clients: [customer]})); await settle(app);
  assert.equal(app.document.querySelector('[data-customer]'), null);
  assert.doesNotMatch(app.document.body.textContent, /Johnny/);
});

test('stale download is an in-place mapped error and retains the readable historical version', async context => {
  const {app} = await fixture(context, {handler: url => url === `/api/artifacts/${artifactId}/download` ? response({code: 'ARTIFACT_STALE'}, 409) : undefined});
  await chooseJohnny(app); app.document.querySelector('[data-artifact-open]').click(); await settle(app);
  app.click('download'); await settle(app);
  assert.equal(app.downloads.length, 0);
  assert.equal(app.get('draft').value, finalContent);
  assert.match(app.document.querySelector('.case-controls .error').textContent, /过期|旧/);
});

test('readiness confirmation preserves pre-existing unsaved edits and does not send a destructive PATCH', async context => {
  const {app} = await fixture(context); await chooseJohnny(app);
  app.document.querySelector('[data-case-open]').click(); await settle(app);
  app.type('draft', 'LOCAL UNSAVED EDITED LETTER');
  app.document.querySelector('[data-readiness="property"]').value = '128 Example Lane';
  app.click('readiness-confirm'); await settle(app);
  assert.equal(app.requests.filter(item => item.options?.method === 'PATCH').length, 0);
  assert.equal(app.get('draft').value, 'LOCAL UNSAVED EDITED LETTER');
  assert.equal(app.document.querySelector('[data-readiness="property"]').value, '128 Example Lane');
  assert.match(app.document.querySelector('.case-controls .error').textContent, /先保存/);
});

for (const target of ['material-input', 'draft']) test(`late readiness PATCH cannot overwrite ${target} edits or silently advance the local version`, async context => {
  const gate = deferred(), started = deferred();
  const {app} = await fixture(context, {handler: (url, options) => {
    if (url.endsWith('/document-context')) {started.resolve(JSON.parse(options.body)); return gate.promise;}
  }});
  await chooseJohnny(app); app.document.querySelector('[data-case-open]').click(); await settle(app);
  app.document.querySelector('[data-readiness="property"]').value = '128 Example Lane';
  app.document.querySelector('[data-readiness="recipientName"]').value = 'Example Intake Team';
  app.click('readiness-confirm');
  assert.equal((await started.promise).expectedVersion, 1);
  app.type(target, 'LOCAL EDIT AFTER REQUEST STARTED');
  gate.resolve(response({case: {...initialCase(), version: 2, sourceText: 'SERVER TEXT MUST NOT OVERWRITE', draftText: ''}, readiness: {ready: true, missing: []}, archivedLegacyDraft: true}));
  await settle(app);
  assert.equal(app.get(target).value, 'LOCAL EDIT AFTER REQUEST STARTED');
  assert.match(app.document.querySelector('.case-controls .error').textContent, /本地输入未被覆盖/);
  assert.equal(app.document.querySelector('[data-readiness="property"]').value, '128 Example Lane');
  assert.equal(app.requests.filter(item => item.options?.method === 'PATCH').length, 1);
});
