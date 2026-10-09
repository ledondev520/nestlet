import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGE_PREFERENCE_KEY, readLanguagePreference, saveLanguagePreference } from './language-preference.js';

test('only a supported interface preference survives a new reader', () => {
  const values = new Map();
  const storage = () => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) });
  assert.equal(readLanguagePreference(storage), 'zh');
  for (const value of ['en', 'zh']) {
    assert.equal(saveLanguagePreference(value, storage), true);
    assert.equal(readLanguagePreference(storage), value);
    assert.deepEqual([...values], [[LANGUAGE_PREFERENCE_KEY, value]]);
  }
  for (const invalid of ['', 'fr', null, {}, 'Private draft']) {
    assert.equal(saveLanguagePreference(invalid, storage), false);
    values.set(LANGUAGE_PREFERENCE_KEY, invalid);
    assert.equal(readLanguagePreference(storage), 'zh');
  }
});

test('absent, denied, and quota-limited storage do not break language switching', () => {
  const denied = () => { throw new Error('SecurityError'); };
  const unavailable = () => undefined;
  const throwingMethods = () => ({ getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } });
  for (const storage of [denied, unavailable, throwingMethods]) {
    assert.equal(readLanguagePreference(storage), 'zh');
    assert.equal(saveLanguagePreference('en', storage), false);
  }
});
