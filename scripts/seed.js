// Membuat akun demo + tiga undangan contoh (pernikahan, ulang tahun, gala).
// Pakai: npm run seed   → masuk dengan demo@example.com / demo12345
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { defaultsFor } = require('../src/lib/defaults');

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

  for (const s of SAMPLES) {
    const d = defaultsFor(s.type, s.title);
    const theme = require('../src/lib/themes').THEMES.find((t) => t.key === s.theme);
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
    }
    await pool.query(
      `INSERT INTO invitations (user_id, slug, title, event_type, status, theme, colors, fonts, content, settings)
       VALUES ($1,$2,$3,$4,'published',$5,$6,$7,$8,$9)
       ON CONFLICT (slug) DO NOTHING`,
      [userId, s.slug, s.title, s.type, theme.key, theme.colors, theme.fonts, d.content, d.settings],
    );
  }
  console.log('Seed selesai. Masuk dengan demo@example.com / demo12345');
  console.log('Contoh: /demo-nadila-azka, /demo-sinta-17, /demo-midnight-gala');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
