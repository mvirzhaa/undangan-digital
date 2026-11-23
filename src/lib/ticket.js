// Data "Tiket masuk" untuk halaman undangan tamu: QR pribadi, status presensi, tombol galeri.
const QRCode = require('qrcode');
const cfg = require('../config');
const { query } = require('../db');
const { attendanceCfg } = require('./attcfg');
const P = require('./photos');

const SAMPLE = { name: 'Nama Tamu', code: 'contoh123', checked_in_at: null, booth_at: null, id: 0 };

async function qrSvg(inv, code) {
  return QRCode.toString(`${cfg.baseUrl}/${inv.slug}?to=${code}`, { type: 'svg', margin: 1, width: 360, color: { dark: '#111111', light: '#ffffff' } });
}

// guest = baris tamu asli, atau null di pratinjau editor (maka ditampilkan contoh).
async function buildTicket(inv, guest, req, { preview = false } = {}) {
  const sample = !guest || !guest.code;
  if (sample && !preview) return null;
  const g = sample ? SAMPLE : guest;
  const a = attendanceCfg(inv.settings);
  const base = `${cfg.basePath || ''}/${inv.slug}`;
  const q = sample ? '' : `?to=${g.code}`;
  const out = {
    sample, name: g.name, code: g.code, svg: await qrSvg(inv, g.code),
    checkedIn: g.checked_in_at, boothAt: g.booth_at, booth: a.photobooth,
    downloadUrl: sample ? '' : `${base}/tiket.svg${q}`,
    selfieUrl: a.selfie ? `${base}/foto${q}` : '', galleryUrl: '', boothUrl: '',
  };
  if (sample) {
    out.galleryUrl = a.selfie ? `${base}/galeri` : '';
    out.boothUrl = a.photobooth ? `${base}/photobooth` : '';
    return out;
  }
  const v = await P.visitor(req, inv);
  v.guest = guest; // sudah divalidasi pada rute
  if (a.selfie && await P.canViewGallery(inv, v)) out.galleryUrl = `${base}/galeri${q}`;
  if (a.photobooth) {
    const r = await query(
      a.boothShare === 'all'
        ? `SELECT 1 FROM photos WHERE invitation_id = $1 AND kind = 'booth' LIMIT 1`
        : `SELECT 1 FROM photos WHERE invitation_id = $1 AND kind = 'booth' AND guest_id = $2 LIMIT 1`,
      a.boothShare === 'all' ? [inv.id] : [inv.id, g.id],
    );
    if (r.rowCount) out.boothUrl = `${base}/photobooth${q}`;
  }
  return out;
}

module.exports = { buildTicket, qrSvg };
