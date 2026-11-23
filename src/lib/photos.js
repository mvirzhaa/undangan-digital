// Penyimpanan & akses foto galeri (swafoto tamu dan photobooth). File disimpan DI LUAR folder publik
// dan hanya disajikan lewat rute yang memeriksa hak akses.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { query } = require('../db');
const cfg = require('../config');
const { attendanceCfg } = require('./attendance');

const GALLERY_ROOT = path.join(__dirname, '../../storage/gallery');
const COOKIE_AGE = 30 * 24 * 3600 * 1000;
const LIMITS = { selfiePerUploader: 60, selfieTotal: 3000, boothTotal: 5000 };

// Deteksi format dari isi file (bukan dari nama / header klien). SVG & lainnya ditolak.
function detectImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  const hex = buf.subarray(0, 4).toString('hex');
  if (hex.startsWith('ffd8ff')) return { ext: 'jpg', mime: 'image/jpeg' };
  if (hex === '89504e47') return { ext: 'png', mime: 'image/png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

// Pengunggah multipart ke memori; isi tiap file diperiksa lagi lewat detectImage.
function memoryUpload(maxFiles, maxBytes) {
  return multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: maxFiles, fields: 10, parts: maxFiles + 12 } }).array('photos', maxFiles);
}
function runUpload(mw, req, res) {
  return new Promise((resolve) => {
    mw(req, res, (err) => {
      if (!err) return resolve(null);
      if (err.code === 'LIMIT_FILE_SIZE') return resolve('Ukuran satu foto terlalu besar.');
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return resolve('Terlalu banyak foto sekaligus.');
      return resolve('Unggahan tidak valid.');
    });
  });
}

// Simpan foto-foto valid; mengembalikan { saved: [row], rejected: n }.
async function savePhotos(invId, files, { kind, guestId = null, name = '', key = '' }) {
  const dir = path.join(GALLERY_ROOT, String(invId));
  await fs.promises.mkdir(dir, { recursive: true });
  const saved = [];
  let rejected = 0;
  for (const f of files || []) {
    const type = detectImage(f.buffer);
    if (!type) { rejected += 1; continue; }
    const file = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${type.ext}`;
    await fs.promises.writeFile(path.join(dir, file), f.buffer, { flag: 'wx' });
    const r = await query(
      `INSERT INTO photos (invitation_id, kind, guest_id, uploader_name, uploader_key, file, mime, bytes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, kind, guest_id, uploader_name, mime, bytes, created_at`,
      [invId, kind, guestId, String(name).slice(0, 160), key, file, type.mime, f.buffer.length],
    );
    saved.push(r.rows[0]);
  }
  return { saved, rejected };
}

function photoPath(invId, file) {
  if (!/^[a-z0-9]+-[a-f0-9]{16}\.(jpg|png|webp)$/.test(file)) return null;
  return path.join(GALLERY_ROOT, String(invId), file);
}
function removeFiles(invId, files) {
  files.forEach((f) => { const p = photoPath(invId, f); if (p) fs.unlink(p, () => {}); });
}
function removeAll(invId) { fs.rm(path.join(GALLERY_ROOT, String(invId)), { recursive: true, force: true }, () => {}); }

// ---- identitas pengunjung (tanpa login): kunci perangkat + kode tamu ----
const kCookie = (invId) => `ud_k_${invId}`;
const gCookie = (invId) => `ud_g_${invId}`;
const cookieOpts = () => ({ httpOnly: true, sameSite: 'lax', secure: cfg.isProd, maxAge: COOKIE_AGE, path: '/' });

async function guestByCode(invId, code) {
  if (typeof code !== 'string' || !/^[a-z0-9]{4,16}$/i.test(code)) return null;
  return (await query('SELECT * FROM guests WHERE code = $1 AND invitation_id = $2', [code.toLowerCase(), invId])).rows[0] || null;
}

// Pengunjung dikenali dari ?to=kode, cookie kode tamu, dan kunci perangkat.
async function visitor(req, inv) {
  const key = String((req.cookies && req.cookies[kCookie(inv.id)]) || '');
  const validKey = /^[a-f0-9]{32}$/.test(key) ? key : '';
  const code = (req.query && req.query.to) || (req.body && req.body.to) || (req.cookies && req.cookies[gCookie(inv.id)]) || '';
  const guest = await guestByCode(inv.id, code);
  const isOwner = !!(req.user && req.user.id === inv.user_id);
  return { key: validKey, guest, isOwner };
}

function rememberVisitor(res, inv, v, guest) {
  let key = v.key;
  if (!key) key = crypto.randomBytes(16).toString('hex');
  res.cookie(kCookie(inv.id), key, cookieOpts());
  if (guest) res.cookie(gCookie(inv.id), guest.code, cookieOpts());
  return key;
}

async function hasContributed(inv, v) {
  if (!v.key && !v.guest) return false;
  const r = await query(
    `SELECT 1 FROM photos WHERE invitation_id = $1 AND kind = 'selfie'
        AND (($2 <> '' AND uploader_key = $2) OR ($3::int IS NOT NULL AND guest_id = $3)) LIMIT 1`,
    [inv.id, v.key, v.guest ? v.guest.id : null],
  );
  return r.rowCount > 0;
}

// Boleh melihat galeri kegiatan (swafoto)?
async function canViewGallery(inv, v) {
  if (v.isOwner) return true;
  const c = attendanceCfg(inv.settings);
  if (!c.selfie) return false;
  if (c.galleryAccess === 'public') return true;
  if (c.galleryAccess === 'guests') return !!v.guest || hasContributed(inv, v);
  return hasContributed(inv, v);
}

// Foto photobooth: pemilik; tamu untuk fotonya sendiri; atau semua tamu bila dibagikan.
function canViewBooth(inv, v, photo) {
  if (v.isOwner) return true;
  const c = attendanceCfg(inv.settings);
  if (!c.photobooth || !v.guest) return false;
  if (!photo) return true; // boleh membuka halaman; isinya disaring terpisah
  return c.boothShare === 'all' || photo.guest_id === v.guest.id;
}

module.exports = {
  GALLERY_ROOT, LIMITS, detectImage, memoryUpload, runUpload, savePhotos, photoPath, removeFiles, removeAll,
  visitor, rememberVisitor, guestByCode, hasContributed, canViewGallery, canViewBooth,
};
