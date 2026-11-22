// Generates build/icon.png (512×512): green rounded square with a white orbit ring and dot.
// Plain Node, no image libraries.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function render(S) {
const k = S / 512;
const px = Buffer.alloc(S * S * 4);
const set = (x, y, r, g, b, a) => {
  const i = (y * S + x) * 4;
  const A = a / 255, inv = 1 - A;
  px[i] = Math.round(r * A + px[i] * inv);
  px[i + 1] = Math.round(g * A + px[i + 1] * inv);
  px[i + 2] = Math.round(b * A + px[i + 2] * inv);
  px[i + 3] = Math.min(255, Math.round(a + px[i + 3] * inv));
};
// coverage helper with 4×4 supersampling
const cover = (fn, x, y) => { let c = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (fn(x + (i + .5) / 4, y + (j + .5) / 4)) c++; return c / 16; };

const R = 112 * k, M = 16 * k; // corner radius, margin
const inRoundRect = (x, y) => {
  const lo = M, hi = S - M;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + R), hi - R), cy = Math.min(Math.max(y, lo + R), hi - R);
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
};
const c = S / 2;
const ring = (x, y) => { const d = Math.hypot(x - c, y - c); return d >= 128 * k && d <= 160 * k; };
const core = (x, y) => Math.hypot(x - c, y - c) <= 56 * k;
const sat = (x, y) => Math.hypot(x - (c + 101 * k), y - (c - 101 * k)) <= 34 * k;

for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const bg = cover(inRoundRect, x, y);
  if (bg) {
    const t = y / S; // vertical gradient
    set(x, y, Math.round(31 + 12 * t), Math.round(111 - 18 * t), Math.round(79 - 8 * t), Math.round(255 * bg));
  }
  const w = Math.max(cover(ring, x, y), cover(core, x, y));
  if (w) set(x, y, 255, 255, 255, Math.round(255 * w));
  const s = cover(sat, x, y);
  if (s) set(x, y, 246, 199, 0, Math.round(255 * s));
}

// PNG encode
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, cr]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);

}

const root = path.join(__dirname, "..");
fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "icon.png"), render(512));
console.log("wrote build/icon.png");
const res = path.join(root, "android", "app", "src", "main", "res");
if (fs.existsSync(res)) {
  for (const [d, n] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    const png = render(n);
    fs.writeFileSync(path.join(res, "mipmap-" + d, "ic_launcher.png"), png);
    fs.writeFileSync(path.join(res, "mipmap-" + d, "ic_launcher_round.png"), png);
  }
  // Use the PNG icons instead of the default adaptive (Capacitor logo) icon.
  fs.rmSync(path.join(res, "mipmap-anydpi-v26"), { recursive: true, force: true });
  console.log("wrote Android launcher icons");
}
