import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiFetch, deleteDevice, sendCommand, parseUTC } from '../api/client.js';
import { C, S, Icon } from '../theme.jsx';

function deviceStatus(lastSeen) {
  if (!lastSeen) return 'unknown';
  const diff = Date.now() - parseUTC(lastSeen).getTime();
  if (diff < 5_000) return 'online';
  if (diff < 15_000) return 'stale';
  return 'offline';
}

function StatusDot({ status }) {
  const labels = { online: 'Online', stale: 'Stale', offline: 'Offline', unknown: 'Unknown' };
  const textColors = { online: C.green, stale: C.amber, offline: C.red, unknown: C.text2 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={S.dot(status)} />
      <span style={{ fontSize: 13, color: textColors[status] ?? C.text2 }}>
        {labels[status] ?? status}
      </span>
    </div>
  );
}

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [reloadSentAt, setReloadSentAt] = useState({});
  const [reloadDone, setReloadDone] = useState({});
  const [refreshAllTargets, setRefreshAllTargets] = useState([]);
  const [refreshAllDone, setRefreshAllDone] = useState(false);
  const [recordingId, setRecordingId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('motionSession') || 'null')?.deviceId; }
    catch { return null; }
  });
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(() => {
      try { setRecordingId(JSON.parse(localStorage.getItem('motionSession') || 'null')?.deviceId ?? null); }
      catch { setRecordingId(null); }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const refreshingAll = refreshAllTargets.length > 0;
  const refreshAllDoneCount = refreshAllTargets.filter(id => reloadDone[id]).length;

  async function handleRefreshAll() {
    if (refreshingAll) return;
    const online = devices.filter(d => deviceStatus(d.last_seen) === 'online');
    if (!online.length) return;
    setRefreshAllDone(false);
    setRefreshAllTargets(online.map(d => d.id));
    try {
      await apiFetch('/api/devices/refresh-all', { method: 'POST' });
      const now = Date.now();
      setReloadSentAt(prev => {
        const next = { ...prev };
        online.forEach(d => { next[d.id] = now; });
        return next;
      });
    } catch (e) {
      alert(`Refresh All failed: ${e.message}`);
      setRefreshAllTargets([]);
    }
  }

  useEffect(() => {
    if (!refreshingAll) return;
    if (refreshAllDoneCount === refreshAllTargets.length) {
      setRefreshAllTargets([]);
      setRefreshAllDone(true);
      setTimeout(() => setRefreshAllDone(false), 2000);
    }
  }, [reloadDone, refreshAllTargets]);

  function refreshLabel(d) {
    if (reloadDone[d.id]) return 'Done';
    if (reloadSentAt[d.id]) return 'Sent';
    return 'Refresh';
  }

  async function load() {
    try {
      const data = await apiFetch('/api/devices/');
      setDevices(data);
    } catch { /* auth redirect handled by apiFetch */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 3_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    devices.forEach(d => {
      const sentAt = reloadSentAt[d.id];
      if (!sentAt || reloadDone[d.id]) return;
      const lastSeenTs = parseUTC(d.last_seen)?.getTime() ?? 0;
      if (lastSeenTs > sentAt + 3000) {
        setReloadDone(rd => ({ ...rd, [d.id]: true }));
        setTimeout(() => {
          setReloadDone(rd => { const r = { ...rd }; delete r[d.id]; return r; });
          setReloadSentAt(rs => { const r = { ...rs }; delete r[d.id]; return r; });
        }, 1000);
      }
    });
  }, [devices]);

  async function handleRefresh(e, d) {
    e.stopPropagation();
    try {
      await sendCommand(d.id, 'reload');
      setReloadSentAt(prev => ({ ...prev, [d.id]: Date.now() }));
    } catch (err) {
      alert(`Refresh failed: ${err.message}`);
    }
  }

  async function handleDelete(e, d) {
    e.stopPropagation();
    if (!window.confirm(`Delete device ${d.name || `#${d.id}`}?`)) return;
    setDeleting(d.id);
    try {
      await deleteDevice(d.id);
      await load();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  const filtered = devices.filter(d =>
    !search ||
    d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.user_agent?.toLowerCase().includes(search.toLowerCase())
  );

  const online  = devices.filter(d => deviceStatus(d.last_seen) === 'online').length;
  const offline = devices.filter(d => deviceStatus(d.last_seen) === 'offline').length;

  const refreshBtnStyle = refreshAllDone
    ? { ...S.btn('ghost'), background: 'rgba(34,197,94,0.1)', color: C.green, borderColor: 'rgba(34,197,94,0.25)' }
    : refreshingAll
      ? { ...S.btn('ghost', true) }
      : S.btn('ghost');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <style>{`
        @keyframes spinOnce { to { transform: rotate(360deg); } }
        @keyframes recBlink { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: C.text }}>Devices</h1>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
            {online} online now
          </div>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          style={{ ...S.input, width: 200 }}
        />
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Online',  value: online,          color: C.green },
          { label: 'Total',   value: devices.length,  color: C.accent },
          { label: 'Offline', value: offline,          color: C.red },
        ].map(s => (
          <div key={s.label} style={{
            background: C.surface3,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '14px 16px',
            flex: 1,
          }}>
            <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text2, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Refresh All + table */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button onClick={handleRefreshAll} disabled={refreshingAll} style={refreshBtnStyle}>
          <span style={{
            display: 'inline-flex',
            animation: refreshingAll ? 'spinOnce 0.6s linear infinite' : 'none',
            flexShrink: 0,
          }}>
            {Icon.refresh}
          </span>
          {refreshAllDone
            ? 'Done'
            : refreshingAll
              ? `${refreshAllDoneCount}/${refreshAllTargets.length}`
              : 'Refresh All'
          }
        </button>
      </div>

      <div style={{
        background: C.surface,
        border: `1px solid ${C.borderMd}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Status', 'Last Seen', ''].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ ...S.td, padding: 40, textAlign: 'center', color: C.text2 }}>
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...S.td, padding: 40, textAlign: 'center', color: C.text2 }}>
                  No devices
                </td>
              </tr>
            ) : filtered.map((d) => {
              const isDone = reloadDone[d.id];
              const isPending = !!reloadSentAt[d.id] && !isDone;
              const refreshStyle = isDone
                ? { ...S.btn('ghost'), background: 'rgba(34,197,94,0.1)', color: C.green, borderColor: 'rgba(34,197,94,0.25)', width: 72 }
                : { ...S.btn('ghost', isPending), width: 72 };

              return (
                <tr
                  key={d.id}
                  className="tbl-row"
                  onClick={() => navigate(`/devices/${d.id}`)}
                  style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                >
                  <td style={{ ...S.td, fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {d.name || '-'}
                      {String(d.id) === recordingId && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.red,
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: 4,
                          padding: '1px 5px',
                          animation: 'recBlink 1.2s infinite',
                          letterSpacing: '0.04em',
                        }}>
                          REC
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={S.td}>
                    <StatusDot status={deviceStatus(d.last_seen)} />
                  </td>
                  <td style={{ ...S.td, fontFamily: C.mono, fontSize: 12, color: C.text2 }}>
                    {d.last_seen ? parseUTC(d.last_seen).toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' }) : '-'}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        onClick={e => handleRefresh(e, d)}
                        disabled={isPending}
                        style={refreshStyle}
                      >
                        {refreshLabel(d)}
                      </button>
                      <button
                        onClick={e => handleDelete(e, d)}
                        disabled={deleting === d.id}
                        style={{ ...S.btn('danger', deleting === d.id) }}
                      >
                        {Icon.trash}
                        {deleting === d.id ? '...' : 'Delete'}
                      </button>
                      <span style={{ color: C.accent, display: 'inline-flex', alignItems: 'center' }}>
                        {Icon.chevronRight}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
