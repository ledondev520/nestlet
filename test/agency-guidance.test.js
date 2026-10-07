import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENCY_OPTIONS, DEFAULT_GUIDANCE_AGENCY, GUIDANCE_COPY, getAgencyGuidance } from '../public/agency-guidance.js';

test('SFHA is the research default but does not silently become the case agency', () => {
  assert.equal(DEFAULT_GUIDANCE_AGENCY, 'sfha');
  assert.equal(AGENCY_OPTIONS[0].id, 'sfha');
  assert.equal(getAgencyGuidance().id, 'unknown');
  for (const value of ['San Francisco', 'SFHA', '__proto__', 'constructor', null, {}, 42]) {
    assert.equal(getAgencyGuidance(value).id, 'unknown');
  }
});

test('every agency has bilingual reference guidance and unconfirmed acceptance', () => {
  const hosts = new Set(['www.hud.gov', 'sfha.org', 'www.oakha.org', 'www.haca.net', 'www.scchousingauthority.org']);
  for (const option of AGENCY_OPTIONS) {
    assert.ok(option.label.zh && option.label.en);
    for (const locale of ['zh', 'en']) {
      const guide = getAgencyGuidance(option.id, locale);
      assert.equal(guide.id, option.id);
      assert.equal(guide.acceptanceStatus, 'unconfirmed');
      assert.equal(guide.checkedAt, '2026-10-07');
      assert.ok(guide.scope && guide.notes.length > 0);
      assert.ok(guide.links.length > 0 && guide.links.length <= 4);
      for (const link of guide.links) {
        const url = new URL(link.url);
        assert.equal(url.protocol, 'https:');
        assert.ok(hosts.has(url.hostname), `Unexpected host ${url.hostname}`);
        assert.equal(link.acceptanceStatus, 'unconfirmed');
        assert.ok(link.title && link.edition);
        assert.doesNotMatch(link.title, /[\p{Script=Han}]/u);
      }
    }
  }
  assert.deepEqual(Object.keys(GUIDANCE_COPY.zh).sort(), Object.keys(GUIDANCE_COPY.en).sort());
});

test('printed expiration is observed metadata, never an acceptance decision', () => {
  const guide = getAgencyGuidance('sfha', 'en');
  for (const id of ['sfha-rta', 'hud-addendum']) {
    const form = guide.links.find(link => link.id === id);
    assert.equal(form.printedOMBExpiration, '2026-04-30');
    assert.equal(form.acceptanceStatus, 'unconfirmed');
    assert.equal(Object.hasOwn(form, 'valid'), false);
  }
  assert.match(GUIDANCE_COPY.en.versionCaution, /neither validity nor invalidity/);
  assert.match(guide.notes.join(' '), /HAP-assumption/);
  assert.match(getAgencyGuidance('oha', 'en').links[1].edition, /10\/19/);
});

test('callers cannot mutate the source registry through returned data', () => {
  const guide = getAgencyGuidance('sfha', 'en');
  assert.ok(Object.isFrozen(guide));
  assert.ok(Object.isFrozen(guide.links));
  assert.ok(Object.isFrozen(guide.links[0]));
  assert.throws(() => { guide.links[0].url = 'https://example.invalid'; }, TypeError);
  assert.equal(getAgencyGuidance('sfha', 'en').links[0].url, guide.links[0].url);
  assert.equal(getAgencyGuidance('sfha', 'zh-CN').label, getAgencyGuidance('sfha', 'zh').label);
});
