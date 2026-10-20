// Generates icons/icon{16,48,128}.png without dependencies: a dark rounded square with a cyan→green
// "lens" ring and a slash (a magnifying glass seen through — the GLASS mark).
import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function pixel(x, y, s) {
  const r = s * 0.22; // corner radius
  const inside = (px, py) => {
    const cx = Math.min(Math.max(px, r), s - r), cy = Math.min(Math.max(py, r), s - r);
    return Math.hypot(px - cx, py - cy) <= r;
  };
  if (!inside(x, y)) return [0, 0, 0, 0];
  // background gradient
  let col = mix([18, 22, 32], [11, 13, 18], y / s);
  const cx = s * 0.47, cy = s * 0.47, R = s * 0.27, w = Math.max(1.2, s * 0.085);
  const d = Math.hypot(x - cx, y - cy);
  const ringT = Math.min(1, Math.max(0, 1 - Math.abs(d - R) / w + 0.5)); // soft ring
  const grad = mix([76, 201, 240], [62, 207, 142], (x + y) / (2 * s));
  if (ringT > 0) col = mix(col, grad, ringT);
  // handle
  const hx = cx + R * 0.72, hy = cy + R * 0.72, hl = s * 0.22;
  const t = Math.min(1, Math.max(0, ((x - hx) + (y - hy)) / (2 * hl)));
  const px = hx + t * hl, py = hy + t * hl;
  const hd = Math.hypot(x - px, y - py);
  if (t > 0 && t < 1 && hd < w * 0.9) col = mix(col, grad, Math.min(1, w * 0.9 - hd + 0.5));
  // glint inside lens
  if (d < R - w * 0.6) {
    const g = Math.max(0, 1 - Math.hypot(x - (cx - R * 0.35), y - (cy - R * 0.35)) / (R * 0.55));
    col = mix(col, [120, 220, 255], g * 0.35);
  }
  return [...col, 255];
}
fs.mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const s of [16, 32, 48, 128]) fs.writeFileSync(new URL(`../icons/icon${s}.png`, import.meta.url), png(s, pixel));
console.log('icons written');
