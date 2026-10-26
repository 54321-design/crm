const router = require('express').Router();
const { pool } = require('../config/db');
const { required, roles } = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { fmt } = require('../utils/range');

router.use(required, roles('admin', 'manager'));

const LIST = `SELECT w.id, w.name, w.status, w.last_run_at, src.name AS source,
  (SELECT COUNT(*) FROM leads l WHERE l.workflow_id = w.id) AS leads_total,
  (SELECT COUNT(*) FROM leads l WHERE l.workflow_id = w.id AND l.created_at >= ?) AS leads_today,
  (SELECT COUNT(*) FROM leads l WHERE l.workflow_id = w.id AND l.created_at >= ?) AS leads_month,
  (SELECT e.status FROM workflow_executions e WHERE e.workflow_id = w.id ORDER BY e.id DESC LIMIT 1) AS last_execution_status
  FROM n8n_workflows w LEFT JOIN lead_sources src ON src.id = w.source_id`;
const periods = () => {
  const n = new Date();
  return [fmt(new Date(n.getFullYear(), n.getMonth(), n.getDate())), fmt(new Date(n.getFullYear(), n.getMonth(), 1))];
};
const shape = (r) => ({ ...r, leads_total: Number(r.leads_total), leads_today: Number(r.leads_today), leads_month: Number(r.leads_month) });

router.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query(`${LIST} ORDER BY w.name`, periods());
  res.json({ success: true, data: rows.map(shape) });
}));

router.get('/:id', wrap(async (req, res) => {
  const [rows] = await pool.query(`${LIST} WHERE w.id = ?`, [...periods(), Number(req.params.id)]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Workflow not found' });
  const [executions] = await pool.query(
    `SELECT id, status, leads_created, error_message, started_at, finished_at FROM workflow_executions
     WHERE workflow_id = ? ORDER BY id DESC LIMIT 20`, [rows[0].id]);
  res.json({ success: true, data: { ...shape(rows[0]), executions } });
}));

module.exports = router;
