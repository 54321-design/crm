import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { PageHeader, Card, Modal, Field, Avatar, Loading, ErrorBox, useFetch, useToast, num } from '../ui';

function UserForm({ user, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', role: user?.role || 'employee', password: '', is_active: user ? user.is_active : true });
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault(); setBusy(true);
    try {
      if (user) await api.put(`/team/${user.id}`, { name: f.name, role: f.role, is_active: f.is_active, ...(f.password ? { password: f.password } : {}) });
      else await api.post('/team', f);
      toast(user ? 'User updated' : 'User added'); onDone();
    } catch (x) { toast(x.message, 'err'); setBusy(false); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={user ? 'Edit user' : 'Add user'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Name"><input required value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input type="email" required disabled={!!user} value={f.email} onChange={set('email')} /></Field>
        <Field label="Role" hint="Admin: everything. Manager: leads, trends, automation. Employee: only leads assigned to them.">
          <select style={{ width: '100%' }} value={f.role} onChange={set('role')}><option value="employee">Employee</option><option value="manager">Manager</option><option value="admin">Admin</option></select></Field>
        <Field label={user ? 'New password' : 'Password'} hint={user ? 'Leave empty to keep the current password.' : 'At least 8 characters.'}>
          <input type="password" autoComplete="new-password" required={!user} minLength={8} value={f.password} onChange={set('password')} /></Field>
        {user && <label className="remember"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Account is active</label>}
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{user ? 'Save changes' : 'Add user'}</button></div>
      </form>
    </Modal>
  );
}

export default function Team() {
  const { can, user: me } = useAuth();
  const list = useFetch(() => api.get('/team'), []);
  const [form, setForm] = useState(null);
  const admin = can('admin');
  return (
    <>
      <PageHeader title="Team" sub="Who can sign in, and how their leads are doing.">
        {admin && <button className="btn primary" onClick={() => setForm({})}><Plus size={16} />Add user</button>}
      </PageHeader>
      <Card pad={false}>
        {list.error ? <div className="card-body"><ErrorBox message={list.error} onRetry={list.reload} /></div> : !list.data ? <div className="card-body"><Loading /></div> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Member</th><th>Role</th><th>Assigned</th><th>Converted</th><th>Rate</th><th>Status</th>{admin && <th />}</tr></thead>
            <tbody>{list.data.data.map((u) => (
              <tr key={u.id}>
                <td><div className="cell-person"><Avatar name={u.name} /><div><b>{u.name}{u.id === me.id && ' (you)'}</b><small>{u.email}</small></div></div></td>
                <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                <td className="num">{num(u.assigned_leads)}</td><td className="num">{num(u.converted_leads)}</td><td className="num">{u.conversion_rate}%</td>
                <td><span className="badge" style={{ '--c': u.is_active ? '#1E7B63' : '#7A8A86' }}>{u.is_active ? 'Active' : 'Deactivated'}</span></td>
                {admin && <td><button className="btn sm" onClick={() => setForm(u)}>Edit</button></td>}
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
      {form && <UserForm user={form.id ? form : null} onClose={() => setForm(null)} onDone={() => { setForm(null); list.reload(); }} />}
    </>
  );
}
