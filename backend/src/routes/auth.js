const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { normEmail } = require('../utils/normalize');

const attempts = new Map(); // ip -> { n, reset } : 10 tries per 15 minutes
function limited(ip) {
  const now = Date.now();
  const e = attempts.get(ip);
  if (!e || e.reset < now) { attempts.set(ip, { n: 1, reset: now + 15 * 60 * 1000 }); return false; }
  return ++e.n > 10;
}

router.post('/login', async (req, res, next) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ success: false, message: 'Too many attempts. Try again in a few minutes.' });
    const email = normEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ success: false, message: 'Incorrect email or password' });

    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET,
      { expiresIn: req.body.remember ? '30d' : '1d' });
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { next(e); }
});

router.get('/me', require('../middleware/auth').required, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ? AND is_active = 1', [req.user.id]);
    if (!rows[0]) return res.status(401).json({ success: false, message: 'Account not found' });
    res.json({ success: true, user: rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
