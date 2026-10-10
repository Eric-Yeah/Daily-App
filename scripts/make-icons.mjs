// Generates the PWA icons (PNG) without extra dependencies: the "Heute" sun symbol
// in the link colour on the app background. Run with: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x1e, 0x28, 0x35];
const FG = [0x8d, 0xb8, 0xff];
const OUT = new URL('../public/icons/', import.meta.url);

// Shapes in a 24×24 design grid (same as the tab bar icon), stroke width 2.
const RING = { cx: 12, cy: 12, r: 4 };
const RAYS = [
  [12, 2, 12, 4],
  [12, 20, 12, 22],
  [2, 12, 4, 12],
  [20, 12, 22, 12],
];
const HALF_STROKE = 1;

function distToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function inside(x, y) {
  const d = Math.abs(Math.hypot(x - RING.cx, y - RING.cy) - RING.r);
  if (d <= HALF_STROKE) return true;
  return RAYS.some((s) => distToSegment(x, y, s) <= HALF_STROKE);
}

/** size: pixels; scale: how much of the canvas the 24-grid symbol covers (0…1). */
function render(size, scale) {
  const SS = 4; // supersampling per axis
  const px = new Uint8Array(size * size * 3);
  const grid = 24 / (size * scale);
  const offset = (size * (1 - scale)) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const gx = (x + (sx + 0.5) / SS - offset) * grid;
          const gy = (y + (sy + 0.5) / SS - offset) * grid;
          if (inside(gx, gy)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons = [
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  ['icon-maskable-512.png', 512, 0.5], // maskable: keep inside the 80 % safe zone
  ['apple-touch-icon.png', 180, 0.6],
];
for (const [name, size, scale] of icons) {
  writeFileSync(new URL(name, OUT), png(size, render(size, scale)));
  console.log('wrote', name);
}

writeFileSync(
  new URL('favicon.svg', OUT),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#1E2835"/><g fill="none" stroke="#8DB8FF" stroke-width="2" stroke-linecap="round" transform="translate(3.6 3.6) scale(0.7)"><circle cx="12" cy="12" r="4"/><path d="M12 2V4M12 20V22M2 12H4M20 12H22"/></g></svg>\n`,
);
console.log('wrote favicon.svg');
