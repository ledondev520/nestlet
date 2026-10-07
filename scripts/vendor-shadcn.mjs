// Reproducible local transform of the pinned official sources documented below.
// Download those files separately; this script does not install or execute code.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { transformAsync } from '@babel/core';
import transformTypeScript from '@babel/plugin-transform-typescript';

const revision = '04b5af3c0ec02fc6a4330e4f441c15571adfdb76';
const names = ['button', 'input', 'card', 'dialog', 'label', 'textarea', 'tabs', 'select', 'native-select', 'badge', 'alert', 'separator', 'checkbox', 'skeleton'];
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/vendor-shadcn.mjs <directory containing pinned official .tsx sources and LICENSE.md>');
const output = new URL('../frontend/components/ui/', import.meta.url);
await mkdir(output, { recursive: true });
const components = [];
for (const name of names) {
  const source = await readFile(join(resolve(input), `${name}.tsx`), 'utf8');
  const sha256 = createHash('sha256').update(source).digest('hex');
  const { code } = await transformAsync(source, {
    filename: `${name}.tsx`,
    configFile: false,
    babelrc: false,
    plugins: [[transformTypeScript, { isTSX: true, allExtensions: true }]]
  });
  const adapted = code.replaceAll('from "cn"', 'from "@/lib/utils"').replaceAll('@/registry/new-york-v4/ui/', '@/components/ui/');
  await writeFile(new URL(`${name}.jsx`, output), `// shadcn/ui (MIT), official new-york-v4 source. See provenance.json.\n${adapted}\n`);
  components.push({ name, source: `https://github.com/shadcn-ui/ui/blob/${revision}/apps/v4/registry/new-york-v4/ui/${name}.tsx`, sha256 });
}
await copyFile(join(resolve(input), 'LICENSE.md'), new URL('LICENSE.shadcn.md', output));
await writeFile(new URL('provenance.json', output), JSON.stringify({
  repository: 'https://github.com/shadcn-ui/ui', revision,
  license: 'MIT', style: 'new-york-v4', language: 'JavaScript/JSX',
  retrieval: 'Official GitHub raw sources; shadcn registry endpoint was unavailable from the build environment.',
  transformations: ['Babel removes TypeScript annotations and type-only imports, preserving JSX', 'cn import points to @/lib/utils', 'Internal registry UI imports point to @/components/ui'],
  components
}, null, 2) + '\n');
console.log(`Vendored ${components.length} official shadcn components as JavaScript/JSX.`);
