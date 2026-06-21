// Server returns ISO strings without timezone suffix → treat as UTC
export function parseUTC(ts) {
  if (!ts) return null;
  if (ts.endsWith('Z') || ts.includes('+')) return new Date(ts);
  return new Date(ts + 'Z');
}

export async function clearAuth() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
}

export async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
  const resp = await fetch(path, { ...opts, headers, credentials: 'include' });
  if (resp.status === 401) {
    clearAuth().catch(() => {});
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (resp.status === 403) {
    throw new Error('Forbidden - insufficient permissions');
  }
  if (resp.status === 204) return null;
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function deleteDevice(id) {
  return apiFetch(`/api/devices/${id}`, { method: 'DELETE' });
}

export async function updateDevice(id, data) {
  return apiFetch(`/api/devices/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function sendCommand(deviceId, type, payload = {}) {
  return apiFetch(`/api/devices/${deviceId}/commands`, {
    method: 'POST',
    body: JSON.stringify({ type, payload }),
  });
}

export async function login(username, password) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}
