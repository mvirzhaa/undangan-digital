# Undangan Digital

Pembuat undangan website untuk **pernikahan, lamaran, ulang tahun, gala (mis. Met Gala), dan acara lainnya**.
Struktur dashboard meniru alur layanan sejenis: **Dasbor · Tampilan · Isi · Versi undangan · Tamu · Pengaturan**, lengkap dengan pratinjau langsung dan halaman undangan publik.

Stack: **Node.js (Express 5) + PostgreSQL**, tampilan dirender di server dengan EJS, JavaScript murni di browser (tanpa build step).

## Fitur

| Area | Isi |
|---|---|
| Akun | Daftar/masuk (bcrypt + JWT di cookie httpOnly), setiap akun hanya melihat undangannya sendiri |
| Jenis acara | Pernikahan, Lamaran, Ulang Tahun, Gala/Acara Formal, Lainnya. **Isian di menu Isi berbeda per jenis** (mis. pernikahan: mempelai, turut mengundang, cerita cinta, amplop digital; ulang tahun: rangkaian acara, wishlist, info penting; gala: susunan acara, pengisi acara, sponsor, info akses; lainnya: agenda & info) |
| Template | **11 template**, tiap jenis punya template sendiri: pernikahan 3 (Glass Rose, Royal Book, Sage Garden), lamaran 2 (Ivory Minimal, Terracotta Boho), ulang tahun 2 (Confetti Pop, Neon Night), gala 2 (Noir Gold, Velvet Night), lainnya 2 (Corporate Slate, Sunny Fest). 11 palet warna + warna kustom, 12 font |
| Animasi pembuka | 7 animasi CSS 3D saat tamu menekan tombol buka: **amplop, buku terbuka, kartu membalik (flip), pintu ganda, tirai panggung, lingkaran membuka, kerai/shutter**. Tiap template punya bawaan, bisa diganti/dimatikan, ada tombol "Coba animasi". Efek latar: kelopak, kilau, konfeti, gelembung. Menghormati "kurangi gerakan" |
| Versi undangan | Buat beberapa versi (mis. **VIP** dan reguler) dengan template, warna, animasi, teks sampul/penutup, sesi acara, catatan khusus, dan bagian berbeda. Tamu diberi versi satu per satu, massal (centang), atau lewat kolom `Versi` di Excel; link personalnya otomatis menampilkan versinya |
| Pembuka pernikahan | **QS. Ar-Rum: 21** (Arab + terjemahan Indonesia) terisi bawaan; teks Arab dan terjemahan masing-masing bisa dipakai atau dimatikan, dan bisa dipulihkan dengan satu tombol |
| Isi | Sampul + foto, kata pembuka, profil penyelenggara/mempelai, sesi acara (tanggal, zona WIB/WITA/WIT, peta Google), cerita, galeri, dresscode, hadiah (rekening/QRIS/alamat), musik latar, penutup |
| Tamu | Daftar tamu + link personal (`/slug?to=kode`), **impor/ekspor Excel (.xlsx)** (template berisi dropdown Jenis & Versi, impor ulang memperbarui tamu lewat kolom Kode), tombol WhatsApp, kartu QR, RSVP (hadir/tidak/belum pasti, jumlah, pilihan menu), buku ucapan dengan moderasi, check-in hari-H |
| Undangan publik | Sampul dengan nama tamu, hitung mundur, simpan ke kalender (.ics), peta, galeri + lightbox, RSVP, ucapan, salin rekening, musik, mode privat, dua bahasa label (ID/EN), tampil 2 kolom di desktop |
| Pengaturan | Ganti alamat link, aktif/nonaktif, mode privat, tombol bagian, batas RSVP, duplikat & hapus undangan |

## Menjalankan

Prasyarat: Node.js ≥ 18 dan PostgreSQL ≥ 13.

```bash
# 1. Database (pilih salah satu)
docker compose up -d                       # PostgreSQL siap pakai, atau:
createuser undangan -P && createdb -O undangan undangan_digital

# 2. Aplikasi
cp .env.example .env                       # sesuaikan DATABASE_URL dan JWT_SECRET
npm install
npm run migrate                            # membuat tabel
npm run seed                               # (opsional) akun demo: demo@example.com / demo12345
npm start                                  # http://localhost:3000
```

**Sudah punya data dari versi sebelumnya?** Jalankan `npm run migrate` lagi (menambah kolom `versions` dan `version_id`, serta mengganti nama template lama; aman diulang).

Uji otomatis (27 skenario end-to-end termasuk keamanan, Excel, versi, dan template): `npm test` (membuat lalu menghapus data uji sendiri).

## Struktur proyek

```
db/schema.sql            Skema PostgreSQL (users, invitations, guests, rsvps, wishes)
scripts/                 migrate, seed, smoke-test
src/server.js            Aplikasi Express (helmet + CSP, static, rute)
src/routes/auth.js       Daftar / masuk / keluar
src/routes/invitations.js API pemilik: undangan, tamu, RSVP, ucapan, unggah, check-in, ekspor
src/routes/public.js     Halaman /:slug, RSVP & ucapan publik, kalender .ics
src/routes/pages.js      Landing, login, dashboard, editor, pratinjau
src/lib/themes.js        Jenis acara (menu & bagian per jenis), 11 template, animasi, efek, teks Ar-Rum 21
src/lib/versions.js      Versi undangan (sanitasi + penggabungan override per tamu)
src/lib/excel.js         Impor/ekspor .xlsx (ExcelJS), pemeriksaan berkas & anti zip-bomb
src/lib/defaults.js      Isi awal per jenis acara
src/lib/sanitize.js      Validasi/pembersihan semua input editor
src/lib/render.js        View model halaman undangan
views/                   Template EJS (invitation.ejs = undangan publik)
public/css, public/js    Gaya & JavaScript (openers.css = animasi pembuka & efek; editor.js = editor dashboard)
```

### Model data

Isi undangan disimpan sebagai **JSONB** (`content`, `settings`, `colors`, `fonts`) sehingga menambah bagian/field baru tidak perlu migrasi. Tamu, RSVP, dan ucapan adalah tabel relasional agar bisa dicari, dihitung, dan diekspor.

### Rute utama

- Halaman: `/` · `/login` · `/register` · `/dashboard` · `/editor/:id?main_menu=data&form=cover` · `/preview/:id` · `/:slug` (undangan publik, `?to=kode` untuk tamu)
- API pemilik (`/api/...`, wajib login): `invitations` (CRUD, `duplicate`, `upload`, `stats`), `invitations/:id/guests` (+`import`, `qr.svg`, `checkin`), `rsvps`, `wishes`, `guests/import` (.xlsx), `guests/bulk`, `guests/template.xlsx`, `export/guests.xlsx`, `export/rsvps.xlsx`
- API tamu (`/api/public/:slug/...`): `POST rsvp`, `POST wish`, `GET wishes`

## Keamanan (yang sudah diterapkan)

- Semua input editor dibersihkan di server (`sanitize.js`): URL hanya `https://` atau `/uploads/…`, warna heks, font dari daftar putih, panjang dibatasi.
- Template EJS meng-*escape* semua teks; JSON di halaman disisipkan dengan escape `<`; CSP ketat (`script-src 'self'`).
- Cookie sesi `httpOnly` + `SameSite=Lax` (`Secure` saat `NODE_ENV=production`); kata sandi di-hash bcrypt.
- Setiap query undangan/tamu/RSVP dibatasi `user_id` pemilik (pengguna lain mendapat 404).
- Unggahan: hanya JPG/PNG/WebP/GIF (gambar) atau MP3/OGG/WAV/M4A (musik), diperiksa *magic bytes*, nama file acak, SVG ditolak.
- Pembatas laju untuk login/daftar dan kiriman RSVP/ucapan publik; impor Excel dibatasi 2 MB / 1000 baris, memeriksa tanda tangan zip dan total ukuran setelah diekstrak, dan ekspor menyimpan isi sel sebagai teks (bukan rumus).

## Menuju production

1. Set `NODE_ENV=production`, `JWT_SECRET` acak ≥ 32 karakter, `BASE_URL` domain Anda, dan jalankan di belakang HTTPS (nginx/Caddy). `trust proxy` sudah aktif.
2. Simpan `public/uploads` di volume persisten atau pindahkan ke object storage (S3/R2) bila memakai banyak instance.
3. Pembatas laju bersifat di memori (per proses). Untuk banyak instance, pindahkan ke Redis.
4. Peta memakai embed Google Maps tanpa API key (`maps?q=…&output=embed`); font dari Google Fonts. Ganti bila perlu self-host.
5. Belum termasuk: pembayaran/paket berlangganan, reset kata sandi lewat email, pemindai QR kamera (check-in saat ini menerima kode/URL yang diketik atau dipindai pemindai barcode USB/ponsel), serta domain kustom per undangan.
