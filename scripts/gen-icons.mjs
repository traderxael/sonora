// Genera los iconos PNG de la PWA sin dependencias externas.
// Dibuja un fondo degradado + ecualizador blanco y codifica PNG con zlib.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Distancia con signo a un rectangulo redondeado.
function roundedRect(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - (halfW - radius);
  const dy = Math.abs(py - cy) - (halfH - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const bars = [0.34, 0.62, 1.0, 0.72, 0.44];
  // Contenido dentro del "safe zone" para iconos maskable.
  const scale = maskable ? 0.62 : 0.78;
  const barW = size * 0.072;
  const gap = size * 0.078;
  const maxH = size * 0.46 * scale;
  const totalW = bars.length * barW + (bars.length - 1) * gap;
  const startX = size / 2 - totalW / 2 + barW / 2;
  const centerY = size / 2;
  const radius = barW / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = clamp01(y / (size - 1));

      // Fondo: degradado diagonal verde.
      const diag = clamp01((x / size) * 0.35 + t * 0.65);
      let r = mix(0x14, 0x0a, diag);
      let g = mix(0xe6, 0xb4, diag);
      let b = mix(0x8c, 0x5c, diag);
      let a = 255;

      if (maskable) {
        // Los maskable necesitan fondo a sangre completa.
        a = 255;
      } else {
        // Borde redondeado tipo "squircle".
        const d = roundedRect(x + 0.5, y + 0.5, size / 2, size / 2, size / 2, size / 2, size * 0.22);
        a = Math.round(255 * (1 - smooth(-1.5, 1.5, d)));
      }

      // Ecualizador.
      for (let bi = 0; bi < bars.length; bi++) {
        const cx = startX + bi * (barW + gap);
        const halfH = (maxH * bars[bi]) / 2;
        const d = roundedRect(x + 0.5, y + 0.5, cx, centerY, barW / 2, halfH, radius);
        const cov = 1 - smooth(-1.2, 1.2, d);
        if (cov > 0) {
          const shade = 0.94 + 0.06 * (1 - clamp01((y - (centerY - halfH)) / (halfH * 2 || 1)));
          const white = 255 * shade;
          r = mix(r, white, cov);
          g = mix(g, white, cov);
          b = mix(b, white, cov);
        }
      }

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = a;
    }
  }
  return encodePng(size, size, rgba);
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
];

for (const [name, size, opts] of targets) {
  writeFileSync(resolve(outDir, name), drawIcon(size, opts));
  console.log(`icono generado: public/icons/${name} (${size}x${size})`);
}
