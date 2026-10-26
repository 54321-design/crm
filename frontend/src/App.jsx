import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, LineChart, Send, Workflow, UsersRound, History, LogOut, Menu } from 'lucide-react';
import { useAuth } from './auth';
import { APP_NAME, Avatar, Loading } from './ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Analytics from './pages/Analytics';
import Outreach from './pages/Outreach';
import Automation from './pages/Automation';
import Team from './pages/Team';
import Activity from './pages/Activity';

function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const item = (to, Icon, label) => <NavLink to={to} end={to === '/'}><Icon size={18} />{label}</NavLink>;
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><i>L</i>{APP_NAME}</div>
        <nav className="nav">
          {item('/', LayoutDashboard, 'Dashboard')}
          {item('/leads', Users, 'Leads')}
          {item('/analytics', LineChart, 'Trends')}
          {item('/outreach', Send, 'Outreach')}
          {item('/activity', History, 'Activity')}
          {can('admin', 'manager') && <><div className="nav-label">Manage</div>{item('/automation', Workflow, 'Automation')}{item('/team', UsersRound, 'Team')}</>}
        </nav>
        <div className="me">
          <Avatar name={user.name} />
          <div><b>{user.name}</b><small>{user.role}</small></div>
          <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
        </div>
      </aside>
      <div className="main">
        <div className="mobilebar"><button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Menu"><Menu size={22} /></button>{APP_NAME}</div>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}

function Protected({ roles }) {
  const { user, booting, can } = useAuth();
  const loc = useLocation();
  if (booting) return <div className="content"><Loading rows={6} /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (roles && !can(...roles)) return <Navigate to="/" replace />;
  return <Layout />;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="outreach" element={<Outreach />} />
        <Route path="activity" element={<Activity />} />
      </Route>
      <Route element={<Protected roles={['admin', 'manager']} />}>
        <Route path="automation" element={<Automation />} />
        <Route path="team" element={<Team />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
