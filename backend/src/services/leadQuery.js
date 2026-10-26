const { parseRange, fmt } = require('../utils/range');

const LEAD_SELECT = `SELECT l.id, l.company, l.person_name, l.title, l.email, l.phone, l.address, l.city, l.country,
  l.website, l.linkedin_url, l.scraped_at, l.created_at, l.updated_at, l.last_activity_at,
  s.name AS status, src.name AS source, w.name AS workflow, l.assigned_to, u.name AS assigned_name`;
const LEAD_FROM = ` FROM leads l JOIN lead_statuses s ON s.id = l.status_id JOIN lead_sources src ON src.id = l.source_id
  LEFT JOIN n8n_workflows w ON w.id = l.workflow_id LEFT JOIN users u ON u.id = l.assigned_to`;
const SORTS = { id: 'l.id', created_at: 'l.created_at', person_name: 'l.person_name', company: 'l.company',
  status: 's.name', source: 'src.name', last_activity: 'l.last_activity_at' };
const like = (s) => `%${String(s).trim().replace(/[\\%_]/g, '\\$&')}%`;

// Employees only ever see leads assigned to them.
function buildWhere(q, user) {
  const w = ['1=1'], a = [];
  if (user.role === 'employee') { w.push('l.assigned_to = ?'); a.push(user.id); }
  if (q.q && String(q.q).trim()) {
    const t = like(q.q);
    const digits = String(q.q).replace(/\D/g, '');
    let c = '(l.person_name LIKE ? OR l.company LIKE ? OR l.email LIKE ? OR l.phone LIKE ?';
    a.push(t, t, t, t);
    if (digits.length >= 4) { c += ' OR l.phone_norm LIKE ?'; a.push(`%${digits}%`); }
    w.push(c + ')');
  }
  if (q.status) { w.push('s.name = ?'); a.push(String(q.status)); }
  if (q.source) { w.push('src.name = ?'); a.push(String(q.source)); }
  if (q.assigned === 'unassigned') w.push('l.assigned_to IS NULL');
  else if (q.assigned && Number.isInteger(Number(q.assigned))) { w.push('l.assigned_to = ?'); a.push(Number(q.assigned)); }
  if (q.range || q.from) {
    const r = parseRange(q, 'all');
    if (r.from) { w.push('l.created_at >= ?'); a.push(fmt(r.from)); }
    w.push('l.created_at < ?'); a.push(fmt(r.to));
  }
  return { sql: ' WHERE ' + w.join(' AND '), args: a };
}

function orderBy(q) {
  const col = SORTS[q.sort] || SORTS.created_at;
  return ` ORDER BY ${col} ${String(q.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC'}, l.id DESC`;
}

module.exports = { LEAD_SELECT, LEAD_FROM, buildWhere, orderBy };
