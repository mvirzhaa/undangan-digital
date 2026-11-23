// API untuk pemilik undangan: undangan, tamu, RSVP, ucapan, unggah file, check-in.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const QRCode = require('qrcode');
const { query } = require('../db');
const cfg = require('../config');
const { requireAuth } = require('../auth');
const { EVENT_TYPES, THEMES, PALETTES, FONTS, OPENERS, EFFECTS, AR_RUM_21, getTheme, resolveThemeKey } = require('../lib/themes');
const { defaultsFor } = require('../lib/defaults');
const S = require('../lib/sanitize');
const { cleanVersions } = require('../lib/versions');
const X = require('../lib/excel');
const JSZip = require('jszip');
const A = require('../lib/attendance');
const P = require('../lib/photos');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_ROOT = path.join(__dirname, '../../public/uploads');
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const MAX_GUESTS = 2000;
const MAX_INVITATIONS = 50;

const randomCode = (n = 8) => Array.from(crypto.randomBytes(n), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const rand4 = () => crypto.randomBytes(2).toString('hex');

async function uniqueSlug(base) {
  let slug = S.cleanSlug(base).slice(0, 50) || 'undangan';
  if (S.slugError(slug)) slug = `undangan-${slug}`.slice(0, 50);
  for (let i = 0; i < 6; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${rand4()}`;
    if (S.slugError(candidate)) continue;
    const r = await query('SELECT 1 FROM invitations WHERE slug = $1', [candidate]);
    if (!r.rowCount) return candidate;
  }
  return `${slug}-${crypto.randomBytes(4).toString('hex')}`;
}

// ---------- meta ----------
router.get('/meta', (_req, res) => {
  res.json({ eventTypes: EVENT_TYPES, themes: THEMES, openers: OPENERS, effects: EFFECTS, arRum21: AR_RUM_21, palettes: PALETTES, fonts: FONTS });
});

router.get('/slug-check', async (req, res) => {
  const slug = S.cleanSlug(req.query.slug);
  const err = S.slugError(slug);
  if (err) return res.json({ available: false, slug, reason: err });
  const r = await query('SELECT user_id, id FROM invitations WHERE slug = $1', [slug]);
  const own = r.rows[0] && String(r.rows[0].id) === String(req.query.except || '');
  res.json({ available: !r.rowCount || own, slug, reason: r.rowCount && !own ? 'Alamat link sudah dipakai.' : null });
});

// ---------- daftar & buat ----------
router.get('/invitations', async (req, res) => {
  const r = await query(
    `SELECT i.id, i.slug, i.title, i.event_type, i.status, i.theme, i.views, i.updated_at,
            i.content->'cover'->>'photo' AS photo,
            (SELECT count(*) FROM guests g WHERE g.invitation_id = i.id)::int AS guests,
            (SELECT coalesce(sum(pax), 0) FROM rsvps r WHERE r.invitation_id = i.id AND r.attendance = 'hadir')::int AS pax_hadir,
            (SELECT count(*) FROM wishes w WHERE w.invitation_id = i.id)::int AS wishes
       FROM invitations i WHERE i.user_id = $1 ORDER BY i.updated_at DESC`,
    [req.user.id],
  );
  res.json({ invitations: r.rows });
});

router.post('/invitations', async (req, res) => {
  const title = S.str(req.body.title, 200).trim();
  const type = EVENT_TYPES[req.body.event_type] ? req.body.event_type : null;
  if (title.length < 2) return res.status(400).json({ error: 'Judul minimal 2 karakter.' });
  if (!type) return res.status(400).json({ error: 'Jenis acara tidak dikenal.' });

  const count = await query('SELECT count(*)::int AS n FROM invitations WHERE user_id = $1', [req.user.id]);
  if (count.rows[0].n >= MAX_INVITATIONS) return res.status(400).json({ error: 'Batas jumlah undangan tercapai.' });

  let slug;
  if (req.body.slug) {
    slug = S.cleanSlug(req.body.slug);
    const err = S.slugError(slug);
    if (err) return res.status(400).json({ error: err });
    const taken = await query('SELECT 1 FROM invitations WHERE slug = $1', [slug]);
    if (taken.rowCount) return res.status(409).json({ error: 'Alamat link sudah dipakai.' });
  } else {
    slug = await uniqueSlug(title);
  }

  const d = defaultsFor(type, title);
  try {
    const r = await query(
      `INSERT INTO invitations (user_id, slug, title, event_type, theme, colors, fonts, content, settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, slug`,
      [req.user.id, slug, title, type, d.theme, d.colors, d.fonts, d.content, d.settings],
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Alamat link sudah dipakai.' });
    throw err;
  }
});

// ---------- muat undangan milik user ----------
router.param('id', async (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Undangan tidak ditemukan.' });
  const r = await query('SELECT * FROM invitations WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Undangan tidak ditemukan.' });
  req.inv = r.rows[0];
  next();
});

router.get('/invitations/:id', (req, res) => res.json({ invitation: req.inv }));

router.put('/invitations/:id', async (req, res) => {
  const inv = req.inv;
  const b = req.body || {};
  // Template hanya boleh yang cocok dengan jenis acara (template yang sudah dipakai tetap diizinkan).
  const wanted = resolveThemeKey(b.theme);
  const wantedDef = THEMES.find((t) => t.key === wanted);
  const theme = wantedDef && (wantedDef.types.includes(inv.event_type) || wanted === inv.theme) ? wanted : inv.theme;
  const base = getTheme(theme);

  const next = {
    title: b.title !== undefined ? S.str(b.title, 200).trim() || inv.title : inv.title,
    slug: inv.slug,
    theme,
    colors: b.colors ? S.cleanColors(b.colors, base.colors) : inv.colors,
    fonts: b.fonts ? S.cleanFonts(b.fonts, base.fonts) : inv.fonts,
    content: b.content ? S.cleanContent(b.content) : inv.content,
    settings: b.settings ? S.cleanSettings(b.settings) : inv.settings,
    versions: b.versions ? cleanVersions(b.versions, inv.event_type) : inv.versions,
    status: b.status === 'published' || b.status === 'draft' ? b.status : inv.status,
  };

  if (b.slug !== undefined && S.cleanSlug(b.slug) !== inv.slug) {
    const slug = S.cleanSlug(b.slug);
    const err = S.slugError(slug);
    if (err) return res.status(400).json({ error: err });
    next.slug = slug;
  }

  try {
    const r = await query(
      `UPDATE invitations SET title=$1, slug=$2, theme=$3, colors=$4, fonts=$5, content=$6, settings=$7,
              status=$8, versions=$9, updated_at=now() WHERE id=$10 RETURNING *`,
      [next.title, next.slug, next.theme, next.colors, next.fonts, next.content, next.settings, next.status, JSON.stringify(next.versions), inv.id],
    );
    // Tamu yang versinya sudah dihapus kembali memakai versi standar.
    await query(
      `UPDATE guests SET version_id = '' WHERE invitation_id = $1 AND version_id <> '' AND NOT (version_id = ANY($2::text[]))`,
      [inv.id, next.versions.map((v) => v.id)],
    );
    res.json({ invitation: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Alamat link sudah dipakai.' });
    throw err;
  }
});

router.delete('/invitations/:id', async (req, res) => {
  await query('DELETE FROM invitations WHERE id = $1', [req.inv.id]);
  fs.rm(path.join(UPLOAD_ROOT, String(req.inv.id)), { recursive: true, force: true }, () => {});
  P.removeAll(req.inv.id);
  res.json({ ok: true });
});

router.post('/invitations/:id/duplicate', async (req, res) => {
  const inv = req.inv;
  const count = await query('SELECT count(*)::int AS n FROM invitations WHERE user_id = $1', [req.user.id]);
  if (count.rows[0].n >= MAX_INVITATIONS) return res.status(400).json({ error: 'Batas jumlah undangan tercapai.' });
  const slug = await uniqueSlug(`${inv.slug}-salinan`);
  const r = await query(
    `INSERT INTO invitations (user_id, slug, title, event_type, theme, colors, fonts, content, settings, versions, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft') RETURNING id, slug`,
    [inv.user_id, slug, `${inv.title} (salinan)`.slice(0, 200), inv.event_type, inv.theme, inv.colors, inv.fonts, inv.content, inv.settings, JSON.stringify(inv.versions || [])],
  );
  res.status(201).json(r.rows[0]);
});

// ---------- unggah file ----------
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const AUDIO_EXT = { 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a' };

function sniff(buf, kind) {
  const hex = buf.subarray(0, 12).toString('hex');
  const ascii = buf.subarray(0, 12).toString('latin1');
  if (kind === 'image') {
    return hex.startsWith('ffd8ff') || hex.startsWith('89504e47') || ascii.startsWith('GIF8') ||
      (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP');
  }
  return ascii.startsWith('ID3') || /^ff[ef][0-9a-f]/.test(hex) || ascii.startsWith('OggS') ||
    (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') || ascii.slice(4, 8) === 'ftyp';
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, String(req.inv.id));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = (req.query.kind === 'audio' ? AUDIO_EXT : IMAGE_EXT)[file.mimetype] || '';
      cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = req.query.kind === 'audio' ? AUDIO_EXT : IMAGE_EXT;
    cb(allowed[file.mimetype] ? null : new Error('Format file tidak didukung.'), !!allowed[file.mimetype]);
  },
});

router.post('/invitations/:id/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 12 MB.' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file.' });
    const kind = req.query.kind === 'audio' ? 'audio' : 'image';
    const head = Buffer.alloc(12);
    const fd = fs.openSync(req.file.path, 'r');
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    if (!sniff(head, kind)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Isi file tidak sesuai dengan formatnya.' });
    }
    if (kind === 'image' && req.file.size > 6 * 1024 * 1024) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Ukuran gambar maksimal 6 MB.' });
    }
    return res.json({ url: `/uploads/${req.inv.id}/${req.file.filename}` });
  });
});

// ---------- statistik ----------
router.get('/invitations/:id/stats', async (req, res) => {
  const id = req.inv.id;
  const [g, r, w] = await Promise.all([
    query(`SELECT count(*)::int AS total, count(opened_at)::int AS opened, count(checked_in_at)::int AS checked_in,
                  coalesce(sum(checked_in_pax),0)::int AS checked_in_pax FROM guests WHERE invitation_id = $1`, [id]),
    query(`SELECT attendance, count(*)::int AS n, coalesce(sum(pax),0)::int AS pax FROM rsvps WHERE invitation_id = $1 GROUP BY attendance`, [id]),
    query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT approved)::int AS pending FROM wishes WHERE invitation_id = $1`, [id]),
  ]);
  const rs = { hadir: { n: 0, pax: 0 }, tidak: { n: 0, pax: 0 }, ragu: { n: 0, pax: 0 } };
  r.rows.forEach((x) => { rs[x.attendance] = { n: x.n, pax: x.pax }; });
  res.json({ guests: g.rows[0], rsvp: rs, wishes: w.rows[0], views: req.inv.views, attendance: await A.attendanceStats(id) });
});

// ---------- tamu ----------
const KINDS = ['individual', 'group', 'private'];
function cleanGuest(b, inv) {
  const vid = S.str(b.version_id, 30);
  return {
    name: S.str(b.name, 160).trim(),
    group_name: S.str(b.group_name, 80).trim(),
    phone: S.str(b.phone, 30).replace(/[^\d+]/g, ''),
    pax_limit: S.int(b.pax_limit, 1, 50, 1),
    kind: KINDS.includes(b.kind) ? b.kind : 'individual',
    table_name: S.str(b.table_name, 60).trim(),
    version_id: (inv.versions || []).some((v) => v.id === vid) ? vid : '',
  };
}

async function insertGuest(invId, g) {
  for (let i = 0; i < 5; i += 1) {
    try {
      const r = await query(
        `INSERT INTO guests (invitation_id, name, code, group_name, phone, pax_limit, kind, table_name, version_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [invId, g.name, randomCode(), g.group_name, g.phone, g.pax_limit, g.kind, g.table_name, g.version_id],
      );
      return r.rows[0];
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
  throw new Error('Gagal membuat kode tamu unik');
}

router.get('/invitations/:id/guests', async (req, res) => {
  const r = await query(
    `SELECT g.*, r.attendance, r.pax AS rsvp_pax FROM guests g
       LEFT JOIN rsvps r ON r.guest_id = g.id WHERE g.invitation_id = $1 ORDER BY g.created_at, g.id`,
    [req.inv.id],
  );
  res.json({ guests: r.rows });
});

async function guestCount(invId) {
  const r = await query('SELECT count(*)::int AS n FROM guests WHERE invitation_id = $1', [invId]);
  return r.rows[0].n;
}

router.post('/invitations/:id/guests', async (req, res) => {
  const g = cleanGuest(req.body || {}, req.inv);
  if (!g.name) return res.status(400).json({ error: 'Nama tamu wajib diisi.' });
  if ((await guestCount(req.inv.id)) >= MAX_GUESTS) return res.status(400).json({ error: 'Batas jumlah tamu tercapai.' });
  res.status(201).json({ guest: await insertGuest(req.inv.id, g) });
});

// Aksi massal: ganti versi undangan atau hapus beberapa tamu sekaligus.
router.post('/invitations/:id/guests/bulk', async (req, res) => {
  const ids = S.arr(req.body.ids, MAX_GUESTS).map((n) => parseInt(n, 10)).filter(Number.isInteger);
  if (!ids.length) return res.status(400).json({ error: 'Pilih minimal satu tamu.' });
  if (req.body.action === 'delete') {
    const r = await query('DELETE FROM guests WHERE invitation_id = $1 AND id = ANY($2::int[])', [req.inv.id, ids]);
    return res.json({ affected: r.rowCount });
  }
  if (req.body.action === 'version') {
    const vid = S.str(req.body.version_id, 30);
    if (vid && !(req.inv.versions || []).some((v) => v.id === vid)) return res.status(400).json({ error: 'Versi tidak ditemukan.' });
    const r = await query('UPDATE guests SET version_id = $1 WHERE invitation_id = $2 AND id = ANY($3::int[])', [vid, req.inv.id, ids]);
    return res.json({ affected: r.rowCount });
  }
  return res.status(400).json({ error: 'Aksi tidak dikenal.' });
});

// ---------- Excel: template, impor, ekspor ----------
const xlsxUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: X.MAX_FILE, files: 1 } });

function sendXlsx(res, filename, buf) {
  res.set('Content-Type', X.XLSX_MIME);
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.set('Cache-Control', 'no-store');
  res.send(buf);
}

router.get('/invitations/:id/guests/template.xlsx', async (req, res) => {
  const buf = await X.buildGuestsWorkbook({ guests: [], versions: req.inv.versions || [], baseUrl: cfg.baseUrl, slug: req.inv.slug, withData: false });
  sendXlsx(res, 'template-tamu.xlsx', buf);
});

router.get('/invitations/:id/export/guests.xlsx', async (req, res) => {
  const r = await query(
    `SELECT g.*, r.attendance FROM guests g LEFT JOIN rsvps r ON r.guest_id = g.id
      WHERE g.invitation_id = $1 ORDER BY g.id`, [req.inv.id],
  );
  const buf = await X.buildGuestsWorkbook({ guests: r.rows, versions: req.inv.versions || [], baseUrl: cfg.baseUrl, slug: req.inv.slug });
  sendXlsx(res, 'daftar-tamu.xlsx', buf);
});

router.get('/invitations/:id/export/rsvps.xlsx', async (req, res) => {
  const r = await query('SELECT * FROM rsvps WHERE invitation_id = $1 ORDER BY id', [req.inv.id]);
  sendXlsx(res, 'rsvp.xlsx', await X.buildRsvpWorkbook(r.rows));
});

// Impor: baris dengan Kode yang sudah ada diperbarui, selain itu ditambahkan sebagai tamu baru.
router.post('/invitations/:id/guests/import', (req, res, next) => {
  xlsxUpload.single('file')(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran berkas maksimal 2 MB.' : err.message });
      if (!req.file) return res.status(400).json({ error: 'Pilih berkas Excel (.xlsx) terlebih dahulu.' });
      let parsed;
      try { parsed = await X.parseGuestsXlsx(req.file.buffer, req.inv.versions || []); } catch (e) { return res.status(400).json({ error: e.message }); }
      if (!parsed.rows.length && !parsed.errors.length) return res.status(400).json({ error: 'Tidak ada data tamu pada berkas.' });

      const existingCodes = new Map(
        (await query('SELECT id, code FROM guests WHERE invitation_id = $1', [req.inv.id])).rows.map((g) => [g.code, g.id]),
      );
      let total = existingCodes.size;
      let added = 0; let updated = 0;
      const errors = parsed.errors.slice();
      for (const row of parsed.rows) {
        const g = cleanGuest(row, req.inv);
        const gid = row.code && existingCodes.get(row.code);
        if (gid) {
          await query(
            `UPDATE guests SET name=$1, group_name=$2, phone=$3, pax_limit=$4, kind=$5, table_name=$6, version_id=$7
              WHERE id=$8 AND invitation_id=$9`,
            [g.name, g.group_name, g.phone, g.pax_limit, g.kind, g.table_name, g.version_id, gid, req.inv.id],
          );
          updated += 1;
        } else if (total >= MAX_GUESTS) {
          errors.push({ row: row.row, message: `Batas ${MAX_GUESTS} tamu tercapai` });
        } else {
          await insertGuest(req.inv.id, g);
          total += 1; added += 1;
        }
      }
      return res.json({ added, updated, skipped: errors.length, errors: errors.slice(0, 30) });
    } catch (e) { return next(e); }
  });
});

router.put('/invitations/:id/guests/:gid', async (req, res) => {
  const g = cleanGuest(req.body || {}, req.inv);
  if (!g.name) return res.status(400).json({ error: 'Nama tamu wajib diisi.' });
  const r = await query(
    `UPDATE guests SET name=$1, group_name=$2, phone=$3, pax_limit=$4, kind=$5, table_name=$6, version_id=$7
      WHERE id=$8 AND invitation_id=$9 RETURNING *`,
    [g.name, g.group_name, g.phone, g.pax_limit, g.kind, g.table_name, g.version_id, req.params.gid, req.inv.id],
  );
  if (!r.rowCount) return res.status(404).json({ error: 'Tamu tidak ditemukan.' });
  res.json({ guest: r.rows[0] });
});

router.delete('/invitations/:id/guests/:gid', async (req, res) => {
  await query('DELETE FROM guests WHERE id = $1 AND invitation_id = $2', [req.params.gid, req.inv.id]);
  res.json({ ok: true });
});

router.get('/invitations/:id/guests/:gid/qr.svg', async (req, res) => {
  const r = await query('SELECT code FROM guests WHERE id = $1 AND invitation_id = $2', [req.params.gid, req.inv.id]);
  if (!r.rowCount) return res.status(404).end();
  const svg = await QRCode.toString(`${cfg.baseUrl}/${req.inv.slug}?to=${r.rows[0].code}`, { type: 'svg', margin: 1, width: 320 });
  res.type('image/svg+xml').send(svg);
});

// ---------- presensi (buku tamu & photobooth) ----------
// Pemilik juga bisa memindai/mengetik kode dari editor; aturannya sama dengan pemindai petugas.
router.post('/invitations/:id/checkin', async (req, res) => {
  const station = req.body.station === 'booth' ? 'booth' : 'guestbook';
  const pax = req.body.pax !== undefined && req.body.pax !== '' ? S.int(req.body.pax, 1, 50, undefined) : undefined;
  const r = await A.recordScan(req.inv, station, { code: S.str(req.body.code, 400), guestId: req.body.guestId, pax, source: 'owner' });
  const msg = { notfound: 'Kode tamu tidak ditemukan.', wrong: 'QR ini milik undangan lain.', disabled: 'Photobooth belum diaktifkan di Pengaturan presensi.', invalid: 'Pos tidak dikenal.' }[r.status];
  if (msg) return res.status(r.status === 'notfound' ? 404 : 400).json({ error: msg, status: r.status });
  res.json({ status: r.status, already: r.status === 'duplicate', guest: r.guest, at: r.at || null });
});

router.delete('/invitations/:id/guests/:gid/checkin', async (req, res) => {
  await query('UPDATE guests SET checked_in_at = NULL, checked_in_pax = NULL WHERE id = $1 AND invitation_id = $2', [req.params.gid, req.inv.id]);
  res.json({ ok: true });
});

router.delete('/invitations/:id/guests/:gid/booth', async (req, res) => {
  await query('UPDATE guests SET booth_at = NULL WHERE id = $1 AND invitation_id = $2', [req.params.gid, req.inv.id]);
  res.json({ ok: true });
});

// Kunci akses pemindai petugas / mesin photobooth. Mengganti kunci mematikan link lama.
router.post('/invitations/:id/staff-token', async (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  await query('UPDATE invitations SET staff_token = $1 WHERE id = $2', [token, req.inv.id]);
  res.json({ staff_token: token });
});

router.get('/invitations/:id/scans', async (req, res) => {
  const r = await query(
    `SELECT l.id, l.station, l.result, l.source, l.created_at, g.name FROM scan_log l LEFT JOIN guests g ON g.id = l.guest_id
      WHERE l.invitation_id = $1 ORDER BY l.id DESC LIMIT 60`, [req.inv.id]);
  res.json({ scans: r.rows });
});

// QR acara: satu untuk semua tamu, mengarah ke halaman swafoto.
router.get('/invitations/:id/event-qr.svg', async (req, res) => {
  const svg = await QRCode.toString(`${cfg.baseUrl}/${req.inv.slug}/foto`, { type: 'svg', margin: 1, width: 400 });
  res.type('image/svg+xml').send(svg);
});

// ---------- galeri: swafoto tamu & photobooth ----------
const photoKind = (v) => (v === 'booth' ? 'booth' : 'selfie');

router.get('/invitations/:id/photos', async (req, res) => {
  const kind = photoKind(req.query.kind);
  const r = await query(
    `SELECT p.id, p.kind, p.guest_id, p.uploader_name, p.bytes, p.created_at, g.name AS guest_name
       FROM photos p LEFT JOIN guests g ON g.id = p.guest_id
      WHERE p.invitation_id = $1 AND p.kind = $2 ORDER BY p.created_at DESC, p.id DESC LIMIT 400`, [req.inv.id, kind]);
  const n = await query('SELECT count(*)::int AS n FROM photos WHERE invitation_id = $1 AND kind = $2', [req.inv.id, kind]);
  res.json({ photos: r.rows, total: n.rows[0].n });
});

// Unggah foto photobooth dari editor (fotografer / operator). Mesin photobooth memakai kunci petugas.
router.post('/invitations/:id/photos', async (req, res) => {
  const err = await P.runUpload(P.memoryUpload(20, 15 * 1024 * 1024), req, res);
  if (err) return res.status(400).json({ error: err });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Pilih foto dulu.' });
  const total = await query(`SELECT count(*)::int AS n FROM photos WHERE invitation_id = $1 AND kind = 'booth'`, [req.inv.id]);
  if (total.rows[0].n + req.files.length > P.LIMITS.boothTotal) return res.status(400).json({ error: 'Batas jumlah foto photobooth tercapai.' });
  let guest = null;
  if (req.body.guest_id) guest = (await query('SELECT id, name FROM guests WHERE id = $1 AND invitation_id = $2', [S.int(req.body.guest_id, 1, 2147483647, 0), req.inv.id])).rows[0] || null;
  const out = await P.savePhotos(req.inv.id, req.files, { kind: 'booth', guestId: guest ? guest.id : null, name: guest ? guest.name : '' });
  if (!out.saved.length) return res.status(400).json({ error: 'Berkas bukan foto (JPG, PNG, atau WebP).' });
  res.status(201).json({ saved: out.saved.length, rejected: out.rejected });
});

router.delete('/invitations/:id/photos/:pid', async (req, res) => {
  if (!/^\d+$/.test(req.params.pid)) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
  const r = await query('DELETE FROM photos WHERE id = $1 AND invitation_id = $2 RETURNING file', [req.params.pid, req.inv.id]);
  P.removeFiles(req.inv.id, r.rows.map((x) => x.file));
  res.json({ ok: true });
});

router.post('/invitations/:id/photos/bulk-delete', async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).slice(0, 500).filter((x) => /^\d+$/.test(String(x))).map(Number);
  if (!ids.length) return res.json({ affected: 0 });
  const r = await query('DELETE FROM photos WHERE invitation_id = $1 AND id = ANY($2::int[]) RETURNING file', [req.inv.id, ids]);
  P.removeFiles(req.inv.id, r.rows.map((x) => x.file));
  res.json({ affected: r.rowCount });
});

// Unduh semua foto sebagai satu berkas zip.
router.get('/invitations/:id/photos.zip', async (req, res) => {
  const kind = photoKind(req.query.kind);
  const r = await query(
    `SELECT p.id, p.file, p.created_at, coalesce(nullif(g.name, ''), nullif(p.uploader_name, ''), 'tamu') AS who
       FROM photos p LEFT JOIN guests g ON g.id = p.guest_id WHERE p.invitation_id = $1 AND p.kind = $2 ORDER BY p.id`, [req.inv.id, kind]);
  if (!r.rowCount) return res.status(404).json({ error: 'Belum ada foto.' });
  const zip = new JSZip();
  r.rows.forEach((p) => {
    const fp = P.photoPath(req.inv.id, p.file);
    if (!fp || !fs.existsSync(fp)) return;
    const who = p.who.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'tamu';
    zip.file(`${String(p.id).padStart(5, '0')}-${who}${path.extname(p.file)}`, fs.createReadStream(fp));
  });
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${kind === 'booth' ? 'photobooth' : 'galeri-kegiatan'}-${req.inv.slug}.zip"` });
  zip.generateNodeStream({ streamFiles: true, compression: 'STORE' }).on('error', () => res.destroy()).pipe(res);
});

// ---------- RSVP ----------
router.get('/invitations/:id/rsvps', async (req, res) => {
  const r = await query('SELECT * FROM rsvps WHERE invitation_id = $1 ORDER BY created_at DESC', [req.inv.id]);
  res.json({ rsvps: r.rows });
});

router.delete('/invitations/:id/rsvps/:rid', async (req, res) => {
  await query('DELETE FROM rsvps WHERE id = $1 AND invitation_id = $2', [req.params.rid, req.inv.id]);
  res.json({ ok: true });
});

// ---------- ucapan ----------
router.get('/invitations/:id/wishes', async (req, res) => {
  const r = await query('SELECT * FROM wishes WHERE invitation_id = $1 ORDER BY created_at DESC', [req.inv.id]);
  res.json({ wishes: r.rows });
});

router.patch('/invitations/:id/wishes/:wid', async (req, res) => {
  const r = await query('UPDATE wishes SET approved = $1 WHERE id = $2 AND invitation_id = $3 RETURNING *',
    [req.body.approved === true, req.params.wid, req.inv.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Ucapan tidak ditemukan.' });
  res.json({ wish: r.rows[0] });
});

router.delete('/invitations/:id/wishes/:wid', async (req, res) => {
  await query('DELETE FROM wishes WHERE id = $1 AND invitation_id = $2', [req.params.wid, req.inv.id]);
  res.json({ ok: true });
});

module.exports = router;
