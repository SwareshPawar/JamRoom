/**
 * Generates PNG icons for the PWA manifest (Android compatibility).
 * Run with: node generateIcons.js
 * Requires no external dependencies — pure Node.js.
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'public', 'icons');

// ── Helpers ────────────────────────────────────────────────────────────────

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function crc32(buf) {
  let crc = 0xffffffff;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })());
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = uint32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBytes = uint32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcBytes]);
}

/**
 * Build a minimal RGB PNG from a flat Uint8Array of R,G,B triplets.
 */
function buildPNG(width, height, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.concat([
    uint32BE(width),
    uint32BE(height),
    Buffer.from([8, 2, 0, 0, 0]) // 8-bit, RGB, no filter, not interlaced
  ]);

  // Raw scanlines: 1 filter byte (0=None) + RGB row
  const raw = Buffer.allocUnsafe(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3;
      const dst = y * (1 + width * 3) + 1 + x * 3;
      raw[dst] = rgb[src];
      raw[dst + 1] = rgb[src + 1];
      raw[dst + 2] = rgb[src + 2];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── Pixel drawing helpers ─────────────────────────────────────────────────

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function hex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Draw a diagonal gradient, an optionally rounded foreground rect,
 * circles, and a text badge.
 */
function renderIcon(size, maskable = false) {
  const rgb = new Uint8Array(size * size * 3);

  // Background gradient: #38bdf8 → #34d399
  const [r1, g1, b1] = hex('#38bdf8'); // sky-400
  const [r2, g2, b2] = hex('#34d399'); // emerald-400

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * (size - 1));
      const i = (y * size + x) * 3;
      rgb[i]     = lerp(r1, r2, t);
      rgb[i + 1] = lerp(g1, g2, t);
      rgb[i + 2] = lerp(b1, b2, t);
    }
  }

  // Draw a centred dark navy rounded rectangle (foreground card)
  const pad = maskable ? Math.round(size * 0.20) : Math.round(size * 0.15);
  const rx = pad;
  const ry = Math.round(size * 0.18);
  const rw = size - pad * 2;
  const rh = size - Math.round(size * 0.24);
  const corner = Math.round(size * 0.09);
  const [nr, ng, nb] = hex('#0f172a'); // slate-900

  function inRoundedRect(px, py) {
    if (px < rx || px >= rx + rw || py < ry || py >= ry + rh) return false;
    // corner rounding
    const cxs = [rx + corner, rx + rw - corner];
    const cys = [ry + corner, ry + rh - corner];
    for (let ci = 0; ci < 2; ci++) {
      for (let cj = 0; cj < 2; cj++) {
        const ex = (ci === 0 ? px < cxs[0] : px >= cxs[1]);
        const ey = (cj === 0 ? py < cys[0] : py >= cys[1]);
        if (ex && ey) {
          const dx = px - cxs[ci];
          const dy = py - cys[cj];
          if (dx * dx + dy * dy > corner * corner) return false;
        }
      }
    }
    return true;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y)) {
        const i = (y * size + x) * 3;
        rgb[i] = nr; rgb[i + 1] = ng; rgb[i + 2] = nb;
      }
    }
  }

  // Draw two circles (left = sky, right = emerald) — the "speakers" motif
  const cy = Math.round(size * 0.46);
  const cr = Math.round(size * 0.08);
  const cl = Math.round(size * 0.33); // left centre x
  const cright = Math.round(size * 0.67); // right centre x

  function drawCircle(cx, cy, cr, color) {
    const [dr, dg, db] = color;
    for (let y = cy - cr; y <= cy + cr; y++) {
      for (let x = cx - cr; x <= cx + cr; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= cr * cr) {
          const i = (y * size + x) * 3;
          rgb[i] = dr; rgb[i + 1] = dg; rgb[i + 2] = db;
        }
      }
    }
  }

  drawCircle(cl, cy, cr, hex('#38bdf8'));
  drawCircle(cright, cy, cr, hex('#34d399'));

  // Centre vertical bar (fader/slider motif)
  const bx = Math.round(size * 0.46);
  const by = Math.round(size * 0.30);
  const bw = Math.round(size * 0.08);
  const bh = Math.round(size * 0.40);
  const [lr, lg, lb] = hex('#e2e8f0');
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      if (x >= 0 && y >= 0 && x < size && y < size) {
        const i = (y * size + x) * 3;
        rgb[i] = lr; rgb[i + 1] = lg; rgb[i + 2] = lb;
      }
    }
  }

  return rgb;
}

// ── Generate files ─────────────────────────────────────────────────────────

function save(filename, size, maskable = false) {
  const rgb = renderIcon(size, maskable);
  const png = buildPNG(size, size, rgb);
  fs.writeFileSync(path.join(OUT_DIR, filename), png);
  console.log(`✓  ${filename}  (${size}×${size})`);
}

save('jamroom-192.png', 192);
save('jamroom-512.png', 512);
save('jamroom-maskable.png', 512, true);

console.log('\nDone! PNG icons written to public/icons/');
