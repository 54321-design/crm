import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Target, LineChart, Send, Loader2 } from 'lucide-react';
import { useAuth } from '../auth';
import { APP_NAME, Field } from '../ui';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ email: '', password: '', remember: true });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await login(f.email, f.password, f.remember); nav(loc.state?.from || '/', { replace: true }); }
    catch (x) { setErr(x.message); setBusy(false); }
  }

  return (
    <div className="login">
      <div className="login-art">
        <div className="brand" style={{ padding: 0 }}><i>L</i>{APP_NAME}</div>
        <div>
          <h2>Every lead your workflows find, in one place.</h2>
          <p>Leads from LinkedIn and Google Maps land here automatically. Review them, write the first message with AI, and send it.</p>
        </div>
        <ul>
          <li><Target size={18} />Leads sync from your n8n workflows, duplicates merged</li>
          <li><LineChart size={18} />See what came in today, this week and this month</li>
          <li><Send size={18} />Send LinkedIn messages through n8n without leaving the CRM</li>
        </ul>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <h1>Sign in</h1>
          <p className="sub">Use the account your admin created for you.</p>
          {err && <div className="errorbox" role="alert" style={{ marginBottom: 16 }}><span>{err}</span></div>}
          <Field label="Email"><input type="email" required autoFocus autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Password">
            <div className="pw">
              <input type={show ? 'text' : 'password'} required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </Field>
          <label className="remember"><input type="checkbox" checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} />Keep me signed in for 30 days</label>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy && <Loader2 size={16} className="spin" />}{busy ? 'Signing in' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
