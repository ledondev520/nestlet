// Public synthetic fixtures already shipped in this repository. No user materials.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const FORMAT_SOURCE_REVISION = '92dc3a8302520d87893dc425effa3b410b653eb4';
export const SYNTHETIC_VALUES = Object.freeze([
  '128 Example Lane, Unit B (fictional)', 'Example Property LLC (fictional)',
  'Not confirmed', 'SYNTHETIC TEST / NOT A REAL CASE / DEMO-104', '$2,100 per month'
]);
export const FORMATS = Object.freeze([
  { extension: 'csv', mimeType: 'text/csv' },
  { extension: 'pdf', mimeType: 'application/pdf' },
  { extension: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { extension: 'xls', mimeType: 'application/vnd.ms-excel' }
]);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function publicFormat(extension) {
  const format = FORMATS.find(item => item.extension === extension);
  const name = `nestlet-synthetic-case.${extension}`;
  return { ...format, name, buffer: await readFile(new URL(`../../public/samples/${name}`, import.meta.url)) };
}
export async function blockedWorkbook(extension) {
  return { name: `blocked.${extension}`, mimeType: FORMATS.find(item => item.extension === extension).mimeType,
    buffer: await readFile(new URL(`../fixtures/blocked.${extension}`, import.meta.url)) };
}
// Same independently validated public one-pixel PNG used in assets-api.test.js.
export const PIXEL = Object.freeze({ name: 'synthetic-browser-pixel.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
export const BAD_CSV = Object.freeze({ name: 'synthetic-malformed.csv', mimeType: 'text/csv', buffer: Buffer.from('"unterminated') });
export const BAD_PDF = Object.freeze({ name: 'synthetic-invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-not-a-valid-document\nSynthetic rejected input only.') });
