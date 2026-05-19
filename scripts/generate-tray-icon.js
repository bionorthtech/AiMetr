#!/usr/bin/env node
'use strict';
// Minimal PNG writer — generates a 32×32 tray icon without external deps.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const W = 32, H = 32;

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function dist(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  const row = y * (W * 4 + 1) + 1;
  raw[row - 1] = 0; // filter none
  for (let x = 0; x < W; x++) {
    const i = row + x * 4;
    let r = 0, g = 0, b = 0, a = 0;
    if (dist(x, y, 16, 16, 14)) { r = 99; g = 102; b = 241; a = 255; }
    if (dist(x, y, 16, 16, 9))  { r = 26; g = 26; b = 46; a = 255; }
    if (dist(x, y, 14, 15, 2))  { r = 255; g = 255; b = 255; a = 255; }
    if (dist(x, y, 20, 15, 2))  { r = 255; g = 255; b = 255; a = 255; }
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
  }
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const compressed = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'tray.png'), png);
console.log('Wrote', path.join(outDir, 'tray.png'));
