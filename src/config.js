require('dotenv').config({ quiet: true });

const isProd = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-ubah-di-production';

if (isProd && (jwtSecret.length < 32 || jwtSecret.startsWith('dev-secret') || jwtSecret.startsWith('ganti-'))) {
  throw new Error('JWT_SECRET wajib diatur (minimal 32 karakter) saat NODE_ENV=production');
}

const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
let basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
if (!basePath && baseUrl) {
  try {
    const u = new URL(baseUrl);
    if (u.pathname && u.pathname !== '/') {
      basePath = u.pathname.replace(/\/$/, '');
    }
  } catch (_) {}
}

module.exports = {
  isProd,
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://undangan:undangan123@localhost:5432/undangan_digital',
  jwtSecret,
  baseUrl,
  basePath,
  cookieName: process.env.COOKIE_NAME || 'token',
};
