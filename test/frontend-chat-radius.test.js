// Source contract only: this does not replace rendered browser acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tokens = await readFile(new URL('../frontend/design-system/tokens.css', import.meta.url), 'utf8');
const styles = await readFile(new URL('../frontend/styles.css', import.meta.url), 'utf8');

function declarations(source, property) {
  return [...source.matchAll(new RegExp(`(?:^|[;{])\\s*${property}:\\s*([^;}]+)`, 'g'))]
    .map(match => match[1].trim());
}

function radiusRules(selector) {
  return [...styles.matchAll(new RegExp(`\\${selector}\\s*\\{([^{}]*)\\}`, 'g'))]
    .map(match => ({ index: match.index, radii: declarations(match[1], 'border-radius') }));
}

function blockEnd(source, openingBrace) {
  let depth = 0;
  for (let index = openingBrace; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return index;
  }
  assert.fail('Expected a closed CSS rule block');
}

function resolveRadius(value) {
  const token = /^var\((--[a-z-]+)\)$/.exec(value)?.[1];
  assert.ok(token, 'Chat radii must consume semantic tokens');
  const values = declarations(tokens, token);
  assert.equal(values.length, 1, `${token} must have one runtime definition`);
  return values[0];
}

test('runtime chat radius tokens retain the approved desktop and compact values', () => {
  assert.match(styles, /@import "\.\/design-system\/tokens\.css";/);
  for (const [name, expected] of [
    ['--radius-bubble-user', '20px 20px 4px 20px'],
    ['--radius-composer', '20px'],
    ['--radius-composer-mobile', '16px'],
  ]) assert.deepEqual(declarations(tokens, name), [expected]);
});

test('user bubbles consume the same semantic radius at every viewport width', () => {
  const rules = radiusRules('.chat-message--user');
  assert.equal(rules.length, 1, 'User bubble radius has no responsive override');
  assert.deepEqual(rules[0].radii, ['var(--radius-bubble-user)']);
  assert.equal(resolveRadius(rules[0].radii[0]), '20px 20px 4px 20px');
});

test('composer retains the inclusive 640px breakpoint and its semantic radius variants', () => {
  const mobile = /@media \(max-width: (\d+)px\) \{\s*\.chat-keyboard-hint/.exec(styles);
  assert.ok(mobile, 'The existing chat mobile media query remains present');
  assert.equal(Number(mobile[1]), 640);
  const rules = radiusRules('.chat-composer');
  assert.equal(rules.length, 2);
  assert.ok(rules[0].index < mobile.index);
  assert.ok(rules[1].index > mobile.index);
  assert.ok(rules[1].index < blockEnd(styles, styles.indexOf('{', mobile.index)), 'Compact composer stays inside the mobile query');
  assert.deepEqual(rules[0].radii, ['var(--radius-composer)']);
  assert.deepEqual(rules[1].radii, ['var(--radius-composer-mobile)']);
  for (const width of [320, 390, 600, 640, 641, 760, 960, 1440]) {
    const radius = rules[width <= Number(mobile[1]) ? 1 : 0].radii[0];
    assert.equal(resolveRadius(radius), width <= 640 ? '16px' : '20px', `Width ${width}px`);
  }
});
