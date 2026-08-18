#!/usr/bin/env node
'use strict';

/**
 * Generates the PWA icon set.
 *
 * The mark is the app's namesake: a switchback queue, drawn as a folded
 * polyline in marquee amber on the app's ink ground. It's rendered here in
 * plain Node rather than checked in as binaries so the palette stays in one
 * place and the set can be regenerated after a colour change.
 *
 * No dependencies: the PNGs are encoded by hand against zlib.
 *
 * Run via: npm run icons
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const INK = [0x0a, 0x0c, 0x18];
const AMBER = [0xff, 0xc7, 0x59];

// The queue itself, in unit coordinates: four passes with three folds.
const QUEUE = [
  [0.18, 0.22],
  [0.82, 0.22],
  [0.82, 0.4],
  [0.18, 0.4],
  [0.18, 0.6],
  [0.82, 0.6],
  [0.82, 0.78],
  [0.18, 0.78],
];

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * @param size    pixel width/height
 * @param inset   fraction of the canvas kept clear around the mark. Maskable
 *                icons need the art inside the safe zone that launchers crop to.
 */
function render(size, inset) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = 1 - inset * 2;
  const stroke = 0.075 * scale;
  const feather = 1.5 / size; // ~1px of antialiasing, in unit space

  const points = QUEUE.map(([x, y]) => [inset + x * scale, inset + y * scale]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size;
      const py = (y + 0.5) / size;

      let nearest = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        nearest = Math.min(
          nearest,
          distanceToSegment(px, py, points[i], points[i + 1]),
        );
      }

      // 1 inside the stroke, 0 outside, ramped across `feather`.
      const edge = (stroke / 2 - nearest) / feather;
      const alpha = Math.max(0, Math.min(1, edge + 0.5));

      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[offset + c] = Math.round(INK[c] + (AMBER[c] - INK[c]) * alpha);
      }
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // 10-12: compression, filter and interlace methods, all zero.

  // One filter byte (0 = None) per scanline, ahead of that row's pixels.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const start = y * (size * 4 + 1);
    raw[start] = 0;
    pixels.copy(raw, start + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 0.06 },
  { file: 'icon-512.png', size: 512, inset: 0.06 },
  // Launchers crop maskable icons to a circle: keep the art well inside.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.18 },
  { file: 'apple-touch-icon-180.png', size: 180, inset: 0.06 },
  { file: 'favicon-32.png', size: 32, inset: 0.04 },
  { file: 'favicon-16.png', size: 16, inset: 0.02 },
];

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const { file, size, inset } of TARGETS) {
  fs.writeFileSync(path.join(outDir, file), encodePng(size, render(size, inset)));
  console.log(`[make-icons] wrote ${file} (${size}x${size})`);
}
