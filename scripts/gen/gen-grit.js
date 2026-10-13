// Writes public/img/grit.png: a tileable 256×256 speckle mask (opaque with small transparent
// flecks) for the Fantasy cards' worn-stencil hero art (style.css .ft-art img).
// A fixed PNG because an SVG-noise mask redraws too slowly at card size.
// Run: node scripts/gen/gen-grit.js
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const N = 256;
let seed = 1234567;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

// Tileable value noise: a random lattice of `cells` per side, smoothly interpolated, wrapping.
function layer(cells) {
  const g = Array.from({ length: cells * cells }, rand), at = (x, y) => g[((y + cells) % cells) * cells + ((x + cells) % cells)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / N) * cells, fy = (y / N) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}
const coarse = layer(24), mid = layer(64), fine = layer(128);

// Alpha per pixel: holes where the summed noise peaks (flecks).
const alpha = new Uint8Array(N * N).fill(255);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const v = coarse(x, y) * 0.55 + mid(x, y) * 0.35 + fine(x, y) * 0.1;
  if (v > 0.83) alpha[y * N + x] = 0;
}

// PNG, grey + alpha, 8 bit.
const raw = Buffer.alloc(N * (1 + N * 2));
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const o = y * (1 + N * 2) + 1 + x * 2; raw[o] = 0; raw[o + 1] = alpha[y * N + x]; }
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 4;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
writeFileSync(new URL("../../public/img/grit.png", import.meta.url), png);
const holes = alpha.reduce((t, a) => t + (a === 0), 0);
console.log(`public/img/grit.png: ${png.length} bytes, ${((100 * holes) / (N * N)).toFixed(1)}% holes`);
