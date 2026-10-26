import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import { PageHeader, Card, Pager, Loading, ErrorBox, Empty, useFetch, timeAgo, fmtDateTime } from '../ui';

const TYPES = [['', 'All activity'], ['lead_created', 'Lead created'], ['sheet_import', 'Sheet imports'], ['status_changed', 'Status changes'], ['lead_contacted', 'Contacted'], ['lead_converted', 'Converted'], ['lead_assigned', 'Assignments'], ['note_added', 'Notes'], ['outreach_queued', 'Messages queued'], ['outreach_failed', 'Message failures'], ['duplicate_detected', 'Duplicates']];

export default function Activity() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const list = useFetch(() => api.get(`/activity${qs({ type, page, limit: 30 })}`), [type, page]);
  return (
    <>
      <PageHeader title="Activity" sub="Everything that happened across your leads.">
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Activity type">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </PageHeader>
      <Card pad={false}>
        {list.error ? <div className="card-body"><ErrorBox message={list.error} onRetry={list.reload} /></div> : !list.data ? <div className="card-body"><Loading rows={8} /></div> : !list.data.data.length ? <Empty title="No activity found" /> : (
          <div className="card-body"><ul className="feed">{list.data.data.map((a) => (
            <li key={a.id}><span className="dot" /><div style={{ flex: 1 }}>
              <Link to={`/leads/${a.lead_id}`}><b>{a.person_name || a.company || `Lead #${a.lead_id}`}</b></Link> <span className="muted">{a.company && a.person_name ? `· ${a.company}` : ''}</span>
              <div>{a.description}</div></div>
              <small title={fmtDateTime(a.created_at)} style={{ whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}{a.user_name ? ` · ${a.user_name}` : ''}</small></li>))}</ul></div>
        )}
        <Pager p={list.data?.pagination} onPage={setPage} />
      </Card>
    </>
  );
}
