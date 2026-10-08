// Fixture sanity over real HTTP/SQLite. This is not Chromium/UI acceptance.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadLegacyReviewBrowser, LEGACY_REVIEW_COMMIT } from '../helpers/build-legacy-review-browser.mjs';
import { startLegacyReviewFixture, LEGACY_FIXTURE_PASSWORD, LEGACY_REVIEW_REQUEST } from '../helpers/legacy-review-browser-fixture.mjs';
import { readChatEvents } from '../fixtures/legacy-chat-parser-090d08e.js';

const { manifest } = await loadLegacyReviewBrowser();
assert.equal(manifest.sourceCommit, LEGACY_REVIEW_COMMIT);
for (const mode of ['prepared', 'no-preview', 'save-failure']) {
  const app = await startLegacyReviewFixture({ mode });
  try {
    const login = await fetch(app.origin + '/api/login', { method: 'POST',
      headers: { Origin: app.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: LEGACY_FIXTURE_PASSWORD }) });
    assert.equal(login.status, 200);
    const session = await login.json();
    const headers = { Origin: app.origin, 'Content-Type': 'application/json',
      Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': session.csrfToken };
    const response = await fetch(app.origin + '/api/chat', { method: 'POST', headers,
      body: JSON.stringify({ caseId: app.record.id, conversationId: app.conversation.id, clientMessageId: randomUUID(),
        locale: 'en', consent: true, actionConsent: true, messages: [{ role: 'user', content: LEGACY_REVIEW_REQUEST }] }) });
    assert.equal(response.status, 200);
    await app.waitForProvider();
    assert.deepEqual(app.messages().filter(message => message.role === 'assistant'), []);
    app.assertUnchanged();
    app.release();
    const events = [];
    for await (const event of readChatEvents(response.body)) {
      if (['proposal', 'delta', 'done'].includes(event.type)) {
        const saved = app.messages().filter(message => message.role === 'assistant');
        assert.equal(saved.length, 1, 'Every result-bearing fallback frame follows real SQLite persistence');
        assert.equal(saved[0].state, 'complete');
      }
      events.push(event);
    }
    assert.doesNotMatch(JSON.stringify(events), /RAW_LEGACY_PROVIDER_FALSE_SUCCESS|PRIVATE_LEGACY_REASONING_SENTINEL/u);
    assert.deepEqual(events.map(event => event.type), mode === 'prepared' ? ['conversation', 'proposal', 'delta', 'done'] :
      mode === 'no-preview' ? ['conversation', 'delta', 'done'] : ['conversation', 'error']);
    if (mode === 'save-failure') {
      assert.equal(events.at(-1).code, 'CHAT_SAVE_FAILED');
      assert.deepEqual(app.messages().filter(message => message.role === 'assistant'), []);
    } else {
      const done = events.at(-1);
      assert.equal(done.reviewResult, undefined);
      assert.equal(done.conversationId, app.conversation.id);
      const saved = app.messages().find(message => message.id === done.assistantMessageId);
      assert.equal(saved.requestId, done.requestId);
      assert.equal(saved.content, events.find(event => event.type === 'delta').text);
      if (mode === 'prepared') {
        const proposal = events.find(event => event.type === 'proposal').proposal;
        assert.equal(proposal.sourceMessageId, app.messages()[0].id);
        assert.deepEqual(proposal.conflicts, ['rent']);
        assert.match(saved.content, /^Review suggestions were prepared/u);
        assert.doesNotMatch(saved.content, /\b(?:cards?|click|confirm|cancel)\b/iu);
      } else assert.match(saved.content, /^No review card was prepared/u);
    }
    const history = await fetch(app.origin + `/api/conversations/${app.conversation.id}`, { headers });
    assert.equal(history.status, 200);
    assert.deepEqual((await history.json()).messages, app.messages());
    if (mode !== 'save-failure') await app.waitForTitle();
    assert.equal(app.primaryRequests.length, 1);
    assert.equal(app.titleRequests.length, mode === 'save-failure' ? 0 : 1);
    app.assertUnchanged();
    app.assertHealthy();
    console.log(`PASS: pinned legacy fixture ${mode}; real current HTTP/SQLite, authored provider transport only`);
  } finally { await app.stop(); }
}
