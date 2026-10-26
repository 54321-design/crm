const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const fail = (res, code, message) => res.status(code).json({ success: false, message });

function required(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return fail(res, 401, 'Authentication required');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    fail(res, 401, 'Session expired. Please sign in again.');
  }
}

const roles = (...allowed) => (req, res, next) =>
  allowed.includes(req.user.role) ? next() : fail(res, 403, 'You do not have permission to do this');

// n8n sends this header: x-api-key: <WEBHOOK_API_KEY>
function webhookKey(req, res, next) {
  const expected = process.env.WEBHOOK_API_KEY || '';
  const got = String(req.headers['x-api-key'] || '');
  const a = Buffer.from(got), b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail(res, 401, 'Invalid API key');
  next();
}

module.exports = { required, roles, webhookKey };
