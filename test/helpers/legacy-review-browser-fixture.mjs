// Real current server.js and SQLite. Only the provider transport is authored.
// No production routes, browser chat mocks, live credentials or network fallback.
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStorage } from '../../storage.js';
import { extract } from '../../public/core.js';

export const LEGACY_FIXTURE_PASSWORD = 'public-synthetic-legacy-review-password';
export const LEGACY_REVIEW_REQUEST = 'Proposed rent is $2,200. Could you prepare a conflict review preview?';
export const FALSE_PROVIDER_CLAIM = 'RAW_LEGACY_PROVIDER_FALSE_SUCCESS: I saved the new rent and sent the approved document.';
const delta = value => `data: ${JSON.stringify({ choices: [{ delta: value, finish_reason: null }] })}\n\n`;
const finish = reason => `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`;
const hash = password => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
};
async function listen(server) {
  const ready = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await ready;
  return server.address().port;
}
async function bounded(promise, label, milliseconds = 10000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function startLegacyReviewFixture({ mode = 'prepared' } = {}) {
  assert.ok(['prepared', 'no-preview', 'save-failure'].includes(mode));
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'nestlet-legacy-review-'));
  const filename = join(directory, 'cases.sqlite');
  const store = openStorage({ filename });
  const sourceText = 'Property: 128 Synthetic Legacy Lane\nOwner: Synthetic Owner LLC\nPHA: Not confirmed\nCase reference: LEGACY-SYNTHETIC\nProposed rent: $2,100';
  const record = store.createCase('owner', { title: 'Synthetic pinned legacy review case', sourceText,
    fields: extract(sourceText).map(field => field.key === 'rent' ? { ...field, confirmed: true } : field), draftType: 'followup', draftText: '' });
  const conversation = store.createConversation('owner', record.id, { title: 'Synthetic legacy review conversation' });
  const requests = [], failures = [], events = new EventEmitter();
  let held, child, output = '', stopped = false, released = false;
  const upstream = http.createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/');
      assert.equal(request.headers.authorization, 'Bearer public-synthetic-legacy-review-key');
      let bytes = '';
      for await (const chunk of request) bytes += chunk;
      const body = JSON.parse(bytes);
      requests.push(body);
      assert.equal(requests.length, 1, 'Unexpected extra provider request fails the authored fixture');
      assert.equal(body.model, 'deepseek-flash');
      assert.deepEqual(body.thinking, { type: 'disabled' });
      assert.deepEqual(body.tool_choice, { type: 'function', function: { name: 'prepare_case_suggestion' } });
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(delta({ content: FALSE_PROVIDER_CLAIM, reasoning_content: 'PRIVATE_LEGACY_REASONING_SENTINEL' }));
      if (mode !== 'no-preview') {
        const tool = body.tools.find(item => item.function.name === 'prepare_case_suggestion');
        assert.ok(tool, 'Current server must supply the scoped review tool');
        const properties = tool.function.parameters.properties;
        const user = store.listMessages('owner', conversation.id).filter(item => item.role === 'user').at(-1);
        assert.ok(user, 'The current user turn is saved by the actual server before the provider call');
        assert.equal(properties.expectedVersion.enum[0], record.version);
        assert.equal(properties.sourceConversationId.enum[0], conversation.id);
        response.write(delta({ tool_calls: [{ index: 0, id: 'synthetic_legacy_review_call', type: 'function', function: {
          name: 'prepare_case_suggestion', arguments: JSON.stringify({ expectedVersion: record.version,
            sourceConversationId: conversation.id, sourceMessageId: user.id,
            factChanges: { rent: { value: '  $2,200  ' } }, changes: {} }),
        } }] }));
      }
      // The test releases provider EOF by an observed condition, never a sleep.
      held = response;
      events.emit('provider-held');
    } catch (error) { failures.push(error); response.destroy(error); events.emit('provider-held'); }
  });
  const withDatabase = operation => {
    const db = new DatabaseSync(filename);
    db.exec('PRAGMA busy_timeout=5000');
    try { return operation(db); } finally { db.close(); }
  };
  async function stop() {
    if (stopped) return;
    stopped = true;
    try {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        try { await bounded(exited, 'disposable server exit', 5000); }
        catch { child.kill('SIGKILL'); await bounded(exited, 'disposable server forced exit', 5000); }
      }
    } finally {
      upstream.closeAllConnections();
      if (upstream.listening) await new Promise(resolve => upstream.close(resolve));
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
  try {
    const upstreamUrl = `http://127.0.0.1:${await listen(upstream)}`;
    const reservation = net.createServer();
    const port = await listen(reservation);
    await new Promise(resolve => reservation.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const preload = join(directory, 'synthetic-provider-transport.mjs');
    await writeFile(preload, `const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (String(url) !== 'https://api.deepseek.com/chat/completions') throw new Error('Unexpected fixture outbound request');
  return originalFetch(${JSON.stringify(upstreamUrl)}, options);
};\n`);
    if (mode === 'save-failure') withDatabase(db => db.exec("CREATE TRIGGER reject_legacy_browser_assistant BEFORE INSERT ON messages WHEN NEW.role='assistant' BEGIN SELECT RAISE(ABORT, 'Synthetic assistant persistence failure'); END;"));
    child = spawn(process.execPath, ['--import', preload, 'server.js'], {
      cwd: new URL('../../', import.meta.url),
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NODE_ENV: 'test',
        HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: '',
        NESTLET_DB_PATH: filename, NESTLET_ASSETS_PATH: join(directory, 'assets'),
        NESTLET_OPERATOR_USERNAME: 'owner', NESTLET_OPERATOR_PASSWORD_HASH: hash(LEGACY_FIXTURE_PASSWORD),
        DEEPSEEK_API_KEY: 'public-synthetic-legacy-review-key', ENABLE_LIVE_AI: 'true', DEEPSEEK_MODEL: 'deepseek-flash',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await bounded(new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('Nestlet available')) resolve(); });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Disposable server exited before readiness: ${code}`)));
    }), 'current server readiness');
    assert.equal((await fetch(origin + '/api/health', { signal: AbortSignal.timeout(5000) })).status, 200);
    const messages = () => store.listMessages('owner', conversation.id);
    return {
      origin, record, conversation, requests, messages, withDatabase, stop,
      async waitForProvider() {
        if (!held && !failures.length) await bounded(once(events, 'provider-held'), 'authored provider request');
        assert.deepEqual(failures, []);
        assert.ok(held && !held.destroyed);
      },
      release() {
        assert.ok(held && !held.destroyed && !released, 'Release exactly one live authored provider response');
        released = true;
        held.end(finish(mode === 'no-preview' ? 'stop' : 'tool_calls'));
      },
      assertHealthy() { assert.deepEqual(failures, []); },
      assertUnchanged() {
        assert.deepEqual(store.getCase('owner', record.id), record, 'Review preview/cancel must not write case state');
        assert.deepEqual(store.listArtifacts('owner', record.id), []);
        assert.equal(withDatabase(db => db.prepare('SELECT COUNT(*) AS count FROM conversation_review_intents').get().count), 0);
      },
      metrics: () => output.split(/\r?\n/u).flatMap(line => {
        try { const value = JSON.parse(line); return value.event === 'review_operation' ? [value] : []; } catch { return []; }
      }),
    };
  } catch (error) { await stop(); throw error; }
}
