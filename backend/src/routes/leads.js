const router = require('express').Router();
const { pool, withTx } = require('../config/db');
const { required, roles } = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { normEmail, normLinkedin, normPhone } = require('../utils/normalize');
const { upsertLead, addActivity } = require('../services/leadService');
const { LEAD_SELECT, LEAD_FROM, buildWhere, orderBy } = require('../services/leadQuery');

router.use(required);
const httpErr = (status, message) => Object.assign(new Error(message), { status });

// Load a lead the current user is allowed to see (employees: only assigned ones).
async function getLead(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw httpErr(400, 'Invalid lead id');
  const a = [id];
  let sc = '';
  if (req.user.role === 'employee') { sc = ' AND l.assigned_to = ?'; a.push(req.user.id); }
  const [rows] = await pool.query(`${LEAD_SELECT}${LEAD_FROM} WHERE l.id = ?${sc}`, a);
  if (!rows[0]) throw httpErr(404, 'Lead not found');
  return rows[0];
}

// GET /api/leads?q=&status=&source=&assigned=&range=&from=&to=&sort=&order=&page=&limit=
router.get('/', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const w = buildWhere(req.query, req.user);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total${LEAD_FROM}${w.sql}`, w.args);
  const [rows] = await pool.query(`${LEAD_SELECT}${LEAD_FROM}${w.sql}${orderBy(req.query)} LIMIT ? OFFSET ?`,
    [...w.args, limit, (page - 1) * limit]);
  res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}));

// GET /api/leads/export  - CSV of the currently filtered leads (same query params as the list)
router.get('/export', wrap(async (req, res) => {
  const w = buildWhere(req.query, req.user);
  const [rows] = await pool.query(`${LEAD_SELECT}${LEAD_FROM}${w.sql}${orderBy(req.query)} LIMIT 50000`, w.args);
  const cols = [['ID', 'id'], ['Company', 'company'], ['Person Name', 'person_name'], ['Title', 'title'], ['Email', 'email'],
    ['Phone', 'phone'], ['Address', 'address'], ['City', 'city'], ['Country', 'country'], ['Website', 'website'],
    ['LinkedIn URL', 'linkedin_url'], ['Source', 'source'], ['Workflow', 'workflow'], ['Status', 'status'],
    ['Assigned To', 'assigned_name'], ['Created At', 'created_at']];
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    // Block spreadsheet formula injection, but leave real phone numbers like +91 98765 43210 untouched.
    if (/^[=@\t\r]/.test(s) || (/^[+\-]/.test(s) && !/^[+\-][\d\s().-]+$/.test(s))) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [cols.map((c) => cell(c[0])).join(',')].concat(rows.map((r) => cols.map((c) => cell(r[c[1]])).join(','))).join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send('\ufeff' + csv);
}));

// GET /api/leads/:id
router.get('/:id', wrap(async (req, res) => {
  const lead = await getLead(req);
  const [notes] = await pool.query(
    'SELECT n.id, n.body, n.created_at, u.name AS user_name FROM notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.lead_id = ? ORDER BY n.id DESC', [lead.id]);
  res.json({ success: true, data: { ...lead, notes } });
}));

// POST /api/leads  - manual lead (duplicate check runs here too)
router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  if (b.email && !normEmail(b.email)) throw httpErr(400, 'Email is invalid');
  if (b.phone && !normPhone(b.phone)) throw httpErr(400, 'Phone is invalid');
  if (b.linkedin_url && !normLinkedin(b.linkedin_url)) throw httpErr(400, 'LinkedIn URL must be a linkedin.com link');
  if (!(b.email || b.phone || b.linkedin_url || (b.company && b.person_name))) throw httpErr(400, 'Provide an email, phone, LinkedIn URL, or company and person name');
  const r = await withTx((c) => upsertLead(c, b, { origin: 'manual', source: b.source || 'Other', workflow: null, status: b.status, userId: req.user.id }));
  if (r.action !== 'created') return res.status(409).json({ success: false, leadId: r.leadId, message: 'This lead already exists' });
  res.status(201).json({ success: true, leadId: r.leadId, message: 'Lead created successfully' });
}));

// PUT /api/leads/:id
const EDITABLE = ['company', 'person_name', 'title', 'email', 'phone', 'address', 'city', 'country', 'website', 'linkedin_url'];
router.put('/:id', wrap(async (req, res) => {
  const lead = await getLead(req);
  const b = req.body || {};
  const set = {};
  for (const k of EDITABLE) if (k in b) set[k] = String(b[k] ?? '').trim() || null;
  if (!Object.keys(set).length) throw httpErr(400, 'Nothing to update');
  if ('email' in set) { set.email_norm = normEmail(set.email); if (set.email && !set.email_norm) throw httpErr(400, 'Email is invalid'); set.email = set.email_norm; }
  if ('phone' in set) { set.phone_norm = normPhone(set.phone); if (set.phone && !set.phone_norm) throw httpErr(400, 'Phone is invalid'); }
  if ('linkedin_url' in set) { set.linkedin_norm = normLinkedin(set.linkedin_url); if (set.linkedin_url && !set.linkedin_norm) throw httpErr(400, 'LinkedIn URL must be a linkedin.com link'); }

  const conds = [], args = [lead.id];
  for (const k of ['linkedin_norm', 'email_norm', 'phone_norm']) if (set[k]) { conds.push(`${k} = ?`); args.push(set[k]); }
  if (conds.length) {
    const [dup] = await pool.query(`SELECT id FROM leads WHERE id <> ? AND (${conds.join(' OR ')}) LIMIT 1`, args);
    if (dup[0]) throw httpErr(409, `Another lead (#${dup[0].id}) already uses this email, phone or LinkedIn URL`);
  }
  const keys = Object.keys(set);
  await withTx(async (c) => {
    await c.query(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => set[k]), lead.id]);
    await addActivity(c, lead.id, 'lead_updated', `Lead updated: ${keys.filter((k) => !k.endsWith('_norm')).join(', ')}`, req.user.id);
  });
  res.json({ success: true, message: 'Lead updated successfully', data: await getLead(req) });
}));

// DELETE /api/leads/:id
router.delete('/:id', roles('admin', 'manager'), wrap(async (req, res) => {
  const lead = await getLead(req);
  await pool.query('DELETE FROM leads WHERE id = ?', [lead.id]);
  res.json({ success: true, message: 'Lead deleted' });
}));

// PATCH /api/leads/:id/status  { status: "Qualified" }
router.patch('/:id/status', wrap(async (req, res) => {
  const lead = await getLead(req);
  const [st] = await pool.query('SELECT id, name FROM lead_statuses WHERE name = ?', [String(req.body.status || '')]);
  if (!st[0]) throw httpErr(400, 'Invalid status');
  if (st[0].name === lead.status) return res.json({ success: true, message: 'Status unchanged' });
  await withTx(async (c) => {
    await c.query('UPDATE leads SET status_id = ? WHERE id = ?', [st[0].id, lead.id]);
    const type = { Converted: 'lead_converted', Contacted: 'lead_contacted' }[st[0].name] || 'status_changed';
    await addActivity(c, lead.id, type, `Status changed from ${lead.status} to ${st[0].name}`, req.user.id);
  });
  res.json({ success: true, message: 'Status changed', status: st[0].name });
}));

// PATCH /api/leads/:id/assign  { userId: 3 | null }
router.patch('/:id/assign', roles('admin', 'manager'), wrap(async (req, res) => {
  const lead = await getLead(req);
  const uid = req.body.userId == null ? null : Number(req.body.userId);
  let name = null;
  if (uid != null) {
    const [u] = await pool.query('SELECT name FROM users WHERE id = ? AND is_active = 1', [uid]);
    if (!u[0]) throw httpErr(400, 'User not found or inactive');
    name = u[0].name;
  }
  await withTx(async (c) => {
    await c.query('UPDATE leads SET assigned_to = ? WHERE id = ?', [uid, lead.id]);
    await addActivity(c, lead.id, 'lead_assigned', name ? `Assigned to ${name}` : 'Unassigned', req.user.id);
  });
  res.json({ success: true, message: 'Lead assigned successfully', assignedTo: uid, assignedName: name });
}));

// GET /api/leads/:id/activity
router.get('/:id/activity', wrap(async (req, res) => {
  const lead = await getLead(req);
  const [rows] = await pool.query(
    `SELECT a.id, a.activity_type AS type, a.description, a.created_at, u.name AS user_name
     FROM lead_activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.lead_id = ? ORDER BY a.id DESC LIMIT 200`, [lead.id]);
  res.json({ success: true, data: rows });
}));

// POST /api/leads/:id/notes  { body: "..." }
router.post('/:id/notes', wrap(async (req, res) => {
  const lead = await getLead(req);
  const body = String(req.body.body || '').trim();
  if (!body || body.length > 5000) throw httpErr(400, 'Note must be 1 to 5000 characters');
  const id = await withTx(async (c) => {
    const [r] = await c.query('INSERT INTO notes (lead_id, user_id, body) VALUES (?,?,?)', [lead.id, req.user.id, body]);
    await addActivity(c, lead.id, 'note_added', 'Note added', req.user.id);
    return r.insertId;
  });
  res.status(201).json({ success: true, message: 'Note added', id });
}));

module.exports = router;
