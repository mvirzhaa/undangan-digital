const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { setAuthCookie, clearAuthCookie, requireAuth, rateLimit } = require('../auth');
const { str } = require('../lib/sanitize');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, message: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.' });
const DUMMY_HASH = bcrypt.hashSync('dummy-password-untuk-waktu-konstan', 10);

router.post('/register', limiter, async (req, res) => {
  const name = str(req.body.name, 120).trim();
  const email = str(req.body.email, 190).trim().toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (name.length < 2) return res.status(400).json({ error: 'Nama minimal 2 karakter.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Format email tidak valid.' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Kata sandi 8–72 karakter.' });

  const hash = await bcrypt.hash(password, 10);
  try {
    const r = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hash],
    );
    setAuthCookie(res, r.rows[0]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email sudah terdaftar.' });
    throw err;
  }
});

router.post('/login', limiter, async (req, res) => {
  const email = str(req.body.email, 190).trim().toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const r = await query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email]);
  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Email atau kata sandi salah.' });
  setAuthCookie(res, user);
  res.json({ ok: true });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
