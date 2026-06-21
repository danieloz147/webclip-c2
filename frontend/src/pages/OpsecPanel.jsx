import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../api/client.js';

// --- Design tokens ---

const DS = {
  bg:       '#07080f',
  surface:  '#0c0d1a',
  surface2: '#10121f',
  surface3: '#141728',
  border:   'rgba(255,255,255,0.05)',
  borderMd: 'rgba(255,255,255,0.09)',
  borderHi: 'rgba(59,130,246,0.32)',
  text:     '#c9d1e8',
  text2:    '#4e5a70',
  accent:   '#3b82f6',
  green:    '#22c55e',
  amber:    '#f59e0b',
  red:      '#ef4444',
  cyan:     '#22d3ee',
  purple:   '#a78bfa',
  mono:     "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans:     "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

const RISK_COLOR = {
  clean:  DS.green,
  low:    DS.amber,
  medium: '#f97316',
  high:   DS.red,
};

const STATUS_DOT = {
  ok:        DS.green,
  warn:      DS.amber,
  bad:       DS.red,
  skipped:   DS.text2,
  unchecked: DS.text2,
  error:     DS.red,
};

const SEV_COLOR = {
  high:   DS.red,
  medium: DS.amber,
  low:    DS.accent,
};

// --- Shared styles ---

const inputStyle = {
  background: DS.surface2,
  border: `1px solid ${DS.borderMd}`,
  borderRadius: 6,
  color: DS.text,
  fontSize: 13,
  padding: '7px 10px',
  outline: 'none',
  flex: 1,
  minWidth: 140,
  fontFamily: DS.sans,
};

const btnStyle = (disabled) => ({
  height: 30, padding: '0 12px', borderRadius: 6, border: 'none',
  background: disabled ? 'transparent' : DS.accent,
  border: disabled ? `1px solid ${DS.borderMd}` : 'none',
  color: disabled ? DS.text2 : '#fff',
  fontSize: 12, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  transition: 'opacity 0.15s',
  whiteSpace: 'nowrap',
  fontFamily: DS.sans,
});

// --- Small reusable components ---

function Card({ children, style }) {
  return (
    <div style={{
      background: DS.surface,
      border: `1px solid ${DS.border}`,
      borderRadius: 8,
      padding: '16px 18px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
      textTransform: 'uppercase', color: DS.text2, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function StatusDot({ status }) {
  const color = STATUS_DOT[status] || DS.text2;
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 8, flexShrink: 0, marginTop: 1,
    }} />
  );
}

function ChipBadge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600,
      background: `${color}17`, color,
      border: `1px solid ${color}33`,
    }}>
      {label}
    </span>
  );
}

function MonoChip({ label }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: 4, fontSize: 11,
      background: DS.surface3, color: DS.text, border: `1px solid ${DS.borderMd}`,
      fontFamily: DS.mono,
    }}>
      {label}
    </span>
  );
}

function FieldRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0', borderBottom: `1px solid ${DS.border}`,
    }}>
      <span style={{ fontSize: 13, color: DS.text2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: DS.mono, color: DS.text }}>
        {value ?? '-'}
      </span>
    </div>
  );
}

// --- Section: Burn Check ---

function BurnCheck() {
  const [ip, setIp]         = useState('');
  const [domain, setDomain] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState('');

  useEffect(() => {
    apiFetch('/api/opsec/engagement-status')
      .then(data => {
        if (data.vps_ip) setIp(data.vps_ip);
        if (data.domain) setDomain(data.domain);
      })
      .catch(() => {});
  }, []);

  const run = async () => {
    if (!ip && !domain) { setErr('Enter at least an IP or domain'); return; }
    setLoading(true); setErr(''); setResult(null);
    try {
      const params = new URLSearchParams();
      if (ip)     params.set('ip', ip);
      if (domain) params.set('domain', domain);
      const data = await apiFetch(`/api/opsec/burn-check?${params}`);
      setResult(data);
    } catch (e) {
      setErr(e.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const riskColor = result ? (RISK_COLOR[result.risk_level] || DS.text2) : DS.text2;

  return (
    <Card>
      <SectionLabel>Burn Check</SectionLabel>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={ip} onChange={e => setIp(e.target.value)}
          placeholder="IP address" style={inputStyle}
          onKeyDown={e => e.key === 'Enter' && run()}
        />
        <input
          value={domain} onChange={e => setDomain(e.target.value)}
          placeholder="Domain (optional)" style={inputStyle}
          onKeyDown={e => e.key === 'Enter' && run()}
        />
        <button onClick={run} disabled={loading} style={btnStyle(loading)}>
          {loading ? 'Checking...' : 'Check Reputation'}
        </button>
      </div>

      {err && <div style={{ color: DS.red, fontSize: 12, marginBottom: 10 }}>{err}</div>}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              fontSize: 22, fontWeight: 800, color: riskColor,
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              {result.risk_level}
            </div>
            <div style={{ fontSize: 12, color: DS.text2, fontFamily: DS.mono }}>
              {result.ip && <span>{result.ip}</span>}
              {result.domain && <span style={{ marginLeft: 8 }}>{result.domain}</span>}
            </div>
          </div>

          <div style={{ border: `1px solid ${DS.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {(result.checks || []).map((check, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 0,
                padding: '10px 14px',
                borderBottom: i < result.checks.length - 1 ? `1px solid ${DS.border}` : 'none',
                background: i % 2 === 0 ? 'transparent' : DS.surface2,
              }}>
                <StatusDot status={check.status} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: DS.text, marginBottom: 2 }}>{check.name}</div>
                  <div style={{ fontSize: 11, color: DS.text2 }}>{check.detail}</div>
                </div>
                <ChipBadge label={check.status} color={STATUS_DOT[check.status] || DS.text2} />
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </Card>
  );
}

// --- Section: SOC Detection ---

function SocDetection() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(() => {
    return apiFetch('/api/opsec/soc-indicators')
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const reset = async () => {
    setResetting(true);
    setData(d => d ? { ...d, indicators: [], last_10_ips: [], log_size: 0 } : d);
    try {
      await apiFetch('/api/opsec/soc-indicators/reset', { method: 'POST' });
      await load();
    } catch (e) {
      console.error('SOC reset failed', e);
      await load();
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <SectionLabel>SOC Detection</SectionLabel>
        <button onClick={reset} disabled={resetting} style={{ ...btnStyle(resetting), background: 'transparent', border: `1px solid ${DS.borderMd}`, color: DS.text }}>
          {resetting ? 'Clearing...' : 'Clear Log'}
        </button>
      </div>

      {loading && <div style={{ color: DS.text2, fontSize: 13 }}>Loading...</div>}

      {!loading && data && (
        <>
          {(data.indicators || []).length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', color: DS.green, fontSize: 13 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>OK</span>
              No suspicious indicators
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {data.indicators.map((ind, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.15, ease: 'easeOut' }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    background: DS.surface2, borderRadius: 6, padding: '10px 12px',
                    borderLeft: `2px solid ${SEV_COLOR[ind.severity] || DS.text2}`,
                    border: `1px solid ${DS.borderMd}`,
                    borderLeft: `2px solid ${SEV_COLOR[ind.severity] || DS.text2}`,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: SEV_COLOR[ind.severity] || DS.text2,
                      marginBottom: 3,
                    }}>
                      {ind.type.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: 13, color: DS.text }}>{ind.detail}</div>
                  </div>
                  <ChipBadge label={ind.severity} color={SEV_COLOR[ind.severity] || DS.text2} />
                </motion.div>
              ))}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${DS.border}`, paddingTop: 14 }}>
            <SectionLabel>Recent IPs</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(data.last_10_ips || []).length === 0
                ? <span style={{ fontSize: 13, color: DS.text2 }}>None</span>
                : data.last_10_ips.map((ip, i) => <MonoChip key={i} label={ip} />)}
            </div>
            {data.log_size !== undefined && (
              <div style={{ fontSize: 11, color: DS.text2, marginTop: 8, fontFamily: DS.mono }}>
                log: {data.log_size} entries
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// --- Section: Engagement Status ---

function EngagementStatus() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch('/api/opsec/engagement-status')
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const fmtDate = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return iso; }
  };

  return (
    <Card>
      <SectionLabel>Engagement Status</SectionLabel>

      {loading && <div style={{ color: DS.text2, fontSize: 13 }}>Loading...</div>}

      {!loading && data && (
        <div>
          <FieldRow label="VPS IP"        value={data.vps_ip} />
          <FieldRow label="Domain"        value={data.domain} />
          <FieldRow label="Days Active"   value={data.days_active !== null ? `${data.days_active}d` : null} />
          <FieldRow label="Active Devices" value={data.active_devices} />
          <FieldRow label="Last Activity" value={fmtDate(data.last_activity)} />
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: DS.green, display: 'inline-block',
              boxShadow: `0 0 6px ${DS.green}88`,
            }} />
            <span style={{ fontSize: 11, color: DS.text2 }}>Server online - auto-refresh 60s</span>
          </div>
        </div>
      )}

      {!loading && !data && (
        <div style={{ color: DS.red, fontSize: 13 }}>Failed to load engagement status</div>
      )}
    </Card>
  );
}

// --- Section: Probe Log ---

function ProbeLogSection() {
  const [probes, setProbes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(() => {
    apiFetch('/api/opsec/probes?limit=100')
      .then(setProbes).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const clear = async () => {
    setClearing(true);
    try {
      await apiFetch('/api/opsec/probes', { method: 'DELETE' });
      setProbes([]);
    } finally {
      setClearing(false);
    }
  };

  const fmtTs = (iso) => {
    try {
      const d = new Date(iso + 'Z');
      return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return iso; }
  };

  return (
    <Card style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <SectionLabel>Non-Standalone Probe Log</SectionLabel>
          <div style={{ fontSize: 11, color: DS.text2 }}>
            Requests that opened WebClip in a browser (not as saved app) - bots, scanners, analysts
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: probes.length > 0 ? DS.red : DS.text2, fontFamily: DS.mono }}>
            {probes.length} entries
          </span>
          <button
            onClick={clear}
            disabled={clearing || probes.length === 0}
            style={{
              height: 28, padding: '0 12px', borderRadius: 6, cursor: clearing || probes.length === 0 ? 'default' : 'pointer',
              background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: DS.red,
              fontSize: 11, fontWeight: 600, opacity: clearing || probes.length === 0 ? 0.4 : 1,
              fontFamily: DS.sans,
            }}
          >
            {clearing ? 'Clearing...' : 'Clear'}
          </button>
        </div>
      </div>

      {loading && <div style={{ color: DS.text2, fontSize: 13 }}>Loading...</div>}

      {!loading && probes.length === 0 && (
        <div style={{ color: DS.green, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>OK</span>
          No probes detected
        </div>
      )}

      {!loading && probes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
          {probes.map((p) => (
            <div key={p.id} style={{
              background: DS.surface2, border: `1px solid ${DS.borderMd}`, borderRadius: 6, padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontFamily: DS.mono, color: DS.text2, whiteSpace: 'nowrap' }}>{fmtTs(p.timestamp)}</span>
                <span style={{
                  fontSize: 12, fontFamily: DS.mono, fontWeight: 700, color: DS.amber,
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 4, padding: '1px 7px',
                }}>{p.ip || '-'}</span>
              </div>
              <div style={{ fontSize: 11, color: DS.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.user_agent}>
                <span style={{ color: DS.text2, marginRight: 6, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>UA</span>
                {p.user_agent || '-'}
              </div>
              <div style={{ fontSize: 11, color: DS.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.url}>
                <span style={{ color: DS.text2, marginRight: 6, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>URL</span>
                {p.url || '-'}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// --- Page root ---

export default function OpsecPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={{ minHeight: '100vh', background: DS.bg, color: DS.text, fontFamily: DS.sans }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: DS.text }}>Opsec Panel</h1>
        <div style={{ fontSize: 12, color: DS.text2, marginTop: 4 }}>
          Burn check - SOC detection - Engagement health
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <ProbeLogSection />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <BurnCheck />
        </div>
        <SocDetection />
        <EngagementStatus />
      </div>
    </motion.div>
  );
}
