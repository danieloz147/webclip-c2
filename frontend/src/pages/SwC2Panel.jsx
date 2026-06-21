import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../api/client.js';

// Design tokens
const C = {
  bg: '#07080f',
  surface: '#0c0d1a',
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
  amberBg: 'rgba(245,158,11,0.09)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.09)',
  cyan: '#22d3ee',
  purple: '#a78bfa',
  mono: "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans: "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

const card = {
  background: C.surface3,
  border: `1px solid ${C.borderMd}`,
  borderRadius: 8,
  padding: '14px 16px',
  marginBottom: 16,
};

const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.09em', textTransform: 'uppercase',
  color: C.text2, marginBottom: 10,
};

const fieldStyle = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  border: `1px solid ${C.borderMd}`, background: C.surface2,
  color: C.text, fontSize: 13, outline: 'none',
  display: 'block', boxSizing: 'border-box',
};

const btnBase = {
  height: 30, padding: '0 12px', borderRadius: 6,
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: 'none', display: 'inline-flex', alignItems: 'center',
};

const btns = {
  primary: { ...btnBase, background: C.accent, color: '#fff' },
  ghost: { ...btnBase, background: 'transparent', border: `1px solid ${C.borderMd}`, color: C.text },
  danger: { ...btnBase, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: C.red },
  green: { ...btnBase, background: C.greenBg, border: '1px solid rgba(34,197,94,0.25)', color: C.green },
};

const disabled = { opacity: 0.4, cursor: 'default' };

// Helpers
function relTime(ts) {
  if (!ts) return 'never';
  const diff = Math.floor((Date.now() - ts * 1000) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function isAlive(ts) {
  if (!ts) return false;
  return (Date.now() - ts * 1000) < 10 * 60 * 1000;
}

function fmtTime(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleTimeString();
}

// Sparkline
function Sparkline({ heartbeats }) {
  const recent = [...heartbeats].slice(-10);
  if (!recent.length) {
    return <div style={{ fontSize: 12, color: C.text2, marginTop: 8 }}>No heartbeats yet</div>;
  }
  const now = Date.now() / 1000;
  const windowSec = 30 * 60;
  const width = 320;
  const height = 32;
  return (
    <div style={{ position: 'relative', width, height, marginTop: 10 }}>
      <div style={{
        position: 'absolute', bottom: 4, left: 0, right: 0,
        height: 1, background: C.border,
      }} />
      {recent.map((hb, i) => {
        const age = now - hb.ts;
        const x = Math.max(0, Math.min(width - 8, ((windowSec - age) / windowSec) * width));
        const alive = age < 10 * 60;
        return (
          <div key={i} title={`${hb.device_id} @ ${fmtTime(hb.ts)}`} style={{
            position: 'absolute', left: x, bottom: 8,
            width: 8, height: 8, borderRadius: '50%',
            background: alive ? C.green : C.text2,
            border: `1px solid ${C.surface}`,
          }} />
        );
      })}
    </div>
  );
}

// Self-destruct dialog
function SelfDestructDialog({ onConfirm, onCancel, loading }) {
  const [val, setVal] = useState('');
  const confirmed = val === 'CONFIRM';
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.15 }}
        style={{
          background: C.surface3, border: `1px solid ${C.red}`,
          borderRadius: 10, padding: 24, width: 360,
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>☢️</div>
        <h3 style={{ margin: '0 0 8px', color: C.red, fontSize: 15, fontWeight: 700 }}>
          Self-Destruct Confirmation
        </h3>
        <p style={{ fontSize: 12, color: C.text, margin: '0 0 14px', lineHeight: 1.6 }}>
          The Service Worker will unregister itself and clear all caches.
          Type <strong style={{ color: '#fff' }}>CONFIRM</strong> to proceed.
        </p>
        <input
          value={val} onChange={e => setVal(e.target.value)}
          placeholder="Type CONFIRM"
          style={{ ...fieldStyle, border: `1px solid rgba(239,68,68,0.4)`, marginBottom: 14 }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={btns.ghost}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || loading}
            style={{ ...btns.danger, ...((!confirmed || loading) ? disabled : {}) }}
          >
            {loading ? 'Sending...' : 'Destroy SW'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Set Config inline form
function SetConfigForm({ onSubmit, loading }) {
  const [server, setServer] = useState('');
  const [token, setToken] = useState('');
  return (
    <div style={{
      marginTop: 10, padding: 12, borderRadius: 6,
      background: C.surface2, border: `1px solid ${C.borderMd}`,
    }}>
      <label style={labelStyle}>Server URL</label>
      <input value={server} onChange={e => setServer(e.target.value)}
        placeholder="https://your-c2.example.com" style={fieldStyle} />
      <div style={{ marginTop: 8 }}>
        <label style={labelStyle}>Token</label>
        <input value={token} onChange={e => setToken(e.target.value)}
          placeholder="secret-token" type="password" style={fieldStyle} />
      </div>
      <button
        onClick={() => onSubmit({ server, token })}
        disabled={!server || loading}
        style={{
          ...btns.primary,
          marginTop: 10,
          ...(!server || loading ? disabled : {}),
        }}
      >
        {loading ? 'Sending...' : 'Apply Config'}
      </button>
    </div>
  );
}

// Main component
export default function SwC2Panel() {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState(null);
  const [statusErr, setStatusErr] = useState(null);
  const [heartbeats, setHeartbeats] = useState([]);
  const [cmdLog, setCmdLog] = useState([]);
  const [actionStatus, setActionStatus] = useState(null);
  const [showSetConfig, setShowSetConfig] = useState(false);
  const [showDestruct, setShowDestruct] = useState(false);
  const [cmdLoading, setCmdLoading] = useState(false);
  const [destructLoading, setDestructLoading] = useState(false);

  const statusTimerRef = useRef(null);
  const hbTimerRef = useRef(null);
  const flashTimerRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/devices').then(devs => {
      setDevices(devs);
      if (devs.length > 0 && !selectedId) setSelectedId(devs[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStatus = useCallback(() => {
    if (!selectedId) return;
    apiFetch(`/api/sw-c2/status/${selectedId}`)
      .then(s => { setStatus(s); setStatusErr(null); })
      .catch(e => setStatusErr(e.message));
  }, [selectedId]);

  useEffect(() => {
    setStatus(null);
    setStatusErr(null);
    fetchStatus();
    clearInterval(statusTimerRef.current);
    statusTimerRef.current = setInterval(fetchStatus, 10_000);
    return () => clearInterval(statusTimerRef.current);
  }, [fetchStatus]);

  const fetchHB = useCallback(() => {
    apiFetch('/api/sw-c2/heartbeats').then(setHeartbeats).catch(() => {});
  }, []);

  useEffect(() => {
    fetchHB();
    clearInterval(hbTimerRef.current);
    hbTimerRef.current = setInterval(fetchHB, 15_000);
    return () => clearInterval(hbTimerRef.current);
  }, [fetchHB]);

  function flash(ok, msg) {
    clearTimeout(flashTimerRef.current);
    setActionStatus({ ok, msg });
    flashTimerRef.current = setTimeout(() => setActionStatus(null), 3000);
  }

  function logCmd(type, result) {
    setCmdLog(prev => [{ type, ts: Date.now(), result }, ...prev].slice(0, 20));
  }

  async function sendCommand(type, payload = {}) {
    if (!selectedId) return;
    setCmdLoading(true);
    try {
      const r = await apiFetch(`/api/sw-c2/command/${selectedId}`, {
        method: 'POST',
        body: JSON.stringify({ type, payload }),
      });
      logCmd(type, r.ok ? 'sent' : `error: ${r.error ?? 'push failed'}`);
      flash(r.ok, r.ok ? `Command "${type}" sent` : `Push failed: ${r.error}`);
      fetchStatus();
    } catch (e) {
      logCmd(type, `error: ${e.message}`);
      flash(false, e.message);
    } finally {
      setCmdLoading(false);
    }
  }

  async function handleDestruct() {
    if (!selectedId) return;
    setDestructLoading(true);
    try {
      const r = await apiFetch(`/api/sw-c2/self-destruct/${selectedId}`, { method: 'POST' });
      logCmd('self_destruct', r.ok ? 'sent' : `error: ${r.error}`);
      flash(r.ok, r.ok ? 'Self-destruct sent' : `Failed: ${r.error}`);
      fetchStatus();
    } catch (e) {
      logCmd('self_destruct', `error: ${e.message}`);
      flash(false, e.message);
    } finally {
      setDestructLoading(false);
      setShowDestruct(false);
    }
  }

  const visibleHB = [...heartbeats].reverse().slice(0, 20);
  const deviceHB = selectedId ? heartbeats.filter(h => h.device_id === selectedId) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{ maxWidth: 1100, margin: '0 auto', fontFamily: C.sans, color: C.text }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: C.text }}>
          SW C2 - Persistent Background Agent
        </h1>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>
          Silent command channel via Service Worker push - in-memory state
        </div>
      </div>

      {/* Device Selector */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: C.text2 }}>Target device</span>
        <select
          value={selectedId ?? ''}
          onChange={e => setSelectedId(Number(e.target.value))}
          style={{ ...fieldStyle, width: 'auto', minWidth: 220 }}
        >
          {devices.length === 0 && <option value="">No devices registered</option>}
          {devices.map(d => (
            <option key={d.id} value={d.id}>#{d.id} - {d.name}</option>
          ))}
        </select>
        {status && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
              fontWeight: 600,
              background: status.push_capable ? C.greenBg : C.amberBg,
              color: status.push_capable ? C.green : C.amber,
              border: status.push_capable ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(245,158,11,0.25)',
            }}>
              {status.push_capable ? 'Push OK' : 'No Push'}
            </span>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
              fontWeight: 600, background: 'transparent',
              border: `1px solid ${C.borderMd}`, color: C.text2,
            }}>
              {status.commands_sent} sent
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Left: Status + Quick Actions */}
        <div>
          <div style={card}>
            <div style={labelStyle}>SW Status</div>
            {statusErr && (
              <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>{statusErr}</div>
            )}
            {!status && !statusErr && (
              <div style={{ color: C.text2, fontSize: 12 }}>Loading...</div>
            )}
            {status && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

                <div style={{ background: C.surface2, borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: C.text2, marginBottom: 6 }}>Last heartbeat</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: isAlive(status.last_heartbeat) ? C.green : C.red,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {relTime(status.last_heartbeat)}
                    </span>
                  </div>
                </div>

                <div style={{ background: C.surface2, borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: C.text2, marginBottom: 6 }}>Last sync</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{relTime(status.last_sync)}</div>
                </div>

                <div style={{ background: C.surface2, borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: C.text2, marginBottom: 6 }}>SW registered</div>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
                    fontWeight: 600,
                    background: status.push_capable ? C.greenBg : 'transparent',
                    color: status.push_capable ? C.green : C.text2,
                    border: status.push_capable ? '1px solid rgba(34,197,94,0.25)' : `1px solid ${C.borderMd}`,
                  }}>
                    {status.push_capable ? 'Yes' : 'No'}
                  </span>
                </div>

                <div style={{ background: C.surface2, borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: C.text2, marginBottom: 6 }}>Queue depth</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{status.command_queue_len}</div>
                </div>

                {status.self_destruct_sent && (
                  <div style={{
                    gridColumn: '1 / -1', background: C.redBg,
                    border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 6,
                    padding: '10px 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: C.red, fontWeight: 600, fontSize: 12,
                  }}>
                    ☢️ Self-destruct command has been sent to this device
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, color: C.text2, marginBottom: 4 }}>
                Heartbeat timeline (30 min window)
              </div>
              <Sparkline heartbeats={deviceHB} />
            </div>
          </div>

          {/* Quick Actions */}
          <div style={card}>
            <div style={labelStyle}>Quick Actions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <button
                onClick={() => sendCommand('ping')}
                disabled={!selectedId || cmdLoading}
                style={{ ...btns.primary, ...(!selectedId || cmdLoading ? disabled : {}) }}
              >
                Ping
              </button>
              <button
                onClick={() => sendCommand('get_info')}
                disabled={!selectedId || cmdLoading}
                style={{ ...btns.ghost, ...(!selectedId || cmdLoading ? disabled : {}) }}
              >
                Get Info
              </button>
              <button
                onClick={() => setShowSetConfig(s => !s)}
                disabled={!selectedId}
                style={{ ...btns.ghost, ...(!selectedId ? disabled : {}) }}
              >
                {showSetConfig ? 'Cancel Config' : 'Set Config'}
              </button>
            </div>

            <AnimatePresence>
              {showSetConfig && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}
                >
                  <SetConfigForm
                    loading={cmdLoading}
                    onSubmit={({ server, token }) => {
                      setShowSetConfig(false);
                      sendCommand('set_config', { server, token });
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <button
                onClick={() => setShowDestruct(true)}
                disabled={!selectedId || status?.self_destruct_sent}
                style={{
                  ...btns.danger,
                  width: '100%', justifyContent: 'center',
                  ...(!selectedId || status?.self_destruct_sent ? disabled : {}),
                }}
              >
                ☢️ {status?.self_destruct_sent ? 'Self-Destruct Already Sent' : 'Self-Destruct'}
              </button>
            </div>

            <AnimatePresence>
              {actionStatus && (
                <motion.div
                  key="flash"
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    marginTop: 10, padding: '8px 12px', borderRadius: 6,
                    background: actionStatus.ok ? C.greenBg : C.redBg,
                    border: `1px solid ${actionStatus.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    color: actionStatus.ok ? C.green : C.red,
                    fontSize: 12,
                  }}
                >
                  {actionStatus.ok ? 'OK: ' : 'Error: '}{actionStatus.msg}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Command Log + Heartbeat Monitor */}
        <div>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={labelStyle}>Command Log</div>
              <span style={{ fontSize: 10, color: C.text2 }}>last 20 - this session</span>
            </div>
            {cmdLog.length === 0 ? (
              <div style={{ fontSize: 12, color: C.text2 }}>No commands sent yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cmdLog.map((entry, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 10px', borderRadius: 6,
                    background: C.surface2, border: `1px solid ${C.border}`,
                  }}>
                    <code style={{ fontSize: 11, color: C.accent, flex: 1, fontFamily: C.mono }}>
                      {entry.type}
                    </code>
                    <span style={{
                      fontSize: 10,
                      color: entry.result === 'sent' ? C.green
                        : entry.result.startsWith('error') ? C.red : C.amber,
                    }}>
                      {entry.result}
                    </span>
                    <span style={{ fontSize: 10, color: C.text2, flexShrink: 0, fontFamily: C.mono }}>
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={labelStyle}>Heartbeat Monitor</div>
              <span style={{ fontSize: 10, color: C.text2 }}>
                {heartbeats.length} total - refreshes 15s
              </span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.text2, marginBottom: 4 }}>
                All-device activity (30 min window)
              </div>
              <Sparkline heartbeats={heartbeats} />
            </div>

            {visibleHB.length === 0 ? (
              <div style={{ fontSize: 12, color: C.text2 }}>No heartbeats received</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: C.text2, fontSize: 10 }}>
                    {['Device', 'Event', 'Time', 'Ago'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '3px 6px 6px', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleHB.map((hb, i) => {
                    const alive = isAlive(hb.ts);
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '5px 6px', fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: alive ? C.green : C.text2,
                              display: 'inline-block', flexShrink: 0,
                            }} />
                            #{hb.device_id}
                          </span>
                        </td>
                        <td style={{ padding: '5px 6px', color: C.purple, fontFamily: C.mono }}>{hb.event}</td>
                        <td style={{ padding: '5px 6px', color: C.text2, fontVariantNumeric: 'tabular-nums', fontFamily: C.mono }}>
                          {fmtTime(hb.ts)}
                        </td>
                        <td style={{ padding: '5px 6px', color: alive ? C.green : C.text2 }}>
                          {relTime(hb.ts)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showDestruct && (
          <SelfDestructDialog
            onConfirm={handleDestruct}
            onCancel={() => setShowDestruct(false)}
            loading={destructLoading}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
