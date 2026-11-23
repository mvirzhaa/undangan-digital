// Pembuat PNG kecil tanpa dependensi (untuk data demo & pengujian): gradasi dua warna.
const zlib = require('zlib');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// a, b = [r,g,b]; arah gradasi diagonal; dot = lingkaran kecil berwarna putih agar tiap foto tampak berbeda.
function makePng(w = 240, h = 240, a = [200, 80, 120], b = [60, 40, 140], dot = 0) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const k = (x / w + y / h) / 2; const o = y * (w * 3 + 1) + 1 + x * 3;
      let px = [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
      if (dot) {
        const cx = w * (0.25 + 0.5 * ((dot * 37) % 100) / 100); const cy = h * (0.25 + 0.5 * ((dot * 61) % 100) / 100);
        if ((x - cx) ** 2 + (y - cy) ** 2 < (w * 0.14) ** 2) px = [255, 255, 255];
      }
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { makePng };
