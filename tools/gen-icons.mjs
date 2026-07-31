#!/usr/bin/env node
/* 词书 · 生成 PWA 图标（纯 Node，零依赖） */
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'icons');

/* ---------- 最小 PNG 编码器 ---------- */
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = 1 + width * 4;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 绘制图标 ---------- */
function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  const BG = [0x4f, 0x46, 0xe5];      // indigo #4f46e5
  const SPINE = [0xc7, 0xd2, 0xfe];   // #c7d2fe
  const WHITE = [0xff, 0xff, 0xff];
  const rad = size * 0.20;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 圆角矩形背景
      const cx = Math.min(Math.max(x + 0.5, rad), size - rad);
      const cy = Math.min(Math.max(y + 0.5, rad), size - rad);
      const dx = (x + 0.5) - cx, dy = (y + 0.5) - cy;
      if (dx * dx + dy * dy <= rad * rad) set(x, y, BG[0], BG[1], BG[2], 255);
      else set(x, y, 0, 0, 0, 0);
    }
  }

  // 打开的书：两页 + 书脊
  const lx = Math.floor(size * 0.24), rx = Math.floor(size * 0.49);
  const lx2 = Math.floor(size * 0.51), rx2 = Math.floor(size * 0.76);
  const ty = Math.floor(size * 0.22), by = Math.floor(size * 0.78);
  for (let y = ty; y <= by; y++) {
    for (let x = lx; x <= rx; x++) set(x, y, WHITE[0], WHITE[1], WHITE[2], 255);
    for (let x = lx2; x <= rx2; x++) set(x, y, WHITE[0], WHITE[1], WHITE[2], 255);
    if (rx + 1 <= lx2 - 1) for (let x = rx + 1; x <= lx2 - 1; x++) set(x, y, SPINE[0], SPINE[1], SPINE[2], 255);
  }

  // 文字行（书页上的横线）
  const lines = [0.32, 0.40, 0.48];
  const lineW = Math.floor(size * 0.11);
  for (const ly of lines) {
    const y = Math.floor(size * ly);
    for (let x = lx + Math.floor(size * 0.06); x <= lx + lineW; x++) set(x, y, SPINE[0], SPINE[1], SPINE[2], 255);
    for (let x = lx2 + Math.floor(size * 0.06); x <= lx2 + lineW; x++) set(x, y, SPINE[0], SPINE[1], SPINE[2], 255);
  }

  return encodePNG(size, size, px);
}

fs.mkdirSync(OUT, { recursive: true });
for (const s of [192, 512]) {
  const p = path.join(OUT, `icon-${s}.png`);
  fs.writeFileSync(p, makeIcon(s));
  console.log(`生成 ${p} (${fs.statSync(p).size} bytes)`);
}
/* iOS 添加到主屏幕需要 180×180 apple-touch-icon */
const ati = path.join(OUT, 'apple-touch-icon.png');
fs.writeFileSync(ati, makeIcon(180));
console.log(`生成 ${ati} (${fs.statSync(ati).size} bytes)`);
