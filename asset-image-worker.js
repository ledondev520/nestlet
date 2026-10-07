/** Isolated image validation: real bounded decode, no OCR, no network and no writes. */
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { validateImageStructure } from './private-assets.js';
try {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > 5 * 1024 * 1024) throw Error();
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks),
    mimeType = process.argv[2];
  validateImageStructure(bytes, mimeType);
  if (mimeType === 'image/png') PNG.sync.read(bytes, { checkCRC: true });
  if (mimeType === 'image/jpeg')
    jpeg.decode(bytes, {
      useTArray: true,
      tolerantDecoding: false,
      maxResolutionInMP: 16,
      maxMemoryUsageInMB: 128
    });
  process.stdout.write(JSON.stringify({ ok: true }));
} catch {
  process.stdout.write(JSON.stringify({ ok: false }));
}
