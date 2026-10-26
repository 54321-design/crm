import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { PageHeader, Card, useFetch, num, Delta, StatusBadge, Avatar, Loading, ErrorBox, Empty, timeAgo, ChartTip, RANGES, STATUS_COLOR, CHART } from '../ui';

const DASH_RANGES = RANGES.filter(([k]) => ['7d', '30d', 'this_month', '3m', 'this_year'].includes(k));
const dotFor = (t) => (t === 'lead_converted' ? '' : t === 'outreach_failed' ? 'bad' : t === 'duplicate_detected' || t === 'lead_updated' ? 'mute' : t === 'lead_contacted' ? 'warn' : '');

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [range, setRange] = useState('30d');
  const group = range === 'this_year' ? 'month' : range === '3m' ? 'week' : 'day';

  const pulse = useFetch(() => Promise.all(['today', '7d', 'this_month'].map((r) => api.get(`/dashboard/stats${qs({ range: r })}`))), []);
  const stats = useFetch(() => api.get(`/dashboard/stats${qs({ range })}`), [range]);
  const trend = useFetch(() => api.get(`/dashboard/lead-trends${qs({ range, group })}`), [range]);
  const sources = useFetch(() => api.get(`/analytics/sources${qs({ range })}`), [range]);
  const recent = useFetch(() => api.get('/dashboard/recent-leads?limit=7'), []);
  const activity = useFetch(() => api.get('/dashboard/recent-activity?limit=8'), []);

  const k = stats.data?.kpis;
  const cards = k && [
    ['Total leads', k.totalLeads], ['New', k.newLeads], ['Qualified', k.qualifiedLeads],
    ['Converted', k.convertedLeads], ['Lost', k.lostLeads, true], ['Conversion rate', k.conversionRate, false, '%'],
  ];
  const maxSrc = Math.max(1, ...(sources.data?.data || []).map((s) => s.total));
  const hello = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader title={`${hello}, ${user.name.split(' ')[0]}`} sub="Here is what your lead pipeline looks like.">
        <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
          {DASH_RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </PageHeader>

      <div className="pulse">
        {['New today', 'Last 7 days', 'This month'].map((label, i) => (
          <div key={label}><small>{label}</small><b>{pulse.data ? num(pulse.data[i].kpis.totalLeads.value) : '-'}</b></div>
        ))}
      </div>

      {stats.error ? <ErrorBox message={stats.error} onRetry={stats.reload} /> : (
        <div className="kpis">
          {(cards || Array.from({ length: 6 })).map((c, i) => (
            <div className="card kpi" key={i}>
              {c ? <><small>{c[0]}</small><b>{num(c[1].value)}{c[3] || ''}</b><Delta value={c[1].value} previous={c[1].previous} invert={c[2]} /></> : <Loading rows={2} />}
            </div>
          ))}
        </div>
      )}

      <div className="grid g32" style={{ marginBottom: 16 }}>
        <Card title="Leads over time">
          {trend.loading ? <Loading rows={6} /> : trend.error ? <ErrorBox message={trend.error} onRetry={trend.reload} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trend.data.data} margin={{ left: -18, right: 6, top: 8 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={CHART[0]} stopOpacity=".28" /><stop offset="1" stopColor={CHART[0]} stopOpacity="0" /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#E8EBE4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="#8E9994" minTickGap={18} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="#8E9994" />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="count" name="Leads" stroke={CHART[0]} strokeWidth={2.5} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Where leads come from" action={<Link to="/analytics">All trends</Link>}>
          {sources.loading ? <Loading /> : sources.error ? <ErrorBox message={sources.error} /> : sources.data.data.every((s) => !s.total) ? <Empty title="No leads in this period" /> : (
            <div className="bars">
              {sources.data.data.filter((s) => s.total).map((s, i) => (
                <div className="bar-row" key={s.id} style={{ '--c': CHART[i % CHART.length] }}>
                  <div className="top"><span>{s.name}</span><b className="num">{num(s.total)}</b></div>
                  <div className="track"><div className="fill" style={{ width: `${(s.total / maxSrc) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid g32">
        <Card title="Latest leads" action={<Link to="/leads">View all</Link>} pad={false}>
          {recent.loading ? <div className="card-body"><Loading /></div> : recent.error ? <div className="card-body"><ErrorBox message={recent.error} /></div> : !recent.data.data.length ? <Empty title="No leads yet" hint="Leads appear here as soon as your n8n sheets sync." /> : (
            <div className="tablewrap"><table><tbody>
              {recent.data.data.map((l) => (
                <tr key={l.id} className="click" onClick={() => nav(`/leads/${l.id}`)}>
                  <td><div className="cell-person"><Avatar name={l.person_name || l.company} /><div><b>{l.person_name || l.company || 'Unnamed lead'}</b><small>{l.person_name ? l.company : l.source}</small></div></div></td>
                  <td className="muted">{l.source}</td>
                  <td><StatusBadge status={l.status} /></td>
                  <td className="muted">{timeAgo(l.created_at)}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
        <Card title="Recent activity" action={<Link to="/activity">See all</Link>}>
          {activity.loading ? <Loading /> : activity.error ? <ErrorBox message={activity.error} /> : !activity.data.data.length ? <Empty title="Nothing yet" /> : (
            <ul className="feed">
              {activity.data.data.map((a) => (
                <li key={a.id}><span className={`dot ${dotFor(a.type)}`} />
                  <div><Link to={`/leads/${a.lead_id}`}>{a.person_name || a.company || `Lead #${a.lead_id}`}</Link><div>{a.description}</div><small>{timeAgo(a.created_at)}{a.user_name ? ` by ${a.user_name}` : ''}</small></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
