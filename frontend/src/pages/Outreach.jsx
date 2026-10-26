import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Sparkles, Send, RefreshCw, Loader2 } from 'lucide-react';
import { api, qs } from '../api';
import { Card, PageHeader, Field, Avatar, Loading, ErrorBox, Empty, Pager, useFetch, useDebounced, useToast, fmtDateTime, num } from '../ui';

const TONES = [['friendly', 'Friendly'], ['professional', 'Professional'], ['direct', 'Direct'], ['curious', 'Curious']];
const STATE = { sent: ['Sent', '#1E7B63'], queued: ['Waiting for n8n', '#B7791F'], failed: ['Failed', '#A4483A'] };

export default function Outreach() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const leadId = sp.get('lead');
  const [term, setTerm] = useState('');
  const q = useDebounced(term);
  const [tone, setTone] = useState('friendly');
  const [offer, setOffer] = useState(() => localStorage.getItem('crm_offer') || '');
  const [msg, setMsg] = useState('');
  const [gen, setGen] = useState(false);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);

  const leads = useFetch(() => api.get(`/leads${qs({ q, limit: 8, sort: 'created_at' })}`), [q]);
  const lead = useFetch(() => (leadId ? api.get(`/leads/${leadId}`) : Promise.resolve(null)), [leadId]);
  const hist = useFetch(() => api.get(`/outreach${qs({ page, limit: 10 })}`), [page]);
  const l = lead.data?.data;

  useEffect(() => { localStorage.setItem('crm_offer', offer); }, [offer]);
  useEffect(() => setMsg(''), [leadId]);
  // While anything is waiting for n8n, re-check every 10 seconds.
  useEffect(() => {
    if (!hist.data?.counts.queued) return;
    const t = setInterval(hist.reload, 10000);
    return () => clearInterval(t);
  }, [hist.data?.counts.queued]);

  async function generate() {
    setGen(true);
    try { const r = await api.post('/outreach/generate', { leadId: Number(leadId), tone, offer }); setMsg(r.message); }
    catch (e) { toast(e.message, 'err'); }
    setGen(false);
  }
  async function send() {
    if (!window.confirm(`Send this message to ${l.person_name || l.company} on LinkedIn?`)) return;
    setSending(true);
    try { await api.post('/outreach/send', { leadId: Number(leadId), body: msg, tone }); toast('Sent to n8n'); setMsg(''); hist.reload(); lead.reload(); }
    catch (e) { toast(e.message, 'err'); }
    setSending(false);
  }

  const c = hist.data?.counts;
  return (
    <>
      <PageHeader title="Outreach" sub="Write a first message with AI, then send it on LinkedIn through n8n.">
        {c && <span className="muted num">{num(c.sent)} sent · {num(c.queued)} waiting · {num(c.failed)} failed</span>}
      </PageHeader>

      <div className="grid g-out">
        <Card title="Choose a lead">
          <div className="search"><Search size={16} /><input placeholder="Search leads" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search leads" /></div>
          <div className="pick">
            {leads.loading ? <Loading rows={5} /> : leads.error ? <ErrorBox message={leads.error} /> : !leads.data.data.length ? <Empty title="No leads found" /> : leads.data.data.map((x) => (
              <button key={x.id} className={String(x.id) === leadId ? 'on' : ''} onClick={() => setSp({ lead: x.id })}>
                <Avatar name={x.person_name || x.company} /><span><b>{x.person_name || x.company}</b><br /><small className="muted">{x.linkedin_url ? x.company || x.title || 'LinkedIn' : 'No LinkedIn URL'}</small></span>
              </button>
            ))}
          </div>
        </Card>

        <Card title={l ? `Message to ${l.person_name || l.company}` : 'Message'}>
          {!leadId ? <Empty title="Pick a lead to start" hint="Choose someone from the list, or open a lead and press Write message." /> : lead.loading ? <Loading /> : lead.error ? <ErrorBox message={lead.error} /> : (
            <>
              <p className="muted" style={{ marginBottom: 14 }}>{[l.title, l.company, [l.city, l.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')} · <Link to={`/leads/${l.id}`}>View lead</Link></p>
              {!l.linkedin_url && <div className="warn-note">This lead has no LinkedIn URL, so it cannot be sent. Add one on the lead page first.</div>}
              <Field label="What are you offering?" hint="Saved on this device. The AI only uses this and the lead's details, so be specific.">
                <textarea rows={2} value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. We build lead-gen automation for marketing agencies" />
              </Field>
              <div className="composer-foot" style={{ marginTop: 0, marginBottom: 14 }}>
                <div className="seg">{TONES.map(([k, label]) => <button key={k} className={`chip ${tone === k ? 'on' : ''}`} onClick={() => setTone(k)}>{label}</button>)}</div>
                <button className="btn" onClick={generate} disabled={gen || !offer.trim()}>{gen ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}{msg ? 'Write again' : 'Write with AI'}</button>
              </div>
              <textarea className="msg" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Your message appears here. You can edit it before sending." />
              <div className="composer-foot">
                <span className="muted num">{msg.length} characters</span>
                <button className="btn primary" disabled={!msg.trim() || !l.linkedin_url || sending} onClick={send}>{sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}Send on LinkedIn</button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card title="Sent messages" className="mt" action={<button className="btn sm" onClick={hist.reload}><RefreshCw size={14} />Refresh</button>} pad={false}>
        <div style={{ height: 0 }} />
        {hist.error ? <div className="card-body"><ErrorBox message={hist.error} /></div> : !hist.data ? <div className="card-body"><Loading /></div> : !hist.data.data.length ? <Empty title="No messages yet" hint="Messages you send appear here with their delivery status." /> : (
          <div className="tablewrap" style={{ marginTop: 14 }}><table>
            <thead><tr><th>Lead</th><th>Message</th><th>Status</th><th>By</th><th>When</th></tr></thead>
            <tbody>{hist.data.data.map((m) => (
              <tr key={m.id}>
                <td><Link to={`/leads/${m.lead_id}`}><b>{m.person_name || m.company}</b></Link></td>
                <td><div className="clip" style={{ maxWidth: 380 }} title={m.body}>{m.body}</div></td>
                <td><span className="badge" style={{ '--c': STATE[m.status][1] }} title={m.error_message || ''}>{STATE[m.status][0]}</span></td>
                <td className="muted">{m.user_name || '-'}</td>
                <td className="muted">{fmtDateTime(m.sent_at || m.created_at)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <Pager p={hist.data?.pagination} onPage={setPage} />
      </Card>
    </>
  );
}
