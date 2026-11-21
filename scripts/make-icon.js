'use strict';

/**
 * Dependency-free PNG icon generator (no image libs).
 * Draws a honey badge with a stylized bee at build/icon.png (512x512).
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const S = 512;
const px = new Float64Array(S * S * 4); // straight RGBA 0..1

function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
  const i = (y * S + x) * 4;
  const dstA = px[i + 3];
  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  px[i] = (r * a + px[i] * dstA * (1 - a)) / outA;
  px[i + 1] = (g * a + px[i + 1] * dstA * (1 - a)) / outA;
  px[i + 2] = (b * a + px[i + 2] * dstA * (1 - a)) / outA;
  px[i + 3] = outA;
}

function roundRect(x0, y0, w, h, radius, color) {
  for (let y = Math.floor(y0); y < y0 + h; y += 1) {
    for (let x = Math.floor(x0); x < x0 + w; x += 1) {
      const dx = Math.max(x0 + radius - x, 0, x - (x0 + w - radius));
      const dy = Math.max(y0 + radius - y, 0, y - (y0 + h - radius));
      if (dx * dx + dy * dy <= radius * radius) blend(x, y, ...color);
    }
  }
}

function ellipse(cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) blend(x, y, ...color);
    }
  }
}

function circle(cx, cy, r, color) {
  ellipse(cx, cy, r, r, color);
}

function line(x1, y1, x2, y2, width, color) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) * 2;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, color);
  }
}

// background: rounded honey tile with vertical gradient
for (let y = 0; y < S; y += 1) {
  const t = y / S;
  const r = 0.98 - 0.12 * t;
  const g = 0.72 - 0.20 * t;
  const b = 0.16 - 0.06 * t;
  for (let x = 0; x < S; x += 1) blend(x, y, r, g, b, 1);
}
// clip background into rounded square
const clip = new Uint8Array(S * S);
for (let y = 0; y < S; y += 1) {
  for (let x = 0; x < S; x += 1) {
    const radius = 108;
    const dx = Math.max(radius - x, 0, x - (S - radius));
    const dy = Math.max(radius - y, 0, y - (S - radius));
    if (dx * dx + dy * dy <= radius * radius) clip[y * S + x] = 1;
  }
}
for (let i = 0; i < S * S; i += 1) if (!clip[i]) px[i * 4 + 3] = 0;
// inner darker ring for depth
ellipse(256, 256, 232, 232, [0.15, 0.1, 0.04, 0.18]);

// honeycomb hints (hexagons)
const hexColor = [0.12, 0.08, 0.03, 0.22];
function hexagon(cx, cy, r) {
  for (let i = 0; i < 6; i += 1) {
    const a1 = (Math.PI / 3) * i - Math.PI / 6;
    const a2 = (Math.PI / 3) * (i + 1) - Math.PI / 6;
    line(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2), 3, hexColor);
  }
}
for (let row = 0; row < 6; row += 1) {
  for (let col = 0; col < 6; col += 1) {
    hexagon(60 + col * 96 + (row % 2 ? 48 : 0), 60 + row * 84, 34);
  }
}

// wings
ellipse(176, 226, 82, 52, [1, 1, 1, 0.62]);
ellipse(336, 226, 82, 52, [1, 1, 1, 0.62]);
ellipse(176, 226, 78, 48, [0.8, 0.95, 1, 0.28]);
ellipse(336, 226, 78, 48, [0.8, 0.95, 1, 0.28]);

// body
ellipse(256, 316, 132, 104, [0.13, 0.09, 0.05, 1]);
// amber stripes clipped to body ellipse
for (let band = 0; band < 3; band += 1) {
  const cy = 268 + band * 52;
  for (let y = Math.floor(cy - 24); y <= cy + 24; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const nx = (x - 256) / 132;
      const ny = (y - 316) / 104;
      if (nx * nx + ny * ny <= 1) blend(x, y, 1, 0.78, 0.13, 1);
    }
  }
}
// body outline
for (let i = 0; i < 360; i += 1) {
  const a = (i / 360) * Math.PI * 2;
  circle(256 + Math.cos(a) * 132, 316 + Math.sin(a) * 104, 5, [0.1, 0.06, 0.02, 1]);
}

// head
circle(256, 176, 66, [0.13, 0.09, 0.05, 1]);
circle(232, 162, 15, [1, 0.95, 0.8, 0.95]);
circle(280, 162, 15, [1, 0.95, 0.8, 0.95]);
circle(232, 162, 7, [0.1, 0.06, 0.02, 1]);
circle(280, 162, 7, [0.1, 0.06, 0.02, 1]);
// smile
line(240, 196, 256, 204, 4, [0.95, 0.8, 0.4, 0.9]);
line(256, 204, 272, 196, 4, [0.95, 0.8, 0.4, 0.9]);
// antennae
line(226, 124, 198, 88, 6, [0.13, 0.09, 0.05, 1]);
circle(196, 84, 9, [0.13, 0.09, 0.05, 1]);
line(286, 124, 314, 88, 6, [0.13, 0.09, 0.05, 1]);
circle(316, 84, 9, [0.13, 0.09, 0.05, 1]);
// stinger
ellipse(256, 420, 18, 26, [0.13, 0.09, 0.05, 1]);

// encode PNG (RGBA, filter 0 per scanline)
const stride = S * 4 + 1;
const raw = Buffer.alloc(stride * S);
for (let y = 0; y < S; y += 1) {
  raw[y * stride] = 0;
  for (let x = 0; x < S; x += 1) {
    const i = (y * S + x) * 4;
    raw[y * stride + 1 + x * 4] = Math.round(Math.min(1, Math.max(0, px[i])) * 255);
    raw[y * stride + 2 + x * 4] = Math.round(Math.min(1, Math.max(0, px[i + 1])) * 255);
    raw[y * stride + 3 + x * 4] = Math.round(Math.min(1, Math.max(0, px[i + 2])) * 255);
    raw[y * stride + 4 + x * 4] = Math.round(Math.min(1, Math.max(0, px[i + 3])) * 255);
  }
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${(png.length / 1024).toFixed(1)} KiB)`);
