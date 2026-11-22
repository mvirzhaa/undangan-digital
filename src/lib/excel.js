// Impor & ekspor daftar tamu / RSVP dalam format Excel (.xlsx).
const ExcelJS = require('exceljs');
const S = require('./sanitize');
const { DEFAULT_NAME } = require('./versions');

const MAX_FILE = 2 * 1024 * 1024;          // ukuran berkas unggahan
const MAX_UNZIPPED = 40 * 1024 * 1024;     // total isi setelah diekstrak (cegah zip bomb)
const MAX_ROWS = 1000;                     // baris data per impor
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const KIND_TO_LABEL = { individual: 'Individu', group: 'Grup', private: 'Privat' };
const LABEL_TO_KIND = {
  individu: 'individual', individual: 'individual', perorangan: 'individual',
  grup: 'group', group: 'group', keluarga: 'group', rombongan: 'group',
  privat: 'private', private: 'private',
};
const STATUS_LABEL = { hadir: 'Hadir', tidak: 'Tidak hadir', ragu: 'Belum pasti' };

// Nama kolom yang dikenali saat impor (huruf kecil, tanpa tanda baca).
const HEADER_ALIASES = {
  name: ['nama', 'name', 'nama tamu', 'tamu'],
  group_name: ['grup', 'group', 'kelompok', 'kategori'],
  phone: ['telepon', 'telp', 'hp', 'no hp', 'wa', 'whatsapp', 'no whatsapp', 'nomor whatsapp', 'phone', 'telepon whatsapp'],
  pax_limit: ['jumlah', 'jumlah tamu', 'pax', 'qty', 'jml'],
  kind: ['jenis', 'tipe', 'kind', 'type'],
  version: ['versi', 'versi undangan', 'version', 'tipe undangan'],
  table_name: ['meja', 'table', 'nomor meja'],
  code: ['kode', 'code', 'kode tamu', 'kode jangan diubah'],
};

// ---- pemeriksaan berkas ----
function checkXlsxBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 100) throw new Error('Berkas kosong atau rusak.');
  if (buf.length > MAX_FILE) throw new Error('Ukuran berkas maksimal 2 MB.');
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('Berkas bukan Excel (.xlsx). Simpan dulu sebagai "Excel Workbook (.xlsx)".');

  // Baca direktori pusat zip untuk menjumlah ukuran setelah diekstrak, tanpa mengekstrak.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Berkas Excel rusak.');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || off === 0xffffffff) throw new Error('Berkas Excel tidak didukung.');
  if (count > 300) throw new Error('Berkas Excel tidak valid.');
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) throw new Error('Berkas Excel rusak.');
    const size = buf.readUInt32LE(off + 24);
    if (size === 0xffffffff) throw new Error('Berkas Excel tidak didukung.');
    total += size;
    if (total > MAX_UNZIPPED) throw new Error('Isi berkas terlalu besar.');
    off += 46 + buf.readUInt16LE(off + 28) + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32);
  }
}

// ---- membaca sel ----
function cellText(cell) {
  let v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if (v.error) return '';
    if ('result' in v) v = v.result;
    else if (v.text !== undefined) v = v.text;
    else return '';
    if (v && typeof v === 'object') return v.richText ? v.richText.map((r) => r.text).join('').trim() : '';
  }
  return String(v === null || v === undefined ? '' : v).trim();
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function mapHeaders(row) {
  const map = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const h = norm(cellText(cell));
    Object.keys(HEADER_ALIASES).forEach((key) => {
      if (!map[key] && HEADER_ALIASES[key].includes(h)) map[key] = col;
    });
  });
  return map;
}

// Mengembalikan { rows, errors }. versions = daftar versi undangan untuk memetakan nama -> id.
async function parseGuestsXlsx(buffer, versions = []) {
  checkXlsxBuffer(buffer);
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (_e) { throw new Error('Berkas Excel tidak dapat dibaca.'); }
  const ws = wb.getWorksheet('Tamu') || wb.worksheets[0];
  if (!ws) throw new Error('Berkas Excel tidak berisi lembar kerja.');

  // Cari baris judul kolom di 10 baris pertama.
  let headerRow = 0; let cols = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const m = mapHeaders(ws.getRow(r));
    if (m.name) { headerRow = r; cols = m; break; }
  }
  if (!headerRow) throw new Error('Kolom "Nama" tidak ditemukan. Pakai template dari tombol "Unduh template".');
  if (ws.rowCount - headerRow > MAX_ROWS + 200) throw new Error(`Maksimal ${MAX_ROWS} baris per impor.`);

  const byName = new Map(versions.map((v) => [v.name.toLowerCase(), v.id]));
  const rows = []; const errors = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const get = (k) => (cols[k] ? cellText(row.getCell(cols[k])) : '');
    const name = S.str(get('name'), 160).trim();
    const any = Object.keys(cols).some((k) => get(k));
    if (!any) continue; // baris kosong
    if (!name) { errors.push({ row: r, message: 'Nama kosong' }); continue; }
    if (rows.length >= MAX_ROWS) { errors.push({ row: r, message: `Melebihi batas ${MAX_ROWS} baris` }); continue; }

    let phone = get('phone');
    if (cols.phone && typeof row.getCell(cols.phone).value === 'number' && /^8\d{8,12}$/.test(phone)) phone = `0${phone}`; // Excel membuang angka 0 di depan

    const kindRaw = norm(get('kind'));
    if (kindRaw && !LABEL_TO_KIND[kindRaw]) { errors.push({ row: r, message: `Jenis "${get('kind')}" tidak dikenal (pakai Individu/Grup/Privat)` }); continue; }

    const verRaw = get('version');
    let versionId = '';
    if (verRaw && verRaw.toLowerCase() !== DEFAULT_NAME.toLowerCase()) {
      versionId = byName.get(verRaw.toLowerCase()) || '';
      if (!versionId) { errors.push({ row: r, message: `Versi "${verRaw}" belum dibuat di menu Versi undangan` }); continue; }
    }

    const paxRaw = get('pax_limit');
    const pax = paxRaw ? parseInt(paxRaw, 10) : 1;
    if (paxRaw && (!Number.isFinite(pax) || pax < 1 || pax > 50)) { errors.push({ row: r, message: 'Jumlah harus 1–50' }); continue; }

    rows.push({
      row: r,
      name,
      group_name: S.str(get('group_name'), 80).trim(),
      phone: S.str(phone, 30).replace(/[^\d+]/g, ''),
      pax_limit: pax || 1,
      kind: LABEL_TO_KIND[kindRaw] || 'individual',
      version_id: versionId,
      table_name: S.str(get('table_name'), 60).trim(),
      code: S.str(get('code'), 16).trim().toLowerCase(),
    });
  }
  return { rows, errors };
}

// ---- membuat berkas ----
function styleHeader(ws, widths) {
  ws.columns = widths.map(([header, width]) => ({ header, width }));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8E3B53' } };
  h.alignment = { vertical: 'middle' };
  h.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function guideSheet(wb, lines) {
  const g = wb.addWorksheet('Petunjuk');
  g.getColumn(1).width = 110;
  lines.forEach((l, i) => {
    const c = g.getCell(i + 1, 1);
    c.value = l;
    c.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0) c.font = { bold: true, size: 14 };
  });
}

function addGuestValidations(ws, versions, lastRow) {
  const names = [DEFAULT_NAME].concat(versions.map((v) => v.name));
  for (let r = 2; r <= lastRow; r += 1) {
    ws.getCell(`D${r}`).dataValidation = { type: 'whole', operator: 'between', formulae: [1, 50], allowBlank: true, showErrorMessage: true, errorTitle: 'Jumlah', error: 'Isi angka 1–50.' };
    ws.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Individu,Grup,Privat"'], showErrorMessage: true, errorTitle: 'Jenis', error: 'Pilih Individu, Grup, atau Privat.' };
    ws.getCell(`F${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${names.join(',')}"`], showErrorMessage: true, errorTitle: 'Versi', error: 'Pilih salah satu versi yang tersedia.' };
    ws.getCell(`C${r}`).numFmt = '@'; // telepon sebagai teks agar angka 0 di depan tetap
  }
}

const GUEST_COLS = [['Nama', 30], ['Grup', 18], ['Telepon / WhatsApp', 20], ['Jumlah', 10], ['Jenis', 12], ['Versi', 16], ['Meja', 12], ['Kode (jangan diubah)', 18], ['Link undangan', 48], ['Status', 14]];

function guestGuide(versions) {
  return [
    'Petunjuk pengisian daftar tamu',
    'Kolom wajib: Nama. Kolom lain boleh dikosongkan.',
    'Telepon / WhatsApp: tulis dengan 0 atau 62 di depan, mis. 081234567890.',
    'Jumlah: batas jumlah orang yang boleh dibawa tamu (1–50). Kosong = 1.',
    'Jenis: pilih Individu, Grup, atau Privat dari daftar.',
    `Versi: pilih versi undangan untuk tamu ini (${[DEFAULT_NAME].concat(versions.map((v) => v.name)).join(', ')}). Kosong = ${DEFAULT_NAME}. Versi dibuat di menu "Versi undangan" pada editor.`,
    'Kode & Link: dibuat otomatis oleh sistem. Biarkan kolom Kode apa adanya jika Anda mengimpor ulang berkas hasil ekspor — tamu dengan kode yang sama akan DIPERBARUI, bukan dobel.',
    'Status: hanya informasi dari sistem, diabaikan saat impor.',
    'Simpan sebagai .xlsx lalu unggah lewat tombol "Impor Excel". Maksimal 1000 baris dan 2 MB per impor.',
  ];
}

async function toBuffer(wb) { return Buffer.from(await wb.xlsx.writeBuffer()); }

async function buildGuestsWorkbook({ guests, versions, baseUrl, slug, withData = true }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Undangan Digital';
  const ws = wb.addWorksheet('Tamu');
  styleHeader(ws, GUEST_COLS);
  const vname = new Map(versions.map((v) => [v.id, v.name]));
  if (withData) {
    guests.forEach((g) => {
      let status = 'Belum dibuka';
      if (g.checked_in_at) status = 'Check-in';
      else if (g.attendance) status = STATUS_LABEL[g.attendance];
      else if (g.opened_at) status = 'Dibuka';
      const row = ws.addRow([g.name, g.group_name, g.phone, g.pax_limit, KIND_TO_LABEL[g.kind] || 'Individu',
        vname.get(g.version_id) || DEFAULT_NAME, g.table_name, g.code, `${baseUrl}/${slug}?to=${g.code}`, status]);
      row.getCell(3).numFmt = '@';
      row.getCell(8).font = { color: { argb: 'FF888888' } };
      row.getCell(9).font = { color: { argb: 'FF888888' } };
      row.getCell(10).font = { color: { argb: 'FF888888' } };
    });
  } else {
    [['Budi Santoso', 'Keluarga', '081234567890', 2, 'Individu', versions[0] ? versions[0].name : DEFAULT_NAME, 'Meja 1'],
      ['Ani Lestari', 'Rekan kerja', '', 1, 'Individu', DEFAULT_NAME, ''],
      ['Keluarga Hartono', 'Keluarga', '', 4, 'Grup', DEFAULT_NAME, 'Meja 2']].forEach((r) => ws.addRow(r).getCell(3).numFmt = '@');
  }
  ws.autoFilter = { from: 'A1', to: 'J1' };
  addGuestValidations(ws, versions, Math.max(guests.length, 3) + 300);
  guideSheet(wb, guestGuide(versions));
  return toBuffer(wb);
}

async function buildRsvpWorkbook(rsvps) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Undangan Digital';
  const ws = wb.addWorksheet('RSVP');
  styleHeader(ws, [['Nama', 30], ['Kehadiran', 14], ['Jumlah', 10], ['Menu', 20], ['Catatan', 40], ['Waktu', 20]]);
  rsvps.forEach((x) => ws.addRow([x.name, STATUS_LABEL[x.attendance] || x.attendance, x.pax, x.menu, x.note, x.created_at]));
  ws.getColumn(6).numFmt = 'yyyy-mm-dd hh:mm';
  ws.autoFilter = { from: 'A1', to: 'F1' };
  return toBuffer(wb);
}

module.exports = { parseGuestsXlsx, buildGuestsWorkbook, buildRsvpWorkbook, checkXlsxBuffer, XLSX_MIME, MAX_FILE, MAX_ROWS, KIND_TO_LABEL };
