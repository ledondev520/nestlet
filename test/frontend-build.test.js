import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
test('shadcn config and source provenance describe real JavaScript components', async () => {
  const config = JSON.parse(await readFile(new URL('components.json', root), 'utf8'));
  assert.equal(config.tsx, false);
  assert.equal(config.rsc, false);
  const manifest = JSON.parse(await readFile(new URL('frontend/components/ui/provenance.json', root), 'utf8'));
  assert.equal(manifest.repository, 'https://github.com/shadcn-ui/ui');
  assert.match(manifest.revision, /^[a-f0-9]{40}$/);
  for (const { name, source, sha256 } of manifest.components) {
    assert.match(source, new RegExp(manifest.revision));
    assert.match(sha256, /^[a-f0-9]{64}$/);
    const component = await readFile(new URL(`frontend/components/ui/${name}.jsx`, root), 'utf8');
    assert.match(component, /shadcn\/ui \(MIT\)/);
    assert.doesNotMatch(component, /React\.ComponentProps|type VariantProps|@\/registry\//);
  }
});

test('production build contains only explicit allowlisted assets, no TypeScript or source map', async () => {
  const files = await readdir(new URL('public/next/', root));
  assert.deepEqual(files.sort(), ['app.js', 'index.css', 'index.html']);
  const html = await readFile(new URL('public/next/index.html', root), 'utf8');
  const bundle = await readFile(new URL('public/next/app.js', root), 'utf8');
  assert.ok(bundle.includes('https://sfha.org/files/documents/52517ENG.pdf'), 'Promoted React build includes the official-source registry');
  assert.ok(bundle.includes('agency-guidance'), 'Promoted React build includes the reference control');
  assert.match(html, /src="\/next\/app\.js"/);
  assert.match(html, /href="\/next\/index\.css"/);
  assert.doesNotMatch(html, /localhost:5173|@vite\/client|main\.jsx/);
  const server = await readFile(new URL('server.js', root), 'utf8');
  assert.match(server, /'\/next\/app\.js': 'next\/app\.js'/);
  assert.match(server, /'\/next\/index\.css': 'next\/index\.css'/);
  assert.doesNotMatch(server, /script-src[^"\n]*unsafe-inline/);
});
