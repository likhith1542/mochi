// Generates app-icon.png (1024x1024 RGBA) — the same pixel cat the app renders —
// without any image library, by writing the PNG format directly.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const GRID = [
  '..kk........kk..',
  '.kppk......kppk.',
  '.kpppk....kpppk.',
  'koooookkkkoooook',
  'kooooooooooooook',
  'koooEEooooEEoook',
  'koooEeooooEeoook',
  'koooowwppwwooook',
  'kooooowwwwoooook',
  'kooooooooooooook',
  'kooooooooooooook',
  '.kooooooooooook.',
  '..kkk......kkk..',
];

const PAL = {
  k: [70, 50, 39, 255],
  o: [244, 162, 89, 255],
  p: [242, 132, 130, 255],
  w: [255, 243, 226, 255],
  E: [255, 253, 246, 255],
  e: [47, 39, 36, 255],
};

const S = 1024;
const COLS = 16;
const ROWS = 13;
const CELL = 56;
const OX = Math.floor((S - COLS * CELL) / 2);
const OY = Math.floor((S - ROWS * CELL) / 2);

const px = new Uint8Array(S * S * 4);
for (let ry = 0; ry < ROWS; ry++) {
  const row = GRID[ry];
  for (let rx = 0; rx < COLS; rx++) {
    const col = PAL[row[rx]];
    if (!col) continue;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const i = ((OY + ry * CELL + y) * S + OX + rx * CELL + x) * 4;
        px[i] = col[0];
        px[i + 1] = col[1];
        px[i + 2] = col[2];
        px[i + 3] = col[3];
      }
    }
  }
}

// --- minimal PNG writer ---
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// compression / filter / interlace all 0

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter: none
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../app-icon.png', import.meta.url), png);
console.log('wrote app-icon.png');
