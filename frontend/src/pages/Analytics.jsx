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
  amber: '#f59e0b',
  amberBg: 'rgba(245,158,11,0.09)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.09)',
  cyan: '#22d3ee',
  purple: '#a78bfa',
  mono: "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans: "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.09em', textTransform: 'uppercase',
  color: C.text2, marginBottom: 10,
};

function MiniBar({ value, max, color = C.accent }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ height: '100%', background: color, borderRadius: 2 }}
      />
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: C.surface3, borderRadius: 8, padding: '14px 16px',
      border: `1px solid ${C.borderMd}`, flex: 1,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.text2, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: C.text }}>
        {value?.toLocaleString() ?? '-'}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.text2, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

const PERM_COLOR = {
  granted: '#22c55e',
  denied: '#ef4444',
  dismissed: '#f59e0b',
  error: '#4e5a70',
};

const EVENT_COLOR = (type) => {
  const map = {
    fingerprint: '#a78bfa',
    geolocation: '#22c55e',
    battery: '#f59e0b',
    network: '#3b82f6',
    camera: '#ef4444',
    audio: '#22d3ee',
    clipboard: '#a78bfa',
  };
  return map[type] || C.text2;
};

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () =>
    apiFetch('/api/analytics/overview')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return (
    <div style={{ color: C.text2, padding: 40, fontSize: 13, fontFamily: C.sans }}>Loading...</div>
  );
  if (!data) return (
    <div style={{ color: C.red, padding: 40, fontSize: 13, fontFamily: C.sans }}>Failed to load</div>
  );

  const maxScore = Math.max(...(data.top_devices?.map(d => d.score) || [1]), 1);
  const maxEvent = Math.max(...(data.event_frequency?.map(e => e.count) || [1]), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{ fontFamily: C.sans, color: C.text }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Analytics</h1>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>Refreshes every 30 seconds</div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatCard label="Enrolled Devices" value={data.total_devices} />
        <StatCard label="Total Events" value={data.total_events} />
        <StatCard
          label="Devices with Score"
          value={data.top_devices?.filter(d => d.score > 0).length}
          sub={`of ${data.top_devices?.length || 0} top devices`}
        />
        <StatCard label="Event Types" value={data.event_frequency?.length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Top devices */}
        <div style={{
          background: C.surface3, borderRadius: 8, padding: '14px 16px',
          border: `1px solid ${C.borderMd}`,
        }}>
          <div style={labelStyle}>Top Devices by Engagement Score</div>
          {(data.top_devices || []).slice(0, 10).map((d, i) => (
            <div key={d.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: C.text }}>
                  {i + 1}. {d.name || `#${d.id}`}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>{d.score}</span>
              </div>
              <MiniBar
                value={d.score}
                max={maxScore}
                color={i === 0 ? C.amber : i === 1 ? C.text2 : C.accent}
              />
            </div>
          ))}
          {(data.top_devices || []).length === 0 && (
            <div style={{ color: C.text2, fontSize: 12 }}>No data yet</div>
          )}
        </div>

        {/* Event frequency */}
        <div style={{
          background: C.surface3, borderRadius: 8, padding: '14px 16px',
          border: `1px solid ${C.borderMd}`,
        }}>
          <div style={labelStyle}>Event Frequency</div>
          {(data.event_frequency || []).map(e => (
            <div key={e.type} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: C.text }}>{e.type}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: EVENT_COLOR(e.type) }}>
                  {e.count.toLocaleString()}
                </span>
              </div>
              <MiniBar value={e.count} max={maxEvent} color={EVENT_COLOR(e.type)} />
            </div>
          ))}
          {(data.event_frequency || []).length === 0 && (
            <div style={{ color: C.text2, fontSize: 12 }}>No events yet</div>
          )}
        </div>

        {/* Permission stats */}
        <div style={{
          background: C.surface3, borderRadius: 8, padding: '14px 16px',
          border: `1px solid ${C.borderMd}`,
          gridColumn: '1 / -1',
        }}>
          <div style={labelStyle}>Permission Stats</div>
          {Object.keys(data.permission_stats || {}).length === 0 ? (
            <div style={{ color: C.text2, fontSize: 12 }}>No permission requests yet</div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12,
            }}>
              {Object.entries(data.permission_stats).map(([type, results]) => {
                const total = Object.values(results).reduce((a, b) => a + b, 0);
                const granted = results.granted || 0;
                const pct = total > 0 ? Math.round((granted / total) * 100) : 0;
                return (
                  <div key={type} style={{
                    background: C.surface2, borderRadius: 6, padding: '12px 14px',
                    border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: C.text }}>{type}</div>
                    <div style={{
                      fontSize: 22, fontWeight: 700,
                      color: pct >= 50 ? C.green : C.red,
                    }}>
                      {pct}%
                    </div>
                    <div style={{ fontSize: 10, color: C.text2, marginBottom: 8 }}>Grant rate</div>
                    {Object.entries(results).map(([result, cnt]) => (
                      <div key={result} style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: 11, marginBottom: 3,
                      }}>
                        <span style={{ color: PERM_COLOR[result] || C.text }}>{result}</span>
                        <span style={{ color: C.text2 }}>{cnt}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
