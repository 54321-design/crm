import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Send, Trash2, ExternalLink, Mail, Phone, Globe } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Card, Field, StatusBadge, Avatar, Loading, ErrorBox, Empty, useFetch, useToast, fmtDate, fmtDateTime, timeAgo, STATUSES, STATUS_COLOR } from '../ui';

const FIELDS = [['person_name', 'Person name'], ['company', 'Company'], ['title', 'Job title'], ['email', 'Email'], ['phone', 'Phone'], ['linkedin_url', 'LinkedIn URL'], ['city', 'City'], ['country', 'Country'], ['website', 'Website'], ['address', 'Address']];

export default function LeadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const lead = useFetch(() => api.get(`/leads/${id}`), [id]);
  const acts = useFetch(() => api.get(`/leads/${id}/activity`), [id]);
  const out = useFetch(() => api.get(`/outreach?leadId=${id}&limit=5`), [id]);
  const team = useFetch(() => (can('admin', 'manager') ? api.get('/team/options') : Promise.resolve({ data: [] })), []);
  const [edit, setEdit] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const l = lead.data?.data;

  useEffect(() => setEdit(null), [id]);
  const refresh = () => { lead.reload(); acts.reload(); };
  const run = async (fn, ok) => { setBusy(true); try { await fn(); toast(ok); refresh(); } catch (e) { toast(e.message, 'err'); } setBusy(false); };

  if (lead.loading && !l) return <Loading rows={8} />;
  if (lead.error) return <><Link to="/leads"><ArrowLeft size={14} /> Back to leads</Link><div style={{ marginTop: 14 }}><ErrorBox message={lead.error} /></div></>;

  const startEdit = () => setEdit(Object.fromEntries(FIELDS.map(([k]) => [k, l[k] || ''])));
  const save = (e) => { e.preventDefault(); run(async () => { await api.put(`/leads/${id}`, edit); setEdit(null); }, 'Lead updated'); };

  return (
    <>
      <Link to="/leads" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 14 }}><ArrowLeft size={14} />Back to leads</Link>
      <div className="hero">
        <Avatar name={l.person_name || l.company} size={54} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>{l.person_name || l.company || `Lead #${l.id}`}</h1>
          <p className="muted">{[l.title, l.person_name && l.company].filter(Boolean).join(' at ') || l.source} <StatusBadge status={l.status} /></p>
        </div>
        <div className="page-actions">
          <Link className="btn primary" to={`/outreach?lead=${l.id}`}><Send size={16} />Write message</Link>
          {!edit && <button className="btn" onClick={startEdit}><Pencil size={16} />Edit</button>}
          {can('admin', 'manager') && <button className="btn danger" onClick={() => window.confirm('Delete this lead and its history?') && run(async () => { await api.del(`/leads/${id}`); nav('/leads'); }, 'Lead deleted')}><Trash2 size={16} />Delete</button>}
        </div>
      </div>

      <div className="grid g32">
        <div className="grid">
          <Card title="Details">
            {edit ? (
              <form onSubmit={save}>
                <div className="row2">{FIELDS.map(([k, label]) => <Field key={k} label={label}><input value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>)}</div>
                <div className="modal-foot"><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" disabled={busy}>Save changes</button></div>
              </form>
            ) : (
              <dl className="facts">
                <div><dt>Email</dt><dd>{l.email ? <a href={`mailto:${l.email}`}><Mail size={13} /> {l.email}</a> : '-'}</dd></div>
                <div><dt>Phone</dt><dd>{l.phone ? <a href={`tel:${l.phone}`}><Phone size={13} /> {l.phone}</a> : '-'}</dd></div>
                <div><dt>LinkedIn</dt><dd>{l.linkedin_url ? <a href={l.linkedin_url} target="_blank" rel="noreferrer">Open profile <ExternalLink size={12} /></a> : '-'}</dd></div>
                <div><dt>Website</dt><dd>{l.website ? <a href={l.website} target="_blank" rel="noreferrer"><Globe size={13} /> {l.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a> : '-'}</dd></div>
                <div><dt>Location</dt><dd>{[l.city, l.country].filter(Boolean).join(', ') || l.address || '-'}</dd></div>
                <div><dt>Source</dt><dd>{l.source}{l.workflow ? ` via ${l.workflow}` : ''}</dd></div>
                <div><dt>Added</dt><dd>{fmtDate(l.created_at)}</dd></div>
                <div><dt>Last activity</dt><dd>{l.last_activity_at ? timeAgo(l.last_activity_at) : '-'}</dd></div>
              </dl>
            )}
          </Card>

          <Card title="Notes">
            <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) run(async () => { await api.post(`/leads/${id}/notes`, { body: note }); setNote(''); }, 'Note added'); }}>
              <textarea rows={3} placeholder="Write a note about this lead" value={note} onChange={(e) => setNote(e.target.value)} />
              <div style={{ margin: '10px 0 16px' }}><button className="btn" disabled={busy || !note.trim()}>Add note</button></div>
            </form>
            {!l.notes.length ? <p className="muted">No notes yet.</p> : l.notes.map((n) => <div className="note" key={n.id}>{n.body}<small>{n.user_name || 'Unknown'} · {fmtDateTime(n.created_at)}</small></div>)}
          </Card>

          <Card title="Messages sent">
            {out.loading ? <Loading rows={2} /> : !out.data?.data.length ? <p className="muted">No outreach to this lead yet.</p> : out.data.data.map((m) => (
              <div className="note" key={m.id}>{m.body}<small>{m.status === 'sent' ? 'Sent' : m.status === 'queued' ? 'Waiting for n8n' : `Failed: ${m.error_message || 'unknown error'}`} · {fmtDateTime(m.sent_at || m.created_at)}</small></div>
            ))}
          </Card>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title="Status">
            <div className="status-row">
              {STATUSES.map((s) => <button key={s} className={`chip ${l.status === s ? 'on' : ''}`} style={{ '--c': STATUS_COLOR[s] }} disabled={busy} onClick={() => l.status !== s && run(() => api.patch(`/leads/${id}/status`, { status: s }), `Status set to ${s}`)}>{s}</button>)}
            </div>
            {can('admin', 'manager') && (
              <Field label="Owner"><select style={{ width: '100%', marginTop: 16 }} value={l.assigned_to || ''} disabled={busy} onChange={(e) => run(() => api.patch(`/leads/${id}/assign`, { userId: e.target.value || null }), 'Owner updated')}>
                <option value="">Unassigned</option>{team.data?.data.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            )}
          </Card>
          <Card title="History">
            {acts.loading ? <Loading /> : !acts.data?.data.length ? <Empty title="No activity" /> : (
              <ul className="feed">{acts.data.data.map((a) => <li key={a.id}><span className="dot" /><div>{a.description}<br /><small>{fmtDateTime(a.created_at)}{a.user_name ? ` · ${a.user_name}` : ''}</small></div></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
