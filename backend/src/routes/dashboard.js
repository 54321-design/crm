const router = require('express').Router();
const { pool } = require('../config/db');
const { required } = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { parseRange, prevRange, fmt } = require('../utils/range');
const A = require('../services/analytics');
const { LEAD_SELECT, LEAD_FROM } = require('../services/leadQuery');

router.use(required);
const limitOf = (q) => Math.min(50, Math.max(1, parseInt(q.limit, 10) || 8));

// GET /api/dashboard/stats?range=30d  -> KPI cards (with previous-period value) + funnel
router.get('/stats', wrap(async (req, res) => {
  const r = parseRange(req.query, '30d');
  const p = prevRange(r);
  const cur = await A.statusCounts(req.user, r);
  const prev = p ? await A.statusCounts(req.user, p) : null;
  const pick = (rows, s) => (rows ? rows.find((x) => x.status === s)?.count ?? 0 : null);
  const sum = (rows) => (rows ? rows.reduce((t, x) => t + x.count, 0) : null);
  const total = sum(cur), ptotal = sum(prev);
  const now = new Date();
  const count = async (from, to) => {
    const w = A.where(req.user, { from, to });
    const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM leads l WHERE ${w.sql}`, w.args);
    return Number(row.c);
  };
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  res.json({
    success: true,
    range: { key: r.key, from: r.from && fmt(r.from), to: fmt(r.to) },
    kpis: {
      totalLeads: { value: total, previous: ptotal },
      newLeads: { value: pick(cur, 'New'), previous: pick(prev, 'New') },
      qualifiedLeads: { value: pick(cur, 'Qualified'), previous: pick(prev, 'Qualified') },
      convertedLeads: { value: pick(cur, 'Converted'), previous: pick(prev, 'Converted') },
      lostLeads: { value: pick(cur, 'Lost'), previous: pick(prev, 'Lost') },
      conversionRate: { value: A.pct(pick(cur, 'Converted'), total), previous: prev ? A.pct(pick(prev, 'Converted'), ptotal) : null },
      leadsThisMonth: { value: await count(new Date(now.getFullYear(), now.getMonth(), 1), tomorrow),
        previous: await count(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)) },
    },
    funnel: cur.map((x) => ({ ...x, percent: A.pct(x.count, total) })),
  });
}));

// GET /api/dashboard/lead-trends?group=month|week|day&range=this_year
router.get('/lead-trends', wrap(async (req, res) => {
  const group = ['day', 'week', 'month'].includes(req.query.group) ? req.query.group : 'month';
  const r = parseRange(req.query, group === 'month' ? 'this_year' : '30d');
  res.json({ success: true, group, data: await A.trends(req.user, r, group) });
}));

router.get('/recent-leads', wrap(async (req, res) => {
  const a = [];
  let sc = '';
  if (req.user.role === 'employee') { sc = ' WHERE l.assigned_to = ?'; a.push(req.user.id); }
  const [rows] = await pool.query(`${LEAD_SELECT}${LEAD_FROM}${sc} ORDER BY l.id DESC LIMIT ?`, [...a, limitOf(req.query)]);
  res.json({ success: true, data: rows });
}));

router.get('/recent-activity', wrap(async (req, res) => {
  const a = [];
  let sc = '';
  if (req.user.role === 'employee') { sc = ' WHERE l.assigned_to = ?'; a.push(req.user.id); }
  const [rows] = await pool.query(
    `SELECT a.id, a.lead_id, a.activity_type AS type, a.description, a.created_at, u.name AS user_name, l.person_name, l.company
     FROM lead_activities a JOIN leads l ON l.id = a.lead_id LEFT JOIN users u ON u.id = a.user_id${sc}
     ORDER BY a.id DESC LIMIT ?`, [...a, limitOf(req.query)]);
  res.json({ success: true, data: rows });
}));

module.exports = router;
