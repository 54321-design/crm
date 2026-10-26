const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { parse } = require('csv-parse/sync');
const { pool, withTx } = require('../config/db');
const { upsertLead } = require('./leadService');
const { normEmail, normLinkedin, normPhone } = require('../utils/normalize');

let running = false;
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

// Sheets come from SHEETS_CONFIG_JSON (env, best for Vercel), backend/sheets.config.json, or SHEET_CSV_URL.
// Each entry is either { csvUrl } (published CSV) or { sheetId, tab | gid } (private sheet shared with the service account).
function getSheets() {
  const file = process.env.SHEETS_CONFIG || path.join(__dirname, '../../sheets.config.json');
  let list = [];
  if (process.env.SHEETS_CONFIG_JSON) list = JSON.parse(process.env.SHEETS_CONFIG_JSON);
  else if (fs.existsSync(file)) list = JSON.parse(fs.readFileSync(file, 'utf8'));
  else if (process.env.SHEET_CSV_URL) list = [{ name: 'Sheet', csvUrl: process.env.SHEET_CSV_URL }];
  return list.filter((x) => (x.csvUrl && /^https?:\/\//.test(x.csvUrl)) || x.sheetId).map((x) => ({
    name: x.name || 'Sheet', url: x.csvUrl && /^https?:\/\//.test(x.csvUrl) ? x.csvUrl : null,
    googleId: x.sheetId || null, tab: x.tab || null,
    sid: x.spreadsheetId || x.sheetId || x.name || 'default', gid: String(x.gid || '0'),
    source: x.source || 'Other', workflow: x.workflow || null,
  }));
}
const isConnected = () => { try { return getSheets().length > 0; } catch { return false; } };

// ---- Private sheets via a Google service account (read-only) ----------------------------------------
function credentials() {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key = process.env.GOOGLE_PRIVATE_KEY;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const j = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    email = j.client_email; key = j.private_key;
  }
  if (!email || !key) throw new Error('Google service account is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON.');
  return { email, key: key.replace(/\\n/g, '\n') };
}

let tokenCache = { value: null, exp: 0 };
async function accessToken() {
  if (tokenCache.value && tokenCache.exp > Date.now() + 60000) return tokenCache.value;
  const { email, key } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, key, { algorithm: 'RS256' });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google sign-in failed: ${j.error_description || j.error || r.status}`);
  tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

async function gget(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 403 || r.status === 404)
    throw new Error(`Google cannot open this sheet. Share it with ${credentials().email} (Viewer) and check the sheet ID.`);
  if (!r.ok) throw new Error(`Google Sheets error ${r.status}: ${j.error?.message || 'request failed'}`);
  return j;
}

async function tabTitle(sheet) {
  if (sheet.tab) return sheet.tab;
  const meta = await gget(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.googleId}?fields=sheets.properties(sheetId,title)`);
  const t = meta.sheets?.find((x) => String(x.properties.sheetId) === sheet.gid) || meta.sheets?.[0];
  if (!t) throw new Error('This spreadsheet has no tabs');
  return t.properties.title;
}

async function loadRows(sheet) {
  if (sheet.googleId) {
    const title = await tabTitle(sheet);
    const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'`);
    const j = await gget(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.googleId}/values/${range}?valueRenderOption=FORMATTED_VALUE`);
    const [head = [], ...body] = j.values || [];
    return body.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ''])));
  }
  const res = await fetch(sheet.url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheet request failed (HTTP ${res.status}). Check the published CSV link.`);
  return parse(await res.text(), { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true });
}

// Every known header name for each CRM field (case-insensitive). Add new aliases here for new sheets.
const HEADERS = {
  company: ['company name', 'company', 'business name'],
  person_name: ['person name', 'name', 'contact name'],
  title: ['title', 'job title'],
  linkedin_url: ['linkedin url', 'linkedin'],
  email: ['email', 'emails', 'email address'],
  phone: ['phone', 'phone number', 'mobile'],
  address: ['address'],
  city: ['city'],
  country: ['country'],
  website: ['company website', 'website'],
  scraped_at: ['date scraped', 'date'],
  status: ['status'],
};

function mapRow(r) {
  const low = {};
  for (const k of Object.keys(r)) low[k.trim().toLowerCase()] = String(r[k] || '').trim();
  const out = {};
  for (const f of Object.keys(HEADERS)) {
    out[f] = '';
    for (const h of HEADERS[f]) if (low[h]) { out[f] = low[h]; break; }
  }
  // A cell may hold several emails ("a@x.com, b@x.com"); keep the first valid one.
  out.email = out.email.split(/[\s,;]+/).map(normEmail).find(Boolean) || '';
  return out;
}

async function syncOne(sheet, trigger) {
  const s = { scanned: 0, created: 0, updated: 0, duplicate: 0, unchanged: 0, errors: 0 };
  const errors = [];
  let status = 'success';
  const [ins] = await pool.query(
    "INSERT INTO sync_logs (sheet_name, trigger_type, status, started_at) VALUES (?, ?, 'running', NOW())", [sheet.name, trigger]);
  const logId = ins.insertId;

  try {
    const rows = await loadRows(sheet);
    const seen = new Set();

    for (let i = 0; i < rows.length; i++) {
      s.scanned++;
      try {
        const row = mapRow(rows[i]);
        if (!row.company && !row.person_name && !row.email && !row.linkedin_url) continue; // blank row

        // Stable row identifier (sheets have no row-id column)
        const key = normLinkedin(row.linkedin_url) || normEmail(row.email) || normPhone(row.phone)
          || sha(`${row.company}|${row.person_name}`.toLowerCase());
        if (seen.has(key)) { s.duplicate++; continue; } // same lead listed twice in this sheet
        seen.add(key);

        const hash = sha(JSON.stringify(row));
        const [st] = await pool.query(
          'SELECT content_hash FROM sheet_row_state WHERE spreadsheet_id = ? AND sheet_gid = ? AND row_key = ?',
          [sheet.sid, sheet.gid, key]);
        if (st[0] && st[0].content_hash === hash) { s.unchanged++; continue; } // already imported, nothing changed

        const result = await withTx(async (conn) => {
          const r = await upsertLead(conn, row, { origin: 'sheet', source: sheet.source, workflow: sheet.workflow, status: row.status });
          await conn.query(
            `INSERT INTO sheet_row_state (spreadsheet_id, sheet_gid, row_key, content_hash, lead_id) VALUES (?,?,?,?,?)
             ON DUPLICATE KEY UPDATE content_hash = VALUES(content_hash), lead_id = VALUES(lead_id)`,
            [sheet.sid, sheet.gid, key, hash, r.leadId]);
          return r;
        });
        s[result.action]++;
      } catch (err) {
        s.errors++;
        if (errors.length < 50) errors.push({ row: i + 2, message: err.message });
      }
    }
    if (s.errors) status = 'partial';
  } catch (err) {
    status = 'failed';
    s.errors++;
    errors.push({ message: err.message });
  }

  await pool.query(
    `UPDATE sync_logs SET status=?, rows_scanned=?, new_leads=?, updated_leads=?, duplicate_leads=?, unchanged_rows=?,
       error_count=?, error_details=?, finished_at=NOW() WHERE id=?`,
    [status, s.scanned, s.created, s.updated, s.duplicate, s.unchanged, s.errors, errors.length ? JSON.stringify(errors) : null, logId]);
  if (status !== 'failed') {
    await pool.query(
      `INSERT INTO sync_state (spreadsheet_id, sheet_gid, last_synced_at) VALUES (?,?,NOW())
       ON DUPLICATE KEY UPDATE last_synced_at = NOW()`, [sheet.sid, sheet.gid]);
  }
  if (sheet.workflow) { // feeds the Automations page
    const wf = status === 'failed' ? 'failed' : 'success';
    await pool.query(
      `INSERT INTO workflow_executions (workflow_id, status, leads_created, started_at, finished_at)
       SELECT id, ?, ?, NOW(), NOW() FROM n8n_workflows WHERE name = ?`, [wf, s.created, sheet.workflow]);
    await pool.query('UPDATE n8n_workflows SET status = ?, last_run_at = NOW() WHERE name = ?', [wf, sheet.workflow]);
  }
  return { id: logId, sheet: sheet.name, status, ...s, errorDetails: errors };
}

async function runSync(trigger = 'schedule') {
  const sheets = getSheets();
  if (!sheets.length) throw Object.assign(new Error('No Google Sheet is connected'), { status: 400 });
  if (running) return { status: 'skipped', message: 'A sync is already running', sheets: [] };
  running = true;
  try {
    const results = [];
    for (const sh of sheets) results.push(await syncOne(sh, trigger));
    const sum = (k) => results.reduce((t, r) => t + r[k], 0);
    return {
      status: results.some((r) => r.status === 'failed') ? 'failed' : results.some((r) => r.status === 'partial') ? 'partial' : 'success',
      scanned: sum('scanned'), created: sum('created'), updated: sum('updated'), duplicate: sum('duplicate'),
      unchanged: sum('unchanged'), errors: sum('errors'), sheets: results,
    };
  } finally {
    running = false;
  }
}

async function getStatus() {
  const [last] = await pool.query(
    `SELECT l.* FROM sync_logs l JOIN (SELECT sheet_name, MAX(id) AS id FROM sync_logs GROUP BY sheet_name) m ON m.id = l.id ORDER BY l.sheet_name`);
  const sheets = isConnected() ? getSheets() : [];
  const sum = (k) => last.reduce((t, r) => t + Number(r[k]), 0);
  const step = 5 * 60 * 1000;
  return {
    connected: sheets.length > 0,
    connectedSheets: sheets.map((x) => x.name),
    running,
    lastRun: last.length ? {
      finishedAt: last.map((r) => r.finished_at).filter(Boolean).sort().pop() || null,
      rowsScanned: sum('rows_scanned'), newLeads: sum('new_leads'), updatedLeads: sum('updated_leads'),
      duplicateLeads: sum('duplicate_leads'), unchangedRows: sum('unchanged_rows'), errors: sum('error_count'),
    } : null,
    perSheet: last,
    nextSyncAt: new Date(Math.ceil((Date.now() + 1) / step) * step).toISOString(),
  };
}

module.exports = { runSync, getStatus, isConnected, loadRows, getSheets };
