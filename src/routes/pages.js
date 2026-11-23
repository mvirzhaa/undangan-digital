// Halaman dashboard (server-rendered shell; interaksi lewat JS + API).
const express = require('express');
const { query } = require('../db');
const cfg = require('../config');
const { requirePage } = require('../auth');
const { EVENT_TYPES, THEMES, PALETTES, FONTS, OPENERS, EFFECTS, AR_RUM_21 } = require('../lib/themes');
const { buildView, safeJson } = require('../lib/render');
const { buildTicket, qrSvg } = require('../lib/ticket');

const router = express.Router();

router.get('/', (req, res) => res.render('index', { user: req.user, themes: THEMES, eventTypes: EVENT_TYPES }));

router.get('/login', (req, res) => (req.user ? res.redirect((cfg.basePath || '') + '/dashboard') : res.render('auth', { mode: 'login' })));
router.get('/register', (req, res) => (req.user ? res.redirect((cfg.basePath || '') + '/dashboard') : res.render('auth', { mode: 'register' })));

router.get('/dashboard', requirePage, (req, res) => {
  res.render('dashboard', { user: req.user, eventTypes: EVENT_TYPES, basePath: cfg.basePath, safeJson });
});

async function ownedInvitation(req) {
  if (!/^\d+$/.test(req.params.id)) return null;
  const r = await query('SELECT * FROM invitations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  return r.rows[0] || null;
}

router.get('/editor/:id', requirePage, async (req, res, next) => {
  const inv = await ownedInvitation(req);
  if (!inv) return next();
  const boot = {
    invitation: inv,
    meta: { eventTypes: EVENT_TYPES, themes: THEMES, openers: OPENERS, effects: EFFECTS, arRum21: AR_RUM_21, palettes: PALETTES, fonts: FONTS },
    baseUrl: cfg.baseUrl,
    basePath: cfg.basePath,
    user: req.user,
  };
  res.render('editor', { inv, boot: safeJson(boot) });
});

// Pratinjau draf (hanya pemilik). Tidak menambah hitungan kunjungan.
router.get('/preview/:id', requirePage, async (req, res, next) => {
  const inv = await ownedInvitation(req);
  if (!inv) return next();
  let guest = null;
  if (req.query.guest) {
    const g = await query('SELECT * FROM guests WHERE id = $1 AND invitation_id = $2', [req.query.guest, inv.id]);
    guest = g.rows[0] || null;
  }
  if (!guest) guest = { name: 'Nama Tamu', code: '', pax_limit: 2, version_id: '' };
  // ?version=ID mencoba versi tertentu; ?demo=1 menampilkan animasi pembuka (tanpa auto-buka).
  const versionId = (inv.versions || []).some((v) => v.id === req.query.version) ? req.query.version : '';
  const view = buildView(inv, { guest, preview: true, versionId, demo: req.query.demo === '1' });
  res.set('Cache-Control', 'no-store');
  const ticket = await buildTicket(inv, req.query.guest ? guest : null, req, { preview: true });
  res.render('invitation', { ...view, ticket, safeJson });
});

// Cetak kartu QR semua tamu (atau satu grup) dan poster QR acara.
router.get('/print/:id/cards', requirePage, async (req, res, next) => {
  const inv = await ownedInvitation(req);
  if (!inv) return next();
  const r = await query('SELECT * FROM guests WHERE invitation_id = $1 ORDER BY name, id LIMIT 2000', [inv.id]);
  const vname = new Map((inv.versions || []).map((v) => [v.id, v.name]));
  const cards = [];
  for (const g of r.rows) {
    cards.push({ name: g.name, group_name: g.group_name, table_name: g.table_name, version: vname.get(g.version_id) || '', code: g.code, svg: await qrSvg(inv, g.code) });
  }
  res.set('Cache-Control', 'no-store');
  res.render('print-cards', { inv, cards });
});

router.get('/print/:id/poster', requirePage, async (req, res, next) => {
  const inv = await ownedInvitation(req);
  if (!inv) return next();
  const url = `${cfg.baseUrl}/${inv.slug}/foto`;
  const svg = await require('qrcode').toString(url, { type: 'svg', margin: 1, width: 400 });
  res.set('Cache-Control', 'no-store');
  res.render('print-poster', { inv, svg, url });
});

module.exports = router;
