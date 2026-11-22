// Uji end-to-end: menjalankan aplikasi di port acak dan memanggil API/halaman sungguhan.
// Pakai: npm test   (butuh database yang sudah dimigrasi)
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = require('../src/server');
const { pool } = require('../src/db');

let passed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); passed += 1; results.push(`  ok   ${name}`); } catch (e) { results.push(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const tag = crypto.randomBytes(4).toString('hex');

  class Client {
    constructor() { this.cookie = ''; }
    async req(method, path, body, headers = {}) {
      const h = { ...headers };
      if (this.cookie) h.Cookie = this.cookie;
      let payload = body;
      if (body && !(body instanceof FormData)) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
      const r = await fetch(base + path, { method, headers: h, body: payload, redirect: 'manual' });
      const sc = r.headers.get('set-cookie');
      if (sc) this.cookie = sc.split(';')[0];
      const type = r.headers.get('content-type') || '';
      const data = type.includes('json') ? await r.json() : await r.text();
      return { status: r.status, data, headers: r.headers };
    }
  }

  const owner = new Client();
  const other = new Client();
  const anon = new Client();
  let inv; let slug; let guests;

  await test('registrasi + cookie sesi', async () => {
    const r = await owner.req('POST', '/api/auth/register', { name: 'Uji Satu', email: `uji1-${tag}@example.com`, password: 'rahasia-123' });
    assert.strictEqual(r.status, 200); assert.ok(owner.cookie.startsWith('token='));
  });
  await test('registrasi menolak email duplikat & sandi pendek', async () => {
    assert.strictEqual((await anon.req('POST', '/api/auth/register', { name: 'X Y', email: `uji1-${tag}@example.com`, password: 'rahasia-123' })).status, 409);
    assert.strictEqual((await anon.req('POST', '/api/auth/register', { name: 'X Y', email: `b-${tag}@example.com`, password: 'pendek' })).status, 400);
  });
  await test('login salah ditolak, login benar diterima', async () => {
    assert.strictEqual((await anon.req('POST', '/api/auth/login', { email: `uji1-${tag}@example.com`, password: 'salah-salah' })).status, 401);
    const c = new Client();
    assert.strictEqual((await c.req('POST', '/api/auth/login', { email: `uji1-${tag}@example.com`, password: 'rahasia-123' })).status, 200);
  });
  await test('API butuh login', async () => {
    assert.strictEqual((await anon.req('GET', '/api/invitations')).status, 401);
    assert.strictEqual((await anon.req('GET', '/dashboard')).status, 302);
  });

  await test('buat undangan untuk semua jenis acara', async () => {
    for (const type of ['wedding', 'engagement', 'birthday', 'gala', 'other']) {
      const r = await owner.req('POST', '/api/invitations', { title: `Uji ${type} ${tag}`, event_type: type });
      assert.strictEqual(r.status, 201, `${type}: ${JSON.stringify(r.data)}`);
      if (type === 'wedding') { inv = r.data.id; slug = r.data.slug; }
    }
    assert.strictEqual((await owner.req('POST', '/api/invitations', { title: 'x', event_type: 'wedding' })).status, 400);
    assert.strictEqual((await owner.req('POST', '/api/invitations', { title: 'Uji', event_type: 'ngawur' })).status, 400);
  });
  await test('slug dicadangkan & duplikat ditolak', async () => {
    assert.strictEqual((await owner.req('POST', '/api/invitations', { title: 'Admin', event_type: 'wedding', slug: 'admin' })).status, 400);
    assert.strictEqual((await owner.req('POST', '/api/invitations', { title: 'Dup', event_type: 'wedding', slug })).status, 409);
  });

  await test('draf tidak bisa dibuka publik, tetapi pemilik bisa pratinjau', async () => {
    assert.strictEqual((await anon.req('GET', `/${slug}`)).status, 404);
    const pv = await owner.req('GET', `/preview/${inv}`);
    assert.strictEqual(pv.status, 200); assert.ok(pv.data.includes('Mode pratinjau'));
    assert.strictEqual((await anon.req('GET', `/preview/${inv}`)).status, 302);
  });

  await test('simpan isi: data dibersihkan (URL berbahaya, warna, font)', async () => {
    const g = await owner.req('GET', `/api/invitations/${inv}`);
    const body = { ...g.data.invitation };
    body.title = 'Nadila & Azka <script>alert(1)</script>';
    body.colors = { primary: 'red;}body{display:none', accent: '#112233', bg: '#ffffff', text: '#000000' };
    body.fonts = { heading: 'Comic Evil', body: 'Poppins' };
    body.content.cover.photo = 'javascript:alert(1)';
    body.content.cover.title = 'Nadila & Azka';
    body.content.hosts[0].name = '<img src=x onerror=alert(1)>';
    body.content.hosts[0].instagram = '@na<dila>';
    body.content.events[0].mapsUrl = 'javascript:alert(2)';
    body.content.events[0].venue = 'Gedung Serbaguna';
    body.content.events[0].address = 'Jl. Merdeka No. 1, Bogor';
    body.content.rsvp.menus = ['Nasi Liwet', 'Vegetarian'];
    body.content.gifts.accounts = [{ bank: 'BCA', number: '1234567890', name: 'Nadila' }];
    body.settings.sections.gifts = true;
    body.status = 'published';
    const r = await owner.req('PUT', `/api/invitations/${inv}`, body);
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const s = r.data.invitation;
    assert.strictEqual(s.content.cover.photo, '');
    assert.strictEqual(s.content.events[0].mapsUrl, '');
    assert.strictEqual(s.colors.primary, '#c2506f');          // jatuh ke warna tema karena tidak valid
    assert.strictEqual(s.fonts.heading, 'Playfair Display'); // font di luar daftar ditolak
    assert.strictEqual(s.content.hosts[0].instagram, 'nadila');
  });

  await test('halaman publik: konten tampil, HTML di-escape, tidak ada script injeksi', async () => {
    const r = await anon.req('GET', `/${slug}`);
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.includes('Gedung Serbaguna')); assert.ok(r.data.includes('Nasi Liwet'));
    assert.ok(!r.data.includes('<script>alert(1)</script>'), 'title harus di-escape');
    assert.ok(!r.data.includes('<img src=x onerror'), 'nama host harus di-escape');
    assert.ok(!/javascript:alert/.test(r.data));
    assert.ok(r.data.includes('1234567890'));
    assert.ok((r.headers.get('content-security-policy') || '').includes("script-src 'self'"));
  });

  await test('tamu: tambah, impor CSV, link personal menampilkan nama', async () => {
    const a = await owner.req('POST', `/api/invitations/${inv}/guests`, { name: 'Budi Santoso', group_name: 'Keluarga', phone: '0812-3456-7890', pax_limit: 3, kind: 'individual' });
    assert.strictEqual(a.status, 201);
    const imp = await owner.req('POST', `/api/invitations/${inv}/guests/import`, { text: 'nama,grup,telepon,jumlah\nAni Lestari,Rekan kerja,08111,2\n=HYPERLINK("http://x"),Uji,,1\n,kosong' });
    assert.strictEqual(imp.data.added, 2); assert.strictEqual(imp.data.skipped, 1);
    guests = (await owner.req('GET', `/api/invitations/${inv}/guests`)).data.guests;
    assert.strictEqual(guests.length, 3);
    const budi = guests.find((g) => g.name === 'Budi Santoso');
    assert.strictEqual(budi.phone, '081234567890'); assert.ok(/^[a-z0-9]{8}$/.test(budi.code));
    const page = await anon.req('GET', `/${slug}?to=${budi.code}`);
    assert.ok(page.data.includes('Budi Santoso'));
  });

  await test('RSVP tamu: simpan, perbarui (upsert), batas jumlah, menu valid', async () => {
    const budi = guests.find((g) => g.name === 'Budi Santoso');
    let r = await anon.req('POST', `/api/public/${slug}/rsvp`, { to: budi.code, attendance: 'hadir', pax: 99, menu: 'Nasi Liwet', note: 'Insya Allah' });
    assert.strictEqual(r.status, 200);
    r = await anon.req('POST', `/api/public/${slug}/rsvp`, { to: budi.code, attendance: 'hadir', pax: 2, menu: 'Menu Palsu' });
    assert.strictEqual(r.status, 200);
    const list = (await owner.req('GET', `/api/invitations/${inv}/rsvps`)).data.rsvps;
    assert.strictEqual(list.length, 1); assert.strictEqual(list[0].pax, 2); assert.strictEqual(list[0].menu, '');
    assert.strictEqual((await anon.req('POST', `/api/public/${slug}/rsvp`, { name: 'Tamu Umum', attendance: 'hmm' })).status, 400);
    assert.strictEqual((await anon.req('POST', `/api/public/${slug}/rsvp`, { name: 'Tamu Umum', attendance: 'tidak' })).status, 200);
    const stats = (await owner.req('GET', `/api/invitations/${inv}/stats`)).data;
    assert.strictEqual(stats.rsvp.hadir.pax, 2); assert.strictEqual(stats.rsvp.tidak.n, 1);
  });

  await test('ucapan: tampil, moderasi menyembunyikan sampai disetujui', async () => {
    assert.strictEqual((await anon.req('POST', `/api/public/${slug}/wish`, { name: 'Sari', message: 'Selamat ya! <b>x</b>' })).status, 200);
    assert.strictEqual((await anon.req('GET', `/api/public/${slug}/wishes`)).data.wishes.length, 1);
    const g = (await owner.req('GET', `/api/invitations/${inv}`)).data.invitation;
    g.settings.wishesModerated = true;
    await owner.req('PUT', `/api/invitations/${inv}`, g);
    const w = await anon.req('POST', `/api/public/${slug}/wish`, { name: 'Rudi', message: 'Barakallah' });
    assert.strictEqual(w.data.approved, false);
    assert.strictEqual((await anon.req('GET', `/api/public/${slug}/wishes`)).data.wishes.length, 1);
    const all = (await owner.req('GET', `/api/invitations/${inv}/wishes`)).data.wishes;
    const pending = all.find((x) => !x.approved);
    await owner.req('PATCH', `/api/invitations/${inv}/wishes/${pending.id}`, { approved: true });
    assert.strictEqual((await anon.req('GET', `/api/public/${slug}/wishes`)).data.wishes.length, 2);
  });

  await test('check-in lewat kode / URL, dan tidak ganda', async () => {
    const ani = guests.find((g) => g.name === 'Ani Lestari');
    let r = await owner.req('POST', `/api/invitations/${inv}/checkin`, { code: `http://x/${slug}?to=${ani.code}` });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.already, false); assert.strictEqual(r.data.guest.checked_in_pax, 2);
    r = await owner.req('POST', `/api/invitations/${inv}/checkin`, { code: ani.code });
    assert.strictEqual(r.data.already, true);
    assert.strictEqual((await owner.req('POST', `/api/invitations/${inv}/checkin`, { code: 'zzzzzzzz' })).status, 404);
  });

  await test('mode privat: link umum ditolak, link tamu diterima', async () => {
    const g = (await owner.req('GET', `/api/invitations/${inv}`)).data.invitation;
    g.settings.privateMode = true;
    await owner.req('PUT', `/api/invitations/${inv}`, g);
    assert.strictEqual((await anon.req('GET', `/${slug}`)).status, 403);
    assert.strictEqual((await anon.req('GET', `/${slug}?to=${guests[0].code}`)).status, 200);
    assert.strictEqual((await anon.req('POST', `/api/public/${slug}/rsvp`, { name: 'Penyusup', attendance: 'hadir' })).status, 403);
  });

  await test('kalender .ics dan ekspor CSV (anti injeksi rumus)', async () => {
    const ics = await anon.req('GET', `/${slug}/calendar.ics?e=0`);
    assert.strictEqual(ics.status, 200); assert.ok(ics.data.includes('BEGIN:VEVENT'));
    const csv = await owner.req('GET', `/api/invitations/${inv}/export/guests.csv`);
    assert.ok(csv.data.includes(`"'=HYPERLINK`), 'sel diawali = harus diberi tanda kutip');
  });

  await test('QR tamu berupa SVG', async () => {
    const r = await owner.req('GET', `/api/invitations/${inv}/guests/${guests[0].id}/qr.svg`);
    assert.strictEqual(r.status, 200); assert.ok(String(r.data).includes('<svg'));
  });

  await test('unggah: gambar asli diterima, file palsu & tipe salah ditolak', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    let fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'a.png');
    let r = await owner.req('POST', `/api/invitations/${inv}/upload`, fd);
    assert.strictEqual(r.status, 200, JSON.stringify(r.data)); assert.ok(/^\/uploads\/\d+\/.+\.png$/.test(r.data.url));
    const served = await fetch(base + r.data.url);
    assert.strictEqual(served.status, 200);
    fd = new FormData(); fd.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'b.png');
    assert.strictEqual((await owner.req('POST', `/api/invitations/${inv}/upload`, fd)).status, 400);
    fd = new FormData(); fd.append('file', new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }), 'c.svg');
    assert.strictEqual((await owner.req('POST', `/api/invitations/${inv}/upload`, fd)).status, 400);
    // URL hasil unggah bisa dipakai sebagai foto sampul
    const g = (await owner.req('GET', `/api/invitations/${inv}`)).data.invitation;
    g.content.cover.photo = r.data.url;
    assert.strictEqual((await owner.req('PUT', `/api/invitations/${inv}`, g)).data.invitation.content.cover.photo, r.data.url);
  });

  await test('isolasi akun: pengguna lain tidak bisa melihat/mengubah/menghapus', async () => {
    assert.strictEqual((await other.req('POST', '/api/auth/register', { name: 'Uji Dua', email: `uji2-${tag}@example.com`, password: 'rahasia-123' })).status, 200);
    for (const [m, p] of [['GET', `/api/invitations/${inv}`], ['GET', `/api/invitations/${inv}/guests`], ['GET', `/api/invitations/${inv}/rsvps`], ['PUT', `/api/invitations/${inv}`], ['DELETE', `/api/invitations/${inv}`], ['GET', `/api/invitations/${inv}/export/guests.csv`]]) {
      const r = await other.req(m, p, m === 'PUT' ? { title: 'bajak' } : undefined);
      assert.strictEqual(r.status, 404, `${m} ${p} -> ${r.status}`);
    }
    assert.strictEqual((await other.req('GET', `/editor/${inv}`)).status, 404);
    assert.strictEqual((await other.req('GET', `/preview/${inv}`)).status, 404);
    assert.strictEqual((await other.req('GET', '/api/invitations')).data.invitations.length, 0);
    const own = await other.req('GET', `/${slug}`);               // draf/privat tetap tidak bocor ke pengguna lain
    assert.strictEqual(own.status, 403);
  });

  await test('pindah slug, duplikasi, dan hapus undangan', async () => {
    const g = (await owner.req('GET', `/api/invitations/${inv}`)).data.invitation;
    g.slug = `Nadila Azka ${tag}`;
    const r = await owner.req('PUT', `/api/invitations/${inv}`, g);
    assert.strictEqual(r.data.invitation.slug, `nadila-azka-${tag}`);
    const dup = await owner.req('POST', `/api/invitations/${inv}/duplicate`);
    assert.strictEqual(dup.status, 201);
    assert.strictEqual((await owner.req('DELETE', `/api/invitations/${dup.data.id}`)).status, 200);
  });

  await test('halaman dashboard & editor dirender untuk pemilik', async () => {
    assert.strictEqual((await owner.req('GET', '/dashboard')).status, 200);
    const ed = await owner.req('GET', `/editor/${inv}?main_menu=data&form=cover`);
    assert.strictEqual(ed.status, 200); assert.ok(ed.data.includes('id="boot"'));
    assert.ok(!ed.data.includes('<script>alert(1)</script>'), 'boot JSON harus aman');
    assert.strictEqual((await anon.req('GET', '/')).status, 200);
    assert.strictEqual((await anon.req('GET', '/tidak-ada-halaman')).status, 404);
  });

  console.log(results.join('\n'));
  console.log(`\n${passed}/${results.length} lulus`);

  // bersihkan data uji (DB + folder unggahan)
  fs.rmSync(path.join(__dirname, '../public/uploads', String(inv)), { recursive: true, force: true });
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%-${tag}@example.com`]);
  await pool.end();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
