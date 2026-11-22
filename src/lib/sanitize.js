// Validasi & pembersihan semua data yang dikirim dari editor sebelum disimpan.
// Tujuan: hanya struktur yang dikenal yang tersimpan, dan URL hanya http(s)/upload lokal.
const { THEME_KEYS, FONTS } = require('./themes');

const str = (v, max = 300) => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : '');
const bool = (v) => v === true;
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function url(v) {
  const s = str(v, 1000).trim();
  if (!s) return '';
  if (/^\/uploads\/[\w\-./]+$/.test(s) && !s.includes('..')) return s;
  if (/^https:\/\/[^\s"'<>\\]+$/i.test(s)) return s;
  return '';
}
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v, 10)) ? v : '');
const time = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(str(v, 5)) ? v : '');
const hex = (v, fallback) => (/^#[0-9a-fA-F]{6}$/.test(str(v, 7)) ? v : fallback);
const int = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function cleanContent(input) {
  const c = obj(input);
  const cover = obj(c.cover);
  const opening = obj(c.opening);
  const dress = obj(c.dresscode);
  const rsvp = obj(c.rsvp);
  const gifts = obj(c.gifts);
  const music = obj(c.music);
  const closing = obj(c.closing);

  return {
    cover: {
      label: str(cover.label, 80),
      title: str(cover.title, 120),
      subtitle: str(cover.subtitle, 300),
      photo: url(cover.photo),
      buttonText: str(cover.buttonText, 40),
    },
    opening: { text: str(opening.text, 1500), source: str(opening.source, 200) },
    hostsHeading: str(c.hostsHeading, 80),
    hosts: arr(c.hosts, 6).map((h) => {
      h = obj(h);
      return {
        role: str(h.role, 60), name: str(h.name, 120), title: str(h.title, 80),
        parents: str(h.parents, 200), instagram: str(h.instagram, 60).replace(/^@/, '').replace(/[^\w.]/g, ''),
        photo: url(h.photo), bio: str(h.bio, 500),
      };
    }),
    countdownTitle: str(c.countdownTitle, 80),
    events: arr(c.events, 8).map((e) => {
      e = obj(e);
      return {
        name: str(e.name, 80), date: date(e.date), start: time(e.start), end: time(e.end),
        tz: ['WIB', 'WITA', 'WIT'].includes(e.tz) ? e.tz : 'WIB',
        venue: str(e.venue, 120), address: str(e.address, 300), mapsUrl: url(e.mapsUrl),
      };
    }),
    story: arr(c.story, 10).map((s) => {
      s = obj(s);
      return { date: str(s.date, 40), title: str(s.title, 100), text: str(s.text, 600) };
    }),
    gallery: arr(c.gallery, 24).map(url).filter(Boolean),
    dresscode: {
      text: str(dress.text, 500),
      colors: arr(dress.colors, 6).map((x) => hex(x, '')).filter(Boolean),
    },
    rsvp: {
      deadline: date(rsvp.deadline),
      maxPax: int(rsvp.maxPax, 1, 20, 4),
      menus: arr(rsvp.menus, 10).map((m) => str(m, 80)).filter(Boolean),
    },
    gifts: {
      accounts: arr(gifts.accounts, 8).map((a) => {
        a = obj(a);
        return { bank: str(a.bank, 60), number: str(a.number, 60), name: str(a.name, 100), qris: url(a.qris) };
      }),
      receiver: str(gifts.receiver, 100),
      address: str(gifts.address, 300),
    },
    music: { url: url(music.url), title: str(music.title, 100) },
    closing: { text: str(closing.text, 800), signature: str(closing.signature, 120) },
  };
}

function cleanSettings(input) {
  const s = obj(input);
  const sec = obj(s.sections);
  return {
    lang: s.lang === 'en' ? 'en' : 'id',
    privateMode: bool(s.privateMode),
    musicAutoplay: s.musicAutoplay !== false,
    wishesModerated: bool(s.wishesModerated),
    waTemplate: str(s.waTemplate, 600),
    sections: {
      story: bool(sec.story), gallery: sec.gallery !== false, dresscode: bool(sec.dresscode),
      rsvp: sec.rsvp !== false, gifts: bool(sec.gifts), wishes: sec.wishes !== false,
    },
  };
}

function cleanColors(input, fallback) {
  const c = obj(input);
  return {
    primary: hex(c.primary, fallback.primary), accent: hex(c.accent, fallback.accent),
    bg: hex(c.bg, fallback.bg), text: hex(c.text, fallback.text),
  };
}

function cleanFonts(input, fallback) {
  const f = obj(input);
  return {
    heading: FONTS.includes(f.heading) ? f.heading : fallback.heading,
    body: FONTS.includes(f.body) ? f.body : fallback.body,
  };
}

const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'register', 'logout', 'dashboard', 'editor', 'preview', 'checkin',
  'css', 'js', 'uploads', 'i', 'static', 'public', 'favicon.ico', 'robots.txt', 'health',
]);

function cleanSlug(v) {
  const s = str(v, 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s;
}
const slugError = (s) => {
  if (s.length < 3 || s.length > 60) return 'Alamat link harus 3–60 karakter (huruf kecil, angka, tanda minus).';
  if (RESERVED_SLUGS.has(s)) return 'Alamat link ini dicadangkan sistem, pilih yang lain.';
  return null;
};

module.exports = {
  str, int, url, cleanContent, cleanSettings, cleanColors, cleanFonts, cleanSlug, slugError, THEME_KEYS,
};
