const jwt = require('jsonwebtoken');
const cfg = require('./config');

const COOKIE = cfg.cookieName || 'token';
const MAX_AGE = 7 * 24 * 3600 * 1000;

function signToken(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email }, cfg.jwtSecret, { expiresIn: '7d' });
}

function setAuthCookie(res, user) {
  res.cookie(COOKIE, signToken(user), {
    httpOnly: true, sameSite: 'lax', secure: cfg.isProd, maxAge: MAX_AGE, path: cfg.basePath || '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: cfg.basePath || '/' });
}

// Mengisi req.user bila token valid.
function attachUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) {
    try {
      const p = jwt.verify(token, cfg.jwtSecret);
      req.user = { id: p.id, name: p.name, email: p.email };
    } catch (_) { /* token tidak valid: abaikan */ }
  }
  next();
}

const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' });

const requirePage = (req, res, next) => (req.user ? next() : res.redirect((cfg.basePath || '') + '/login'));

// Pembatas laju sederhana di memori (cukup untuk satu instance).
function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Terlalu banyak permintaan, coba lagi nanti.' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let h = hits.get(k);
    if (!h || h.reset <= now) { h = { count: 0, reset: now + windowMs }; hits.set(k, h); }
    h.count += 1;
    if (h.count > max) return res.status(429).json({ error: message });
    next();
  };
}

module.exports = { setAuthCookie, clearAuthCookie, attachUser, requireAuth, requirePage, rateLimit };
