const router = require('express').Router();
const { withTx } = require('../config/db');
const { webhookKey } = require('../middleware/auth');
const { upsertLead, getSourceId, getWorkflowId, addActivity } = require('../services/leadService');
const { normEmail, normLinkedin, normPhone } = require('../utils/normalize');

router.use(webhookKey);

function validate(b) {
  const errs = [];
  if (b.email && !normEmail(b.email)) errs.push('email is invalid');
  if (b.phone && !normPhone(b.phone)) errs.push('phone is invalid');
  if (b.linkedin_url && !normLinkedin(b.linkedin_url)) errs.push('linkedin_url must be a linkedin.com URL');
  const hasId = b.email || b.phone || b.linkedin_url || (b.company && (b.person_name || b.name));
  if (!hasId) errs.push('provide at least one of: email, phone, linkedin_url, or company + person_name');
  return errs;
}

const MESSAGES = {
  created: 'Lead created successfully',
  updated: 'Existing lead updated with new data',
  duplicate: 'Duplicate lead; no changes made',
};

// POST /api/webhooks/leads  - one lead object, or an array of leads
router.post('/leads', async (req, res, next) => {
  try {
    const batch = Array.isArray(req.body);
    const items = batch ? req.body : [req.body];
    if (!items.length || items.length > 500)
      return res.status(400).json({ success: false, message: 'Send between 1 and 500 leads' });

    const results = [];
    for (const item of items) {
      const errs = validate(item || {});
      if (errs.length) { results.push({ success: false, errors: errs }); continue; }
      const r = await withTx((conn) => upsertLead(conn, item, {
        origin: 'webhook', source: item.source || 'Other', workflow: item.workflow, status: item.status,
      }));
      results.push({ success: true, leadId: r.leadId, action: r.action, message: MESSAGES[r.action] });
    }

    if (!batch) {
      const r = results[0];
      return res.status(r.success ? 201 : 400).json(r.success ? r : { success: false, message: 'Validation failed', errors: r.errors });
    }
    res.status(207).json({ success: results.every((r) => r.success), results });
  } catch (e) { next(e); }
});

// POST /api/webhooks/workflow-execution
// { "workflow": "LinkedIn Lead Generation", "source": "LinkedIn", "status": "success|failed|running", "leads_created": 12, "error": "" }
router.post('/workflow-execution', async (req, res, next) => {
  try {
    const { workflow, source, status, leads_created, error } = req.body || {};
    if (!workflow || !['running', 'success', 'failed'].includes(status))
      return res.status(400).json({ success: false, message: 'workflow and status (running | success | failed) are required' });

    await withTx(async (conn) => {
      const sourceId = source ? await getSourceId(conn, source) : null;
      const wfId = await getWorkflowId(conn, workflow, sourceId);
      await conn.query(
        `INSERT INTO workflow_executions (workflow_id, status, leads_created, error_message, started_at, finished_at)
         VALUES (?,?,?,?,NOW(),IF(?='running',NULL,NOW()))`,
        [wfId, status, Number(leads_created) || 0, error ? String(error).slice(0, 500) : null, status]);
      await conn.query('UPDATE n8n_workflows SET status=?, last_run_at=NOW() WHERE id=?', [status, wfId]);
    });
    res.status(201).json({ success: true, message: 'Execution recorded' });
  } catch (e) { next(e); }
});

// POST /api/webhooks/sync  - n8n Schedule Trigger calls this every few minutes to pull the Google Sheets.
router.post('/sync', async (req, res, next) => {
  try {
    const sync = require('../services/sheetSync');
    if (!sync.isConnected()) return res.status(400).json({ success: false, message: 'No Google Sheet is connected' });
    const r = await sync.runSync('schedule');
    res.json({ success: r.status !== 'failed', status: r.status, scanned: r.scanned, created: r.created, updated: r.updated,
      duplicate: r.duplicate, unchanged: r.unchanged, errors: r.errors,
      errorDetails: (r.sheets || []).flatMap((x) => x.errorDetails || []).slice(0, 5) });
  } catch (e) { next(e); }
});

// POST /api/webhooks/outreach-status  { outreachId, status: "sent" | "failed", error }
// n8n calls this after it tries to send the LinkedIn DM.
router.post('/outreach-status', async (req, res, next) => {
  try {
    const { outreachId, status, error } = req.body || {};
    if (!Number.isInteger(Number(outreachId)) || !['sent', 'failed'].includes(status))
      return res.status(400).json({ success: false, message: 'outreachId and status (sent | failed) are required' });
    await withTx(async (conn) => {
      const [rows] = await conn.query('SELECT lead_id FROM outreach_messages WHERE id = ?', [Number(outreachId)]);
      if (!rows[0]) throw Object.assign(new Error('Outreach message not found'), { status: 404 });
      await conn.query('UPDATE outreach_messages SET status=?, error_message=?, sent_at=IF(?=\'sent\', NOW(), NULL) WHERE id=?',
        [status, status === 'failed' ? String(error || 'Send failed').slice(0, 500) : null, status, Number(outreachId)]);
      if (status === 'sent') {
        await conn.query("UPDATE leads SET status_id = (SELECT id FROM lead_statuses WHERE name='Contacted') WHERE id = ? AND status_id = (SELECT id FROM lead_statuses WHERE name='New')", [rows[0].lead_id]);
        await addActivity(conn, rows[0].lead_id, 'lead_contacted', 'LinkedIn message sent via n8n');
      } else {
        await addActivity(conn, rows[0].lead_id, 'outreach_failed', `LinkedIn message failed: ${String(error || 'unknown error').slice(0, 200)}`);
      }
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
