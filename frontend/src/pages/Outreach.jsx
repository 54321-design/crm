import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Sparkles, Send, RefreshCw, Loader2 } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Card, PageHeader, Field, Avatar, Loading, ErrorBox, Empty, Pager, useFetch, useDebounced, useToast, fmtDateTime, num } from '../ui';

const TONES = [['friendly', 'Friendly'], ['professional', 'Professional'], ['direct', 'Direct'], ['curious', 'Curious']];
const STATE = { sent: ['Sent', '#1E7B63'], queued: ['Waiting for n8n', '#B7791F'], failed: ['Failed', '#A4483A'] };

/* ---------- Demo mode: fictional leads and messages for screenshots, videos and ads. Nothing is saved or sent. ---------- */
const DEMO_OFFER = 'We build lead-generation automation for local businesses.';
const DEMO_LEADS = [
  [9001, 'Ananya Sharma', 'Founder', 'Lotus Grove Realty', 'Gurugram'], [9002, 'Rohan Mehta', 'Marketing Head', 'PixelNest Studio', 'Bengaluru'],
  [9003, 'Priya Nair', 'Owner', 'Kiran Dental Studio', 'Kochi'], [9004, 'Arjun Malhotra', 'CEO', 'Orbit Fitness', 'Delhi'],
  [9005, 'Sneha Kapoor', 'Co-founder', 'Greenleaf Organics', 'Pune'], [9006, 'Vikram Rao', 'Director', 'Nimbus Cloud Labs', 'Hyderabad'],
  [9007, 'Meera Iyer', 'Owner', 'Sutra Interiors', 'Chennai'], [9008, 'Karan Bedi', 'Founder', 'BlueMango Cafe', 'Chandigarh'],
].map(([id, person_name, title, company, city]) => ({ id, person_name, title, company, city, country: 'India', linkedin_url: 'demo' }));

const sentence = (o) => (o || DEMO_OFFER).trim().replace(/[.\s]*$/, '.');
function demoMessage(l, tone, offer) {
  const f = (l.person_name || '').split(' ')[0] || 'there', c = l.company || 'your business', o = sentence(offer);
  if (tone === 'professional') return `Hello ${f}, I'm reaching out because ${c} looks like a strong fit for what we do. ${o} Would you be open to a short conversation this week?`;
  if (tone === 'direct') return `Hi ${f}, quick one. ${o} Is it worth a 10 minute chat about ${c}?`;
  if (tone === 'curious') return `Hi ${f}, I was reading about ${c} and wondered how you are finding new customers right now. ${o} Happy to share what is working for similar businesses.`;
  return `Hi ${f}, I came across ${c} and really liked what you are building${l.city ? ` in ${l.city}` : ''}. ${o} Would it help if I shared a quick example of how this could work for you?`;
}
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const seedHistory = (userName) => [
  [0, 'friendly', 'sent', 26, 20], [1, 'professional', 'sent', 50, null], [2, 'friendly', 'sent', 74, 70], [3, 'direct', 'sent', 98, null],
  [4, 'curious', 'sent', 120, 110], [5, 'professional', 'sent', 150, null], [6, 'direct', 'queued', 0.2, null],
].sort((a, b) => a[3] - b[3]).map(([i, tone, status, h, r]) => ({
  id: 8000 + i, lead_id: DEMO_LEADS[i].id, person_name: DEMO_LEADS[i].person_name, company: DEMO_LEADS[i].company,
  body: demoMessage(DEMO_LEADS[i], tone, DEMO_OFFER), status, error_message: null, user_name: userName || 'You',
  sent_at: status === 'sent' ? ago(h) : null, replied_at: r ? ago(r) : null, created_at: ago(h),
}));
const demoHistory = (rows) => ({
  data: rows, pagination: { page: 1, pages: 1, total: rows.length, limit: 10 },
  counts: { total: rows.length, sent: rows.filter((m) => m.status === 'sent').length, queued: rows.filter((m) => m.status === 'queued').length, failed: 0, replied: rows.filter((m) => m.replied_at).length },
});

export default function Outreach() {
  const { user } = useAuth();
  const [demo, setDemo] = useState(() => new URLSearchParams(window.location.search).get('demo') === '1' || localStorage.getItem('crm_demo') === '1');
  const [bar, setBar] = useState(true);
  const [dOffer, setDOffer] = useState(DEMO_OFFER);
  const [dh, setDh] = useState(() => seedHistory(user?.name));
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const leadId = sp.get('lead') || (demo ? String(DEMO_LEADS[0].id) : null);
  const [term, setTerm] = useState('');
  const q = useDebounced(term);
  const [tone, setTone] = useState('friendly');
  const [offer, setOffer] = useState(() => localStorage.getItem('crm_offer') || '');
  const [msg, setMsg] = useState('');
  const [gen, setGen] = useState(false);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);

  const leads = useFetch(() => (demo ? Promise.resolve({ data: DEMO_LEADS.filter((x) => `${x.person_name} ${x.company}`.toLowerCase().includes(q.toLowerCase())) }) : api.get(`/leads${qs({ q, limit: 8, sort: 'created_at' })}`)), [q, demo]);
  const lead = useFetch(() => (demo ? Promise.resolve({ data: DEMO_LEADS.find((x) => String(x.id) === leadId) || null }) : leadId ? api.get(`/leads/${leadId}`) : Promise.resolve(null)), [leadId, demo]);
  const hist = useFetch(() => (demo ? Promise.resolve(demoHistory(dh)) : api.get(`/outreach${qs({ page, limit: 10 })}`)), [page, demo, dh]);
  const l = lead.data?.data;

  useEffect(() => { localStorage.setItem('crm_offer', offer); }, [offer]);
  useEffect(() => setMsg(''), [leadId]);
  useEffect(() => { if (demo && l) setMsg(demoMessage(l, tone, dOffer)); }, [demo, l?.id]); // eslint-disable-line
  const offerValue = demo ? dOffer : offer;
  const setOfferValue = demo ? setDOffer : setOffer;
  function toggleDemo() { const v = !demo; localStorage.setItem('crm_demo', v ? '1' : '0'); setMsg(''); setSp({}); setDemo(v); }
  // While anything is waiting for n8n, re-check every 10 seconds.
  useEffect(() => {
    if (!hist.data?.counts.queued) return;
    const t = setInterval(hist.reload, 10000);
    return () => clearInterval(t);
  }, [hist.data?.counts.queued]);

  async function generate() {
    setGen(true);
    if (demo) {
      await new Promise((r) => setTimeout(r, 700));
      const full = demoMessage(l, tone, dOffer);
      let i = 0;
      setMsg('');
      const t = setInterval(() => { i += 4; setMsg(full.slice(0, i)); if (i >= full.length) { clearInterval(t); setGen(false); } }, 20);
      return;
    }
    try { const r = await api.post('/outreach/generate', { leadId: Number(leadId), tone, offer }); setMsg(r.message); }
    catch (e) { toast(e.message, 'err'); }
    setGen(false);
  }
  async function send() {
    if (demo) {
      setSending(true);
      await new Promise((r) => setTimeout(r, 600));
      const id = Date.now();
      setDh((h) => [{ id, lead_id: l.id, person_name: l.person_name, company: l.company, body: msg, status: 'queued', error_message: null, sent_at: null, replied_at: null, created_at: new Date().toISOString(), user_name: user?.name }, ...h]);
      toast('Message sent (demo)'); setMsg(''); setSending(false);
      setTimeout(() => setDh((h) => h.map((m) => (m.id === id ? { ...m, status: 'sent', sent_at: new Date().toISOString() } : m))), 2500);
      return;
    }
    if (!window.confirm(`Send this message to ${l.person_name || l.company} on LinkedIn?`)) return;
    setSending(true);
    try { await api.post('/outreach/send', { leadId: Number(leadId), body: msg, tone }); toast('Sent to n8n'); setMsg(''); hist.reload(); lead.reload(); }
    catch (e) { toast(e.message, 'err'); }
    setSending(false);
  }

  async function markReplied(m, replied) {
    if (demo) { setDh((h) => h.map((x) => (x.id === m.id ? { ...x, replied_at: replied ? new Date().toISOString() : null } : x))); toast(replied ? 'Marked as replied' : 'Reply removed'); return; }
    try { await api.post(`/outreach/${m.id}/replied`, { replied }); toast(replied ? 'Marked as replied' : 'Reply removed'); hist.reload(); }
    catch (e) { toast(e.message, 'err'); }
  }
  const c = hist.data?.counts;
  return (
    <>
      <PageHeader title="Outreach" sub="Write a first message with AI, then send it on LinkedIn through n8n.">
        {c && <span className="muted num">{num(c.sent)} sent · {num(c.replied)} replied{c.sent ? ` (${Math.round((c.replied / c.sent) * 100)}%)` : ''} · {num(c.queued)} waiting · {num(c.failed)} failed</span>}
        <button className="btn" onClick={toggleDemo}>{demo ? 'Exit demo mode' : 'Demo mode'}</button>
      </PageHeader>
      {demo && bar && (
        <div className="warn-note" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Demo mode: sample leads and messages for screenshots and videos. Nothing is saved or sent.</span>
          <button className="btn sm" onClick={() => setBar(false)}>Hide</button>
        </div>
      )}

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
          {!leadId ? <Empty title="Pick a lead to start" hint="Choose someone from the list, or open a lead and press Write message." /> : lead.loading ? <Loading /> : lead.error ? <ErrorBox message={lead.error} /> : !l ? <Empty title="Lead not found" /> : (
            <>
              <p className="muted" style={{ marginBottom: 14 }}>{[l.title, l.company, [l.city, l.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')} {!demo && <> · <Link to={`/leads/${l.id}`}>View lead</Link></>}</p>
              {!l.linkedin_url && <div className="warn-note">This lead has no LinkedIn URL, so it cannot be sent. Add one on the lead page first.</div>}
              <Field label="What are you offering?" hint="Saved on this device. The AI only uses this and the lead's details, so be specific.">
                <textarea rows={2} value={offerValue} onChange={(e) => setOfferValue(e.target.value)} placeholder="e.g. We build lead-gen automation for marketing agencies" />
              </Field>
              <div className="composer-foot" style={{ marginTop: 0, marginBottom: 14 }}>
                <div className="seg">{TONES.map(([k, label]) => <button key={k} className={`chip ${tone === k ? 'on' : ''}`} onClick={() => setTone(k)}>{label}</button>)}</div>
                <button className="btn" onClick={generate} disabled={gen || !offerValue.trim()}>{gen ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}{msg ? 'Write again' : 'Write with AI'}</button>
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
            <thead><tr><th>Lead</th><th>Message</th><th>Status</th><th>Reply</th><th>By</th><th>When</th></tr></thead>
            <tbody>{hist.data.data.map((m) => (
              <tr key={m.id}>
                <td>{demo ? <b>{m.person_name || m.company}</b> : <Link to={`/leads/${m.lead_id}`}><b>{m.person_name || m.company}</b></Link>}</td>
                <td><div className="clip" style={{ maxWidth: 380 }} title={m.body}>{m.body}</div></td>
                <td><span className="badge" style={{ '--c': STATE[m.status][1] }} title={m.error_message || ''}>{STATE[m.status][0]}</span></td>
                <td>{m.replied_at ? <span>Replied <button className="btn sm" onClick={() => markReplied(m, false)}>Undo</button></span> : m.status === 'sent' ? <button className="btn sm" onClick={() => markReplied(m, true)}>Mark replied</button> : <span className="muted">-</span>}</td>
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
