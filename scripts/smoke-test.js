// Uji end-to-end: menjalankan aplikasi di port acak dan memanggil API/halaman sungguhan.
// Pakai: npm test   (butuh database yang sudah dimigrasi)
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
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
  let inv; let slug; let guests; let meta; let vip;
  const ids = {};
  const xlsx = async (rows, sheet = 'Tamu') => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(sheet);
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  };
  const upload = (buf, id = () => inv) => {
    const fd = new FormData(); fd.append('file', new Blob([buf]), 'tamu.xlsx');
    return owner.req('POST', `/api/invitations/${id()}/guests/import`, fd);
  };

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
      ids[type] = r.data;
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

  await test('template: 3 untuk pernikahan, 2 untuk tiap jenis lain, eksklusif per jenis, 7 animasi pembuka', async () => {
    meta = (await owner.req('GET', '/api/meta')).data;
    const counts = {};
    meta.themes.forEach((t) => {
      assert.strictEqual(t.types.length, 1, `${t.key} harus milik satu jenis`);
      counts[t.types[0]] = (counts[t.types[0]] || 0) + 1;
      assert.ok(meta.openers.some((o) => o.key === t.opener), `${t.key}: opener`);
    });
    assert.deepStrictEqual(counts, { wedding: 3, engagement: 2, birthday: 2, gala: 2, other: 2 });
    assert.strictEqual(meta.openers.length, 7);
    assert.deepStrictEqual(meta.openers.map((o) => o.key).sort(), ['book', 'curtain', 'doors', 'envelope', 'flip', 'iris', 'shutter']);
    // template jenis lain ditolak; template pernikahan diterima
    const g = (await owner.req('GET', `/api/invitations/${inv}`)).data.invitation;
    g.theme = 'confetti-pop';
    assert.strictEqual((await owner.req('PUT', `/api/invitations/${inv}`, g)).data.invitation.theme, 'glass-rose');
    g.theme = 'royal-book';
    assert.strictEqual((await owner.req('PUT', `/api/invitations/${inv}`, g)).data.invitation.theme, 'royal-book');
    g.theme = 'glass-rose';
    assert.strictEqual((await owner.req('PUT', `/api/invitations/${inv}`, g)).data.invitation.theme, 'glass-rose');
  });

  await test('setiap template dirender dengan animasi pembuka & efeknya; pengaturan animasi bisa diganti/dimatikan', async () => {
    for (const t of meta.themes) {
      const c = await owner.req('POST', '/api/invitations', { title: `Tema ${t.key} ${tag}`, event_type: t.types[0] });
      const g = (await owner.req('GET', `/api/invitations/${c.data.id}`)).data.invitation;
      g.theme = t.key; g.colors = t.colors; g.fonts = t.fonts; g.status = 'published';
      const put = (await owner.req('PUT', `/api/invitations/${c.data.id}`, g)).data.invitation;
      assert.strictEqual(put.theme, t.key);
      let page = (await anon.req('GET', `/${c.data.slug}`)).data;
      assert.ok(page.includes(`theme-${t.key}`) && page.includes(`op-${t.opener}`) && page.includes('id="open-btn"'), `${t.key} opener ${t.opener}`);
      if (t.fx) assert.ok(page.includes(`fx-${t.fx}`), `${t.key} fx`);
      if (t.key === 'glass-rose') {
        put.settings.opener = 'curtain'; put.settings.fx = 'none';
        await owner.req('PUT', `/api/invitations/${c.data.id}`, put);
        page = (await anon.req('GET', `/${c.data.slug}`)).data;
        assert.ok(page.includes('op-curtain') && !page.includes('op-envelope') && !page.includes('class="fx '));
        put.settings.opener = 'none';
        await owner.req('PUT', `/api/invitations/${c.data.id}`, put);
        page = (await anon.req('GET', `/${c.data.slug}`)).data;
        assert.ok(!page.includes('id="opener"') && page.includes('id="open-btn"'), 'tanpa animasi: tombol buka tetap di sampul');
        put.settings.opener = 'ngawur';
        assert.strictEqual((await owner.req('PUT', `/api/invitations/${c.data.id}`, put)).data.invitation.settings.opener, '');
      }
    }
  });

  await test('pernikahan: Ar-Rum 21 bawaan (Arab + Indonesia), masing-masing bisa dipakai atau tidak', async () => {
    const g = (await owner.req('GET', `/api/invitations/${inv}`)).data.invitation;
    const o = g.content.opening;
    assert.strictEqual(o.arabic, meta.arRum21.arabic); assert.ok(o.arabic.startsWith('وَمِنْ') && o.arabic.endsWith('يَّتَفَكَّرُوْنَ'));
    assert.ok(o.showArabic && o.showText && o.source === 'QS. Ar-Rum: 21' && o.text.includes('kasih dan sayang'));
    let page = (await anon.req('GET', `/${slug}`)).data;
    assert.ok(page.includes('class="arabic"') && page.includes('dir="rtl"') && page.includes('kasih dan sayang') && page.includes('Ar-Rum: 21'));
    g.content.opening.showArabic = false;
    await owner.req('PUT', `/api/invitations/${inv}`, g);
    page = (await anon.req('GET', `/${slug}`)).data;
    assert.ok(!page.includes('class="arabic"') && page.includes('kasih dan sayang'), 'hanya terjemahan');
    g.content.opening.showArabic = true; g.content.opening.showText = false;
    await owner.req('PUT', `/api/invitations/${inv}`, g);
    page = (await anon.req('GET', `/${slug}`)).data;
    assert.ok(page.includes('class="arabic"') && !page.includes('kasih dan sayang'), 'hanya Arab');
    g.content.opening.showArabic = false;
    await owner.req('PUT', `/api/invitations/${inv}`, g);
    assert.ok(!(await anon.req('GET', `/${slug}`)).data.includes('id="opening"'), 'keduanya mati: bagian pembuka hilang');
    g.content.opening.showArabic = true; g.content.opening.showText = true;
    await owner.req('PUT', `/api/invitations/${inv}`, g);
    assert.ok((await anon.req('GET', `/${slug}`)).data.includes('class="arabic"'));
    // jenis lain tidak memakai Ar-Rum
    const bd = (await owner.req('GET', `/api/invitations/${ids.birthday.id}`)).data.invitation;
    assert.strictEqual(bd.content.opening.arabic, ''); assert.strictEqual(bd.content.opening.showArabic, false);
  });

  await test('isian & bagian berbeda per jenis acara (pernikahan vs ulang tahun vs gala vs lainnya)', async () => {
    const keys = (t) => meta.eventTypes[t].menu.map((m) => m[0]);
    assert.ok(keys('wedding').includes('family') && keys('wedding').includes('story') && keys('wedding').includes('gift') && !keys('wedding').includes('lineup'));
    assert.ok(keys('gala').includes('lineup') && keys('gala').includes('partners') && keys('gala').includes('program') && !keys('gala').includes('story') && !keys('gala').includes('gift'));
    assert.ok(keys('birthday').includes('program') && keys('birthday').includes('info') && !keys('birthday').includes('family'));
    assert.ok(keys('other').includes('program') && !keys('other').includes('gift') && !keys('other').includes('story'));
    assert.strictEqual(meta.eventTypes.wedding.host.bio, null); assert.ok(meta.eventTypes.birthday.host.bio);
    assert.strictEqual(meta.eventTypes.gala.host.parents, null); assert.ok(meta.eventTypes.wedding.host.parents);
    assert.ok(meta.eventTypes.wedding.arabic && !meta.eventTypes.gala.arabic);

    const get = async (id) => (await owner.req('GET', `/api/invitations/${id}`)).data.invitation;
    const gala = await get(ids.gala.id); const wed = await get(inv); const bd = await get(ids.birthday.id);
    assert.ok(gala.content.lineup.items.length > 0 && gala.settings.sections.lineup && gala.settings.sections.dresscode);
    assert.ok(bd.content.program.items.length > 0 && bd.settings.sections.program && !bd.settings.sections.lineup);
    assert.ok(wed.settings.sections.family && !wed.settings.sections.lineup && wed.content.hosts.length === 2);
    assert.strictEqual(bd.content.hosts.length, 1);

    // tampilan publik hanya memakai bagian milik jenisnya, walau datanya terisi
    gala.status = 'published'; await owner.req('PUT', `/api/invitations/${ids.gala.id}`, gala);
    const gp = (await anon.req('GET', `/${ids.gala.slug}`)).data;
    assert.ok(gp.includes('lineup-grid') && gp.includes('rundown') && gp.includes('class="sec info"'));
    wed.settings.sections.lineup = true; wed.content.lineup.items = [{ name: 'Penyanyi', role: '', photo: '', text: '' }];
    await owner.req('PUT', `/api/invitations/${inv}`, wed);
    assert.ok(!(await anon.req('GET', `/${slug}`)).data.includes('lineup-grid'), 'pernikahan tidak menampilkan lineup');
    wed.settings.sections.lineup = false;
    await owner.req('PUT', `/api/invitations/${inv}`, wed);
    // isian baru dibersihkan (URL berbahaya pada logo mitra ditolak)
    gala.content.partners.items = [{ name: 'Sponsor <b>', logo: 'javascript:x', url: 'http://tidak-aman.example' }];
    const saved = (await owner.req('PUT', `/api/invitations/${ids.gala.id}`, gala)).data.invitation;
    assert.strictEqual(saved.content.partners.items[0].logo, ''); assert.strictEqual(saved.content.partners.items[0].url, '');
  });

  await test('tamu: tambah, impor Excel (.xlsx), link personal menampilkan nama', async () => {
    const a = await owner.req('POST', `/api/invitations/${inv}/guests`, { name: 'Budi Santoso', group_name: 'Keluarga', phone: '0812-3456-7890', pax_limit: 3, kind: 'individual' });
    assert.strictEqual(a.status, 201);
    const buf = await xlsx([
      ['Nama', 'Grup', 'Telepon / WhatsApp', 'Jumlah', 'Jenis', 'Versi', 'Meja'],
      ['Ani Lestari', 'Rekan kerja', 81234567891, 2, 'Individu', '', ''],        // nomor numerik: angka 0 di depan hilang di Excel
      ['=HYPERLINK("http://x")', 'Uji', '', 1, 'Grup', 'Standar', 'Meja 4'],
      ['', 'kosong', '', '', '', '', ''],                                           // nama kosong -> dilewati
    ]);
    const imp = await upload(buf);
    assert.strictEqual(imp.status, 200, JSON.stringify(imp.data));
    assert.strictEqual(imp.data.added, 2); assert.strictEqual(imp.data.skipped, 1); assert.strictEqual(imp.data.errors[0].row, 4);
    guests = (await owner.req('GET', `/api/invitations/${inv}/guests`)).data.guests;
    assert.strictEqual(guests.length, 3);
    const budi = guests.find((g) => g.name === 'Budi Santoso');
    assert.strictEqual(budi.phone, '081234567890'); assert.ok(/^[a-z0-9]{8}$/.test(budi.code));
    assert.strictEqual(guests.find((g) => g.name === 'Ani Lestari').phone, '081234567891');
    assert.strictEqual(guests.find((g) => g.name.startsWith('=HYPERLINK')).kind, 'group');
    const page = await anon.req('GET', `/${slug}?to=${budi.code}`);
    assert.ok(page.data.includes('Budi Santoso'));
  });

  await test('impor Excel: berkas bukan xlsx / zip bomb / jenis & versi salah ditolak dengan pesan jelas', async () => {
    let r = await upload(Buffer.from('nama,grup\nBudi,Keluarga\n'.repeat(20)));
    assert.strictEqual(r.status, 400); assert.ok(/Excel/.test(r.data.error));
    const fd = new FormData(); r = await owner.req('POST', `/api/invitations/${inv}/guests/import`, fd);
    assert.strictEqual(r.status, 400);
    // zip yang isinya sangat besar setelah diekstrak (dikompres) harus ditolak sebelum diproses
    const JSZip = require('jszip');
    const z = new JSZip(); z.file('xl/big.xml', Buffer.alloc(60 * 1024 * 1024, 65));
    const bomb = await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    assert.ok(bomb.length < 2 * 1024 * 1024, `bomb ${bomb.length}`);
    r = await upload(bomb);
    assert.strictEqual(r.status, 400); assert.ok(/terlalu besar/i.test(r.data.error), r.data.error);
    // tanpa kolom Nama
    r = await upload(await xlsx([['Foo', 'Bar'], ['a', 'b']]));
    assert.strictEqual(r.status, 400); assert.ok(/Nama/.test(r.data.error));
    // baris bermasalah dilaporkan per baris, baris baik tetap masuk
    r = await upload(await xlsx([['Nama', 'Jenis', 'Versi', 'Jumlah'], ['Joko', 'Aneh', '', 1], ['Sri', 'Individu', 'TidakAda', 1], ['Tono', 'Privat', '', 99], ['Wati', 'Privat', '', 2]]));
    assert.strictEqual(r.data.added, 1); assert.strictEqual(r.data.skipped, 3);
    assert.deepStrictEqual(r.data.errors.map((e) => e.row), [2, 3, 4]);
    const all = (await owner.req('GET', `/api/invitations/${inv}/guests`)).data.guests;
    const wati = all.find((g) => g.name === 'Wati'); assert.strictEqual(wati.kind, 'private');
    await owner.req('POST', `/api/invitations/${inv}/guests/bulk`, { action: 'delete', ids: [wati.id] });
    guests = (await owner.req('GET', `/api/invitations/${inv}/guests`)).data.guests;
    assert.strictEqual(guests.length, 3);
  });

  await test('ekspor Excel: berkas .xlsx valid, sel berupa teks (bukan rumus), impor ulang memperbarui bukan menggandakan', async () => {
    const res = await fetch(base + `/api/invitations/${inv}/export/guests.xlsx`, { headers: { Cookie: owner.cookie } });
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('spreadsheetml'));
    const buf = Buffer.from(await res.arrayBuffer());
    assert.strictEqual(buf.subarray(0, 2).toString(), 'PK');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Tamu');
    assert.deepStrictEqual(ws.getRow(1).values.slice(1, 9), ['Nama', 'Grup', 'Telepon / WhatsApp', 'Jumlah', 'Jenis', 'Versi', 'Meja', 'Kode (jangan diubah)']);
    let formula = null;
    ws.eachRow((row) => { const v = row.getCell(1).value; if (typeof v === 'string' && v.startsWith('=HYPERLINK')) formula = v; else if (v && typeof v === 'object' && v.formula) formula = 'RUMUS'; });
    assert.strictEqual(formula, '=HYPERLINK("http://x")', 'harus tersimpan sebagai teks, bukan rumus');
    assert.ok(wb.getWorksheet('Petunjuk'));
    // ubah satu nama di Excel lalu impor ulang
    ws.eachRow((row, n) => { if (n > 1 && row.getCell(1).value === 'Budi Santoso') row.getCell(1).value = 'Budi S. Santoso'; });
    const edited = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await upload(edited);
    assert.strictEqual(r.data.added, 0); assert.strictEqual(r.data.updated, 3);
    guests = (await owner.req('GET', `/api/invitations/${inv}/guests`)).data.guests;
    assert.strictEqual(guests.length, 3); assert.ok(guests.some((g) => g.name === 'Budi S. Santoso'));
    const renamed = guests.find((g) => g.name === 'Budi S. Santoso');
    await owner.req('PUT', `/api/invitations/${inv}/guests/${renamed.id}`, { name: 'Budi Santoso', group_name: 'Keluarga', phone: '081234567890', pax_limit: 3 });
    guests = (await owner.req('GET', `/api/invitations/${inv}/guests`)).data.guests;
    const tpl = await fetch(base + `/api/invitations/${inv}/guests/template.xlsx`, { headers: { Cookie: owner.cookie } });
    assert.strictEqual(tpl.status, 200);
    // CSV sudah tidak tersedia
    assert.strictEqual((await owner.req('GET', `/api/invitations/${inv}/export/guests.csv`)).status, 404);
  });

  await test('versi undangan: VIP dan reguler berbeda template, teks, sesi acara & bagian — per tamu', async () => {
    const g = (await owner.req('GET', `/api/invitations/${inv}`)).data.invitation;
    g.versions = [
      { name: 'VIP', badge: 'VIP Guest', theme: 'royal-book', cover: { subtitle: 'Khusus tamu VIP', title: '', label: '', buttonText: '', photo: '' }, limitEvents: true, eventIdx: [0], note: { title: 'Info VIP', text: 'Parkir khusus lobi utama' }, sections: { gifts: 'off' } },
      { name: 'standar', badge: '', theme: 'confetti-pop' },
      { name: 'Keluarga,"X', badge: '', opener: 'iris', closingText: 'Terima kasih keluarga tercinta' },
    ];
    const put = await owner.req('PUT', `/api/invitations/${inv}`, g);
    assert.strictEqual(put.status, 200, JSON.stringify(put.data));
    const v = put.data.invitation.versions;
    assert.strictEqual(v.length, 3); assert.ok(v.every((x) => /^v[a-z0-9]{4,12}$/.test(x.id)));
    assert.strictEqual(v[0].name, 'VIP'); assert.strictEqual(v[1].name, 'standar 2', 'nama "Standar" dicadangkan untuk versi utama');
    assert.strictEqual(v[1].theme, '', 'template jenis lain ditolak'); assert.ok(!/[,"]/.test(v[2].name));
    vip = v[0];

    const [budi, ani] = [guests.find((x) => x.name === 'Budi Santoso'), guests.find((x) => x.name === 'Ani Lestari')];
    let r = await owner.req('PUT', `/api/invitations/${inv}/guests/${budi.id}`, { name: budi.name, group_name: 'Keluarga', pax_limit: 3, version_id: vip.id });
    assert.strictEqual(r.data.guest.version_id, vip.id);
    r = await owner.req('PUT', `/api/invitations/${inv}/guests/${ani.id}`, { name: ani.name, pax_limit: 2, version_id: 'vtidakada' });
    assert.strictEqual(r.data.guest.version_id, '', 'versi tidak dikenal diabaikan');

    const vp = (await anon.req('GET', `/${slug}?to=${budi.code}`)).data;
    assert.ok(vp.includes('theme-royal-book') && vp.includes('op-book') && vp.includes('VIP Guest') && vp.includes('Khusus tamu VIP') && vp.includes('Parkir khusus lobi utama'));
    assert.ok(vp.includes('Akad Nikah') && !vp.includes('>Resepsi<'), 'VIP hanya melihat sesi yang dipilih');
    assert.ok(!vp.includes('1234567890'), 'bagian hadiah disembunyikan untuk VIP');
    const rp = (await anon.req('GET', `/${slug}?to=${ani.code}`)).data;
    assert.ok(rp.includes('theme-glass-rose') && !rp.includes('VIP Guest') && rp.includes('>Resepsi<') && rp.includes('1234567890'));
    const pub = (await anon.req('GET', `/${slug}`)).data;
    assert.ok(!pub.includes('VIP Guest') && pub.includes('theme-glass-rose'), 'link umum = versi standar');
    // pratinjau pemilik per versi
    const pv = (await owner.req('GET', `/preview/${inv}?version=${vip.id}`)).data;
    assert.ok(pv.includes('VIP Guest') && pv.includes('Mode pratinjau'));
    assert.ok(!(await owner.req('GET', `/preview/${inv}?version=ngawur`)).data.includes('VIP Guest'));
    assert.ok((await owner.req('GET', `/preview/${inv}?demo=1`)).data.includes('id="opener"'));
    assert.ok((await owner.req('GET', `/preview/${inv}?guest=${budi.id}`)).data.includes('VIP Guest'));

    // Excel: kolom Versi berisi nama versi, daftar pilihan memuat versi; impor memetakan nama -> versi
    const res = await fetch(base + `/api/invitations/${inv}/export/guests.xlsx`, { headers: { Cookie: owner.cookie } });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
    const ws = wb.getWorksheet('Tamu'); let budiRow; ws.eachRow((row) => { if (row.getCell(1).value === 'Budi Santoso') budiRow = row; });
    assert.strictEqual(budiRow.getCell(6).value, 'VIP');
    assert.ok(String(ws.getCell('F2').dataValidation.formulae[0]).includes('VIP'));
    r = await upload(await xlsx([['Nama', 'Versi'], ['Tamu VIP Baru', 'vip'], ['Tamu Biasa', 'Standar']]));
    assert.strictEqual(r.data.added, 2);
    let all = (await owner.req('GET', `/api/invitations/${inv}/guests`)).data.guests;
    assert.strictEqual(all.find((x) => x.name === 'Tamu VIP Baru').version_id, vip.id);
    assert.strictEqual(all.find((x) => x.name === 'Tamu Biasa').version_id, '');

    // aksi massal: ganti versi, lalu hapus tamu uji
    const extra = all.filter((x) => x.name.startsWith('Tamu '));
    r = await owner.req('POST', `/api/invitations/${inv}/guests/bulk`, { action: 'version', ids: extra.map((x) => x.id), version_id: v[2].id });
    assert.strictEqual(r.data.affected, 2);
    assert.strictEqual((await owner.req('POST', `/api/invitations/${inv}/guests/bulk`, { action: 'version', ids: [extra[0].id], version_id: 'vxxxx' })).status, 400);
    assert.strictEqual((await owner.req('POST', `/api/invitations/${inv}/guests/bulk`, { action: 'version', ids: [] })).status, 400);
    const kel = (await anon.req('GET', `/${slug}?to=${extra[0].code}`)).data;
    assert.ok(kel.includes('op-iris') && kel.includes('Terima kasih keluarga tercinta'));
    await owner.req('POST', `/api/invitations/${inv}/guests/bulk`, { action: 'delete', ids: extra.map((x) => x.id) });

    // menghapus versi: tamu kembali ke Standar
    const g2 = (await owner.req('GET', `/api/invitations/${inv}`)).data.invitation;
    g2.versions = g2.versions.filter((x) => x.id !== vip.id);
    await owner.req('PUT', `/api/invitations/${inv}`, g2);
    all = (await owner.req('GET', `/api/invitations/${inv}/guests`)).data.guests;
    assert.strictEqual(all.find((x) => x.name === 'Budi Santoso').version_id, '');
    assert.ok(!(await anon.req('GET', `/${slug}?to=${budi.code}`)).data.includes('VIP Guest'));
    guests = all;
    g2.versions = []; await owner.req('PUT', `/api/invitations/${inv}`, g2);
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

  await test('kalender .ics', async () => {
    const ics = await anon.req('GET', `/${slug}/calendar.ics?e=0`);
    assert.strictEqual(ics.status, 200); assert.ok(ics.data.includes('BEGIN:VEVENT'));
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
    for (const [m, p] of [['GET', `/api/invitations/${inv}`], ['GET', `/api/invitations/${inv}/guests`], ['GET', `/api/invitations/${inv}/rsvps`], ['PUT', `/api/invitations/${inv}`], ['DELETE', `/api/invitations/${inv}`], ['GET', `/api/invitations/${inv}/export/guests.xlsx`], ['GET', `/api/invitations/${inv}/guests/template.xlsx`], ['POST', `/api/invitations/${inv}/guests/bulk`]]) {
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
