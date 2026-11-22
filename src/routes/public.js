// Halaman undangan publik + API untuk tamu (RSVP, ucapan, kalender).
const express = require('express');
const { query } = require('../db');
const { rateLimit } = require('../auth');
const { buildView, safeJson, OFFSET } = require('../lib/render');
const i18n = require('../lib/i18n');
const S = require('../lib/sanitize');
const { applyVersion } = require('../lib/versions');

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
  res.render('invitation', { ...view, safeJson });
});

module.exports = { api, pages };
