const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cfg = require('./config');
const { pool } = require('./db');
const { attachUser } = require('./auth');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

const csp = {
  useDefaults: true,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'https:'],
    mediaSrc: ["'self'", 'https:'],
    frameSrc: ["'self'", 'https://www.google.com'],
    connectSrc: ["'self'"],
    frameAncestors: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: cfg.isProd ? [] : null,
  },
};
app.use(helmet({ contentSecurityPolicy: csp, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);
app.use((req, res, next) => {
  res.locals.basePath = cfg.basePath;
  res.locals.baseUrl = cfg.baseUrl;
  next();
});

app.use(express.static(path.join(__dirname, '../public'), { maxAge: cfg.isProd ? '1h' : 0, index: false }));

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch (_) { res.status(503).json({ ok: false }); }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public').api);
app.use('/api', require('./routes/invitations'));
app.use('/', require('./routes/pages'));
app.use('/', require('./routes/public').pages); // /:slug harus terakhir

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Tidak ditemukan.' });
  return res.status(404).render('notice', { title: 'Halaman tidak ditemukan', text: 'Alamat yang Anda tuju tidak ada atau belum dipublikasikan.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  return res.status(500).render('notice', { title: 'Terjadi kesalahan', text: 'Silakan coba lagi beberapa saat lagi.' });
});

if (require.main === module) {
  app.listen(cfg.port, () => console.log(`Undangan Digital berjalan di ${cfg.baseUrl}`));
}

module.exports = app;
