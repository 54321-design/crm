const { normEmail, normLinkedin, normPhone } = require('../utils/normalize');

const clean = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};
const slugify = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const COUNTRIES = ['India','Sweden','United States','USA','United Kingdom','UK','UAE','United Arab Emirates','Canada','Australia','Germany','France','Singapore','Netherlands','Spain','Italy','Ireland','Norway','Denmark','Finland','Pakistan','Bangladesh','Sri Lanka','Nepal','South Africa','Saudi Arabia','Qatar','New Zealand','Malaysia'];
// Best effort: "..., Stockholm, Sweden" -> Sweden, "..., Miami, FL 33145" -> United States
function deriveCountry(addr) {
  if (!addr) return null;
  const parts = addr.split(',').map((x) => x.trim());
  const lastRaw = parts[parts.length - 1];
  const hit = COUNTRIES.find((c) => c.toLowerCase() === lastRaw.replace(/\d+/g, '').trim().toLowerCase());
  if (hit) return hit === 'USA' ? 'United States' : hit === 'UK' ? 'United Kingdom' : hit;
  return /^[A-Z]{2}\s*\d{5}(-\d{4})?$/.test(lastRaw) ? 'United States' : null;
}
const asDate = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);

async function getSourceId(c, name) {
  const n = clean(name) || 'Other';
  const slug = slugify(n) || 'other';
  await c.query('INSERT IGNORE INTO lead_sources (name, slug) VALUES (?, ?)', [n, slug]);
  const [r] = await c.query('SELECT id FROM lead_sources WHERE slug = ?', [slug]);
  return r[0].id;
}

async function getWorkflowId(c, name, sourceId = null) {
  const n = clean(name);
  if (!n) return null;
  await c.query('INSERT IGNORE INTO n8n_workflows (name, source_id) VALUES (?, ?)', [n, sourceId]);
  const [r] = await c.query('SELECT id FROM n8n_workflows WHERE name = ?', [n]);
  return r[0].id;
}

async function getStatusId(c, name) {
  const [r] = await c.query('SELECT id FROM lead_statuses WHERE LOWER(name) = LOWER(?)', [name || 'New']);
  if (r.length) return r[0].id;
  const [d] = await c.query("SELECT id FROM lead_statuses WHERE name = 'New'");
  return d[0].id;
}

async function addActivity(c, leadId, type, description, userId = null, meta = null) {
  await c.query(
    'INSERT INTO lead_activities (lead_id, user_id, activity_type, description, meta) VALUES (?, ?, ?, ?, ?)',
    [leadId, userId, type, description, meta ? JSON.stringify(meta) : null]
  );
  await c.query('UPDATE leads SET last_activity_at = NOW() WHERE id = ?', [leadId]);
}

/**
 * Single entry point for BOTH the sheet sync and the n8n webhook.
 * ctx: { origin: 'sheet' | 'webhook', source, workflow, status }
 * returns { action: 'created' | 'updated' | 'duplicate', leadId }
 */
async function upsertLead(c, raw, ctx = {}) {
  const emailNorm = normEmail(raw.email);
  const phoneNorm = normPhone(raw.phone);
  const linkedinNorm = normLinkedin(raw.linkedin_url || raw.linkedin);
  const lead = {
    company: clean(raw.company),
    person_name: clean(raw.person_name || raw.name),
    title: clean(raw.title),
    email: emailNorm,
    phone: phoneNorm ? clean(raw.phone) : null,
    city: clean(raw.city),
    country: clean(raw.country) || deriveCountry(clean(raw.address)),
    address: clean(raw.address),
    website: clean(raw.website),
    linkedin_url: linkedinNorm ? clean(raw.linkedin_url || raw.linkedin) : null,
  };

  const conds = [];
  const args = [];
  if (linkedinNorm) { conds.push('linkedin_norm = ?'); args.push(linkedinNorm); }
  if (emailNorm) { conds.push('email_norm = ?'); args.push(emailNorm); }
  if (phoneNorm) { conds.push('phone_norm = ?'); args.push(phoneNorm); }

  let existing = null;
  if (conds.length) {
    const [rows] = await c.query(
      `SELECT * FROM leads WHERE ${conds.join(' OR ')}
       ORDER BY (linkedin_norm <=> ?) DESC, (email_norm <=> ?) DESC LIMIT 1 FOR UPDATE`,
      [...args, linkedinNorm, emailNorm]
    );
    existing = rows[0] || null;
  }

  const origin = { sheet: 'Google Sheet', webhook: 'n8n webhook', manual: 'manual entry' }[ctx.origin] || 'n8n webhook';

  if (!existing) {
    const sourceId = await getSourceId(c, ctx.source);
    const workflowId = await getWorkflowId(c, ctx.workflow, sourceId);
    const statusId = await getStatusId(c, ctx.status);
    const [r] = await c.query(
      `INSERT INTO leads (company, person_name, title, email, phone, city, country, address, website, linkedin_url,
        linkedin_norm, email_norm, phone_norm, source_id, status_id, workflow_id, scraped_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [lead.company, lead.person_name, lead.title, lead.email, lead.phone, lead.city, lead.country, lead.address, lead.website,
        lead.linkedin_url, linkedinNorm, emailNorm, phoneNorm, sourceId, statusId, workflowId, asDate(raw.scraped_at)]
    );
    await addActivity(c, r.insertId, 'lead_created',
      ctx.origin === 'manual' ? 'Lead added manually' : `Lead generated${ctx.workflow ? ` by "${ctx.workflow}"` : ''}`,
      ctx.userId || null, { origin: ctx.origin });
    if (ctx.origin === 'sheet') await addActivity(c, r.insertId, 'sheet_import', 'Lead imported from Google Sheet');
    if (workflowId) await c.query('UPDATE n8n_workflows SET last_run_at = NOW() WHERE id = ?', [workflowId]);
    return { action: 'created', leadId: r.insertId };
  }

  // Duplicate: only fill fields that are empty on the existing lead.
  const fill = {};
  for (const k of Object.keys(lead)) if (!existing[k] && lead[k]) fill[k] = lead[k];
  if (!existing.linkedin_norm && linkedinNorm) fill.linkedin_norm = linkedinNorm;
  if (!existing.email_norm && emailNorm) fill.email_norm = emailNorm;
  if (!existing.phone_norm && phoneNorm) fill.phone_norm = phoneNorm;

  const keys = Object.keys(fill);
  if (keys.length) {
    await c.query(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map((k) => fill[k]), existing.id]);
    const fields = keys.filter((k) => !k.endsWith('_norm'));
    await addActivity(c, existing.id, 'lead_updated',
      `Duplicate from ${origin} matched this lead; added missing: ${fields.join(', ')}`, null, { origin: ctx.origin });
    return { action: 'updated', leadId: existing.id };
  }

  await addActivity(c, existing.id, 'duplicate_detected',
    `Duplicate received from ${origin}; no new data`, null, { origin: ctx.origin });
  return { action: 'duplicate', leadId: existing.id };
}

module.exports = { upsertLead, getSourceId, getWorkflowId, getStatusId, addActivity };
