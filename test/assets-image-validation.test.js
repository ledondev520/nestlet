// Synthetic byte-level invalid PNG fixtures independently assembled from the PNG chunk format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { parseAsset } from '../private-assets.js';
function chunk(type, data) {
  const name = Buffer.from(type),
    body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const b of body) {
    crc ^= b;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}
function png({ color = 6, interlace = 0, data = Buffer.from([0, 0, 0, 0, 255]) } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = color;
  header[12] = interlace;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(data)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
test('PNG decoder rejects invalid scanline filters, missing indexed palettes and truncated Adam7 data despite valid CRCs', async () => {
  const options = { originalFilename: 'synthetic.png', mimeType: 'image/png' };
  assert.equal((await parseAsset(png(), options)).textStatus, 'unavailable');
  for (const bytes of [
    png({ data: Buffer.from([5, 0, 0, 0, 255]) }),
    png({ color: 3, data: Buffer.from([0, 0]) }),
    png({ interlace: 1, data: Buffer.from([0]) })
  ])
    await assert.rejects(
      parseAsset(bytes, options),
      (error) => error.code === 'ASSET_IMAGE_INVALID'
    );
});
