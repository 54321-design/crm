import { useState } from 'react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { PageHeader, Card, useFetch, num, Loading, ErrorBox, Empty, ChartTip, RANGES, STATUS_COLOR, CHART } from '../ui';

const axis = { tickLine: false, axisLine: false, fontSize: 12, stroke: '#8E9994' };

function Chart({ res, height = 260, children, empty }) {
  if (res.loading) return <Loading rows={5} />;
  if (res.error) return <ErrorBox message={res.error} onRetry={res.reload} />;
  const rows = res.data.data;
  if (!rows.length || empty?.(rows)) return <Empty title="No data in this period" hint="Try a wider date range." />;
  return <ResponsiveContainer width="100%" height={height}>{children(rows)}</ResponsiveContainer>;
}

export default function Analytics() {
  const { can } = useAuth();
  const [range, setRange] = useState('this_year');
  const [group, setGroup] = useState('month');
  const r = { range, group };
  const trend = useFetch(() => api.get(`/analytics/lead-trends${qs(r)}`), [range, group]);
  const conv = useFetch(() => api.get(`/analytics/conversion${qs(r)}`), [range, group]);
  const sources = useFetch(() => api.get(`/analytics/sources${qs({ range })}`), [range]);
  const status = useFetch(() => api.get(`/analytics/status${qs({ range })}`), [range]);
  const team = useFetch(() => (can('admin', 'manager') ? api.get(`/analytics/team${qs({ range })}`) : Promise.resolve({ data: [] })), [range]);
  const cmp = useFetch(() => api.get('/analytics/monthly-comparison'), []);

  const m = cmp.data?.data;
  const total = trend.data?.data.reduce((t, x) => t + x.count, 0);
  const peak = trend.data?.data.reduce((b, x) => (x.count > (b?.count ?? -1) ? x : b), null);

  return (
    <>
      <PageHeader title="Trends" sub="How many leads came in, and how many turned into customers.">
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group by">
          <option value="day">By day</option><option value="week">By week</option><option value="month">By month</option>
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </PageHeader>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><small>This month so far</small><b>{m ? num(m.thisMonth.total) : '-'}</b>
          <span className={`delta ${m?.changePct == null ? 'flat' : m.changePct >= 0 ? 'good' : 'bad'}`}>{m?.changePct == null ? 'no last month to compare' : `${m.changePct > 0 ? '+' : ''}${m.changePct}% vs last month (${num(m.lastMonth.total)})`}</span></div>
        <div className="card kpi"><small>Leads in selected range</small><b>{total == null ? '-' : num(total)}</b><span className="delta flat">{peak && peak.count ? `Busiest: ${peak.fullLabel} (${num(peak.count)})` : ' '}</span></div>
        <div className="card kpi"><small>Converted this month</small><b>{m ? num(m.thisMonth.converted) : '-'}</b><span className="delta flat">{m ? `${num(m.lastMonth.converted)} last month` : ' '}</span></div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <Card title="Leads received">
          <Chart res={trend}>{(rows) => (
            <AreaChart data={rows} margin={{ left: -18, right: 6, top: 8 }}>
              <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={CHART[0]} stopOpacity=".28" /><stop offset="1" stopColor={CHART[0]} stopOpacity="0" /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#E8EBE4" /><XAxis dataKey="label" {...axis} minTickGap={16} /><YAxis allowDecimals={false} {...axis} />
              <Tooltip content={<ChartTip />} /><Area type="monotone" dataKey="count" name="Leads" stroke={CHART[0]} strokeWidth={2.5} fill="url(#a)" />
            </AreaChart>)}</Chart>
        </Card>
        <Card title="Conversion rate">
          <Chart res={conv} empty={(rows) => rows.every((x) => !x.total)}>{(rows) => (
            <LineChart data={rows} margin={{ left: -10, right: 6, top: 8 }}>
              <CartesianGrid vertical={false} stroke="#E8EBE4" /><XAxis dataKey="label" {...axis} minTickGap={16} /><YAxis unit="%" {...axis} />
              <Tooltip content={<ChartTip unit="%" />} /><Line type="monotone" dataKey="rate" name="Converted" stroke={CHART[1]} strokeWidth={2.5} dot={false} />
            </LineChart>)}</Chart>
        </Card>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <Card title="Leads by source">
          <Chart res={sources} empty={(rows) => rows.every((x) => !x.total)}>{(rows) => (
            <BarChart data={rows} margin={{ left: -18, right: 6, top: 8 }}>
              <CartesianGrid vertical={false} stroke="#E8EBE4" /><XAxis dataKey="name" {...axis} /><YAxis allowDecimals={false} {...axis} />
              <Tooltip content={<ChartTip />} /><Legend iconType="circle" />
              <Bar dataKey="total" name="Total" fill={CHART[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="converted" name="Converted" fill={CHART[1]} radius={[4, 4, 0, 0]} />
            </BarChart>)}</Chart>
        </Card>
        <Card title="Pipeline by status">
          <Chart res={status} empty={(rows) => rows.every((x) => !x.count)}>{(rows) => (
            <BarChart data={rows} layout="vertical" margin={{ left: 20, right: 16 }}>
              <CartesianGrid horizontal={false} stroke="#E8EBE4" /><XAxis type="number" allowDecimals={false} {...axis} /><YAxis type="category" dataKey="status" {...axis} width={78} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} shape={(p) => <rect {...p} fill={STATUS_COLOR[p.payload.status]} rx={4} />} />
            </BarChart>)}</Chart>
        </Card>
      </div>

      <div className={`grid ${can('admin', 'manager') ? 'g2' : ''}`}>
        <Card title="Source performance" pad={false}>
          {sources.loading ? <div className="card-body"><Loading /></div> : sources.error ? null : (
            <div className="tablewrap"><table>
              <thead><tr><th>Source</th><th>Total</th><th>This month</th><th>Qualified</th><th>Converted</th><th>Rate</th></tr></thead>
              <tbody>{sources.data.data.map((s) => <tr key={s.id}><td><b>{s.name}</b></td><td className="num">{num(s.total)}</td><td className="num">{num(s.thisMonth)}</td><td className="num">{num(s.qualified)}</td><td className="num">{num(s.converted)}</td><td className="num">{s.conversionRate}%</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
        {can('admin', 'manager') && (
          <Card title="Team results" pad={false}>
            {team.loading ? <div className="card-body"><Loading /></div> : team.error ? null : !team.data.data.length ? <Empty title="No leads in this period" /> : (
              <div className="tablewrap"><table>
                <thead><tr><th>Owner</th><th>Leads</th><th>Converted</th><th>Rate</th></tr></thead>
                <tbody>{team.data.data.map((t) => <tr key={t.name}><td><b>{t.name}</b></td><td className="num">{num(t.total)}</td><td className="num">{num(t.converted)}</td><td className="num">{t.conversionRate}%</td></tr>)}</tbody>
              </table></div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
