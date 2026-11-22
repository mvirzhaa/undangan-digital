// Isi awal undangan menurut jenis acara.
const { EVENT_TYPES, getTheme } = require('./themes');

function isoDateInDays(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function defaultSettings() {
  return {
    lang: 'id',
    privateMode: false,
    musicAutoplay: true,
    waTemplate:
      'Halo {nama}, kami mengundang Anda ke acara kami. Detail dan konfirmasi kehadiran ada di tautan berikut:\n{link}',
    sections: { story: false, gallery: true, dresscode: false, rsvp: true, gifts: false, wishes: true },
    wishesModerated: false,
  };
}

function baseContent(type, title) {
  const t = EVENT_TYPES[type] || EVENT_TYPES.other;
  return {
    cover: {
      label: t.coverLabel,
      title: title || 'Judul Acara',
      subtitle: 'Kami mengundang Anda untuk hadir dan berbagi kebahagiaan bersama kami.',
      photo: '',
      buttonText: 'Buka Undangan',
    },
    opening: {
      text: 'Dengan penuh rasa syukur, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dan memberikan doa restu pada acara kami.',
      source: '',
    },
    hostsHeading: t.hostsHeading,
    hosts: [],
    countdownTitle: 'Acara Akan Diselenggarakan',
    events: [],
    story: [],
    gallery: [],
    dresscode: { text: '', colors: [] },
    rsvp: { deadline: '', maxPax: 4, menus: [] },
    gifts: { accounts: [], receiver: '', address: '' },
    music: { url: '', title: '' },
    closing: {
      text: 'Merupakan kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir. Terima kasih atas doa dan kehadirannya.',
      signature: title || '',
    },
  };
}

function defaultContent(type, title) {
  const c = baseContent(type, title);
  const date = isoDateInDays(60);

  if (type === 'wedding' || type === 'engagement') {
    const isWedding = type === 'wedding';
    c.hosts = [
      { role: isWedding ? 'Mempelai Wanita' : 'Calon Mempelai Wanita', name: 'Nama Mempelai Wanita', title: '', parents: 'Putri dari Bapak ... & Ibu ...', instagram: '', photo: '', bio: '' },
      { role: isWedding ? 'Mempelai Pria' : 'Calon Mempelai Pria', name: 'Nama Mempelai Pria', title: '', parents: 'Putra dari Bapak ... & Ibu ...', instagram: '', photo: '', bio: '' },
    ];
    c.events = isWedding
      ? [
          { name: 'Akad Nikah', date, start: '08:00', end: '10:00', tz: 'WIB', venue: 'Nama Tempat', address: 'Alamat lengkap lokasi acara', mapsUrl: '' },
          { name: 'Resepsi', date, start: '11:00', end: '14:00', tz: 'WIB', venue: 'Nama Tempat', address: 'Alamat lengkap lokasi acara', mapsUrl: '' },
        ]
      : [{ name: 'Acara Lamaran', date, start: '10:00', end: '12:00', tz: 'WIB', venue: 'Nama Tempat', address: 'Alamat lengkap lokasi acara', mapsUrl: '' }];
  } else if (type === 'birthday') {
    c.cover.subtitle = "Let's celebrate! Datang dan rayakan hari spesial ini bersama kami.";
    c.opening.text = 'Ada pesta, tawa, dan kue yang lezat! Kami ingin merayakan hari istimewa ini bersama Anda.';
    c.hosts = [{ role: 'Yang Berulang Tahun', name: 'Nama Yang Berulang Tahun', title: '', parents: 'Ulang tahun ke-...', instagram: '', photo: '', bio: '' }];
    c.events = [{ name: 'Pesta Ulang Tahun', date, start: '16:00', end: '19:00', tz: 'WIB', venue: 'Nama Tempat', address: 'Alamat lengkap lokasi acara', mapsUrl: '' }];
    c.countdownTitle = 'Hitung Mundur Menuju Pesta';
    c.closing.text = 'Kehadiranmu adalah hadiah terbaik. Sampai jumpa di pestanya!';
  } else if (type === 'gala') {
    c.cover.subtitle = 'An evening of art, fashion & philanthropy';
    c.opening.text = 'You are cordially invited to an unforgettable evening. Please join us for a night of elegance, music, and celebration.';
    c.hosts = [{ role: 'Hosted by', name: 'Nama Penyelenggara', title: '', parents: '', instagram: '', photo: '', bio: 'Tuliskan deskripsi singkat penyelenggara atau tujuan acara.' }];
    c.events = [
      { name: 'Red Carpet', date, start: '19:00', end: '20:30', tz: 'WIB', venue: 'Nama Venue', address: 'Alamat lengkap lokasi acara', mapsUrl: '' },
      { name: 'Gala Dinner & Program', date, start: '20:30', end: '23:00', tz: 'WIB', venue: 'Nama Venue', address: 'Alamat lengkap lokasi acara', mapsUrl: '' },
    ];
    c.dresscode = { text: 'Black tie. Tema malam ini: "Sculpted in Gold". Kenakan busana terbaik Anda.', colors: ['#0e0e10', '#d4af37', '#f3ead2'] };
    c.countdownTitle = 'The Night Begins In';
    c.closing.text = 'We look forward to welcoming you. RSVP is required for entry.';
  } else {
    c.hosts = [{ role: 'Penyelenggara', name: 'Nama Penyelenggara', title: '', parents: '', instagram: '', photo: '', bio: '' }];
    c.events = [{ name: 'Acara Utama', date, start: '09:00', end: '12:00', tz: 'WIB', venue: 'Nama Tempat', address: 'Alamat lengkap lokasi acara', mapsUrl: '' }];
  }
  return c;
}

function defaultsFor(type, title) {
  const t = EVENT_TYPES[type] ? type : 'other';
  const themeKey = EVENT_TYPES[t].defaultTheme;
  const theme = getTheme(themeKey);
  const settings = defaultSettings();
  if (t === 'gala') settings.sections.dresscode = true;
  return {
    theme: theme.key,
    colors: { ...theme.colors },
    fonts: { ...theme.fonts },
    content: defaultContent(t, title),
    settings,
  };
}

module.exports = { defaultsFor, defaultContent, defaultSettings };
