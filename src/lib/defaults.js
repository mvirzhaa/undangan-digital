// Isi awal undangan menurut jenis acara.
const { EVENT_TYPES, AR_RUM_21, getTheme } = require('./themes');

function isoDateInDays(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

const ALL_SECTIONS = ['family', 'story', 'gallery', 'dresscode', 'rsvp', 'gifts', 'wishes', 'program', 'lineup', 'info', 'partners'];

function defaultSettings(type = 'other') {
  const t = EVENT_TYPES[type] || EVENT_TYPES.other;
  const sections = {};
  ALL_SECTIONS.forEach((k) => { sections[k] = false; });
  const on = {
    wedding: ['family', 'gallery', 'rsvp', 'gifts', 'wishes'],
    engagement: ['family', 'gallery', 'rsvp', 'wishes'],
    birthday: ['program', 'gallery', 'rsvp', 'info', 'wishes'],
    gala: ['program', 'lineup', 'dresscode', 'rsvp', 'info', 'wishes'],
    other: ['program', 'gallery', 'rsvp', 'wishes'],
  }[type] || [];
  on.forEach((k) => { if (t.sections.includes(k)) sections[k] = true; });
  return {
    lang: 'id',
    privateMode: false,
    musicAutoplay: true,
    opener: '', // kosong = ikuti template; 'none' = tanpa animasi
    fx: '',     // kosong = ikuti template; 'none' = tanpa efek
    waTemplate:
      'Halo {nama}, kami mengundang Anda ke acara kami. Detail dan konfirmasi kehadiran ada di tautan berikut:\n{link}',
    sections,
    wishesModerated: false,
  };
}

const host = (o) => ({ role: '', name: '', title: '', parents: '', instagram: '', photo: '', bio: '', ...o });
const event = (o) => ({ name: '', date: '', start: '', end: '', tz: 'WIB', venue: 'Nama Tempat', address: 'Alamat lengkap lokasi acara', mapsUrl: '', ...o });

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
      arabic: '', showArabic: false,
      text: 'Dengan penuh rasa syukur, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dan memberikan doa restu pada acara kami.',
      showText: true,
      source: '',
    },
    hostsHeading: t.hostsHeading,
    hosts: [],
    family: { heading: 'Turut Mengundang', text: '' },
    countdownTitle: 'Acara Akan Diselenggarakan',
    events: [],
    program: { heading: 'Rangkaian Acara', items: [] },
    lineup: { heading: 'Pengisi Acara', items: [] },
    info: { heading: 'Info Penting', items: [] },
    partners: { heading: 'Didukung Oleh', items: [] },
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

  if (type === 'wedding') {
    // Ar-Rum 21 sebagai pembuka bawaan; Arab dan terjemahan bisa dipilih dipakai atau tidak.
    c.opening = { arabic: AR_RUM_21.arabic, showArabic: true, text: AR_RUM_21.text, showText: true, source: AR_RUM_21.source };
    c.cover.subtitle = 'Kami mengundang Anda untuk hadir dan memberikan doa restu pada hari bahagia kami.';
    c.hosts = [
      host({ role: 'Mempelai Wanita', name: 'Nama Mempelai Wanita', parents: 'Putri dari Bapak ... & Ibu ...' }),
      host({ role: 'Mempelai Pria', name: 'Nama Mempelai Pria', parents: 'Putra dari Bapak ... & Ibu ...' }),
    ];
    c.family.text = 'Keluarga Besar Bapak ... & Ibu ...\nKeluarga Besar Bapak ... & Ibu ...';
    c.events = [
      event({ name: 'Akad Nikah', date, start: '08:00', end: '10:00' }),
      event({ name: 'Resepsi', date, start: '11:00', end: '14:00' }),
    ];
    c.gifts.receiver = '';
  } else if (type === 'engagement') {
    c.opening.text = 'Dengan memohon rahmat dan ridho Allah SWT, kami mengundang Bapak/Ibu/Saudara/i pada acara lamaran putra-putri kami.';
    c.hosts = [
      host({ role: 'Calon Mempelai Wanita', name: 'Nama Mempelai Wanita', parents: 'Putri dari Bapak ... & Ibu ...' }),
      host({ role: 'Calon Mempelai Pria', name: 'Nama Mempelai Pria', parents: 'Putra dari Bapak ... & Ibu ...' }),
    ];
    c.family.text = 'Keluarga Besar kedua belah pihak';
    c.events = [event({ name: 'Acara Lamaran', date, start: '10:00', end: '12:00' })];
  } else if (type === 'birthday') {
    c.cover.subtitle = "Let's celebrate! Datang dan rayakan hari spesial ini bersama kami.";
    c.opening.text = 'Ada pesta, tawa, dan kue yang lezat! Kami ingin merayakan hari istimewa ini bersama Anda.';
    c.hosts = [host({ role: 'Yang Berulang Tahun', name: 'Nama Yang Berulang Tahun', parents: 'Ulang tahun ke-...' })];
    c.events = [event({ name: 'Pesta Ulang Tahun', date, start: '16:00', end: '19:00' })];
    c.program = {
      heading: 'Rangkaian Acara',
      items: [
        { time: '16:00', title: 'Kedatangan tamu', text: 'Welcome drink dan foto bersama.' },
        { time: '16:45', title: 'Tiup lilin & potong kue', text: '' },
        { time: '17:30', title: 'Games & hiburan', text: '' },
        { time: '18:30', title: 'Makan bersama', text: '' },
      ],
    };
    c.info = { heading: 'Info Penting', items: [{ title: 'Tema pesta', text: 'Kenakan warna favoritmu!' }, { title: 'Parkir', text: 'Tersedia area parkir di lokasi.' }] };
    c.dresscode = { text: 'Bebas rapi & ceria. Warna cerah sangat disarankan.', colors: [] };
    c.countdownTitle = 'Hitung Mundur Menuju Pesta';
    c.closing.text = 'Kehadiranmu adalah hadiah terbaik. Sampai jumpa di pestanya!';
  } else if (type === 'gala') {
    c.cover.subtitle = 'An evening of art, fashion & philanthropy';
    c.opening.text = 'You are cordially invited to an unforgettable evening. Please join us for a night of elegance, music, and celebration.';
    c.hosts = [host({ role: 'Hosted by', name: 'Nama Penyelenggara', bio: 'Tuliskan deskripsi singkat penyelenggara atau tujuan acara.' })];
    c.events = [
      event({ name: 'Red Carpet', date, start: '19:00', end: '20:30', venue: 'Nama Venue' }),
      event({ name: 'Gala Dinner & Program', date, start: '20:30', end: '23:00', venue: 'Nama Venue' }),
    ];
    c.program = {
      heading: 'Susunan Acara',
      items: [
        { time: '19:00', title: 'Red carpet & registrasi', text: '' },
        { time: '20:00', title: 'Sambutan & pembukaan', text: '' },
        { time: '20:30', title: 'Gala dinner', text: '' },
        { time: '22:00', title: 'Penampilan utama', text: '' },
      ],
    };
    c.lineup = { heading: 'Tamu Kehormatan & Pengisi Acara', items: [{ name: 'Nama Pengisi Acara', role: 'Guest performer', photo: '', text: '' }] };
    c.info = { heading: 'Info Akses', items: [{ title: 'Registrasi', text: 'Tunjukkan QR undangan di pintu masuk.' }, { title: 'Valet parking', text: 'Tersedia di lobi utama.' }] };
    c.dresscode = { text: 'Black tie. Tema malam ini: "Sculpted in Gold". Kenakan busana terbaik Anda.', colors: ['#0e0e10', '#d4af37', '#f3ead2'] };
    c.countdownTitle = 'The Night Begins In';
    c.closing.text = 'We look forward to welcoming you. RSVP is required for entry.';
  } else {
    c.hosts = [host({ role: 'Penyelenggara', name: 'Nama Penyelenggara' })];
    c.events = [event({ name: 'Acara Utama', date, start: '09:00', end: '12:00' })];
    c.program = {
      heading: 'Agenda',
      items: [
        { time: '09:00', title: 'Registrasi', text: '' },
        { time: '09:30', title: 'Acara inti', text: '' },
        { time: '11:30', title: 'Penutupan', text: '' },
      ],
    };
  }
  return c;
}

function defaultsFor(type, title) {
  const t = EVENT_TYPES[type] ? type : 'other';
  const theme = getTheme(EVENT_TYPES[t].defaultTheme);
  return {
    theme: theme.key,
    colors: { ...theme.colors },
    fonts: { ...theme.fonts },
    content: defaultContent(t, title),
    settings: defaultSettings(t),
    versions: [],
  };
}

module.exports = { defaultsFor, defaultContent, defaultSettings, ALL_SECTIONS };
