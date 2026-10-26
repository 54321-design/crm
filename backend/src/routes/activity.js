const router = require('express').Router();
const { pool } = require('../config/db');
const { required } = require('../middleware/auth');
const wrap = require('../utils/wrap');

router.use(required);

// GET /api/activity?type=&page=&limit=
router.get('/', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
  const w = ['1=1'], a = [];
  if (req.user.role === 'employee') { w.push('l.assigned_to = ?'); a.push(req.user.id); }
  if (req.query.type) { w.push('a.activity_type = ?'); a.push(String(req.query.type)); }
  const from = `FROM lead_activities a JOIN leads l ON l.id = a.lead_id LEFT JOIN users u ON u.id = a.user_id WHERE ${w.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, a);
  const [rows] = await pool.query(
    `SELECT a.id, a.lead_id, a.activity_type AS type, a.description, a.created_at, u.name AS user_name, l.person_name, l.company
     ${from} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...a, limit, (page - 1) * limit]);
  res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}));

module.exports = router;
