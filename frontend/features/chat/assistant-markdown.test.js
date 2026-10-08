// Synthetic SSR/DOM rendering checks, not live-provider acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error' });
const { AssistantMarkdown, safeMarkdownUrl } = await vite.ssrLoadModule('/features/chat/assistant-markdown.jsx');
test.after(() => vite.close());
const render = (content, props = {}) => new JSDOM(renderToStaticMarkup(React.createElement(AssistantMarkdown, { content, ...props }))).window.document;

test('assistant Markdown renders emphasis, nested lists, headings, code and GFM tables semantically', () => {
  const content = '# Overview\n\n**Reviewed** and *pending* ~~old~~\n\n1. First\n   - Nested\n\n| Field | Status |\n| --- | --- |\n| Owner | **Unknown** |\n\n```js\nconst text = "<script>";\n```\n\n`inline`\n\n> A quote\n\n- [x] Done';
  const doc = render(content, { lang: 'en' });
  assert.equal(doc.querySelector('h1').textContent, 'Overview');
  assert.equal(doc.querySelector('strong').textContent, 'Reviewed');
  assert.equal(doc.querySelector('ol ul li').textContent, 'Nested');
  assert.equal(doc.querySelectorAll('th[scope=col]').length, 2);
  assert.equal(doc.querySelector('td strong').textContent, 'Unknown');
  assert.equal(doc.querySelector('[role=region]').tabIndex, 0);
  assert.match(doc.querySelector('[role=region]').getAttribute('aria-label'), /scroll horizontally/);
  assert.match(doc.querySelector('pre code').textContent, /<script>/);
  assert.equal(doc.querySelector('input').disabled, true);
});

test('untrusted HTML, scripts, links and images never become executable or fetched resources', () => {
  const doc = render('<script>alert(1)</script>\n\n<img src="https://tracker.invalid/pixel" onerror="alert(1)">\n\n[bad](javascript:alert%281%29) [data](data:text/html,evil) [local](/api/logout) [protocol](//tracker.invalid) [encoded](jav&#x61;script:alert%281%29)\n\n![Tracking alt](https://tracker.invalid/image.png)\n\n[Safe](https://example.invalid/path?q=1)');
  assert.equal(doc.querySelectorAll('script,img,iframe,svg,style,object,embed').length, 0);
  assert.equal(doc.querySelectorAll('a').length, 1);
  const link = doc.querySelector('a');
  assert.equal(link.href, 'https://example.invalid/path?q=1');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(link.getAttribute('referrerpolicy'), 'no-referrer');
  assert.match(doc.body.textContent, /Tracking alt/);
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:evil', 'data:text/html,evil', '//evil.invalid', '/api/logout', 'https:\\evil.invalid', 'https://a.invalid\n.evil', 'https://user:secret@evil.invalid']) assert.equal(safeMarkdownUrl(url), '', url);
  assert.equal(safeMarkdownUrl('mailto:person@example.invalid'), 'mailto:person@example.invalid');
});

test('every partial streaming prefix renders safely, including unfinished tables and fences', () => {
  const source = '**Bold**\n\n| Field | Status |\n| --- | --- |\n| Owner | Unknown |\n\n```html\n<img src=x onerror=alert(1)>\n```\n\n[link](https://example.invalid)';
  for (let i = 0; i <= source.length; i++) {
    const doc = render(source.slice(0, i), { streaming: true });
    assert.equal(doc.querySelectorAll('img,script').length, 0);
    assert.equal(doc.querySelector('.assistant-markdown-cursor').getAttribute('aria-hidden'), 'true');
  }
  assert.equal(render(source).querySelector('.assistant-markdown-cursor'), null);
  assert.equal(source.includes('**Bold**'), true); // renderer receives, never edits, raw source
});
