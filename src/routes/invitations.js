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
const { EVENT_TYPES, THEMES, PALETTES, FONTS, THEME_KEYS, getTheme } = require('../lib/themes');
const { defaultsFor } = require('../lib/defaults');
const S = require('../lib/sanitize');

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
  res.json({ eventTypes: EVENT_TYPES, themes: THEMES, palettes: PALETTES, fonts: FONTS });
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
  const theme = THEME_KEYS.includes(b.theme) ? b.theme : inv.theme;
  const base = getTheme(theme);

  const next = {
    title: b.title !== undefined ? S.str(b.title, 200).trim() || inv.title : inv.title,
    slug: inv.slug,
    theme,
    colors: b.colors ? S.cleanColors(b.colors, base.colors) : inv.colors,
    fonts: b.fonts ? S.cleanFonts(b.fonts, base.fonts) : inv.fonts,
    content: b.content ? S.cleanContent(b.content) : inv.content,
    settings: b.settings ? S.cleanSettings(b.settings) : inv.settings,
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
              status=$8, updated_at=now() WHERE id=$9 RETURNING *`,
      [next.title, next.slug, next.theme, next.colors, next.fonts, next.content, next.settings, next.status, inv.id],
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
  res.json({ ok: true });
});

router.post('/invitations/:id/duplicate', async (req, res) => {
  const inv = req.inv;
  const count = await query('SELECT count(*)::int AS n FROM invitations WHERE user_id = $1', [req.user.id]);
  if (count.rows[0].n >= MAX_INVITATIONS) return res.status(400).json({ error: 'Batas jumlah undangan tercapai.' });
  const slug = await uniqueSlug(`${inv.slug}-salinan`);
  const r = await query(
    `INSERT INTO invitations (user_id, slug, title, event_type, theme, colors, fonts, content, settings, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') RETURNING id, slug`,
    [inv.user_id, slug, `${inv.title} (salinan)`.slice(0, 200), inv.event_type, inv.theme, inv.colors, inv.fonts, inv.content, inv.settings],
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
  res.json({ guests: g.rows[0], rsvp: rs, wishes: w.rows[0], views: req.inv.views });
});

// ---------- tamu ----------
const KINDS = ['individual', 'group', 'private'];
function cleanGuest(b) {
  return {
    name: S.str(b.name, 160).trim(),
    group_name: S.str(b.group_name, 80).trim(),
    phone: S.str(b.phone, 30).replace(/[^\d+]/g, ''),
    pax_limit: S.int(b.pax_limit, 1, 50, 1),
    kind: KINDS.includes(b.kind) ? b.kind : 'individual',
    table_name: S.str(b.table_name, 60).trim(),
  };
}

async function insertGuest(invId, g) {
  for (let i = 0; i < 5; i += 1) {
    try {
      const r = await query(
        `INSERT INTO guests (invitation_id, name, code, group_name, phone, pax_limit, kind, table_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [invId, g.name, randomCode(), g.group_name, g.phone, g.pax_limit, g.kind, g.table_name],
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
  const g = cleanGuest(req.body || {});
  if (!g.name) return res.status(400).json({ error: 'Nama tamu wajib diisi.' });
  if ((await guestCount(req.inv.id)) >= MAX_GUESTS) return res.status(400).json({ error: 'Batas jumlah tamu tercapai.' });
  res.status(201).json({ guest: await insertGuest(req.inv.id, g) });
});

// Impor: satu baris per tamu. Format: nama, grup, telepon, jumlah (pemisah koma/titik koma/tab).
router.post('/invitations/:id/guests/import', async (req, res) => {
  const text = S.str(req.body.text, 400000);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: 'Data impor kosong.' });
  if (lines.length > 500) return res.status(400).json({ error: 'Maksimal 500 baris per impor.' });

  let existing = await guestCount(req.inv.id);
  const added = [];
  let skipped = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const cells = lines[i].split(/[;\t,]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /^(nama|name)$/i.test(cells[0])) continue;
    if (!cells[0] || existing >= MAX_GUESTS) { skipped += 1; continue; }
    const g = cleanGuest({ name: cells[0], group_name: cells[1], phone: cells[2], pax_limit: cells[3] });
    added.push(await insertGuest(req.inv.id, g));
    existing += 1;
  }
  res.json({ added: added.length, skipped });
});

router.put('/invitations/:id/guests/:gid', async (req, res) => {
  const g = cleanGuest(req.body || {});
  if (!g.name) return res.status(400).json({ error: 'Nama tamu wajib diisi.' });
  const r = await query(
    `UPDATE guests SET name=$1, group_name=$2, phone=$3, pax_limit=$4, kind=$5, table_name=$6
      WHERE id=$7 AND invitation_id=$8 RETURNING *`,
    [g.name, g.group_name, g.phone, g.pax_limit, g.kind, g.table_name, req.params.gid, req.inv.id],
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

// ---------- check-in (buku tamu hari-H) ----------
router.post('/invitations/:id/checkin', async (req, res) => {
  let code = S.str(req.body.code, 300).trim();
  const m = code.match(/[?&]to=([a-z0-9]+)/i);
  if (m) code = m[1];
  code = code.toLowerCase();
  if (!code) return res.status(400).json({ error: 'Kode tamu kosong.' });

  const found = await query('SELECT * FROM guests WHERE code = $1 AND invitation_id = $2', [code, req.inv.id]);
  if (!found.rowCount) return res.status(404).json({ error: 'Kode tamu tidak ditemukan.' });
  const g = found.rows[0];
  if (g.checked_in_at) return res.json({ guest: g, already: true });

  const pax = S.int(req.body.pax, 1, 50, g.pax_limit);
  const r = await query(
    'UPDATE guests SET checked_in_at = now(), checked_in_pax = $1 WHERE id = $2 RETURNING *',
    [pax, g.id],
  );
  res.json({ guest: r.rows[0], already: false });
});

router.delete('/invitations/:id/guests/:gid/checkin', async (req, res) => {
  await query('UPDATE guests SET checked_in_at = NULL, checked_in_pax = NULL WHERE id = $1 AND invitation_id = $2', [req.params.gid, req.inv.id]);
  res.json({ ok: true });
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

// ---------- ekspor CSV ----------
const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // cegah injeksi rumus spreadsheet
  return `"${s.replace(/"/g, '""')}"`;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

router.get('/invitations/:id/export/guests.csv', async (req, res) => {
  const r = await query('SELECT * FROM guests WHERE invitation_id = $1 ORDER BY id', [req.inv.id]);
  const rows = [['Nama', 'Grup', 'Telepon', 'Jumlah', 'Jenis', 'Meja', 'Link']].concat(
    r.rows.map((g) => [g.name, g.group_name, g.phone, g.pax_limit, g.kind, g.table_name, `${cfg.baseUrl}/${req.inv.slug}?to=${g.code}`]),
  );
  res.type('text/csv').attachment('tamu.csv').send(`﻿${toCsv(rows)}`);
});

router.get('/invitations/:id/export/rsvps.csv', async (req, res) => {
  const r = await query('SELECT * FROM rsvps WHERE invitation_id = $1 ORDER BY id', [req.inv.id]);
  const rows = [['Nama', 'Kehadiran', 'Jumlah', 'Menu', 'Catatan', 'Waktu']].concat(
    r.rows.map((x) => [x.name, x.attendance, x.pax, x.menu, x.note, x.created_at.toISOString()]),
  );
  res.type('text/csv').attachment('rsvp.csv').send(`﻿${toCsv(rows)}`);
});

module.exports = router;
