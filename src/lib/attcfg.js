// Pengaturan presensi & galeri (tanpa akses database agar bisa dipakai di sanitasi).
const ACCESS = ['contributors', 'guests', 'public'];
const BOOTH_SHARE = ['own', 'all'];

// Bawaan aman: unggahan swafoto & photobooth tertutup sampai dinyalakan penyelenggara.
function attendanceCfg(settings) {
  const a = (settings && typeof settings.attendance === 'object' && settings.attendance) || {};
  return {
    photobooth: a.photobooth === true,
    selfie: a.selfie === true,
    galleryAccess: ACCESS.includes(a.galleryAccess) ? a.galleryAccess : 'contributors',
    boothShare: BOOTH_SHARE.includes(a.boothShare) ? a.boothShare : 'own',
  };
}

module.exports = { attendanceCfg, ACCESS, BOOTH_SHARE };
