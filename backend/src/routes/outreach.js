const router = require('express').Router();
const { pool, withTx } = require('../config/db');
const { required } = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { addActivity } = require('../services/leadService');

router.use(required);
const httpErr = (status, message) => Object.assign(new Error(message), { status });

async function loadLead(req, id) {
  id = Number(id);
  if (!Number.isInteger(id) || id < 1) throw httpErr(400, 'Invalid lead id');
  const a = [id];
  let sc = '';
  if (req.user.role === 'employee') { sc = ' AND l.assigned_to = ?'; a.push(req.user.id); }
  const [rows] = await pool.query(
    `SELECT l.id, l.company, l.person_name, l.title, l.city, l.country, l.website, l.linkedin_url, s.name AS status
     FROM leads l JOIN lead_statuses s ON s.id = l.status_id WHERE l.id = ?${sc}`, a);
  if (!rows[0]) throw httpErr(404, 'Lead not found');
  return rows[0];
}

const TONES = {
  friendly: 'warm, friendly and conversational',
  professional: 'professional, polished and respectful',
  direct: 'short, direct and to the point',
  curious: 'curious, asking one thoughtful question',
};

// POST /api/outreach/generate { leadId, tone, offer, sender }  -> { message }
router.post('/generate', wrap(async (req, res) => {
  if (!process.env.GROQ_API_KEY) throw httpErr(400, 'AI is not configured. Set GROQ_API_KEY in backend/.env.');
  const lead = await loadLead(req, req.body.leadId);
  const tone = TONES[req.body.tone] ? req.body.tone : 'friendly';
  const offer = String(req.body.offer || '').trim().slice(0, 600);
  const sender = String(req.body.sender || req.user.name || '').trim().slice(0, 120);
  if (!offer) throw httpErr(400, 'Describe what you offer so the message can be specific');

  const facts = [
    lead.person_name && `Name: ${lead.person_name}`, lead.title && `Role: ${lead.title}`,
    lead.company && `Company: ${lead.company}`, (lead.city || lead.country) && `Location: ${[lead.city, lead.country].filter(Boolean).join(', ')}`,
    lead.website && `Website: ${lead.website}`,
  ].filter(Boolean).join('\n');

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.7, max_tokens: 400,
      messages: [
        { role: 'system', content: 'You write LinkedIn direct messages for B2B outreach. Output only the message text: no subject line, no quotes, no placeholders, no emojis, under 600 characters. Use only the facts you are given; never invent details about the recipient. End with one low-pressure question.' },
        { role: 'user', content: `Tone: ${TONES[tone]}.\nSender: ${sender}\nWhat the sender offers: ${offer}\n\nRecipient:\n${facts}\n\nWrite the message.` },
      ],
    }),
  });
  if (!r.ok) throw httpErr(502, `AI provider error (${r.status}). Try again.`);
  const j = await r.json();
  const message = String(j.choices?.[0]?.message?.content || '').trim();
  if (!message) throw httpErr(502, 'AI returned an empty message. Try again.');
  res.json({ success: true, message, tone });
}));

// POST /api/outreach/send { leadId, body } -> queues it and hands it to n8n
router.post('/send', wrap(async (req, res) => {
  const url = process.env.N8N_LINKEDIN_WEBHOOK_URL;
  if (!url) throw httpErr(400, 'n8n is not connected. Set N8N_LINKEDIN_WEBHOOK_URL in backend/.env.');
  const lead = await loadLead(req, req.body.leadId);
  const body = String(req.body.body || '').trim();
  if (!body || body.length > 8000) throw httpErr(400, 'Message must be 1 to 8000 characters');
  if (!lead.linkedin_url) throw httpErr(400, 'This lead has no LinkedIn URL');

  const id = await withTx(async (c) => {
    const [r] = await c.query('INSERT INTO outreach_messages (lead_id, user_id, body, tone) VALUES (?,?,?,?)',
      [lead.id, req.user.id, body, String(req.body.tone || '').slice(0, 30) || null]);
    await addActivity(c, lead.id, 'outreach_queued', 'LinkedIn message queued in n8n', req.user.id);
    return r.insertId;
  });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.WEBHOOK_API_KEY || '' },
      body: JSON.stringify({
        outreachId: id, leadId: lead.id, linkedin_url: lead.linkedin_url, person_name: lead.person_name,
        company: lead.company, message: body,
        callback_url: `${process.env.API_URL || ''}/api/webhooks/outreach-status`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`n8n responded ${r.status}`);
  } catch (e) {
    await pool.query("UPDATE outreach_messages SET status='failed', error_message=? WHERE id=?", [String(e.message).slice(0, 500), id]);
    throw httpErr(502, `Could not reach n8n: ${e.message}`);
  }
  res.status(202).json({ success: true, id, message: 'Message sent to n8n' });
}));

// GET /api/outreach?leadId=&status=&page=&limit=
router.get('/', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const w = ['1=1'], a = [];
  if (req.user.role === 'employee') { w.push('l.assigned_to = ?'); a.push(req.user.id); }
  if (req.query.leadId) { w.push('o.lead_id = ?'); a.push(Number(req.query.leadId)); }
  if (['queued', 'sent', 'failed'].includes(req.query.status)) { w.push('o.status = ?'); a.push(req.query.status); }
  const from = `FROM outreach_messages o JOIN leads l ON l.id = o.lead_id LEFT JOIN users u ON u.id = o.user_id WHERE ${w.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, a);
  const [rows] = await pool.query(
    `SELECT o.id, o.lead_id, o.body, o.tone, o.status, o.error_message, o.sent_at, o.created_at,
            l.person_name, l.company, u.name AS user_name ${from} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...a, limit, (page - 1) * limit]);
  const scoped = req.user.role === 'employee';
  const [[c]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(o.status='sent'),0) AS sent, COALESCE(SUM(o.status='queued'),0) AS queued,
            COALESCE(SUM(o.status='failed'),0) AS failed FROM outreach_messages o JOIN leads l ON l.id=o.lead_id
     ${scoped ? 'WHERE l.assigned_to = ?' : ''}`, scoped ? [req.user.id] : []);
  res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    counts: { total: Number(c.total), sent: Number(c.sent), queued: Number(c.queued), failed: Number(c.failed) } });
}));

module.exports = router;
