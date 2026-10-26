const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const ymd = (d) => fmt(d).slice(0, 10);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(`${s}T00:00:00`));
const bad = (m) => Object.assign(new Error(m), { status: 400 });

// range: today | 7d | 30d | this_month | last_month | 3m | 6m | this_year | all | custom (+from,to)
function parseRange(q = {}, def = '30d') {
  const key = q.range || (q.from && q.to ? 'custom' : def);
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const today = new Date(y, m, now.getDate());
  let from, to = addDays(today, 1);
  switch (key) {
    case 'today': from = today; break;
    case '7d': from = addDays(today, -6); break;
    case '30d': from = addDays(today, -29); break;
    case 'this_month': from = new Date(y, m, 1); break;
    case 'last_month': from = new Date(y, m - 1, 1); to = new Date(y, m, 1); break;
    case '3m': from = new Date(y, m - 2, 1); break;
    case '6m': from = new Date(y, m - 5, 1); break;
    case 'this_year': from = new Date(y, 0, 1); break;
    case 'all': from = null; break;
    case 'custom':
      if (!validDate(q.from) || !validDate(q.to)) throw bad('Custom range needs valid from and to dates (YYYY-MM-DD)');
      from = new Date(`${q.from}T00:00:00`);
      to = addDays(new Date(`${q.to}T00:00:00`), 1);
      if (to <= from) throw bad('"to" must be on or after "from"');
      break;
    default: throw bad('Unknown range');
  }
  return { key, from, to };
}

function prevRange(r) {
  if (!r.from) return null;
  return { key: 'previous', from: new Date(r.from - (r.to - r.from)), to: r.from };
}

module.exports = { parseRange, prevRange, fmt, ymd, addDays };
