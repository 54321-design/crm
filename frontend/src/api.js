const BASE = import.meta.env.VITE_API_URL || '';
const KEY = 'crm_token';

export const getToken = () => localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
export const setToken = (t, remember) => { clearToken(); (remember ? localStorage : sessionStorage).setItem(KEY, t); };
export const clearToken = () => { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); };

export const qs = (o = {}) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

async function request(method, path, body) {
  const t = getToken();
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check that the API is running.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (res.status === 401 && !path.startsWith('/auth/login')) { clearToken(); window.dispatchEvent(new Event('crm:logout')); }
  if (!res.ok || data?.success === false) throw Object.assign(new Error(data?.message || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b || {}),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  async download(path, fallbackName) {
    const res = await fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: fallbackName });
    a.click();
    URL.revokeObjectURL(url);
  },
};
