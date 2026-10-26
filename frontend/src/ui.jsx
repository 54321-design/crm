import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'LeadDesk';
export const STATUSES = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
export const STATUS_COLOR = { New: '#3B6FB6', Contacted: '#B7791F', Qualified: '#6B4FBB', Converted: '#1E7B63', Lost: '#A4483A' };
export const CHART = ['#1E7B63', '#E3A23B', '#3B6FB6', '#6B4FBB', '#A4483A', '#7A8A86'];

/* ---------- formatting ---------- */
export const num = (n) => (n == null ? '-' : Number(n).toLocaleString('en-IN'));
export const parseDate = (s) => (s ? new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z') : null);
export const fmtDate = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'; };
export const fmtDateTime = (s) => { const d = parseDate(s); return d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-'; };
export function timeAgo(s) {
  const d = parseDate(s); if (!d) return '-';
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(s);
}
export const initials = (n = '?') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/* ---------- data hook ---------- */
export function useFetch(fn, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: '' });
  const n = useRef(0);
  const load = useCallback(() => {
    const id = ++n.current;
    set((s) => ({ ...s, loading: true, error: '' }));
    Promise.resolve().then(fn).then(
      (data) => id === n.current && set({ data, loading: false, error: '' }),
      (e) => id === n.current && set({ data: null, loading: false, error: e.message })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* ---------- toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.kind === 'ok' ? <Check size={16} /> : <AlertCircle size={16} />}{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- building blocks ---------- */
export function PageHeader({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export const Card = ({ title, action, children, className = '', pad = true }) => (
  <section className={`card ${className}`}>
    {(title || action) && <header className="card-head"><h2>{title}</h2>{action}</header>}
    <div className={pad ? 'card-body' : ''}>{children}</div>
  </section>
);

export const StatusBadge = ({ status }) => (
  <span className="badge" style={{ '--c': STATUS_COLOR[status] || '#7A8A86' }}>{status}</span>
);

export const Avatar = ({ name, size = 32 }) => (
  <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>
);

export function Delta({ value, previous, invert }) {
  if (previous == null || value == null || previous === 0) return <span className="delta flat">no prior data</span>;
  const p = ((value - previous) / previous) * 100;
  if (Math.abs(p) < 0.05) return <span className="delta flat">no change</span>;
  const good = invert ? p < 0 : p > 0;
  const Icon = p > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`delta ${good ? 'good' : 'bad'}`}><Icon size={14} />{Math.abs(p).toFixed(1)}% vs previous</span>;
}

export const Loading = ({ rows = 4 }) => (
  <div className="skeletons">{Array.from({ length: rows }).map((_, i) => <div key={i} className="skel" />)}</div>
);
export const ErrorBox = ({ message, onRetry }) => (
  <div className="errorbox"><AlertCircle size={18} /><span>{message}</span>{onRetry && <button className="btn sm" onClick={onRetry}>Try again</button>}</div>
);
export const Empty = ({ title, hint, children }) => (
  <div className="empty"><strong>{title}</strong>{hint && <p>{hint}</p>}{children}</div>
);

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);

export function Pager({ p, onPage }) {
  if (!p || p.pages <= 1) return p ? <div className="pager"><span>{num(p.total)} result{p.total === 1 ? '' : 's'}</span></div> : null;
  return (
    <div className="pager">
      <span>{num(p.total)} results</span>
      <div>
        <button className="btn sm" disabled={p.page <= 1} onClick={() => onPage(p.page - 1)}>Previous</button>
        <span className="pager-n">Page {p.page} of {p.pages}</span>
        <button className="btn sm" disabled={p.page >= p.pages} onClick={() => onPage(p.page + 1)}>Next</button>
      </div>
    </div>
  );
}

export const RANGES = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['this_month', 'This month'], ['last_month', 'Last month'], ['3m', 'Last 3 months'], ['6m', 'Last 6 months'], ['this_year', 'This year'], ['all', 'All time']];

export const ChartTip = ({ active, payload, label, unit = '' }) =>
  active && payload?.length ? (
    <div className="tip"><b>{payload[0].payload.fullLabel || label}</b>
      {payload.map((p) => <div key={p.dataKey}><i style={{ background: p.color || p.stroke || p.fill }} />{p.name}: {num(p.value)}{unit}</div>)}
    </div>
  ) : null;
