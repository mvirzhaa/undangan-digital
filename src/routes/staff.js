// Pemindai petugas (tanpa login, memakai kunci petugas di URL) untuk buku tamu & photobooth,
// serta API unggah foto untuk fotografer / mesin photobooth.
const express = require('express');
const fs = require('fs');
const { query } = require('../db');
const { rateLimit } = require('../auth');
const A = require('../lib/attendance');
const P = require('../lib/photos');
const S = require('../lib/sanitize');
const { attendanceCfg } = require('../lib/attcfg');
const { safeJson } = require('../lib/render');

const api = express.Router();
const pages = express.Router();

const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 3000, key: (req) => `${req.ip}:${req.params.token || ''}`, message: 'Terlalu banyak permintaan. Tunggu sebentar.' });
const uploadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 120, key: (req) => `${req.ip}:${req.params.token || ''}:up`, message: 'Terlalu banyak unggahan. Tunggu sebentar.' });
const badTokenLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, key: (req) => `${req.ip}:bad`, message: 'Terlalu banyak percobaan.' });

async function loadByToken(req, res, next, token) {
  if (!/^[a-f0-9]{32}$/.test(String(token))) return notFound(req, res);
  const r = await query('SELECT * FROM invitations WHERE staff_token = $1', [token]);
  if (!r.rowCount) {
    return badTokenLimiter(req, res, () => notFound(req, res));
  }
  req.inv = r.rows[0];
  return next();
}
function notFound(req, res) {
  if (req.originalUrl.includes('/api/')) return res.status(404).json({ error: 'Kunci petugas tidak valid. Minta tautan baru ke penyelenggara.' });
  return res.status(404).render('notice', { title: 'Tautan tidak berlaku', text: 'Tautan pemindai ini salah atau sudah diganti penyelenggara.' });
}
api.param('token', loadByToken);
pages.param('token', loadByToken);

const verName = (inv, id) => { const v = (inv.versions || []).find((x) => x.id === id); return v ? v.name : ''; };
const guestOut = (inv, g) => ({
  id: g.id, name: g.name, group_name: g.group_name, table_name: g.table_name, pax_limit: g.pax_limit,
  checked_in_at: g.checked_in_at, checked_in_pax: g.checked_in_pax, booth_at: g.booth_at, version: verName(inv, g.version_id),
});

async function info(inv) {
  const cfg = attendanceCfg(inv.settings);
  const [stats, recent] = await Promise.all([
    A.attendanceStats(inv.id),
    query(`SELECT l.station, l.result, l.created_at, g.name FROM scan_log l LEFT JOIN guests g ON g.id = l.guest_id
            WHERE l.invitation_id = $1 ORDER BY l.id DESC LIMIT 12`, [inv.id]),
  ]);
  return { title: inv.title, photobooth: cfg.photobooth, stats, recent: recent.rows };
}

api.get('/:token/info', limiter, async (req, res) => res.json(await info(req.inv)));

api.post('/:token/scan', limiter, async (req, res) => {
  const b = req.body || {};
  const station = b.station === 'booth' ? 'booth' : 'guestbook';
  const pax = b.pax !== undefined && b.pax !== '' ? S.int(b.pax, 1, 50, undefined) : undefined;
  const r = await A.recordScan(req.inv, station, { code: S.str(b.code, 400), guestId: b.guestId, pax, source: 'staff' });
  const out = { status: r.status, station };
  if (r.guest) { out.guest = guestOut(req.inv, r.guest); out.at = r.at || (station === 'booth' ? r.guest.booth_at : r.guest.checked_in_at); }
  out.stats = await A.attendanceStats(req.inv.id);
  res.json(out);
});

api.post('/:token/pax', limiter, async (req, res) => {
  const pax = S.int(req.body.pax, 1, 50, 0);
  if (!pax || !/^\d+$/.test(String(req.body.guestId))) return res.status(400).json({ error: 'Jumlah tidak valid.' });
  const r = await query('UPDATE guests SET checked_in_pax = $1 WHERE id = $2 AND invitation_id = $3 AND checked_in_at IS NOT NULL RETURNING *', [pax, req.body.guestId, req.inv.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Tamu belum tercatat hadir.' });
  res.json({ guest: guestOut(req.inv, r.rows[0]), stats: await A.attendanceStats(req.inv.id) });
});

// Cari tamu berdasarkan nama (untuk tamu yang tidak membawa QR).
api.get('/:token/search', limiter, async (req, res) => {
  const q = S.str(req.query.q, 60).trim();
  if (q.length < 2) return res.json({ guests: [] });
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const r = await query(
    `SELECT * FROM guests WHERE invitation_id = $1 AND (name ILIKE $2 OR group_name ILIKE $2 OR table_name ILIKE $2) ORDER BY name LIMIT 15`, [req.inv.id, like]);
  res.json({ guests: r.rows.map((g) => guestOut(req.inv, g)) });
});

// ---- foto photobooth (fotografer / mesin) ----
// POST multipart: photos[] (JPG/PNG/WebP, maks. 20 file x 15 MB), opsional guestId atau code (isi QR / kode tamu).
api.post('/:token/photos', uploadLimiter, async (req, res) => {
  if (!attendanceCfg(req.inv.settings).photobooth) return res.status(403).json({ error: 'Photobooth belum diaktifkan oleh penyelenggara.' });
  const err = await P.runUpload(P.memoryUpload(20, 15 * 1024 * 1024), req, res);
  if (err) return res.status(400).json({ error: err });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Pilih foto dulu.' });
  const total = await query(`SELECT count(*)::int AS n FROM photos WHERE invitation_id = $1 AND kind = 'booth'`, [req.inv.id]);
  if (total.rows[0].n + req.files.length > P.LIMITS.boothTotal) return res.status(400).json({ error: 'Batas jumlah foto photobooth tercapai.' });

  let guest = null;
  const b = req.body || {};
  if (b.guestId) {
    if (!/^\d+$/.test(String(b.guestId))) return res.status(400).json({ error: 'Tamu tidak dikenal.' });
    guest = (await query('SELECT * FROM guests WHERE id = $1 AND invitation_id = $2', [b.guestId, req.inv.id])).rows[0];
  } else if (b.code) {
    const p = A.parseScan(b.code);
    guest = p.code ? await P.guestByCode(req.inv.id, p.code) : null;
  }
  if ((b.guestId || b.code) && !guest) return res.status(404).json({ error: 'Tamu tidak ditemukan.' });

  const out = await P.savePhotos(req.inv.id, req.files, { kind: 'booth', guestId: guest ? guest.id : null, name: guest ? guest.name : '' });
  if (!out.saved.length) return res.status(400).json({ error: 'Berkas bukan foto (JPG, PNG, atau WebP).' });
  res.status(201).json({ saved: out.saved.length, rejected: out.rejected, guest: guest ? guestOut(req.inv, guest) : null, photos: out.saved.map((p) => p.id) });
});

api.get('/:token/photos', limiter, async (req, res) => {
  const r = await query(
    `SELECT p.id, p.created_at, p.guest_id, g.name AS guest_name FROM photos p LEFT JOIN guests g ON g.id = p.guest_id
      WHERE p.invitation_id = $1 AND p.kind = 'booth' ORDER BY p.id DESC LIMIT 16`, [req.inv.id]);
  res.json({ photos: r.rows });
});

api.get('/:token/media/:pid', limiter, async (req, res) => {
  if (!/^\d+$/.test(req.params.pid)) return res.status(404).end();
  const r = await query(`SELECT file, mime FROM photos WHERE id = $1 AND invitation_id = $2 AND kind = 'booth'`, [req.params.pid, req.inv.id]);
  const p = r.rows[0];
  const fp = p && P.photoPath(req.inv.id, p.file);
  if (!fp || !fs.existsSync(fp)) return res.status(404).end();
  res.set({ 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=600' });
  fs.createReadStream(fp).pipe(res);
});

// ---- halaman pemindai ----
pages.get('/scan/:token', (req, res) => {
  const cfg = attendanceCfg(req.inv.settings);
  const boot = { token: req.params.token, title: req.inv.title, photobooth: cfg.photobooth, basePath: res.locals.basePath || '' };
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  res.render('scan', { title: req.inv.title, boot: safeJson(boot) });
});

module.exports = { api, pages };
