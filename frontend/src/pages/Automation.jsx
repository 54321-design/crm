import { useState } from 'react';
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Card, Modal, Loading, ErrorBox, Empty, useFetch, useToast, fmtDateTime, timeAgo, num } from '../ui';

const WF = { running: ['Running', '#3B6FB6'], success: ['Healthy', '#1E7B63'], failed: ['Failed', '#A4483A'], inactive: ['No runs yet', '#7A8A86'] };

export default function Automation() {
  const toast = useToast();
  const wf = useFetch(() => api.get('/workflows'), []);
  const sync = useFetch(() => api.get('/sync/status'), []);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [syncing, setSyncing] = useState(false);

  async function show(id) { setOpen(id); setDetail(null); try { setDetail((await api.get(`/workflows/${id}`)).data); } catch (e) { toast(e.message, 'err'); setOpen(null); } }
  async function syncNow() {
    setSyncing(true);
    try { const r = (await api.post('/sync/sheet')).result; toast(`Sync finished: ${num(r.created ?? 0)} new leads`); sync.reload(); wf.reload(); }
    catch (e) { toast(e.message, 'err'); }
    setSyncing(false);
  }
  const s = sync.data;

  return (
    <>
      <PageHeader title="Automation" sub="Your n8n workflows and the Google Sheets feeding this CRM.">
        <button className="btn primary" onClick={syncNow} disabled={syncing || (s && !s.connected)}>{syncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}Sync sheets now</button>
      </PageHeader>

      <Card title="Google Sheet sync" className="" >
        {sync.loading ? <Loading rows={2} /> : sync.error ? <ErrorBox message={sync.error} onRetry={sync.reload} /> : !s.connected ? (
          <Empty title="No sheets connected" hint="Add your published CSV links to backend/sheets.config.json, then sync." />
        ) : (
          <div className="grid g3">
            <div><small className="muted">Connected sheets</small><div style={{ fontWeight: 600, marginTop: 2 }}>{s.connectedSheets.join(', ')}</div></div>
            <div><small className="muted">Last sync</small><div style={{ fontWeight: 600, marginTop: 2 }}>{s.lastRun?.finishedAt ? timeAgo(s.lastRun.finishedAt) : 'Not yet'}{s.running ? ' (running now)' : ''}</div>
              {s.lastRun && <small className="muted">{num(s.lastRun.newLeads)} new · {num(s.lastRun.updatedLeads)} updated · {num(s.lastRun.duplicateLeads)} duplicates{s.lastRun.errors ? ` · ${s.lastRun.errors} errors` : ''}</small>}</div>
            <div><small className="muted">Next automatic sync</small><div style={{ fontWeight: 600, marginTop: 2 }}>{fmtDateTime(s.nextSyncAt)}</div></div>
          </div>
        )}
      </Card>

      <h2 style={{ fontSize: 16, margin: '26px 0 12px' }}>Workflows</h2>
      {wf.error ? <ErrorBox message={wf.error} onRetry={wf.reload} /> : !wf.data ? <Loading rows={4} /> : !wf.data.data.length ? <Empty title="No workflows yet" /> : (
        <div className="grid g3">
          {wf.data.data.map((w) => (
            <button key={w.id} className="card wf" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => show(w.id)}>
              <div className="wf-top"><div><h3>{w.name}</h3><small className="muted">{w.source || 'No source'}</small></div>
                <span className="badge" style={{ '--c': WF[w.status][1] }}>{WF[w.status][0]}</span></div>
              <div className="wf-stats"><div><b>{num(w.leads_today)}</b><small>Today</small></div><div><b>{num(w.leads_month)}</b><small>This month</small></div><div><b>{num(w.leads_total)}</b><small>All time</small></div></div>
              <small className="muted" style={{ display: 'block', marginTop: 12 }}>Last run: {w.last_run_at ? timeAgo(w.last_run_at) : 'never reported'}</small>
            </button>
          ))}
        </div>
      )}

      {open && (
        <Modal title={detail?.name || 'Workflow'} onClose={() => setOpen(null)} wide>
          {!detail ? <Loading /> : !detail.executions.length ? <Empty title="No runs reported" hint="Add an HTTP Request node that calls /api/webhooks/workflow-execution at the end of this n8n workflow." /> : (
            <div className="tablewrap"><table>
              <thead><tr><th>Run</th><th>Result</th><th>Leads</th><th>Started</th></tr></thead>
              <tbody>{detail.executions.map((e) => (
                <tr key={e.id}><td className="muted">#{e.id}</td>
                  <td>{e.status === 'failed' ? <span style={{ color: 'var(--danger)' }}><AlertTriangle size={14} /> {e.error_message || 'Failed'}</span> : e.status === 'success' ? <span style={{ color: 'var(--brand)' }}><CheckCircle2 size={14} /> Success</span> : 'Running'}</td>
                  <td className="num">{num(e.leads_created)}</td><td className="muted">{fmtDateTime(e.started_at)}</td></tr>))}</tbody>
            </table></div>
          )}
        </Modal>
      )}
    </>
  );
}
