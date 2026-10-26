import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, clearToken } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api.get('/auth/me').then((r) => setUser(r.user)).catch(() => clearToken()).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('crm:logout', out);
    return () => window.removeEventListener('crm:logout', out);
  }, []);

  const login = useCallback(async (email, password, remember) => {
    const r = await api.post('/auth/login', { email, password, remember });
    setToken(r.token, remember);
    setUser(r.user);
  }, []);
  const logout = useCallback(() => { clearToken(); setUser(null); }, []);
  const can = (...roles) => !!user && roles.includes(user.role);

  return <Ctx.Provider value={{ user, booting, login, logout, can }}>{children}</Ctx.Provider>;
}
