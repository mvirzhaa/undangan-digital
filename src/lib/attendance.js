// Presensi QR: pengaturan, pembacaan kode, dan pencatatan pindai (satu QR = satu kali per pos).
const { query } = require('../db');

const { attendanceCfg, ACCESS, BOOTH_SHARE } = require('./attcfg');

// Menerima kode mentah ("abc123xy") atau isi QR (link undangan ...?to=kode).
// Mengembalikan { code, slug } — slug terisi bila berupa link.
function parseScan(raw) {
  const s = String(raw == null ? '' : raw).trim().slice(0, 400);
  const m = s.match(/[?&]to=([a-z0-9]+)/i);
  if (m) {
    let slug = '';
    try { slug = new URL(s).pathname.split('/').filter(Boolean)[0] || ''; } catch (_) { /* bukan URL penuh */ }
    return { code: m[1].toLowerCase(), slug: slug.toLowerCase() };
  }
  return { code: /^[a-z0-9]{4,16}$/i.test(s) ? s.toLowerCase() : '', slug: '' };
}

const COL = { guestbook: 'checked_in_at', booth: 'booth_at' };

// station: 'guestbook' | 'booth'. Aman terhadap pindai ganda serentak (UPDATE ... WHERE kolom IS NULL).
// status: ok | duplicate | notfound | wrong | disabled | invalid
async function recordScan(inv, station, { code, guestId, pax, source = 'staff' } = {}) {
  if (!COL[station]) return { status: 'invalid' };
  if (station === 'booth' && !attendanceCfg(inv.settings).photobooth) return { status: 'disabled' };

  let guest = null;
  if (guestId != null && guestId !== '') {
    if (!/^\d+$/.test(String(guestId))) return { status: 'notfound' };
    guest = (await query('SELECT * FROM guests WHERE id = $1 AND invitation_id = $2', [guestId, inv.id])).rows[0];
  } else {
    const p = parseScan(code);
    if (p.slug && p.slug !== inv.slug) return { status: 'wrong' };
    if (!p.code) return { status: 'notfound' };
    guest = (await query('SELECT * FROM guests WHERE code = $1 AND invitation_id = $2', [p.code, inv.id])).rows[0];
    if (!guest) {
      const other = await query('SELECT 1 FROM guests WHERE code = $1', [p.code]);
      return { status: other.rowCount ? 'wrong' : 'notfound' };
    }
  }
  if (!guest) return { status: 'notfound' };

  let r;
  if (station === 'guestbook') {
    const n = Number.isInteger(pax) && pax >= 1 && pax <= 50 ? pax : guest.pax_limit;
    r = await query('UPDATE guests SET checked_in_at = now(), checked_in_pax = $1 WHERE id = $2 AND checked_in_at IS NULL RETURNING *', [n, guest.id]);
  } else {
    r = await query('UPDATE guests SET booth_at = now() WHERE id = $1 AND booth_at IS NULL RETURNING *', [guest.id]);
  }
  const ok = r.rowCount === 1;
  await query('INSERT INTO scan_log (invitation_id, guest_id, station, result, source) VALUES ($1,$2,$3,$4,$5)', [inv.id, guest.id, station, ok ? 'ok' : 'duplicate', source]);
  if (ok) return { status: 'ok', guest: r.rows[0] };
  const cur = (await query('SELECT * FROM guests WHERE id = $1', [guest.id])).rows[0];
  return { status: 'duplicate', guest: cur, at: cur[COL[station]] };
}

// Ringkasan angka untuk dasbor & pemindai.
async function attendanceStats(invId) {
  const g = await query(
    `SELECT count(*)::int AS total, coalesce(sum(pax_limit),0)::int AS pax_total,
            count(checked_in_at)::int AS checked_in, coalesce(sum(checked_in_pax),0)::int AS checked_in_pax,
            count(booth_at)::int AS booth FROM guests WHERE invitation_id = $1`, [invId]);
  const p = await query(`SELECT kind, count(*)::int AS n FROM photos WHERE invitation_id = $1 GROUP BY kind`, [invId]);
  const photos = { selfie: 0, booth: 0 };
  p.rows.forEach((x) => { photos[x.kind] = x.n; });
  return { ...g.rows[0], photos };
}

module.exports = { attendanceCfg, parseScan, recordScan, attendanceStats, ACCESS, BOOTH_SHARE };
