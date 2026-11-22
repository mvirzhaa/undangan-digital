// Katalog jenis acara, template (desain), animasi pembuka, efek, palet warna, dan font.
// Setiap template milik tepat satu jenis acara: pernikahan 3, lainnya masing-masing 2.

const OPENERS = [
  { key: 'envelope', name: 'Amplop surat', desc: 'Amplop terbuka, surat naik' },
  { key: 'book', name: 'Buku terbuka', desc: 'Sampul buku membuka seperti halaman' },
  { key: 'flip', name: 'Kartu membalik', desc: 'Kartu berputar 3D' },
  { key: 'doors', name: 'Pintu ganda', desc: 'Dua daun pintu terbuka ke samping' },
  { key: 'curtain', name: 'Tirai panggung', desc: 'Tirai tersibak ke kiri-kanan' },
  { key: 'iris', name: 'Lingkaran membuka', desc: 'Lubang lingkaran melebar' },
  { key: 'shutter', name: 'Kerai / shutter', desc: 'Bilah-bilah berputar bergantian' },
];

const EFFECTS = [
  { key: 'petals', name: 'Kelopak jatuh' },
  { key: 'sparkle', name: 'Kilau bintang' },
  { key: 'confetti', name: 'Konfeti' },
  { key: 'bubbles', name: 'Gelembung melayang' },
];

// Teks bawaan QS. Ar-Rum: 21 (Arab + terjemahan Indonesia versi Kemenag).
const AR_RUM_21 = {
  arabic: 'وَمِنْ اٰيٰتِهٖٓ اَنْ خَلَقَ لَكُمْ مِّنْ اَنْفُسِكُمْ اَزْوَاجًا لِّتَسْكُنُوْٓا اِلَيْهَا وَجَعَلَ بَيْنَكُمْ مَّوَدَّةً وَّرَحْمَةً ۗاِنَّ فِيْ ذٰلِكَ لَاٰيٰتٍ لِّقَوْمٍ يَّتَفَكَّرُوْنَ',
  text: 'Dan di antara tanda-tanda (kebesaran)-Nya ialah Dia menciptakan pasangan-pasangan untukmu dari jenismu sendiri, agar kamu cenderung dan merasa tenteram kepadanya, dan Dia menjadikan di antaramu rasa kasih dan sayang. Sungguh, pada yang demikian itu benar-benar terdapat tanda-tanda (kebesaran Allah) bagi kaum yang berpikir.',
  source: 'QS. Ar-Rum: 21',
};

// menu: halaman pada menu "Isi" editor, khusus per jenis acara.
// sections: bagian yang boleh tampil di undangan untuk jenis tersebut.
// host: label isian profil (null = isian disembunyikan).
const EVENT_TYPES = {
  wedding: {
    label: 'Pernikahan',
    coverLabel: 'THE WEDDING OF',
    hostsHeading: 'Mempelai',
    hostsMenu: 'Mempelai',
    defaultTheme: 'glass-rose',
    arabic: true,
    menu: [['cover', 'Sampul'], ['opening', 'Pembuka & Ar-Rum 21'], ['profile', 'Mempelai'], ['family', 'Turut mengundang'], ['detail', 'Akad, resepsi & lokasi'],
      ['story', 'Cerita cinta'], ['gallery', 'Galeri'], ['extra', 'Dresscode & penutup'], ['gift', 'Amplop digital & hadiah'], ['music', 'Musik latar']],
    sections: ['family', 'story', 'gallery', 'dresscode', 'rsvp', 'gifts', 'wishes'],
    host: { role: 'Sebutan', name: 'Nama lengkap', title: 'Gelar (opsional)', parents: 'Nama orang tua', parentsPh: 'Putri dari Bapak … & Ibu …', bio: null, instagram: 'Instagram (opsional)', max: 4 },
  },
  engagement: {
    label: 'Lamaran / Tunangan',
    coverLabel: 'UNDANGAN LAMARAN',
    hostsHeading: 'Calon Pengantin',
    hostsMenu: 'Calon pengantin',
    defaultTheme: 'ivory-minimal',
    arabic: true,
    menu: [['cover', 'Sampul'], ['opening', 'Kata pembuka'], ['profile', 'Calon pengantin'], ['family', 'Turut mengundang'], ['detail', 'Acara & lokasi'],
      ['story', 'Cerita'], ['gallery', 'Galeri'], ['extra', 'Dresscode & penutup'], ['gift', 'Hadiah'], ['music', 'Musik latar']],
    sections: ['family', 'story', 'gallery', 'dresscode', 'rsvp', 'gifts', 'wishes'],
    host: { role: 'Sebutan', name: 'Nama lengkap', title: 'Gelar (opsional)', parents: 'Nama orang tua', parentsPh: 'Putra dari Bapak … & Ibu …', bio: null, instagram: 'Instagram (opsional)', max: 4 },
  },
  birthday: {
    label: 'Ulang Tahun',
    coverLabel: 'BIRTHDAY PARTY',
    hostsHeading: 'Yang Berulang Tahun',
    hostsMenu: 'Yang berulang tahun',
    defaultTheme: 'confetti-pop',
    arabic: false,
    menu: [['cover', 'Sampul'], ['opening', 'Kata pembuka'], ['profile', 'Yang berulang tahun'], ['detail', 'Pesta & lokasi'], ['program', 'Rangkaian acara'],
      ['gallery', 'Galeri'], ['extra', 'Tema/dresscode & penutup'], ['gift', 'Wishlist hadiah'], ['info', 'Info penting'], ['music', 'Musik latar']],
    sections: ['program', 'gallery', 'dresscode', 'rsvp', 'gifts', 'info', 'wishes'],
    host: { role: 'Sebutan', name: 'Nama', title: null, parents: 'Usia / keterangan', parentsPh: 'Ulang tahun ke-17', bio: 'Tentang dia (opsional)', instagram: 'Instagram (opsional)', max: 3 },
  },
  gala: {
    label: 'Gala / Acara Formal',
    coverLabel: 'GALA INVITATION',
    hostsHeading: 'Hosted By',
    hostsMenu: 'Penyelenggara',
    defaultTheme: 'noir-gold',
    arabic: false,
    menu: [['cover', 'Sampul'], ['opening', 'Kata sambutan'], ['profile', 'Penyelenggara'], ['detail', 'Venue & jadwal'], ['program', 'Susunan acara'],
      ['lineup', 'Pengisi acara & tamu kehormatan'], ['extra', 'Dresscode & penutup'], ['info', 'Info akses & ketentuan'], ['partners', 'Sponsor & mitra'],
      ['gallery', 'Galeri'], ['music', 'Musik latar']],
    sections: ['program', 'lineup', 'gallery', 'dresscode', 'rsvp', 'info', 'partners', 'wishes'],
    host: { role: 'Sebutan', name: 'Nama / organisasi', title: 'Jabatan (opsional)', parents: null, bio: 'Tentang penyelenggara', instagram: 'Instagram (opsional)', max: 6 },
  },
  other: {
    label: 'Acara Lainnya',
    coverLabel: 'UNDANGAN',
    hostsHeading: 'Penyelenggara',
    hostsMenu: 'Penyelenggara',
    defaultTheme: 'corporate-slate',
    arabic: false,
    menu: [['cover', 'Sampul'], ['opening', 'Kata pembuka'], ['profile', 'Penyelenggara'], ['detail', 'Acara & lokasi'], ['program', 'Agenda'],
      ['info', 'Info penting'], ['gallery', 'Galeri'], ['extra', 'Penutup'], ['music', 'Musik latar']],
    sections: ['program', 'info', 'gallery', 'rsvp', 'wishes'],
    host: { role: 'Sebutan', name: 'Nama / instansi', title: 'Jabatan / peran (opsional)', parents: null, bio: 'Deskripsi (opsional)', instagram: 'Instagram (opsional)', max: 6 },
  },
};

const THEMES = [
  // ===== Pernikahan (3) =====
  {
    key: 'glass-rose', name: 'Glass Rose', category: 'Pernikahan', types: ['wedding'], opener: 'envelope', fx: 'petals',
    blurb: 'Kaca buram lembut, amplop surat terbuka, kelopak mawar jatuh.',
    colors: { primary: '#c2506f', accent: '#f4b6c2', bg: '#fff6f7', text: '#4a2c34' },
    fonts: { heading: 'Playfair Display', body: 'Poppins' },
  },
  {
    key: 'royal-book', name: 'Royal Book', category: 'Pernikahan', types: ['wedding'], opener: 'book', fx: 'sparkle',
    blurb: 'Biru malam & emas; sampul buku membuka seperti halaman.',
    colors: { primary: '#e6c36a', accent: '#5f78c9', bg: '#0f1b3d', text: '#eef1fb' },
    fonts: { heading: 'DM Serif Display', body: 'Poppins' },
  },
  {
    key: 'sage-garden', name: 'Sage Garden', category: 'Pernikahan', types: ['wedding'], opener: 'doors', fx: 'petals',
    blurb: 'Hijau sage & bunga; gerbang taman terbuka, daun berguguran.',
    colors: { primary: '#5b7a5e', accent: '#d9b8a3', bg: '#f5f7f1', text: '#2f3d31' },
    fonts: { heading: 'Lora', body: 'Nunito' },
  },
  // ===== Lamaran (2) =====
  {
    key: 'ivory-minimal', name: 'Ivory Minimal', category: 'Lamaran', types: ['engagement'], opener: 'flip', fx: 'sparkle',
    blurb: 'Minimalis gading; kartu undangan berputar 3D.',
    colors: { primary: '#2b2b2b', accent: '#b8a88a', bg: '#faf8f3', text: '#2b2b2b' },
    fonts: { heading: 'Cormorant Garamond', body: 'Inter' },
  },
  {
    key: 'terracotta-boho', name: 'Terracotta Boho', category: 'Lamaran', types: ['engagement'], opener: 'iris', fx: 'petals',
    blurb: 'Hangat ala boho dengan lengkungan; lingkaran melebar.',
    colors: { primary: '#b5573a', accent: '#e8c9a0', bg: '#fbf3ea', text: '#4a2f22' },
    fonts: { heading: 'Dancing Script', body: 'Lora' },
  },
  // ===== Ulang tahun (2) =====
  {
    key: 'confetti-pop', name: 'Confetti Pop', category: 'Ulang Tahun', types: ['birthday'], opener: 'curtain', fx: 'confetti',
    blurb: 'Ceria berwarna, tirai panggung tersibak, konfeti berjatuhan.',
    colors: { primary: '#ff4f81', accent: '#ffd23f', bg: '#fff9e8', text: '#2d2a4a' },
    fonts: { heading: 'Fredoka', body: 'Nunito' },
  },
  {
    key: 'neon-night', name: 'Neon Night', category: 'Ulang Tahun', types: ['birthday'], opener: 'shutter', fx: 'bubbles',
    blurb: 'Ungu neon bercahaya; kerai berputar, gelembung melayang.',
    colors: { primary: '#b46cff', accent: '#2de2e6', bg: '#120a24', text: '#f1e9ff' },
    fonts: { heading: 'Montserrat', body: 'Inter' },
  },
  // ===== Gala (2) =====
  {
    key: 'noir-gold', name: 'Noir Gold', category: 'Gala', types: ['gala'], opener: 'doors', fx: 'sparkle',
    blurb: 'Hitam & emas; pintu ganda terbuka, kilau emas.',
    colors: { primary: '#d4af37', accent: '#8c6d1f', bg: '#0e0e10', text: '#f3ead2' },
    fonts: { heading: 'Cinzel', body: 'Montserrat' },
  },
  {
    key: 'velvet-night', name: 'Velvet Night', category: 'Gala', types: ['gala'], opener: 'curtain', fx: 'sparkle',
    blurb: 'Beludru marun & emas; tirai teater tersibak.',
    colors: { primary: '#e0b45c', accent: '#a02c43', bg: '#1d0b12', text: '#f7e9e3' },
    fonts: { heading: 'Playfair Display', body: 'Montserrat' },
  },
  // ===== Lainnya (2) =====
  {
    key: 'corporate-slate', name: 'Corporate Slate', category: 'Acara Lainnya', types: ['other'], opener: 'shutter', fx: '',
    blurb: 'Rapi & profesional; kerai membuka, tanpa efek berlebih.',
    colors: { primary: '#1f6feb', accent: '#9ec1f7', bg: '#f4f7fb', text: '#172036' },
    fonts: { heading: 'Montserrat', body: 'Inter' },
  },
  {
    key: 'sunny-fest', name: 'Sunny Fest', category: 'Acara Lainnya', types: ['other'], opener: 'iris', fx: 'bubbles',
    blurb: 'Hangat & ramah untuk reuni, syukuran, atau komunitas.',
    colors: { primary: '#e8742a', accent: '#ffd08a', bg: '#fff8ef', text: '#3a2412' },
    fonts: { heading: 'Fredoka', body: 'Nunito' },
  },
];

// Nama template lama yang sudah diganti.
const LEGACY = { 'sage-floral': 'sage-garden', 'midnight-royal': 'royal-book' };

const PALETTES = [
  { name: 'Putih & Nude', colors: { primary: '#a68a6d', accent: '#e8d8c6', bg: '#fbf8f4', text: '#3d332a' } },
  { name: 'Pink', colors: { primary: '#c2506f', accent: '#f4b6c2', bg: '#fff6f7', text: '#4a2c34' } },
  { name: 'Merah', colors: { primary: '#c0262d', accent: '#f1a7a9', bg: '#fff5f4', text: '#4a1d1f' } },
  { name: 'Maroon', colors: { primary: '#7a1f35', accent: '#d9a5b1', bg: '#fbf1f3', text: '#3f1420' } },
  { name: 'Cokelat', colors: { primary: '#7b5234', accent: '#d8b999', bg: '#faf4ee', text: '#3a2a1c' } },
  { name: 'Emas', colors: { primary: '#d4af37', accent: '#8c6d1f', bg: '#0e0e10', text: '#f3ead2' } },
  { name: 'Hijau', colors: { primary: '#5b7a5e', accent: '#c7d8b8', bg: '#f5f7f1', text: '#2f3d31' } },
  { name: 'Tosca', colors: { primary: '#1d8a8a', accent: '#a6dcd8', bg: '#f0fafa', text: '#173a3a' } },
  { name: 'Biru & Navy', colors: { primary: '#e6c36a', accent: '#5f78c9', bg: '#0f1b3d', text: '#eef1fb' } },
  { name: 'Ungu', colors: { primary: '#7e57c2', accent: '#d1c4e9', bg: '#f7f3fc', text: '#2f2340' } },
  { name: 'Hitam', colors: { primary: '#ffffff', accent: '#9a9a9a', bg: '#101010', text: '#f2f2f2' } },
];

const FONTS = [
  'Playfair Display', 'Cormorant Garamond', 'Cinzel', 'DM Serif Display', 'Lora',
  'Great Vibes', 'Dancing Script', 'Fredoka', 'Montserrat', 'Poppins', 'Nunito', 'Inter',
];

const THEME_KEYS = THEMES.map((t) => t.key);
const OPENER_KEYS = OPENERS.map((o) => o.key);
const FX_KEYS = EFFECTS.map((e) => e.key);
const resolveThemeKey = (key) => LEGACY[key] || key;
const getTheme = (key) => THEMES.find((t) => t.key === resolveThemeKey(key)) || THEMES[0];
const themesFor = (type) => THEMES.filter((t) => t.types.includes(type));

module.exports = {
  EVENT_TYPES, THEMES, PALETTES, FONTS, OPENERS, EFFECTS, AR_RUM_21,
  THEME_KEYS, OPENER_KEYS, FX_KEYS, LEGACY, getTheme, resolveThemeKey, themesFor,
};
