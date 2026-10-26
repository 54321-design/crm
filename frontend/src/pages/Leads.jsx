import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Plus, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { PageHeader, Card, Modal, Field, Pager, StatusBadge, Avatar, Loading, ErrorBox, Empty, useFetch, useDebounced, useToast, fmtDate, STATUSES, RANGES } from '../ui';

const EMPTY = { company: '', person_name: '', title: '', email: '', phone: '', linkedin_url: '', city: '', country: '', website: '', source: 'Other' };

function AddLead({ sources, onClose, onDone }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api.post('/leads', f); onDone(r.leadId); }
    catch (x) { setErr({ message: x.message, id: x.data?.leadId }); setBusy(false); }
  }
  return (
    <Modal title="Add lead" onClose={onClose} wide>
      <form onSubmit={save}>
        {err && <div className="errorbox" style={{ marginBottom: 14 }}><span>{err.message}{err.id && <> <Link to={`/leads/${err.id}`}>Open existing lead</Link></>}</span></div>}
        <div className="row2"><Field label="Person name"><input value={f.person_name} onChange={set('person_name')} /></Field><Field label="Company"><input value={f.company} onChange={set('company')} /></Field></div>
        <div className="row2"><Field label="Job title"><input value={f.title} onChange={set('title')} /></Field>
          <Field label="Source"><select style={{ width: '100%' }} value={f.source} onChange={set('source')}>{sources.map((s) => <option key={s}>{s}</option>)}</select></Field></div>
        <div className="row2"><Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field><Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field></div>
        <Field label="LinkedIn URL"><input value={f.linkedin_url} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/..." /></Field>
        <div className="row2"><Field label="City"><input value={f.city} onChange={set('city')} /></Field><Field label="Country"><input value={f.country} onChange={set('country')} /></Field></div>
        <Field label="Website"><input value={f.website} onChange={set('website')} /></Field>
        <p className="muted" style={{ marginBottom: 10 }}>Add an email, phone, LinkedIn URL, or both a company and a person name.</p>
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Adding' : 'Add lead'}</button></div>
      </form>
    </Modal>
  );
}

export default function Leads() {
  const { can } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ q: '', status: '', source: '', assigned: '', range: '', sort: 'created_at', order: 'desc', page: 1 });
  const [adding, setAdding] = useState(false);
  const q = useDebounced(f.q);
  const params = { ...f, q, limit: 20 };

  useEffect(() => { setF((x) => ({ ...x, page: 1 })); }, [q, f.status, f.source, f.assigned, f.range]);
  const list = useFetch(() => api.get(`/leads${qs(params)}`), [q, f.status, f.source, f.assigned, f.range, f.sort, f.order, f.page]);
  const sources = useFetch(() => api.get('/analytics/sources?range=all'), []);
  const team = useFetch(() => (can('admin', 'manager') ? api.get('/team/options') : Promise.resolve({ data: [] })), []);
  const srcNames = sources.data?.data.map((s) => s.name) || [];

  const sortBy = (col) => setF((x) => ({ ...x, sort: col, order: x.sort === col && x.order === 'desc' ? 'asc' : 'desc', page: 1 }));
  const Th = ({ col, children }) => (
    <th className="sortable" onClick={() => sortBy(col)} aria-sort={f.sort === col ? (f.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {children}{f.sort === col && (f.order === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
    </th>
  );
  const rows = list.data?.data;

  return (
    <>
      <PageHeader title="Leads" sub={can('employee') ? 'Leads assigned to you.' : 'Every lead from your workflows and manual entries.'}>
        <button className="btn" onClick={() => api.download(`/leads/export${qs({ ...params, page: '', limit: '' })}`, 'leads.csv').catch((e) => toast(e.message, 'err'))}><Download size={16} />Export CSV</button>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} />Add lead</button>
      </PageHeader>
      <Card pad={false}>
        <div className="filters">
          <div className="search"><Search size={16} /><input placeholder="Search name, company, email or phone" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search leads" /></div>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label="Source"><option value="">All sources</option>{srcNames.map((s) => <option key={s}>{s}</option>)}</select>
          {can('admin', 'manager') && (
            <select value={f.assigned} onChange={(e) => setF({ ...f, assigned: e.target.value })} aria-label="Owner"><option value="">Any owner</option><option value="unassigned">Unassigned</option>{team.data?.data.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          )}
          <select value={f.range} onChange={(e) => setF({ ...f, range: e.target.value })} aria-label="Added"><option value="">Any date added</option>{RANGES.filter(([k]) => k !== 'all').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        {list.error ? <div className="card-body"><ErrorBox message={list.error} onRetry={list.reload} /></div> : !rows ? <div className="card-body"><Loading rows={8} /></div> : !rows.length ? (
          <Empty title="No leads match" hint={f.q || f.status || f.source || f.range ? 'Clear a filter to see more.' : 'New leads appear here after your next sheet sync.'} />
        ) : (
          <div className="tablewrap" style={{ opacity: list.loading ? 0.6 : 1 }}>
            <table>
              <thead><tr><Th col="person_name">Lead</Th><Th col="company">Company</Th><th>Contact</th><Th col="source">Source</Th><Th col="status">Status</Th><th>Owner</th><Th col="created_at">Added</Th></tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="click" onClick={() => nav(`/leads/${l.id}`)}>
                    <td><div className="cell-person"><Avatar name={l.person_name || l.company} /><div><b>{l.person_name || 'Unnamed contact'}</b><small>{l.title || l.city || ''}</small></div></div></td>
                    <td><div className="clip">{l.company || '-'}</div></td>
                    <td><div className="clip">{l.email || l.phone || (l.linkedin_url ? 'LinkedIn only' : '-')}</div></td>
                    <td className="muted">{l.source}</td>
                    <td><StatusBadge status={l.status} /></td>
                    <td className="muted">{l.assigned_name || 'Unassigned'}</td>
                    <td className="muted">{fmtDate(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager p={list.data?.pagination} onPage={(page) => setF({ ...f, page })} />
      </Card>
      {adding && <AddLead sources={srcNames.length ? srcNames : ['Other']} onClose={() => setAdding(false)} onDone={(id) => { toast('Lead added'); nav(`/leads/${id}`); }} />}
    </>
  );
}
