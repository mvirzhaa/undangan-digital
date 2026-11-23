// Menyusun data tampilan (view model) untuk halaman undangan publik & pratinjau.
const cfg = require('../config');
const i18n = require('./i18n');
const { EVENT_TYPES, getTheme, OPENER_KEYS, FX_KEYS } = require('./themes');
const { cleanContent } = require('./sanitize');
const { applyVersion, findVersion } = require('./versions');

const OFFSET = { WIB: '+07:00', WITA: '+08:00', WIT: '+09:00' };

function fmtDate(d, lang) {
  if (!d) return '';
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

// Warna teks di atas tombol/blok warna utama (hitam atau putih, mana yang kontrasnya lebih baik).
function onColor(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? '#1b1b1b' : '#ffffff';
}

const gfont = (name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}`;

function buildEvents(events, lang, t) {
  const list = events.map((e) => {
    const off = OFFSET[e.tz] || OFFSET.WIB;
    const startIso = e.date && e.start ? `${e.date}T${e.start}:00${off}` : '';
    const q = [e.venue, e.address].filter(Boolean).join(' ');
    return {
      ...e,
      dateLabel: fmtDate(e.date, lang),
      timeLabel: e.start ? `${e.start}${e.end ? ` – ${e.end}` : ` – ${t.until}`} ${e.tz}` : '',
      startIso,
      mapEmbed: q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed` : '',
      mapLink: e.mapsUrl || (q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : ''),
    };
  });
  list.forEach((e, i) => { e.index = i; });
  return list;
}

const FX_COUNT = { petals: 16, sparkle: 22, confetti: 30, bubbles: 14 };

// Partikel efek latar: posisi/kecepatan dibuat deterministik agar halaman stabil.
function buildFx(key) {
  const n = FX_COUNT[key] || 0;
  return Array.from({ length: n }, (_, i) => {
    const r = (k) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    return {
      left: Math.round(r(1) * 100), delay: (r(2) * 9).toFixed(1), dur: (7 + r(3) * 8).toFixed(1),
      top: Math.round(r(6) * 100), size: Math.round(8 + r(4) * 14), drift: Math.round((r(5) - 0.5) * 120), tone: i % 3,
    };
  });
}

// Variabel CSS & font untuk halaman pendukung (swafoto, galeri) agar senada dengan undangannya.
function themeVars(inv) {
  const base = getTheme(inv.theme);
  const colors = { ...base.colors, ...(inv.colors || {}) };
  const fonts = { ...base.fonts, ...(inv.fonts || {}) };
  const cssVars = [
    `--primary:${colors.primary}`, `--on-primary:${onColor(colors.primary)}`, `--accent:${colors.accent}`, `--bg:${colors.bg}`, `--text:${colors.text}`,
    `--font-heading:'${fonts.heading}',serif`, `--font-body:'${fonts.body}',sans-serif`,
  ].join(';');
  const fontsUrl = `https://fonts.googleapis.com/css2?${gfont(fonts.heading)}:wght@400;600;700&${gfont(fonts.body)}:wght@300;400;500;600&display=swap`;
  return { cssVars, fontsUrl };
}

function buildView(inv0, { guest = null, preview = false, versionId = '', demo = false } = {}) {
  const typeInfo = EVENT_TYPES[inv0.event_type] || EVENT_TYPES.other;
  inv0 = { ...inv0, staff_token: undefined, content: cleanContent(inv0.content), settings: inv0.settings || {}, versions: inv0.versions || [] };
  const vid = versionId || (guest && guest.version_id) || '';
  const { inv, version } = applyVersion(inv0, vid);

  const settings = inv.settings || {};
  const lang = settings.lang === 'en' ? 'en' : 'id';
  const t = i18n(lang, inv.event_type);
  const c = inv.content;
  const themeDef = getTheme(inv.theme);

  let events = buildEvents(inv0.content.events || [], lang, t); // indeks asli dipertahankan untuk kalender
  if (version && version.limitEvents) events = events.filter((e) => version.eventIdx.includes(e.index));

  const withIso = events.filter((e) => e.startIso).sort((a, b) => new Date(a.startIso) - new Date(b.startIso));
  const target = withIso.length ? withIso[0].startIso : '';

  const sec = settings.sections || {};
  const allowed = new Set(typeInfo.sections);
  const has = (k) => allowed.has(k) && !!sec[k];
  const sections = {
    family: has('family') && !!(c.family && c.family.text),
    story: has('story') && (c.story || []).length > 0,
    gallery: has('gallery') && (c.gallery || []).length > 0,
    dresscode: has('dresscode') && !!(c.dresscode.text || c.dresscode.colors.length),
    rsvp: allowed.has('rsvp') && sec.rsvp !== false,
    gifts: has('gifts') && !!((c.gifts.accounts || []).length || c.gifts.address),
    wishes: allowed.has('wishes') && sec.wishes !== false,
    program: has('program') && c.program.items.length > 0,
    lineup: has('lineup') && c.lineup.items.length > 0,
    info: has('info') && c.info.items.length > 0,
    partners: has('partners') && c.partners.items.length > 0,
  };

  const colors = inv.colors || {};
  const fonts = inv.fonts || {};
  const cssVars = [
    `--primary:${colors.primary}`, `--on-primary:${onColor(colors.primary)}`, `--accent:${colors.accent}`, `--bg:${colors.bg}`, `--text:${colors.text}`,
    `--font-heading:'${fonts.heading}',serif`, `--font-body:'${fonts.body}',sans-serif`,
    c.cover.photo ? `--cover-img:url('${c.cover.photo}')` : '',
  ].filter(Boolean).join(';');

  const arabicOn = !!(c.opening.showArabic && c.opening.arabic);
  const textOn = !!(c.opening.showText && c.opening.text);
  const opening = { arabicOn, textOn, show: arabicOn || textOn || !!(c.opening.source && (arabicOn || textOn)) };

  const fontsUrl = `https://fonts.googleapis.com/css2?${gfont(fonts.heading)}:wght@400;600;700&${gfont(fonts.body)}:wght@300;400;500;600&${arabicOn ? 'family=Amiri:wght@400;700&' : ''}display=swap`;

  // Animasi pembuka & efek: pengaturan undangan > bawaan template.
  const openerKey = OPENER_KEYS.includes(settings.opener) ? settings.opener : (settings.opener === 'none' ? '' : themeDef.opener);
  const fxKey = FX_KEYS.includes(settings.fx) ? settings.fx : (settings.fx === 'none' ? '' : themeDef.fx);
  const fx = buildFx(fxKey);

  const pageUrl = `${cfg.baseUrl}/${inv.slug}`;
  const ogImage = c.cover.photo ? (c.cover.photo.startsWith('/') ? cfg.baseUrl + c.cover.photo : c.cover.photo) : '';

  const maxPax = guest ? guest.pax_limit : (c.rsvp.maxPax || 4);
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const rsvpClosed = !!(c.rsvp.deadline && today > c.rsvp.deadline);

  const clientData = {
    slug: inv.slug, preview, demo, target, lang, to: guest ? guest.code : '', opener: openerKey, fx: fxKey,
    guestName: guest ? guest.name : '', maxPax, moderated: !!settings.wishesModerated,
    autoplay: settings.musicAutoplay !== false, labels: t,
    basePath: cfg.basePath,
  };

  return {
    inv, c, settings, t, lang, events, target, sections, guest, preview, demo, fontsUrl, cssVars, typeInfo, opening,
    pageUrl, ogImage, maxPax, rsvpClosed, clientData, version, openerKey, fxKey, fx,
    versionNote: version && version.note && version.note.text ? version.note : null,
    basePath: cfg.basePath,
  };
}

// Aman untuk disisipkan di <script type="application/json">
const safeJson = (o) => JSON.stringify(o)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

module.exports = { buildView, safeJson, OFFSET, findVersion, themeVars };
