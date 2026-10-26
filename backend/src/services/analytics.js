const { pool } = require('../config/db');
const { fmt, ymd, addDays } = require('../utils/range');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BUCKET = { day: "DATE_FORMAT(l.created_at,'%Y-%m-%d')", week: "DATE_FORMAT(l.created_at,'%x-W%v')", month: "DATE_FORMAT(l.created_at,'%Y-%m')" };
const num = (v) => Number(v) || 0;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function where(user, r) {
  const w = ['1=1'], a = [];
  if (user.role === 'employee') { w.push('l.assigned_to = ?'); a.push(user.id); }
  if (r.from) { w.push('l.created_at >= ?'); a.push(fmt(r.from)); }
  w.push('l.created_at < ?'); a.push(fmt(r.to));
  return { sql: w.join(' AND '), args: a };
}

async function statusCounts(user, r) {
  const w = where(user, r);
  const [rows] = await pool.query(
    `SELECT s.name AS status, COUNT(l.id) AS count FROM lead_statuses s
     LEFT JOIN leads l ON l.status_id = s.id AND ${w.sql} GROUP BY s.id, s.name ORDER BY s.sort_order`, w.args);
  return rows.map((x) => ({ status: x.status, count: num(x.count) }));
}

function label(bucket, group) {
  if (group === 'month') return { label: MONTHS[+bucket.slice(5, 7) - 1], fullLabel: `${MONTHS[+bucket.slice(5, 7) - 1]} ${bucket.slice(0, 4)}` };
  return { label: group === 'day' ? bucket.slice(5) : bucket, fullLabel: bucket };
}

// Zero-fill empty days/months so charts show every period in the range.
function fill(rows, r, group, blank) {
  const map = new Map(rows.map((x) => [x.bucket, x]));
  let buckets = rows.map((x) => x.bucket);
  if (r.from && group !== 'week') {
    buckets = [];
    if (group === 'day') for (let d = r.from; d < r.to; d = addDays(d, 1)) buckets.push(ymd(d));
    else for (let d = new Date(r.from.getFullYear(), r.from.getMonth(), 1); d < r.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) buckets.push(ymd(d).slice(0, 7));
  }
  return buckets.map((b) => ({ bucket: b, ...label(b, group), ...(map.get(b) || blank(b)) }));
}

// "This year" monthly charts always show Jan-Dec (future months are simply 0).
const fullYear = (r, group) => (group === 'month' && r.key === 'this_year' ? { ...r, to: new Date(r.from.getFullYear() + 1, 0, 1) } : r);

async function trends(user, r, group) {
  r = fullYear(r, group);
  const w = where(user, r);
  const [rows] = await pool.query(
    `SELECT ${BUCKET[group]} AS bucket, COUNT(*) AS count FROM leads l WHERE ${w.sql} GROUP BY bucket ORDER BY bucket`, w.args);
  return fill(rows.map((x) => ({ bucket: x.bucket, count: num(x.count) })), r, group, () => ({ count: 0 }));
}

async function conversionOverTime(user, r, group) {
  r = fullYear(r, group);
  const w = where(user, r);
  const [rows] = await pool.query(
    `SELECT ${BUCKET[group]} AS bucket, COUNT(*) AS total, SUM(s.name = 'Converted') AS converted
     FROM leads l JOIN lead_statuses s ON s.id = l.status_id WHERE ${w.sql} GROUP BY bucket ORDER BY bucket`, w.args);
  const mapped = rows.map((x) => ({ bucket: x.bucket, total: num(x.total), converted: num(x.converted), rate: pct(num(x.converted), num(x.total)) }));
  return fill(mapped, r, group, () => ({ total: 0, converted: 0, rate: 0 }));
}

async function sources(user, r) {
  const w = where(user, r);
  const now = new Date();
  const monthStart = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
  const [rows] = await pool.query(
    `SELECT src.id, src.name, COUNT(l.id) AS total,
       COALESCE(SUM(l.created_at >= ?), 0) AS this_month,
       COALESCE(SUM(s.name = 'Qualified'), 0) AS qualified,
       COALESCE(SUM(s.name = 'Converted'), 0) AS converted
     FROM lead_sources src
     LEFT JOIN leads l ON l.source_id = src.id AND ${w.sql}
     LEFT JOIN lead_statuses s ON s.id = l.status_id
     GROUP BY src.id, src.name ORDER BY total DESC, src.name`, [monthStart, ...w.args]);
  return rows.map((x) => ({ id: x.id, name: x.name, total: num(x.total), thisMonth: num(x.this_month),
    qualified: num(x.qualified), converted: num(x.converted), conversionRate: pct(num(x.converted), num(x.total)) }));
}

async function byTeam(user, r) {
  const w = where(user, r);
  const [rows] = await pool.query(
    `SELECT COALESCE(u.name, 'Unassigned') AS name, COUNT(*) AS total, SUM(s.name = 'Converted') AS converted
     FROM leads l JOIN lead_statuses s ON s.id = l.status_id LEFT JOIN users u ON u.id = l.assigned_to
     WHERE ${w.sql} GROUP BY u.id, u.name ORDER BY total DESC`, w.args);
  return rows.map((x) => ({ name: x.name, total: num(x.total), converted: num(x.converted), conversionRate: pct(num(x.converted), num(x.total)) }));
}

async function monthlyComparison(user) {
  const now = new Date();
  const periods = [
    ['thisMonth', new Date(now.getFullYear(), now.getMonth(), 1), addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1)],
    ['lastMonth', new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)],
  ];
  const out = {};
  for (const [k, from, to] of periods) {
    const w = where(user, { from, to });
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(s.name = 'Converted'), 0) AS converted
       FROM leads l JOIN lead_statuses s ON s.id = l.status_id WHERE ${w.sql}`, w.args);
    out[k] = { total: num(row.total), converted: num(row.converted) };
  }
  out.changePct = out.lastMonth.total ? pct(out.thisMonth.total - out.lastMonth.total, out.lastMonth.total) : null;
  return out;
}

module.exports = { statusCounts, trends, conversionOverTime, sources, byTeam, monthlyComparison, where, pct, num };
