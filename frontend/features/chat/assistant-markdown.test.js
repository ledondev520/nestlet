// Synthetic SSR/DOM rendering checks, not live-provider acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { MARKDOWN_BUDGET, withinMarkdownBudget } from './markdown-budget.js';
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


test('untrusted parser complexity is bounded before Markdown parsing, preserving complete literal source', () => {
  const cases = ['['.repeat(30000)+']'.repeat(30000), '*'.repeat(4000),
    '[x]'.repeat(1500), 'line\n'.repeat(401), 'ordinary prose '.repeat(4300),
    '['.repeat(100)+'<img src=https://tracker.invalid onerror=alert(1)>'+']'.repeat(100)];
  for (const content of cases) {
    assert.equal(withinMarkdownBudget(content),false);
    const start=performance.now();
    const html=renderToStaticMarkup(React.createElement(AssistantMarkdown,{content,streaming:true,lang:'en'}));
    assert.ok(performance.now()-start<500,'bounded plaintext rendering must not spend seconds parsing Markdown');
    const doc=new JSDOM(html).window.document;
    assert.equal(doc.querySelector('[data-markdown-fallback]').textContent,content);
    assert.equal(doc.querySelectorAll('img,script,a').length,0);
    assert.ok(doc.querySelector('.assistant-markdown-cursor'));
  }
  assert.equal(withinMarkdownBudget('**Reviewed**\n\n| Field | Status |\n| --- | --- |\n| Owner | Unknown |'),true);
});

test('streaming across length and delimiter limits keeps every character and safely returns to formatted display', () => {
  const content='['.repeat(30000)+']'.repeat(30000);
  for(const length of [0,1,32,33,2048,16000,16001,30000,59000,60000]) {
    const prefix=content.slice(0,length), doc=render(prefix,{streaming:true});
    const fallback=doc.querySelector('[data-markdown-fallback]');
    if(length>MARKDOWN_BUDGET.repeatedDelimiter) assert.equal(fallback.textContent,prefix);
    assert.equal(doc.querySelectorAll('script,img').length,0);
  }
  assert.equal(render('**Finished**').querySelector('strong').textContent,'Finished');
});
