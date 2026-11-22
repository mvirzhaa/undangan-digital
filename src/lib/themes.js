// Katalog jenis acara, tema, palet warna, dan font.

const EVENT_TYPES = {
  wedding: {
    label: 'Pernikahan',
    coverLabel: 'UNDANGAN PERNIKAHAN',
    hostsHeading: 'Pasangan Yang Berbahagia',
    hostsMenu: 'Mempelai',
    defaultTheme: 'glass-rose',
  },
  engagement: {
    label: 'Lamaran / Tunangan',
    coverLabel: 'UNDANGAN LAMARAN',
    hostsHeading: 'Calon Pengantin',
    hostsMenu: 'Calon pengantin',
    defaultTheme: 'ivory-minimal',
  },
  birthday: {
    label: 'Ulang Tahun',
    coverLabel: 'BIRTHDAY PARTY',
    hostsHeading: 'Yang Berulang Tahun',
    hostsMenu: 'Yang berulang tahun',
    defaultTheme: 'confetti-pop',
  },
  gala: {
    label: 'Gala / Acara Formal',
    coverLabel: 'GALA INVITATION',
    hostsHeading: 'Hosted By',
    hostsMenu: 'Penyelenggara',
    defaultTheme: 'noir-gold',
  },
  other: {
    label: 'Acara Lainnya',
    coverLabel: 'UNDANGAN',
    hostsHeading: 'Penyelenggara',
    hostsMenu: 'Penyelenggara',
    defaultTheme: 'ivory-minimal',
  },
};

const THEMES = [
  {
    key: 'glass-rose', name: 'Glass Rose', category: 'Elegan & Mewah',
    types: ['wedding', 'engagement'],
    colors: { primary: '#c2506f', accent: '#f4b6c2', bg: '#fff6f7', text: '#4a2c34' },
    fonts: { heading: 'Playfair Display', body: 'Poppins' },
  },
  {
    key: 'ivory-minimal', name: 'Ivory Minimal', category: 'Minimalis',
    types: ['wedding', 'engagement', 'other', 'birthday'],
    colors: { primary: '#2b2b2b', accent: '#b8a88a', bg: '#faf8f3', text: '#2b2b2b' },
    fonts: { heading: 'Cormorant Garamond', body: 'Inter' },
  },
  {
    key: 'sage-floral', name: 'Sage Floral', category: 'Floral & Bunga',
    types: ['wedding', 'engagement', 'birthday'],
    colors: { primary: '#5b7a5e', accent: '#d9b8a3', bg: '#f5f7f1', text: '#2f3d31' },
    fonts: { heading: 'Lora', body: 'Nunito' },
  },
  {
    key: 'noir-gold', name: 'Noir Gold', category: 'Dark & Moody',
    types: ['gala', 'wedding', 'birthday', 'other'],
    colors: { primary: '#d4af37', accent: '#8c6d1f', bg: '#0e0e10', text: '#f3ead2' },
    fonts: { heading: 'Cinzel', body: 'Montserrat' },
  },
  {
    key: 'confetti-pop', name: 'Confetti Pop', category: 'Game & Playful',
    types: ['birthday', 'other'],
    colors: { primary: '#ff4f81', accent: '#ffd23f', bg: '#fff9e8', text: '#2d2a4a' },
    fonts: { heading: 'Fredoka', body: 'Nunito' },
  },
  {
    key: 'midnight-royal', name: 'Midnight Royal', category: 'Elegan & Mewah',
    types: ['wedding', 'gala', 'engagement', 'other'],
    colors: { primary: '#e6c36a', accent: '#5f78c9', bg: '#0f1b3d', text: '#eef1fb' },
    fonts: { heading: 'DM Serif Display', body: 'Poppins' },
  },
  {
    key: 'terracotta-boho', name: 'Terracotta Boho', category: 'Adat & Tradisional',
    types: ['wedding', 'engagement', 'birthday', 'other'],
    colors: { primary: '#b5573a', accent: '#e8c9a0', bg: '#fbf3ea', text: '#4a2f22' },
    fonts: { heading: 'Dancing Script', body: 'Lora' },
  },
  {
    key: 'neon-night', name: 'Neon Night', category: 'Animasi & 3D',
    types: ['birthday', 'gala', 'other'],
    colors: { primary: '#b46cff', accent: '#2de2e6', bg: '#120a24', text: '#f1e9ff' },
    fonts: { heading: 'Montserrat', body: 'Inter' },
  },
];

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
const getTheme = (key) => THEMES.find((t) => t.key === key) || THEMES[0];

module.exports = { EVENT_TYPES, THEMES, PALETTES, FONTS, THEME_KEYS, getTheme };
