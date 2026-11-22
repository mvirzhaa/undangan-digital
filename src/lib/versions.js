// Versi undangan: tiap tipe tamu (mis. VIP, Keluarga, Rekan kerja) bisa mendapat tampilan & isi berbeda.
// Versi hanya menyimpan perbedaan ("override") dari undangan utama; kolom kosong = ikuti undangan utama.
const crypto = require('crypto');
const { THEMES, resolveThemeKey, getTheme } = require('./themes');
const S = require('./sanitize');

const MAX_VERSIONS = 6;
const DEFAULT_NAME = 'Standar';
const SECTION_KEYS = ['family', 'story', 'gallery', 'dresscode', 'rsvp', 'gifts', 'wishes', 'program', 'lineup', 'info', 'partners'];

const newId = () => `v${crypto.randomBytes(4).toString('hex')}`;

function cleanVersions(input, type) {
  const seenIds = new Set();
  const seenNames = new Set([DEFAULT_NAME.toLowerCase()]);
  return S.arr(input, MAX_VERSIONS).map((raw, i) => {
    const v = S.obj(raw);
    const cover = S.obj(v.cover);
    const note = S.obj(v.note);
    const sections = S.obj(v.sections);

    let id = S.str(v.id, 20);
    if (!/^v[a-z0-9]{4,12}$/.test(id) || seenIds.has(id)) id = newId();
    seenIds.add(id);

    let name = S.str(v.name, 30).replace(/[,"]/g, ' ').trim() || `Versi ${i + 1}`;
    while (seenNames.has(name.toLowerCase())) name = `${name} 2`.slice(0, 30);
    seenNames.add(name.toLowerCase());

    const themeKey = resolveThemeKey(S.str(v.theme, 50));
    const theme = THEMES.find((t) => t.key === themeKey && t.types.includes(type));
    const rawColors = S.obj(v.colors);
    const hasColors = ['primary', 'accent', 'bg', 'text'].every((k) => /^#[0-9a-fA-F]{6}$/.test(String(rawColors[k] || '')));

    const secOut = {};
    SECTION_KEYS.forEach((k) => { if (sections[k] === 'on' || sections[k] === 'off') secOut[k] = sections[k]; });

    return {
      id,
      name,
      badge: S.str(v.badge, 40).trim(),
      theme: theme ? theme.key : '',
      colors: hasColors ? S.cleanColors(rawColors, getTheme(themeKey).colors) : null,
      opener: S.cleanSettings({ opener: v.opener }).opener,
      fx: S.cleanSettings({ fx: v.fx }).fx,
      cover: {
        label: S.str(cover.label, 80), title: S.str(cover.title, 120), subtitle: S.str(cover.subtitle, 300),
        buttonText: S.str(cover.buttonText, 40), photo: S.url(cover.photo),
      },
      openingText: S.str(v.openingText, 1500),
      closingText: S.str(v.closingText, 800),
      limitEvents: S.bool(v.limitEvents),
      eventIdx: S.arr(v.eventIdx, 8).map((n) => S.int(n, 0, 7, -1)).filter((n) => n >= 0),
      note: { title: S.str(note.title, 100), text: S.str(note.text, 800) },
      sections: secOut,
    };
  });
}

const findVersion = (inv, id) => (id ? (inv.versions || []).find((v) => v.id === id) || null : null);

// Menggabungkan override versi ke salinan undangan. Undangan asli tidak diubah.
function applyVersion(inv, versionId) {
  const v = findVersion(inv, versionId);
  if (!v) return { inv, version: null };
  const out = { ...inv };
  if (v.theme) {
    const th = getTheme(v.theme);
    out.theme = th.key;
    out.colors = v.colors || { ...th.colors };
    out.fonts = { ...th.fonts };
  } else if (v.colors) {
    out.colors = v.colors;
  }

  const c = JSON.parse(JSON.stringify(inv.content));
  ['label', 'title', 'subtitle', 'buttonText', 'photo'].forEach((k) => { if (v.cover[k]) c.cover[k] = v.cover[k]; });
  if (v.openingText) { c.opening.text = v.openingText; c.opening.showText = true; }
  if (v.closingText) c.closing.text = v.closingText;
  out.content = c;

  const s = JSON.parse(JSON.stringify(inv.settings || {}));
  s.sections = s.sections || {};
  Object.keys(v.sections).forEach((k) => { s.sections[k] = v.sections[k] === 'on'; });
  if (v.opener) s.opener = v.opener;
  if (v.fx) s.fx = v.fx;
  out.settings = s;
  return { inv: out, version: v };
}

module.exports = { cleanVersions, applyVersion, findVersion, MAX_VERSIONS, DEFAULT_NAME, SECTION_KEYS };
