const router = require('express').Router();
const { required, roles } = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { parseRange } = require('../utils/range');
const A = require('../services/analytics');

router.use(required);
const groupOf = (q) => (['day', 'week', 'month'].includes(q.group) ? q.group : 'month');
const rangeOf = (q, group) => parseRange(q, group === 'month' ? 'this_year' : '30d');

// Every endpoint accepts ?range=today|7d|30d|this_month|last_month|3m|6m|this_year|all|custom&from=&to=
router.get('/lead-trends', wrap(async (req, res) => {
  const g = groupOf(req.query);
  res.json({ success: true, group: g, data: await A.trends(req.user, rangeOf(req.query, g), g) });
}));
router.get('/sources', wrap(async (req, res) => res.json({ success: true, data: await A.sources(req.user, parseRange(req.query, 'all')) })));
router.get('/status', wrap(async (req, res) => res.json({ success: true, data: await A.statusCounts(req.user, parseRange(req.query, '30d')) })));
router.get('/funnel', wrap(async (req, res) => {
  const rows = await A.statusCounts(req.user, parseRange(req.query, '30d'));
  const total = rows.reduce((t, x) => t + x.count, 0);
  res.json({ success: true, data: rows.map((x) => ({ ...x, percent: A.pct(x.count, total) })) });
}));
router.get('/conversion', wrap(async (req, res) => {
  const g = groupOf(req.query);
  res.json({ success: true, group: g, data: await A.conversionOverTime(req.user, rangeOf(req.query, g), g) });
}));
router.get('/source-conversion', wrap(async (req, res) => res.json({ success: true, data: await A.sources(req.user, parseRange(req.query, 'all')) })));
router.get('/team', roles('admin', 'manager'), wrap(async (req, res) => res.json({ success: true, data: await A.byTeam(req.user, parseRange(req.query, '30d')) })));
router.get('/monthly-comparison', wrap(async (req, res) => res.json({ success: true, data: await A.monthlyComparison(req.user) })));

module.exports = router;
