// Label tetap pada halaman undangan publik (Indonesia & Inggris).
const dict = {
  id: {
    dear: 'Kepada Yth.', guestFallback: 'Tamu Undangan', open: 'Buka Undangan', scroll: 'Gulir ke bawah',
    days: 'Hari', hours: 'Jam', minutes: 'Menit', seconds: 'Detik', started: 'Acara sedang berlangsung / telah dimulai',
    events: 'Acara', saveCalendar: 'Simpan ke Kalender', openMaps: 'Buka di Google Maps', location: 'Lokasi',
    story: 'Cerita Kami', gallery: 'Galeri', dresscode: 'Dress Code',
    rsvp: 'Konfirmasi Kehadiran', rsvpIntro: 'Mohon konfirmasi kehadiran Anda.', rsvpName: 'Nama', attendance: 'Kehadiran',
    yes: 'Hadir', no: 'Tidak hadir', maybe: 'Belum pasti', pax: 'Jumlah tamu', menu: 'Pilihan menu', note: 'Catatan (opsional)',
    send: 'Kirim', sending: 'Mengirim…', rsvpThanks: 'Terima kasih! Konfirmasi Anda sudah kami terima.',
    rsvpClosed: 'Batas konfirmasi kehadiran telah berakhir.', rsvpDeadline: 'Batas konfirmasi', rsvpUpdate: 'Perbarui',
    gifts: 'Hadiah', giftsIntro: 'Doa restu Anda sudah cukup. Namun bila ingin memberi tanda kasih, dapat melalui:',
    copy: 'Salin', copied: 'Tersalin', giftAddress: 'Kirim kado ke alamat',
    wishes: 'Ucapan & Doa', wishName: 'Nama', wishMessage: 'Tulis ucapan & doa', noWishes: 'Belum ada ucapan, jadilah yang pertama.',
    wishPending: 'Ucapan Anda terkirim dan menunggu persetujuan tuan rumah.', wishThanks: 'Terima kasih atas ucapannya!',
    privateTitle: 'Undangan Privat', privateText: 'Undangan ini hanya dapat dibuka lewat tautan pribadi yang dikirim oleh penyelenggara.',
    draftTitle: 'Undangan belum aktif', draftText: 'Undangan ini belum dipublikasikan oleh pemiliknya.',
    nav_hosts: 'Profil', nav_events: 'Acara', nav_rsvp: 'Hadir', nav_wishes: 'Ucapan',
    previewNotice: 'Mode pratinjau: pengiriman data dinonaktifkan.', madeWith: 'Dibuat dengan',
    error: 'Terjadi kesalahan, coba lagi.', until: 'sampai selesai',
    program: 'Rangkaian Acara', lineup: 'Pengisi Acara', info: 'Info Penting', partners: 'Didukung Oleh', family: 'Turut Mengundang',
    nav_program: 'Agenda', openerHint: 'Ketuk untuk membuka',
    ticketTitle: 'Tiket Masuk', ticketHint: 'Tunjukkan QR ini kepada petugas saat tiba di lokasi. Satu QR hanya dapat dipindai satu kali.',
    ticketBook: 'Buku tamu', ticketBooth: 'Photobooth', ticketDone: 'Sudah tercatat', ticketNot: 'Belum', ticketDownload: 'Unduh QR', nav_ticket: 'Tiket',
    ticketSample: 'Contoh tampilan: QR asli muncul di link personal tamu.',
    photoShare: 'Bagikan Foto Kegiatan', galleryOpen: 'Lihat Galeri Kegiatan', boothOpen: 'Foto Photobooth Saya', boothOpenAll: 'Foto Photobooth',
  },
  en: {
    dear: 'Dear', guestFallback: 'Dear Guest', open: 'Open Invitation', scroll: 'Scroll down',
    days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds', started: 'The event is underway / has started',
    events: 'Schedule', saveCalendar: 'Add to Calendar', openMaps: 'Open in Google Maps', location: 'Location',
    story: 'Our Story', gallery: 'Gallery', dresscode: 'Dress Code',
    rsvp: 'RSVP', rsvpIntro: 'Kindly let us know if you can attend.', rsvpName: 'Name', attendance: 'Attendance',
    ticketTitle: 'Entry Pass', ticketHint: 'Show this QR to the staff on arrival. Each QR can be scanned only once.',
    ticketBook: 'Guest book', ticketBooth: 'Photobooth', ticketDone: 'Recorded', ticketNot: 'Not yet', ticketDownload: 'Download QR', nav_ticket: 'Pass',
    ticketSample: 'Sample view: the real QR appears on each guest\'s personal link.',
    photoShare: 'Share Event Photos', galleryOpen: 'View Event Gallery', boothOpen: 'My Photobooth Photos', boothOpenAll: 'Photobooth Photos',
    yes: 'Attending', no: 'Not attending', maybe: 'Not sure yet', pax: 'Number of guests', menu: 'Menu choice', note: 'Note (optional)',
    send: 'Send', sending: 'Sending…', rsvpThanks: 'Thank you! Your RSVP has been received.',
    rsvpClosed: 'The RSVP deadline has passed.', rsvpDeadline: 'RSVP by', rsvpUpdate: 'Update',
    gifts: 'Gifts', giftsIntro: 'Your presence is the greatest gift. Should you wish to give a token of love:',
    copy: 'Copy', copied: 'Copied', giftAddress: 'Send gifts to',
    wishes: 'Wishes', wishName: 'Name', wishMessage: 'Write your wishes', noWishes: 'No wishes yet. Be the first!',
    wishPending: 'Your wish was sent and awaits approval by the host.', wishThanks: 'Thank you for your wishes!',
    privateTitle: 'Private Invitation', privateText: 'This invitation can only be opened through the personal link sent by the host.',
    draftTitle: 'Invitation not active', draftText: 'This invitation has not been published by its owner.',
    nav_hosts: 'Hosts', nav_events: 'Schedule', nav_rsvp: 'RSVP', nav_wishes: 'Wishes',
    previewNotice: 'Preview mode: submissions are disabled.', madeWith: 'Made with',
    error: 'Something went wrong, please try again.', until: 'until end',
    program: 'Programme', lineup: 'Featured Guests', info: 'Good to Know', partners: 'Supported By', family: 'Together With',
    nav_program: 'Programme', openerHint: 'Tap to open',
  },
};

// Penyesuaian kata menurut jenis acara (menimpa kamus dasar).
const byType = {
  wedding: {
    id: { rsvpIntro: 'Merupakan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir. Mohon konfirmasi kehadiran Anda.', events: 'Akad & Resepsi', wishes: 'Ucapan & Doa Restu', wishMessage: 'Tulis ucapan & doa restu' },
    en: { rsvpIntro: 'It would mean the world to us if you could celebrate with us. Kindly let us know.', wishes: 'Wishes & Blessings' },
  },
  engagement: {
    id: { wishes: 'Ucapan & Doa Restu', wishMessage: 'Tulis ucapan & doa restu' },
    en: { wishes: 'Wishes & Blessings' },
  },
  birthday: {
    id: { rsvpIntro: 'Yuk, kabari kami kamu bisa datang atau tidak ya!', wishes: 'Ucapan Selamat', wishMessage: 'Tulis ucapan selamat ulang tahun', gifts: 'Wishlist Hadiah', giftsIntro: 'Kehadiranmu sudah cukup. Kalau mau memberi hadiah, ini beberapa pilihannya:', story: 'Cerita' },
    en: { rsvpIntro: "Let us know if you can make it!", wishes: 'Birthday Wishes', wishMessage: 'Write your birthday wishes', gifts: 'Gift Wishlist' },
  },
  gala: {
    id: { rsvpIntro: 'Kehadiran Anda wajib dikonfirmasi untuk keperluan registrasi.', wishes: 'Pesan & Ucapan', dear: 'Kepada Yth.', yes: 'Hadir', no: 'Berhalangan' },
    en: { rsvpIntro: 'Kindly confirm your attendance for registration purposes.', yes: 'Accepts with pleasure', no: 'Regretfully declines', dear: 'Dear', wishes: 'Messages' },
  },
  other: {
    id: { rsvpIntro: 'Mohon konfirmasi kehadiran Anda agar kami dapat mempersiapkan acara dengan baik.' },
    en: { rsvpIntro: 'Please confirm your attendance so we can plan accordingly.' },
  },
};

module.exports = (lang, type) => {
  const l = dict[lang] ? lang : 'id';
  const extra = type && byType[type] && byType[type][l];
  return extra ? { ...dict[l], ...extra } : dict[l];
};
module.exports.dict = dict;
