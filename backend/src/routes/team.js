const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { required, roles } = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { normEmail } = require('../utils/normalize');

router.use(required, roles('admin', 'manager'));
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const ROLES = ['admin', 'manager', 'employee'];

router.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, COUNT(l.id) AS assigned_leads,
       COALESCE(SUM(s.name = 'Converted'), 0) AS converted_leads
     FROM users u LEFT JOIN leads l ON l.assigned_to = u.id LEFT JOIN lead_statuses s ON s.id = l.status_id
     GROUP BY u.id ORDER BY u.name`);
  res.json({ success: true, data: rows.map((u) => {
    const a = Number(u.assigned_leads), c = Number(u.converted_leads);
    return { ...u, is_active: !!u.is_active, assigned_leads: a, converted_leads: c, conversion_rate: a ? Math.round((c / a) * 1000) / 10 : 0 };
  }) });
}));

// For "assign lead" dropdowns
router.get('/options', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM users WHERE is_active = 1 ORDER BY name');
  res.json({ success: true, data: rows });
}));

router.post('/', roles('admin'), wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normEmail(req.body.email);
  const password = String(req.body.password || '');
  const role = req.body.role || 'employee';
  if (!name || !email) throw httpErr(400, 'Name and a valid email are required');
  if (password.length < 8) throw httpErr(400, 'Password must be at least 8 characters');
  if (!ROLES.includes(role)) throw httpErr(400, 'Invalid role');
  try {
    const [r] = await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
      [name, email, await bcrypt.hash(password, 12), role]);
    res.status(201).json({ success: true, message: 'User added successfully', id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw httpErr(409, 'A user with this email already exists');
    throw e;
  }
}));

// Edit user / deactivate (is_active:false) / reset password
router.put('/:id', roles('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!rows[0]) throw httpErr(404, 'User not found');
  const b = req.body || {};
  const set = {};
  if (b.name != null) set.name = String(b.name).trim();
  if (b.role != null) { if (!ROLES.includes(b.role)) throw httpErr(400, 'Invalid role'); set.role = b.role; }
  if (b.is_active != null) set.is_active = b.is_active ? 1 : 0;
  if (b.password) { if (String(b.password).length < 8) throw httpErr(400, 'Password must be at least 8 characters'); set.password_hash = await bcrypt.hash(String(b.password), 12); }
  if (id === req.user.id && (set.is_active === 0 || (set.role && set.role !== 'admin'))) throw httpErr(400, 'You cannot deactivate or demote your own account');
  const keys = Object.keys(set);
  if (!keys.length) throw httpErr(400, 'Nothing to update');
  await pool.query(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => set[k]), id]);
  res.json({ success: true, message: 'User updated successfully' });
}));

module.exports = router;
