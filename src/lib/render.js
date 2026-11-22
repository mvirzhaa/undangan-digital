// Menyusun data tampilan (view model) untuk halaman undangan publik & pratinjau.
const cfg = require('../config');
const i18n = require('./i18n');

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

function buildView(inv, { guest = null, preview = false } = {}) {
  const settings = inv.settings || {};
  const lang = settings.lang === 'en' ? 'en' : 'id';
  const t = i18n(lang);
  const c = inv.content;
  const events = buildEvents(c.events || [], lang, t);

  const withIso = events.filter((e) => e.startIso).sort((a, b) => new Date(a.startIso) - new Date(b.startIso));
  const target = withIso.length ? withIso[0].startIso : '';

  const sec = settings.sections || {};
  const sections = {
    story: !!sec.story && (c.story || []).length > 0,
    gallery: sec.gallery !== false && (c.gallery || []).length > 0,
    dresscode: !!sec.dresscode && !!((c.dresscode && c.dresscode.text) || (c.dresscode && c.dresscode.colors.length)),
    rsvp: sec.rsvp !== false,
    gifts: !!sec.gifts && !!((c.gifts.accounts || []).length || c.gifts.address),
    wishes: sec.wishes !== false,
  };

  const mediaUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('/uploads/')) return (cfg.basePath || '') + url;
    return url;
  };

  const colors = inv.colors || {};
  const fonts = inv.fonts || {};
  const cssVars = [
    `--primary:${colors.primary}`, `--on-primary:${onColor(colors.primary)}`, `--accent:${colors.accent}`, `--bg:${colors.bg}`, `--text:${colors.text}`,
    `--font-heading:'${fonts.heading}',serif`, `--font-body:'${fonts.body}',sans-serif`,
    c.cover.photo ? `--cover-img:url('${mediaUrl(c.cover.photo)}')` : '',
  ].filter(Boolean).join(';');

  const fontsUrl = `https://fonts.googleapis.com/css2?${gfont(fonts.heading)}:wght@400;600;700&${gfont(fonts.body)}:wght@300;400;500;600&display=swap`;

  const pageUrl = `${cfg.baseUrl}/${inv.slug}`;
  const ogImage = c.cover.photo ? (c.cover.photo.startsWith('/') ? cfg.baseUrl + c.cover.photo : c.cover.photo) : '';

  const maxPax = guest ? guest.pax_limit : (c.rsvp.maxPax || 4);
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const rsvpClosed = !!(c.rsvp.deadline && today > c.rsvp.deadline);

  const clientData = {
    slug: inv.slug, preview, target, lang, to: guest ? guest.code : '',
    guestName: guest ? guest.name : '', maxPax, moderated: !!settings.wishesModerated,
    autoplay: settings.musicAutoplay !== false, labels: t,
    basePath: cfg.basePath,
  };

  return {
    inv, c, settings, t, lang, events, target, sections, guest, preview, fontsUrl, cssVars,
    pageUrl, ogImage, maxPax, rsvpClosed, clientData, mediaUrl, basePath: cfg.basePath,
  };
}

// Aman untuk disisipkan di <script type="application/json">
const safeJson = (o) => JSON.stringify(o)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

module.exports = { buildView, safeJson, OFFSET };
