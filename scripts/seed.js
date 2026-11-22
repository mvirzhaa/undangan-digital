// Membuat akun demo + undangan contoh (pernikahan dengan versi VIP, ulang tahun, gala).
// Pakai: npm run seed   → masuk dengan demo@example.com / demo12345
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { defaultsFor } = require('../src/lib/defaults');
const { THEMES } = require('../src/lib/themes');

const SAMPLES = [
  { type: 'wedding', title: 'Nadila & Azka', slug: 'demo-nadila-azka', theme: 'glass-rose' },
  { type: 'birthday', title: 'Sweet Seventeen Sinta', slug: 'demo-sinta-17', theme: 'confetti-pop' },
  { type: 'gala', title: 'The Midnight Gala', slug: 'demo-midnight-gala', theme: 'noir-gold' },
];

(async () => {
  const hash = await bcrypt.hash('demo12345', 10);
  const u = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ('Akun Demo', 'demo@example.com', $1)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [hash],
  );
  const userId = u.rows[0].id;

  // Contoh lama milik akun demo dibuat ulang agar mengikuti format terbaru.
  await pool.query('DELETE FROM invitations WHERE user_id = $1 AND slug = ANY($2::text[])', [userId, SAMPLES.map((x) => x.slug)]);

  for (const s of SAMPLES) {
    const d = defaultsFor(s.type, s.title);
    const theme = THEMES.find((t) => t.key === s.theme);
    let versions = [];
    if (s.type === 'wedding') {
      d.content.hosts[0].name = 'Nadila Putri'; d.content.hosts[1].name = 'Azka Pratama';
      d.content.hosts[0].parents = 'Putri dari Bapak Ahmad & Ibu Siti'; d.content.hosts[1].parents = 'Putra dari Bapak Hasan & Ibu Rina';
      d.content.cover.title = 'Nadila & Azka';
      d.content.events.forEach((e) => { e.venue = 'Gedung Serbaguna Bogor'; e.address = 'Jl. Pajajaran No. 10, Bogor'; });
      d.settings.sections.story = true;
      d.content.story = [
        { date: '2019', title: 'Pertama bertemu', text: 'Berawal dari satu obrolan di kedai kopi kecil.' },
        { date: '2025', title: 'Lamaran', text: 'Dengan restu kedua keluarga, kami melangkah ke jenjang berikutnya.' },
      ];
      // Contoh versi: tamu VIP diundang ke akad + resepsi dan mendapat info parkir khusus.
      versions = [{
        id: 'vvip0001', name: 'VIP', badge: 'VIP Guest', theme: 'royal-book', colors: null, opener: '', fx: '',
        cover: { label: '', title: '', subtitle: 'Dengan hormat, kami mengundang Bapak/Ibu untuk menyaksikan akad nikah dan hadir pada resepsi kami.', buttonText: 'Buka Undangan VIP', photo: '' },
        openingText: '', closingText: '', limitEvents: false, eventIdx: [],
        note: { title: 'Informasi Tamu VIP', text: 'Parkir khusus di lobi utama. Ruang tunggu VIP tersedia di lantai 2.' }, sections: { gifts: 'off' },
      }];
    }
    const r = await pool.query(
      `INSERT INTO invitations (user_id, slug, title, event_type, status, theme, colors, fonts, content, settings, versions)
       VALUES ($1,$2,$3,$4,'published',$5,$6,$7,$8,$9,$10)
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [userId, s.slug, s.title, s.type, theme.key, theme.colors, theme.fonts, d.content, d.settings, JSON.stringify(versions)],
    );
    if (s.type === 'wedding' && r.rowCount) {
      const id = r.rows[0].id;
      const guests = [['Bapak Hendra (VIP)', 'vvip0001', 'demovip01'], ['Ibu Maya', '', 'demoreg01']];
      for (const [name, version, code] of guests) {
        await pool.query(
          `INSERT INTO guests (invitation_id, name, code, group_name, pax_limit, version_id) VALUES ($1,$2,$3,'Keluarga',2,$4)
           ON CONFLICT (code) DO NOTHING`, [id, name, code, version]);
      }
    }
  }
  console.log('Seed selesai. Masuk dengan demo@example.com / demo12345');
  console.log('Contoh: /demo-nadila-azka, /demo-nadila-azka?to=demovip01 (versi VIP), /demo-sinta-17, /demo-midnight-gala');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
