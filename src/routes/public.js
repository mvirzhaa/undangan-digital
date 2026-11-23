// Halaman undangan publik + API untuk tamu (RSVP, ucapan, kalender).
const express = require('express');
const { query } = require('../db');
const { rateLimit } = require('../auth');
const { buildView, safeJson, OFFSET } = require('../lib/render');
const i18n = require('../lib/i18n');
const S = require('../lib/sanitize');
const { applyVersion } = require('../lib/versions');
const fs = require('fs');
const cfg = require('../config');
const { attendanceCfg } = require('../lib/attcfg');
const P = require('../lib/photos');
const { buildTicket, qrSvg } = require('../lib/ticket');
const { themeVars } = require('../lib/render');

const api = express.Router();
const pages = express.Router();

const postLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: 'Terlalu banyak kiriman. Coba lagi nanti.' });

async function findPublished(slug) {
  const r = await query('SELECT * FROM invitations WHERE slug = $1', [String(slug).toLowerCase()]);
  const inv = r.rows[0];
  return inv && inv.status === 'published' ? inv : null;
}

async function findGuest(invId, code) {
  if (typeof code !== 'string' || !/^[a-z0-9]{4,16}$/i.test(code)) return null;
  const r = await query('SELECT * FROM guests WHERE code = $1 AND invitation_id = $2', [code.toLowerCase(), invId]);
  return r.rows[0] || null;
}

// ---------------- API tamu ----------------
api.post('/:slug/rsvp', postLimiter, async (req, res) => {
  const inv = await findPublished(req.params.slug);
  if (!inv) return res.status(404).json({ error: 'Undangan tidak ditemukan.' });
  const t = i18n(inv.settings.lang);
  const guest = await findGuest(inv.id, req.body.to);
  if (applyVersion(inv, guest && guest.version_id).inv.settings.sections.rsvp === false) return res.status(403).json({ error: 'RSVP dinonaktifkan.' });
  if (inv.settings.privateMode && !guest) return res.status(403).json({ error: t.privateText });

  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  if (inv.content.rsvp.deadline && today > inv.content.rsvp.deadline) return res.status(403).json({ error: t.rsvpClosed });

  const name = guest ? guest.name : S.str(req.body.name, 160).trim();
  if (!name) return res.status(400).json({ error: 'Nama wajib diisi.' });
  const attendance = ['hadir', 'tidak', 'ragu'].includes(req.body.attendance) ? req.body.attendance : null;
  if (!attendance) return res.status(400).json({ error: 'Pilih status kehadiran.' });

  const maxPax = guest ? guest.pax_limit : inv.content.rsvp.maxPax || 4;
  const pax = attendance === 'tidak' ? 0 : S.int(req.body.pax, 1, maxPax, 1);
  const menus = inv.content.rsvp.menus || [];
  const menu = menus.includes(req.body.menu) && attendance !== 'tidak' ? req.body.menu : '';
  const note = S.str(req.body.note, 500).trim();

  if (guest) {
    await query(
      `INSERT INTO rsvps (invitation_id, guest_id, name, attendance, pax, menu, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (invitation_id, guest_id) WHERE guest_id IS NOT NULL
       DO UPDATE SET attendance = EXCLUDED.attendance, pax = EXCLUDED.pax, menu = EXCLUDED.menu,
                     note = EXCLUDED.note, name = EXCLUDED.name, created_at = now()`,
      [inv.id, guest.id, name, attendance, pax, menu, note],
    );
  } else {
    await query(
      'INSERT INTO rsvps (invitation_id, name, attendance, pax, menu, note) VALUES ($1,$2,$3,$4,$5,$6)',
      [inv.id, name, attendance, pax, menu, note],
    );
  }
  res.json({ ok: true, message: t.rsvpThanks });
});

api.get('/:slug/wishes', async (req, res) => {
  const inv = await findPublished(req.params.slug);
  if (!inv) return res.status(404).json({ error: 'Undangan tidak ditemukan.' });
  const r = await query(
    `SELECT name, message, created_at FROM wishes WHERE invitation_id = $1 AND approved = TRUE
      ORDER BY created_at DESC LIMIT 100`,
    [inv.id],
  );
  res.json({ wishes: r.rows });
});

api.post('/:slug/wish', postLimiter, async (req, res) => {
  const inv = await findPublished(req.params.slug);
  if (!inv) return res.status(404).json({ error: 'Undangan tidak ditemukan.' });
  const t = i18n(inv.settings.lang);
  const guest = await findGuest(inv.id, req.body.to);
  if (applyVersion(inv, guest && guest.version_id).inv.settings.sections.wishes === false) return res.status(403).json({ error: 'Ucapan dinonaktifkan.' });
  if (inv.settings.privateMode && !guest) return res.status(403).json({ error: t.privateText });

  const name = guest ? guest.name : S.str(req.body.name, 160).trim();
  const message = S.str(req.body.message, 500).trim();
  if (!name || !message) return res.status(400).json({ error: 'Nama dan ucapan wajib diisi.' });

  const approved = !inv.settings.wishesModerated;
  await query('INSERT INTO wishes (invitation_id, guest_id, name, message, approved) VALUES ($1,$2,$3,$4,$5)',
    [inv.id, guest ? guest.id : null, name, message, approved]);
  res.json({ ok: true, approved, message: approved ? t.wishThanks : t.wishPending });
});

// ---------------- halaman ----------------
const icsEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

pages.get('/:slug/calendar.ics', async (req, res, next) => {
  const inv = await findPublished(req.params.slug);
  if (!inv) return next();
  const ev = inv.content.events[parseInt(req.query.e, 10) || 0];
  if (!ev || !ev.date || !ev.start) return next();
  const off = OFFSET[ev.tz] || OFFSET.WIB;
  const start = new Date(`${ev.date}T${ev.start}:00${off}`);
  const end = ev.end ? new Date(`${ev.date}T${ev.end}:00${off}`) : new Date(start.getTime() + 2 * 3600 * 1000);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Undangan Digital//ID', 'BEGIN:VEVENT',
    `UID:${inv.id}-${req.query.e || 0}@undangan-digital`, `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(`${ev.name} – ${inv.title}`)}`,
    `LOCATION:${icsEscape([ev.venue, ev.address].filter(Boolean).join(', '))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  res.type('text/calendar').attachment('acara.ics').send(ics);
});

function notice(res, status, lang, titleKey, textKey) {
  const t = i18n(lang);
  return res.status(status).render('notice', { title: t[titleKey], text: t[textKey] });
}

pages.get('/:slug', async (req, res, next) => {
  const slug = String(req.params.slug).toLowerCase();
  if (slug.includes('.')) return next();
  const r = await query('SELECT * FROM invitations WHERE slug = $1', [slug]);
  const inv = r.rows[0];
  if (!inv) return next();

  const isOwner = !!(req.user && req.user.id === inv.user_id);
  const lang = inv.settings.lang;
  if (inv.status !== 'published' && !isOwner) return notice(res, 404, lang, 'draftTitle', 'draftText');

  const guest = await findGuest(inv.id, req.query.to);
  if (inv.settings.privateMode && !guest && !isOwner) return notice(res, 403, lang, 'privateTitle', 'privateText');

  if (!isOwner) {
    query('UPDATE invitations SET views = views + 1 WHERE id = $1', [inv.id]).catch(() => {});
    if (guest && !guest.opened_at) query('UPDATE guests SET opened_at = now() WHERE id = $1', [guest.id]).catch(() => {});
  }

  const view = buildView(inv, { guest, preview: false });
  const ticket = await buildTicket(inv, guest, req);
  res.render('invitation', { ...view, ticket, safeJson });
});

// ---------------- swafoto, galeri kegiatan & photobooth ----------------
const selfieLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, message: 'Terlalu banyak unggahan. Coba lagi beberapa menit lagi.' });

api.post('/:slug/selfie', selfieLimiter, async (req, res) => {
  const inv = await findPublished(req.params.slug);
  if (!inv) return res.status(404).json({ error: 'Acara tidak ditemukan.' });
  if (!attendanceCfg(inv.settings).selfie) return res.status(403).json({ error: 'Unggah foto belum dibuka oleh penyelenggara.' });
  const err = await P.runUpload(P.memoryUpload(6, 10 * 1024 * 1024), req, res);
  if (err) return res.status(400).json({ error: err });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Pilih atau ambil foto dulu.' });

  const v = await P.visitor(req, inv);
  const name = v.guest ? v.guest.name : S.str(req.body.name, 80).trim();
  if (!name) return res.status(400).json({ error: 'Nama wajib diisi.' });

  const mine = await query(
    `SELECT count(*)::int AS n FROM photos WHERE invitation_id = $1 AND kind = 'selfie'
        AND (($2 <> '' AND uploader_key = $2) OR ($3::int IS NOT NULL AND guest_id = $3))`, [inv.id, v.key, v.guest ? v.guest.id : null]);
  const all = await query(`SELECT count(*)::int AS n FROM photos WHERE invitation_id = $1 AND kind = 'selfie'`, [inv.id]);
  if (all.rows[0].n + req.files.length > P.LIMITS.selfieTotal) return res.status(400).json({ error: 'Galeri sudah penuh.' });
  if (mine.rows[0].n + req.files.length > P.LIMITS.selfiePerUploader) return res.status(400).json({ error: `Maksimal ${P.LIMITS.selfiePerUploader} foto per tamu.` });

  const key = P.rememberVisitor(res, inv, v, v.guest);
  const out = await P.savePhotos(inv.id, req.files, { kind: 'selfie', guestId: v.guest ? v.guest.id : null, name, key });
  if (!out.saved.length) return res.status(400).json({ error: 'Berkas bukan foto (JPG, PNG, atau WebP).' });
  const q = v.guest ? `?to=${v.guest.code}` : '';
  const base = `${cfg.basePath || ''}/${inv.slug}`;
  res.status(201).json({ saved: out.saved.length, rejected: out.rejected, mine: mine.rows[0].n + out.saved.length, name, galleryUrl: `${base}/galeri${q}` });
});

async function pageCtx(req, inv, extra = {}) {
  const lang = inv.settings.lang === 'en' ? 'en' : 'id';
  const t = i18n(lang, inv.event_type);
  const tv = themeVars(inv);
  return { inv, t, lang, ...tv, theme: inv.theme, pageTitle: inv.title, basePath: cfg.basePath, ...extra, safeJson };
}
async function findVisible(req, slug) {
  const r = await query('SELECT * FROM invitations WHERE slug = $1', [String(slug).toLowerCase()]);
  const inv = r.rows[0];
  if (!inv) return null;
  const isOwner = !!(req.user && req.user.id === inv.user_id);
  return inv.status === 'published' || isOwner ? inv : null;
}
const evNotice = (res, status, inv, title, text, link) => res.status(status).render('event-notice', { title, text, link: link || null, inv, basePath: cfg.basePath, ...themeVars(inv), t: i18n(inv.settings.lang === 'en' ? 'en' : 'id', inv.event_type) });

// Halaman tujuan QR acara: tamu mengambil/mengunggah swafoto.
pages.get('/:slug/foto', async (req, res, next) => {
  const inv = await findVisible(req, req.params.slug);
  if (!inv) return next();
  const a = attendanceCfg(inv.settings);
  const v = await P.visitor(req, inv);
  const mine = v.key || v.guest ? (await query(
    `SELECT count(*)::int AS n FROM photos WHERE invitation_id = $1 AND kind = 'selfie' AND (($2 <> '' AND uploader_key = $2) OR ($3::int IS NOT NULL AND guest_id = $3))`,
    [inv.id, v.key, v.guest ? v.guest.id : null])).rows[0].n : 0;
  const canGallery = a.selfie && await P.canViewGallery(inv, v);
  const data = { slug: inv.slug, enabled: a.selfie, guestName: v.guest ? v.guest.name : '', knownGuest: !!v.guest, mine, hasGallery: canGallery, qs: v.guest ? `?to=${v.guest.code}` : '', basePath: cfg.basePath || '' };
  res.set('Cache-Control', 'no-store');
  res.render('selfie', { ...(await pageCtx(req, inv)), a, data, galleryOwner: v.isOwner });
});

pages.get('/:slug/galeri', async (req, res, next) => {
  const inv = await findVisible(req, req.params.slug);
  if (!inv) return next();
  const v = await P.visitor(req, inv);
  const base = `${cfg.basePath || ''}/${inv.slug}`;
  if (!attendanceCfg(inv.settings).selfie && !v.isOwner) return evNotice(res, 404, inv, 'Galeri belum dibuka', 'Galeri kegiatan belum dibuka oleh penyelenggara.');
  if (!(await P.canViewGallery(inv, v))) {
    return evNotice(res, 403, inv, 'Galeri khusus peserta', 'Galeri ini dapat dilihat oleh tamu yang ikut mengunggah foto kegiatan. Ambil swafoto lewat QR acara untuk membukanya.', { href: `${base}/foto${v.guest ? `?to=${v.guest.code}` : ''}`, label: 'Ambil swafoto' });
  }
  const r = await query(
    `SELECT p.id, p.created_at, coalesce(nullif(g.name, ''), nullif(p.uploader_name, ''), '') AS who FROM photos p LEFT JOIN guests g ON g.id = p.guest_id
      WHERE p.invitation_id = $1 AND p.kind = 'selfie' ORDER BY p.created_at DESC, p.id DESC LIMIT 300`, [inv.id]);
  const total = (await query(`SELECT count(*)::int AS n FROM photos WHERE invitation_id = $1 AND kind = 'selfie'`, [inv.id])).rows[0].n;
  res.set('Cache-Control', 'no-store');
  res.render('gallery', { ...(await pageCtx(req, inv)), mode: 'selfie', heading: 'Galeri Kegiatan', qs: v.guest ? `?to=${v.guest.code}` : '', photos: r.rows, total, back: `${base}${v.guest ? `?to=${v.guest.code}` : ''}`, shootUrl: attendanceCfg(inv.settings).selfie ? `${base}/foto${v.guest ? `?to=${v.guest.code}` : ''}` : '' });
});

pages.get('/:slug/photobooth', async (req, res, next) => {
  const inv = await findVisible(req, req.params.slug);
  if (!inv) return next();
  const a = attendanceCfg(inv.settings);
  const v = await P.visitor(req, inv);
  const base = `${cfg.basePath || ''}/${inv.slug}`;
  if (!a.photobooth && !v.isOwner) return evNotice(res, 404, inv, 'Photobooth tidak tersedia', 'Acara ini tidak memakai photobooth.');
  if (!P.canViewBooth(inv, v, null)) return evNotice(res, 403, inv, 'Buka lewat link undangan', 'Foto photobooth dapat dilihat dari link undangan pribadi Anda (tombol “Foto Photobooth Saya”).');
  const own = !v.isOwner && a.boothShare !== 'all';
  const r = await query(
    `SELECT p.id, p.created_at, coalesce(nullif(g.name, ''), nullif(p.uploader_name, ''), '') AS who FROM photos p LEFT JOIN guests g ON g.id = p.guest_id
      WHERE p.invitation_id = $1 AND p.kind = 'booth' ${own ? 'AND p.guest_id = $2' : ''} ORDER BY p.created_at DESC, p.id DESC LIMIT 300`,
    own ? [inv.id, v.guest.id] : [inv.id]);
  res.set('Cache-Control', 'no-store');
  res.render('gallery', { ...(await pageCtx(req, inv)), mode: 'booth', heading: own ? 'Foto Photobooth Saya' : 'Galeri Photobooth', photos: r.rows, total: r.rowCount, qs: v.guest ? `?to=${v.guest.code}` : '', back: `${base}${v.guest ? `?to=${v.guest.code}` : ''}`, shootUrl: '' });
});

// Penyaji foto: hak akses diperiksa per foto (file tidak berada di folder publik).
pages.get('/:slug/media/:id', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const inv = await findVisible(req, req.params.slug);
  if (!inv) return next();
  const p = (await query('SELECT * FROM photos WHERE id = $1 AND invitation_id = $2', [req.params.id, inv.id])).rows[0];
  if (!p) return next();
  const v = await P.visitor(req, inv);
  const allowed = p.kind === 'booth' ? P.canViewBooth(inv, v, p) : await P.canViewGallery(inv, v);
  if (!allowed) return res.status(403).end();
  const fp = P.photoPath(inv.id, p.file);
  if (!fp || !fs.existsSync(fp)) return next();
  res.set({ 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline' });
  fs.createReadStream(fp).pipe(res);
});

// QR pribadi tamu sebagai gambar (untuk diunduh).
pages.get('/:slug/tiket.svg', async (req, res, next) => {
  const inv = await findPublished(req.params.slug);
  if (!inv) return next();
  const guest = await findGuest(inv.id, req.query.to);
  if (!guest) return next();
  res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=600', 'Content-Disposition': `attachment; filename="qr-${guest.code}.svg"` });
  res.send(await qrSvg(inv, guest.code));
});

module.exports = { api, pages };
