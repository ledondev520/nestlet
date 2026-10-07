// Pure routing tests. No browser, provider, or actual mailbox delivery is claimed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureAuthFragment } from './auth-route.js';
const token = 'a'.repeat(43);
function browser(url) {
  const location = new URL(url); const replacements = [];
  return { location, replacements, history: { replaceState(state, title, path) { replacements.push({ state, title, path }); location.href = new URL(path, location).href; } } };
}
test('root fragments are scrubbed synchronously and token is closure-only and single-read', () => {
  const page = browser(`https://fixture.invalid/#auth=verify&token=${token}`);
  const link = captureAuthFragment(page);
  assert.equal(page.location.hash, ''); assert.equal(page.replacements[0].state, null);
  assert.equal(link.valid, true); assert.equal(link.mode, 'verify');
  assert.equal(JSON.stringify(link).includes(token), false);
  assert.equal(link.takeToken(), token); assert.equal(link.takeToken(), '');
});
test('malformed links, duplicate fields, other routes and query redirect injection fail closed but are scrubbed', () => {
  for (const url of [`https://fixture.invalid/next/#auth=verify&token=${token}`, `https://fixture.invalid/#auth=verify&token=${token}&auth=reset`, `https://fixture.invalid/#auth=reset&token=${token}&next=https://evil.invalid`, 'https://fixture.invalid/#auth=reset&token=short', `https://fixture.invalid/#auth=unknown&token=${token}`]) {
    const page = browser(url), link = captureAuthFragment(page);
    assert.equal(page.location.hash, ''); assert.equal(link.valid, false); assert.equal(link.takeToken(), '');
  }
});
test('ordinary hash navigation is untouched and abandoning a link destroys the in-memory secret', () => {
  const page = browser('https://fixture.invalid/#customers'); assert.equal(captureAuthFragment(page), null); assert.equal(page.location.hash, '#customers');
  const link = captureAuthFragment(browser(`https://fixture.invalid/#auth=reset&token=${token}`)); link.clear(); assert.equal(link.takeToken(), '');
});
