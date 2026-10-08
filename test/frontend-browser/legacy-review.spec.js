import { test as base, expect } from '@playwright/test';
import { loadLegacyReviewBrowser, LEGACY_REVIEW_COMMIT, sha256 } from '../helpers/build-legacy-review-browser.mjs';
import { startLegacyReviewFixture, LEGACY_FIXTURE_PASSWORD, LEGACY_REVIEW_REQUEST, FALSE_PROVIDER_CLAIM } from '../helpers/legacy-review-browser-fixture.mjs';
import { english, openSavedCase, screenshot } from './support.js';
import { getJson } from './customer-case-support.js';

const canonicalText = 'Review suggestions were prepared from the supplied information in this turn. No case facts or completed documents were changed. This is not agency approval and nothing was sent or submitted.';
const noPreviewText = 'No review card was prepared for this turn. No case facts or documents were changed. You can request a new review preview with the specific details to check.';
const packets = text => text.split(/\r?\n\r?\n/u).filter(Boolean).map(block => ({
  event: /^event: (.+)$/mu.exec(block)?.[1],
  data: JSON.parse(block.split(/\r?\n/u).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')),
}));
function observeLegacyChatWire() {
  window.__legacyWireResponses = [];
  const nativeFetch = window.fetch;
  window.fetch = async function (...args) {
    // Observe a native clone; return the original Response unchanged. Forward
    // the same input/options/AbortSignal, never author or delay app SSE frames.
    const response = await Reflect.apply(nativeFetch, this, args);
    const input = args[0] instanceof Request ? args[0].url : String(args[0]);
    const url = new URL(input, location.href);
    if (url.origin === location.origin && url.pathname === '/api/chat') {
      const captured = { requestId: response.headers.get('x-request-id'), state: 'pending', text: null, error: null };
      window.__legacyWireResponses.push(captured);
      const failed = error => { captured.error = error.name; captured.state = 'failed'; };
      try {
        // Read the bounded authored fixture in parallel rather than relying on
        // Chromium's CDP body cache after the old parser releases its reader.
        response.clone().text().then(text => { captured.text = text; captured.state = 'complete'; }, failed);
      } catch (error) { failed(error); }
    }
    return response;
  };
}
const test = base.extend({
  legacyMode: ['prepared', { option: true }],
  legacyReview: async ({ page, legacyMode }, use, testInfo) => {
    const { assets, manifest } = await loadLegacyReviewBrowser();
    const app = await startLegacyReviewFixture({ mode: legacyMode });
    const errors = [], outbound = [], mutations = [], chatRequests = [], served = new Set();
    const onError = error => errors.push(error.message);
    const onRequest = request => {
      const url = new URL(request.url());
      if (url.origin !== app.origin) outbound.push(request.url());
      if (url.pathname === '/api/chat') chatRequests.push(request.postDataJSON());
      if (!['GET', 'HEAD'].includes(request.method()) && (url.pathname === `/api/cases/${app.record.id}` ||
        url.pathname.startsWith(`/api/cases/${app.record.id}/document-context`) ||
        url.pathname.startsWith(`/api/cases/${app.record.id}/artifacts`) ||
        url.pathname.startsWith(`/api/cases/${app.record.id}/conversation-reviews`))) mutations.push(`${request.method()} ${url.pathname}`);
    };
    const assetPaths = new Map([['/', 'index.html'], ['/next/', 'index.html'], ['/next/index.html', 'index.html'],
      ['/next/app.js', 'app.js'], ['/next/index.css', 'index.css']]);
    const routePinnedAssets = async route => {
      const url = new URL(route.request().url());
      if (url.origin !== app.origin) { await route.abort('blockedbyclient'); return; }
      const filename = assetPaths.get(url.pathname);
      // All product API requests, including chat/status/history, remain untouched.
      if (!filename) { await route.continue(); return; }
      expect(route.request().method()).toBe('GET');
      const original = await route.fetch();
      expect(original.status()).toBe(200);
      let body = assets[filename];
      if (filename === 'index.html') {
        const nonce = /'nonce-([^']+)'/u.exec(original.headers()['content-security-policy'])?.[1];
        expect(nonce, 'Preserve the real current server style nonce and CSP').toBeTruthy();
        body = Buffer.from(body.toString('utf8').replace('__NESTLET_STYLE_NONCE__', nonce));
      }
      served.add(filename);
      await route.fulfill({ response: original, body });
    };
    try {
      testInfo.annotations.push({ type: 'pinned-legacy-browser', description: `Actual full frontend from ${LEGACY_REVIEW_COMMIT}, with byte-identical locked dependencies. Static assets only are substituted. Current server, HTTP, authentication, SQLite persistence and history are real. The only authored response is a fail-closed synthetic provider stream; no live provider or deployment.` });
      await testInfo.attach('Pinned baseline build provenance', { body: JSON.stringify(manifest, null, 2), contentType: 'application/json' });
      await page.setViewportSize({ width: 1440, height: 1000 });
      page.on('pageerror', onError);
      page.on('request', onRequest);
      await page.addInitScript(() => {
        window.__legacyCspViolations = [];
        document.addEventListener('securitypolicyviolation', event => window.__legacyCspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`));
      });
      await page.addInitScript(observeLegacyChatWire);
      await page.route('**/*', routePinnedAssets);
      const bundleResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/next/app.js');
      await page.goto(app.origin + '/');
      expect(sha256(await (await bundleResponse).body()), 'The browser actually received the pinned old bundle').toBe(manifest.hashes['app.js']);
      await english(page);
      await page.getByLabel('Email or existing username', { exact: true }).fill('owner');
      await page.getByLabel('Password', { exact: true }).fill(LEGACY_FIXTURE_PASSWORD);
      const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/login' && response.request().method() === 'POST');
      await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
      expect((await login).status()).toBe(200);
      await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
      expect(await getJson(page, app, '/api/status')).toMatchObject({ authenticated: true, username: 'owner', liveEnabled: true });
      await openSavedCase(page, app.record.title, {legacy:true});
      const chat = page.locator('[data-feature="chat"]');
      const cards = chat.getByTestId('conversation-action-review');
      const settled = async () => {
        await expect(chat.getByRole('button', { name: 'New conversation', exact: true })).toBeEnabled();
        await expect(chat.locator('.chat-input')).toBeEnabled();
      };
      const unchanged = () => {
        expect(mutations, 'Preview, stop and proposal dismissal never mutate case/facts/artifacts').toEqual([]);
        app.assertUnchanged();
      };
      const wireText = async response => {
        expect(response.status()).toBe(200);
        const requestId = response.headers()['x-request-id'];
        expect(requestId).toMatch(/^[0-9a-f-]{36}$/u);
        await expect.poll(() => page.evaluate(id => window.__legacyWireResponses.find(item => item.requestId === id)?.state || 'missing', requestId),
          { message: 'The actual native chat response clone reaches a terminal state' }).toMatch(/^(?:complete|failed)$/u);
        const captures = await page.evaluate(id => window.__legacyWireResponses.filter(item => item.requestId === id), requestId);
        expect(captures).toHaveLength(1);
        expect(captures[0]).toMatchObject({ requestId, state: 'complete', error: null });
        return captures[0].text;
      };
      const begin = async () => {
        await settled();
        await chat.locator('.chat-input').fill(LEGACY_REVIEW_REQUEST);
        const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/chat');
        await chat.getByRole('button', { name: 'Send', exact: true }).click();
        const consent = page.getByRole('dialog', { name: 'Use your saved library?', exact: true });
        await expect(consent).toBeVisible();
        await consent.getByRole('button', { name: 'Continue without library', exact: true }).click();
        await app.waitForProvider();
        expect(chatRequests).toHaveLength(1);
        expect(chatRequests[0]).toMatchObject({ caseId: app.record.id, conversationId: app.conversation.id, actionConsent: true,
          locale: 'en', messages: [{ role: 'user', content: LEGACY_REVIEW_REQUEST }] });
        expect(Object.hasOwn(chatRequests[0], 'reviewResultVersion'), 'The unmodified old client sends no atomic protocol capability').toBe(false);
        await expect(chat.getByRole('button', { name: 'Stop reply', exact: true })).toBeVisible();
        await expect(cards).toHaveCount(0);
        await expect(chat).not.toContainText(FALSE_PROVIDER_CLAIM);
        await expect(chat).not.toContainText('PRIVATE_LEGACY_REASONING_SENTINEL');
        await expect(chat.getByText(canonicalText, { exact: true })).toHaveCount(0);
        expect(app.messages().filter(message => message.role === 'assistant')).toEqual([]);
        unchanged();
        return response;
      };
      const reopenHistory = async () => {
        await settled();
        // A full navigation loads the actual baseline again, discarding every
        // transient review component. Restoration is from the current HTTP API.
        await page.reload();
        await english(page);
        await openSavedCase(page, app.record.title, {legacy:true});
        await settled();
        await expect(cards).toHaveCount(0);
        const history = await getJson(page, app, `/api/conversations/${app.conversation.id}`);
        expect(history.messages).toEqual(app.messages());
        expect(history.messages.every(message => !Object.hasOwn(message, 'proposals') && !Object.hasOwn(message, 'reviewResult'))).toBe(true);
        unchanged();
        return history.messages;
      };
      await use({ app, chat, cards, begin, settled, unchanged, reopenHistory, wireText });
      app.assertHealthy();
      expect([...served].sort()).toEqual(['app.js', 'index.css', 'index.html']);
      expect(errors, 'No uncaught errors in the pinned old application').toEqual([]);
      expect(outbound, 'The browser never sends data outside this disposable localhost origin').toEqual([]);
      expect(await page.evaluate(() => window.__legacyCspViolations)).toEqual([]);
    } finally {
      await page.unroute('**/*', routePinnedAssets);
      page.off('pageerror', onError);
      page.off('request', onRequest);
      await app.stop();
    }
  },
});

test('actual pinned old browser consumes post-save canonical fallback and conflict card, then restores neutral history', async ({ page, legacyReview: review }, testInfo) => {
  const response = await review.begin();
  review.app.release();
  await review.settled();
  const events = packets(await review.wireText(response));
  expect(events.map(packet => packet.event)).toEqual(['conversation', 'proposal', 'delta', 'done']);
  expect(events.find(packet => packet.event === 'delta').data.text).toBe(canonicalText);
  const proposal = events.find(packet => packet.event === 'proposal').data.proposal;
  const done = events.at(-1).data;
  expect(done.reviewResult).toBeUndefined();
  expect(JSON.stringify(events)).not.toMatch(/RAW_LEGACY_PROVIDER_FALSE_SUCCESS|PRIVATE_LEGACY_REASONING_SENTINEL/u);
  const saved = review.app.messages().filter(message => message.role === 'assistant');
  expect(saved).toMatchObject([{ id: done.assistantMessageId, requestId: done.requestId, state: 'complete', content: canonicalText }]);
  expect(saved).toHaveLength(1);
  expect(proposal).toMatchObject({ caseId: review.app.record.id, expectedVersion: review.app.record.version,
    sourceConversationId: review.app.conversation.id, sourceMessageId: review.app.messages()[0].id,
    conflicts: ['rent'], preview: [{ group: 'factChanges', key: 'rent', before: '$2,100', after: '$2,200', confirmed: true, conflict: true }] });
  await expect(review.cards).toHaveCount(1);
  await expect(review.cards).toContainText('Current: $2,100');
  await expect(review.cards).toContainText('Suggested: $2,200');
  await expect(review.cards).toContainText(proposal.sourceMessageId);
  await expect(review.cards.getByRole('button', { name: 'Correct, save these facts', exact: true })).toBeEnabled();
  await expect(review.cards.getByRole('button', { name: 'Apply as unreviewed suggestions', exact: true })).toBeDisabled();
  await expect(review.chat.getByText(canonicalText, { exact: true })).toBeVisible();
  await expect.poll(() => review.app.metrics().length).toBe(1);
  expect(review.app.metrics()[0]).toMatchObject({ requestId: done.requestId, outcome: 'prepared', emittedProposals: 1, providerRequests: 1 });
  review.unchanged();
  await screenshot(page, testInfo, 'pinned-legacy-canonical-conflict-preview');
  await review.cards.getByRole('button', { name: 'Cancel proposal', exact: true }).click();
  await expect(review.cards).toHaveCount(0);
  expect((await review.reopenHistory()).filter(message => message.role === 'assistant')).toEqual(saved);
  await expect(review.chat.getByText(canonicalText, { exact: true })).toBeVisible();
  expect(canonicalText).not.toMatch(/\b(?:cards?|click|confirm|cancel)\b/iu);
});

test.describe('pinned old browser no-preview fallback', () => {
  test.use({ legacyMode: 'no-preview' });
  test('provider false success becomes truthful saved prose with no card', async ({ legacyReview: review }) => {
    const response = await review.begin();
    review.app.release();
    await review.settled();
    const events = packets(await review.wireText(response));
    expect(events.map(packet => packet.event)).toEqual(['conversation', 'delta', 'done']);
    expect(events.find(packet => packet.event === 'delta').data.text).toBe(noPreviewText);
    await expect(review.cards).toHaveCount(0);
    await expect(review.chat.getByText(noPreviewText, { exact: true })).toBeVisible();
    expect((await review.reopenHistory()).filter(message => message.role === 'assistant')).toMatchObject([{ state: 'complete', content: noPreviewText }]);
    await expect(review.chat.getByText(noPreviewText, { exact: true })).toBeVisible();
  });
});

test.describe('pinned old browser persistence failure', () => {
  test.use({ legacyMode: 'save-failure' });
  test('real SQLite save rejection leaves no fallback card or saved success', async ({ legacyReview: review }) => {
    const response = await review.begin();
    review.app.release();
    await review.settled();
    const events = packets(await review.wireText(response));
    expect(events.map(packet => packet.event)).toEqual(['conversation', 'error']);
    expect(events.at(-1).data.code).toBe('CHAT_SAVE_FAILED');
    await expect(review.cards).toHaveCount(0);
    await expect(review.chat.getByText('Could not confirm the saved reply. Copy it before retrying.', { exact: true })).toBeVisible();
    expect((await review.reopenHistory()).filter(message => message.role === 'assistant')).toEqual([]);
    await expect(review.chat.getByText(canonicalText, { exact: true })).toHaveCount(0);
  });
});

test('actual pinned old browser stop clears pending review and cannot revive a card from history', async ({ page, legacyReview: review }) => {
  const response = await review.begin();
  await review.chat.getByRole('button', { name: 'Stop reply', exact: true }).click();
  await review.settled();
  await expect(review.chat.getByText('Reply stopped', { exact: true })).toBeVisible();
  const requestId = response.headers()['x-request-id'];
  await expect.poll(() => page.evaluate(id => window.__legacyWireResponses.find(item => item.requestId === id)?.state, requestId),
    { message: 'Stop aborts the native response clone as well as the app reader' }).toBe('failed');
  expect(await page.evaluate(id => window.__legacyWireResponses.filter(item => item.requestId === id), requestId))
    .toMatchObject([{ requestId, state: 'failed', error: 'AbortError', text: null }]);
  await expect(review.cards).toHaveCount(0);
  await expect.poll(() => review.app.metrics().length).toBe(1);
  expect(review.app.metrics()[0]).toMatchObject({ outcome: 'cancelled', emittedProposals: 0 });
  const history = await review.reopenHistory();
  expect(history.filter(message => message.role === 'assistant').every(message => message.state !== 'complete')).toBe(true);
  expect(JSON.stringify(history)).not.toMatch(/RAW_LEGACY_PROVIDER_FALSE_SUCCESS|PRIVATE_LEGACY_REASONING_SENTINEL/u);
  await expect(review.chat.getByText(canonicalText, { exact: true })).toHaveCount(0);
});
