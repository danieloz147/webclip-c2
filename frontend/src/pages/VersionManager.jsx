import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
  red: '#ef4444',
  mono: "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans: "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.09em', textTransform: 'uppercase',
  color: C.text2, marginBottom: 10,
};

export default function VersionManager() {
  const [versions, setVersions] = useState([]);
  const [bundleText, setBundleText] = useState('{}');
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState('');

  const load = () => apiFetch('/api/versions/').then(setVersions).catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  async function publish() {
    setPublishing(true); setResult('');
    try {
      let bundle;
      try { bundle = JSON.parse(bundleText); }
      catch { setResult('Invalid JSON'); setPublishing(false); return; }
      const r = await apiFetch('/api/versions/', { method: 'POST', body: JSON.stringify({ bundle }) });
      setResult(`ok:Version ${r.version_hash} published`);
      await load();
    } catch (e) {
      setResult(`err:${e.message}`);
    } finally {
      setPublishing(false);
    }
  }

  async function setCurrent(id) {
    await apiFetch(`/api/versions/${id}/set-current`, { method: 'POST' });
    await load();
  }

  const current = versions.find(v => v.is_current);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{ fontFamily: C.sans, color: C.text }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Version Manager</h1>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>
          Active:{' '}
          <span style={{ fontFamily: C.mono, color: C.accent }}>
            {current?.version_hash || 'none'}
          </span>
          {' - '}{current?.device_count || 0} devices
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Version list */}
        <div>
          <div style={labelStyle}>Version History</div>
          {versions.length === 0 ? (
            <div style={{ color: C.text2, padding: 16, fontSize: 12 }}>No versions yet</div>
          ) : versions.map(v => (
            <div key={v.id} style={{
              background: C.surface3, borderRadius: 8, padding: '12px 14px', marginBottom: 8,
              border: v.is_current ? `1px solid ${C.borderHi}` : `1px solid ${C.borderMd}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontFamily: C.mono, fontSize: 12, color: C.text }}>
                  {v.version_hash}
                  {v.is_current && (
                    <span style={{
                      marginLeft: 8, background: C.accentBg, color: C.accent,
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      border: '1px solid rgba(59,130,246,0.2)',
                    }}>
                      active
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>
                  {v.published_at ? new Date(v.published_at).toLocaleString('en-US') : '-'}
                  {' - '}{v.device_count} devices
                </div>
              </div>
              {!v.is_current && (
                <button onClick={() => setCurrent(v.id)} style={{
                  height: 26, padding: '0 10px', borderRadius: 5, border: `1px solid ${C.borderMd}`,
                  background: 'transparent', color: C.text, fontSize: 11, cursor: 'pointer',
                  fontWeight: 600,
                }}>
                  Activate
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Publish new */}
        <div>
          <div style={labelStyle}>Publish New Version</div>
          <div style={{
            background: C.surface3, borderRadius: 8, padding: '14px 16px',
            border: `1px solid ${C.borderMd}`,
          }}>
            <div style={{
              background: C.accentBg, border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 6, padding: '10px 12px', fontSize: 12, color: C.text,
              lineHeight: 1.6, marginBottom: 12,
            }}>
              Bundle JSON - values injected into the WebClip (persona, feature flags, config).
              Hash is computed automatically.
            </div>
            <textarea
              value={bundleText}
              onChange={e => setBundleText(e.target.value)}
              rows={10}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 6,
                border: `1px solid ${C.borderMd}`, background: C.surface2,
                color: C.text, fontSize: 12, fontFamily: C.mono,
                outline: 'none', resize: 'vertical', display: 'block', boxSizing: 'border-box',
              }}
              dir="ltr"
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <button
                onClick={publish}
                disabled={publishing}
                style={{
                  height: 30, padding: '0 12px', borderRadius: 6, border: 'none',
                  background: publishing ? 'transparent' : C.green,
                  border: publishing ? `1px solid ${C.borderMd}` : 'none',
                  color: publishing ? C.text2 : '#fff',
                  fontSize: 12, fontWeight: 600, cursor: publishing ? 'default' : 'pointer',
                  opacity: publishing ? 0.5 : 1,
                }}
              >
                {publishing ? 'Publishing...' : 'Publish Version'}
              </button>
              {result && (
                <span style={{
                  fontSize: 12,
                  color: result.startsWith('ok:') ? C.green : C.red,
                }}>
                  {result.startsWith('ok:') ? result.slice(3) : result.startsWith('err:') ? result.slice(4) : result}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
