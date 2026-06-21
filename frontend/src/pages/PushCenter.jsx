import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../api/client.js';

const C = {
  surface2: '#10121f',
  surface3: '#141728',
  border: 'rgba(255,255,255,0.05)',
  borderMd: 'rgba(255,255,255,0.09)',
  text: '#c9d1e8',
  text2: '#4e5a70',
  accent: '#3b82f6',
  accentBg: 'rgba(59,130,246,0.09)',
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.09)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.09)',
  mono: "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans: "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

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

export default function PushCenter() {
  const [subscribers, setSubscribers] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [target, setTarget] = useState('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    apiFetch('/api/push/subscribers').then(setSubscribers).catch(() => {});
  }, []);

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const r = await apiFetch('/api/push/send', {
        method: 'POST',
        body: JSON.stringify({ title, body, url, target }),
      });
      setResult(r);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setSending(false);
    }
  }

  const subscribed = subscribers.filter(s => s.subscribed).length;
  const canSend = !sending && !!title;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{ fontFamily: C.sans, color: C.text }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Push Center</h1>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>{subscribed} active subscribers</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Compose */}
        <div style={{
          background: C.surface3, borderRadius: 8, padding: '14px 16px',
          border: `1px solid ${C.borderMd}`,
        }}>
          <div style={labelStyle}>Compose Message</div>

          <label style={labelStyle}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Important update!" style={fieldStyle} />

          <label style={labelStyle}>Body</label>
          <textarea value={body} onChange={e => setBody(e.target.value)}
            placeholder="You have a new update..." rows={3}
            style={{ ...fieldStyle, resize: 'vertical', fontFamily: C.mono }} />

          <label style={labelStyle}>Click URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="/" style={fieldStyle} dir="ltr" />

          <label style={labelStyle}>Target</label>
          <select value={target} onChange={e => setTarget(e.target.value)} style={fieldStyle}>
            <option value="all">All subscribers ({subscribed})</option>
            {subscribers.filter(s => s.subscribed).map(s => (
              <option key={s.id} value={String(s.id)}>{s.name} (#{s.id})</option>
            ))}
          </select>

          <button
            onClick={send}
            disabled={!canSend}
            style={{
              width: '100%', height: 32, borderRadius: 6, border: 'none',
              background: canSend ? C.accent : 'transparent',
              border: canSend ? 'none' : `1px solid ${C.borderMd}`,
              color: canSend ? '#fff' : C.text2,
              fontSize: 12, fontWeight: 600,
              cursor: canSend ? 'pointer' : 'default',
              marginTop: 14,
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </div>

        {/* Preview + result */}
        <div>
          <div style={{
            background: C.surface3, borderRadius: 8, padding: '14px 16px',
            border: `1px solid ${C.borderMd}`, marginBottom: 14,
          }}>
            <div style={labelStyle}>Preview</div>
            <div style={{
              background: C.surface2, borderRadius: 8, padding: '10px 12px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
              border: `1px solid ${C.border}`, marginTop: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: C.accentBg, border: `1px solid rgba(59,130,246,0.2)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>
                ⚡
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>
                  {title || 'Notification Title'}
                </div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 3 }}>
                  {body || 'Notification body will appear here...'}
                </div>
              </div>
              <div style={{ fontSize: 10, color: C.text2, flexShrink: 0 }}>now</div>
            </div>
          </div>

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                background: C.surface3, borderRadius: 8, padding: '14px 16px',
                border: `1px solid ${C.borderMd}`,
              }}
            >
              <div style={labelStyle}>Send Results</div>
              {result.error ? (
                <div style={{
                  background: C.redBg, border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 6, padding: '8px 10px', fontSize: 12, color: C.red, marginTop: 8,
                }}>
                  {result.error}
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                    <span style={{ color: C.green, fontWeight: 700, fontSize: 16 }}>
                      {result.sent} sent
                    </span>
                    <span style={{ color: C.red, fontWeight: 700, fontSize: 16 }}>
                      {result.failed} failed
                    </span>
                  </div>
                  {result.results?.filter(r => !r.ok).map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: C.red, marginBottom: 2 }}>
                      {r.name}: {r.error}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
