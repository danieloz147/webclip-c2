import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, parseUTC } from '../api/client.js';

const C = {
  bg: '#07080f',
  surface: '#0c0d1a',
  surface2: '#10121f',
  surface3: '#141728',
  border: 'rgba(255,255,255,0.05)',
  borderMd: 'rgba(255,255,255,0.09)',
  text: '#c9d1e8',
  text2: '#4e5a70',
  accent: '#3b82f6',
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.09)',
  amber: '#f59e0b',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.09)',
  cyan: '#22d3ee',
  purple: '#a78bfa',
  mono: "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans: "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

// Service name lookup
const SERVICE_NAMES = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
  80: 'HTTP', 110: 'POP3', 143: 'IMAP', 389: 'LDAP', 443: 'HTTPS',
  445: 'SMB', 465: 'SMTPS', 514: 'Syslog', 587: 'SMTP/TLS', 636: 'LDAPS',
  993: 'IMAPS', 995: 'POP3S', 1433: 'MSSQL', 1521: 'Oracle', 2375: 'Docker',
  2376: 'Docker-TLS', 2379: 'etcd', 2380: 'etcd-peers', 3000: 'Dev-HTTP',
  3306: 'MySQL', 3389: 'RDP', 4848: 'GlassFish', 5432: 'PostgreSQL',
  5900: 'VNC', 5901: 'VNC-1', 5984: 'CouchDB', 5985: 'WinRM-HTTP',
  5986: 'WinRM-HTTPS', 6379: 'Redis', 6443: 'K8s-API', 7001: 'WebLogic',
  7474: 'Neo4j', 8080: 'Alt-HTTP', 8443: 'Alt-HTTPS', 8500: 'Consul',
  8983: 'Solr', 9000: 'SonarQube', 9042: 'Cassandra', 9090: 'Prometheus',
  9092: 'Kafka', 9200: 'Elasticsearch', 9300: 'ES-Transport', 10000: 'Webmin',
  11211: 'Memcached', 15672: 'RabbitMQ-Mgmt', 27017: 'MongoDB',
};

function serviceName(port) {
  return SERVICE_NAMES[port] ?? `port-${port}`;
}

// Node color using design system palette
function nodeColor(node) {
  if (node.isGateway) return C.amber;
  if (node.isCurrentDevice) return C.accent;
  if (node.openPorts && node.openPorts.length > 0) return C.green;
  if (node.alive) return C.text2;
  return 'rgba(255,255,255,0.08)';
}

// Force layout (deterministic, 100 iterations)
function forceLayout(nodes, width, height, iterations = 100) {
  const cx = width / 2;
  const cy = height / 2;
  const REPULSION = 4000;
  const CENTER_PULL = 0.04;
  const MIN_DIST = 70;

  const pos = nodes.map(() => ({ x: cx, y: cy }));

  nodes.forEach((n, i) => {
    const parts = n.ip.split('.').map(p => parseInt(p, 10)).filter(v => !isNaN(v));
    const seed = parts.length === 4 ? parts.reduce((acc, p) => acc * 256 + p, 0) : i * 137438953;
    const angle = (seed % 360) * (Math.PI / 180);
    const radius = 80 + (seed % 200);
    pos[i] = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });

  for (let iter = 0; iter < iterations; iter++) {
    const forces = pos.map(() => ({ fx: 0, fy: 0 }));

    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        if (dist < MIN_DIST * 3) {
          const force = REPULSION / (dist * dist);
          const nx = (dx / dist) * force;
          const ny = (dy / dist) * force;
          forces[i].fx += nx; forces[i].fy += ny;
          forces[j].fx -= nx; forces[j].fy -= ny;
        }
      }
    }

    for (let i = 0; i < pos.length; i++) {
      forces[i].fx += (cx - pos[i].x) * CENTER_PULL;
      forces[i].fy += (cy - pos[i].y) * CENTER_PULL;
    }

    for (let i = 0; i < pos.length; i++) {
      pos[i].x += Math.max(-20, Math.min(20, forces[i].fx));
      pos[i].y += Math.max(-20, Math.min(20, forces[i].fy));
      pos[i].x = Math.max(30, Math.min(width - 30, pos[i].x));
      pos[i].y = Math.max(30, Math.min(height - 30, pos[i].y));
    }
  }

  return pos;
}

// Parse recon events to host list
function parseReconEvents(events) {
  const hostMap = new Map();

  const upsert = (ip, data) => {
    if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return;
    if (!hostMap.has(ip)) {
      hostMap.set(ip, { ip, openPorts: [], alive: false, hostname: null, firstSeen: null, ms: null });
    }
    const h = hostMap.get(ip);
    if (data.ports) {
      const interesting = (Array.isArray(data.ports) ? data.ports : [])
        .filter(p => p && (p.status === 'open' || p.status === 'closed'))
        .map(p => p.port ?? p);
      interesting.forEach(port => { if (!h.openPorts.includes(port)) h.openPorts.push(port); });
    }
    if (data.alive !== undefined) h.alive = !!data.alive;
    if (data.port && !h.openPorts.includes(data.port)) h.openPorts.push(data.port);
    if (data.ms !== undefined && h.ms === null) h.ms = data.ms;
    if (data.hostname) h.hostname = data.hostname;
    if (data.host && !data.host.includes('.local')) h.hostname = data.host;
    if (!h.firstSeen) h.firstSeen = data.ts ?? null;
  };

  for (const ev of events) {
    const type = (ev.type ?? '').toLowerCase();
    const isRecon = type.includes('recon') || type.includes('lan_host') ||
                    type.includes('port_scan') || type.includes('scan_result') ||
                    type === 'lan_hosts';
    if (!isRecon) continue;

    let data = ev.data_json;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { continue; }
    }
    if (!data) continue;

    if (data.hosts && Array.isArray(data.hosts)) {
      data.hosts.forEach(h => {
        upsert(h.ip, { alive: h.alive ?? true, port: h.port, ms: h.ms, ts: ev.timestamp });
      });
    }
    if (data.ip && (type === 'lan_host_found' || type === 'lan_host')) {
      upsert(data.ip, { alive: true, port: data.port, ms: data.ms, ts: ev.timestamp });
    }
    if (data.ip && data.results && Array.isArray(data.results)) {
      upsert(data.ip, { ports: data.results, ts: ev.timestamp });
    }
    if (data.ip && data.port && type === 'port_scan_found') {
      upsert(data.ip, { port: data.port, alive: true, ts: ev.timestamp });
    }
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item.ip) upsert(item.ip, { alive: item.alive ?? true, port: item.port, ms: item.ms, ts: ev.timestamp });
      });
    }
  }

  return [...hostMap.values()];
}

function inferGateway(hosts) {
  const candidates = hosts.filter(h => {
    const parts = h.ip.split('.');
    const last = parseInt(parts[3], 10);
    return last === 1 || last === 254;
  });
  if (candidates.length) return candidates[0].ip;
  const sorted = [...hosts].sort((a, b) => {
    const ap = a.ip.split('.').map(Number);
    const bp = b.ip.split('.').map(Number);
    for (let i = 0; i < 4; i++) { if (ap[i] !== bp[i]) return ap[i] - bp[i]; }
    return 0;
  });
  return sorted[0]?.ip ?? null;
}

const SVG_W = 800;
const SVG_H = 520;
const NODE_R = 13;

function NetworkGraph({ nodes, selectedIp, onSelectNode }) {
  const positions = React.useMemo(() => forceLayout(nodes, SVG_W, SVG_H), [nodes]);
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  if (!nodes.length) return null;

  const posMap = {};
  nodes.forEach((n, i) => { posMap[n.ip] = positions[i]; });

  const gwIp = nodes.find(n => n.isGateway)?.ip;
  const edges = gwIp ? nodes.filter(n => !n.isGateway).map(n => ({ from: gwIp, to: n.ip })) : [];

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* Background */}
      <rect x={0} y={0} width={SVG_W} height={SVG_H} rx={8} fill={C.bg} />

      {/* Grid dots */}
      {Array.from({ length: 20 }).map((_, xi) =>
        Array.from({ length: 14 }).map((_, yi) => (
          <circle key={`${xi}-${yi}`}
            cx={xi * 42 + 20} cy={yi * 38 + 18}
            r={1} fill="rgba(255,255,255,0.04)"
          />
        ))
      )}

      {/* Edges */}
      {edges.map(e => {
        const from = posMap[e.from];
        const to = posMap[e.to];
        if (!from || !to) return null;
        return (
          <line
            key={`${e.from}-${e.to}`}
            x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1.5}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node, i) => {
        const pos = positions[i];
        const color = nodeColor(node);
        const isSelected = selectedIp === node.ip;
        const isHov = hovered === node.ip;

        return (
          <g
            key={node.ip}
            transform={`translate(${pos.x},${pos.y})`}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectNode(node)}
            onMouseEnter={() => { setHovered(node.ip); setTooltip({ node, x: pos.x, y: pos.y }); }}
            onMouseLeave={() => { setHovered(null); setTooltip(null); }}
          >
            {/* Selection ring */}
            {isSelected && (
              <circle r={NODE_R + 6} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.4} />
            )}

            {/* Hover glow */}
            {isHov && (
              <circle r={NODE_R + 3} fill={color} fillOpacity={0.1} />
            )}

            {/* Gateway: square; others: circle */}
            {node.isGateway ? (
              <rect
                x={-NODE_R} y={-NODE_R} width={NODE_R * 2} height={NODE_R * 2}
                rx={3} fill={color} fillOpacity={isHov ? 0.95 : 0.8}
                stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.15)'} strokeWidth={isSelected ? 1.5 : 1}
              />
            ) : (
              <circle
                r={NODE_R} fill={color} fillOpacity={isHov ? 0.95 : 0.8}
                stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.15)'} strokeWidth={isSelected ? 1.5 : 1}
              />
            )}

            {/* IP label */}
            <text
              y={NODE_R + 11} textAnchor="middle" fill={C.text2}
              fontSize={9} fontFamily={C.mono}
            >
              {node.ip.split('.').slice(-2).join('.')}
            </text>
          </g>
        );
      })}

      {/* Tooltip */}
      {tooltip && (() => {
        const { node, x, y } = tooltip;
        const tx = Math.min(x + 16, SVG_W - 165);
        const ty = Math.max(y - 50, 10);
        const lines = [
          node.ip,
          node.hostname ? `Host: ${node.hostname}` : null,
          node.openPorts.length ? `Ports: ${node.openPorts.slice(0, 4).join(', ')}${node.openPorts.length > 4 ? '...' : ''}` : null,
          node.firstSeen ? `Seen: ${new Date(node.firstSeen).toLocaleString()}` : null,
        ].filter(Boolean);
        return (
          <g>
            <rect x={tx} y={ty} width={158} height={lines.length * 14 + 10} rx={5}
              fill={C.surface3} stroke="rgba(255,255,255,0.09)" strokeWidth={1} />
            {lines.map((l, i) => (
              <text key={i} x={tx + 8} y={ty + 14 + i * 14}
                fill={i === 0 ? C.text : C.text2} fontSize={10} fontFamily={C.mono}>
                {l}
              </text>
            ))}
          </g>
        );
      })()}
    </svg>
  );
}

// Detail panel
function DetailPanel({ node, deviceId, onClose }) {
  const navigate = useNavigate();
  if (!node) return null;

  const interestingPorts = node.openPorts.filter(p => p).sort((a, b) => a - b);

  return (
    <div style={{
      width: 260, background: C.surface3, border: `1px solid ${C.borderMd}`, borderRadius: 8,
      padding: '14px 16px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.mono }}>
            {node.ip}
          </div>
          {node.isGateway && (
            <div style={{
              fontSize: 10, color: C.amber, fontWeight: 700, marginTop: 2,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Gateway / Router
            </div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: C.text2, cursor: 'pointer',
          fontSize: 18, lineHeight: 1, padding: 0,
        }}>x</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: node.openPorts.length > 0 ? C.green : C.text2,
        }} />
        <span style={{ fontSize: 11, color: C.text2 }}>
          {node.openPorts.length > 0 ? 'Ports detected' : node.alive ? 'Alive (ping only)' : 'Unknown status'}
        </span>
      </div>

      {node.hostname && (
        <div>
          <div style={{
            fontSize: 10, color: C.text2, textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, fontWeight: 700,
          }}>Hostname</div>
          <div style={{ fontSize: 12, color: C.text, fontFamily: C.mono }}>{node.hostname}</div>
        </div>
      )}

      {node.ms !== null && (
        <div>
          <div style={{
            fontSize: 10, color: C.text2, textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, fontWeight: 700,
          }}>Response</div>
          <div style={{ fontSize: 12, color: C.text }}>{node.ms}ms</div>
        </div>
      )}

      {node.firstSeen && (
        <div>
          <div style={{
            fontSize: 10, color: C.text2, textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, fontWeight: 700,
          }}>First Seen</div>
          <div style={{ fontSize: 11, color: C.text2 }}>{new Date(node.firstSeen).toLocaleString()}</div>
        </div>
      )}

      <div>
        <div style={{
          fontSize: 10, color: C.text2, textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 6, fontWeight: 700,
        }}>
          Open / Responding Ports ({interestingPorts.length})
        </div>
        {interestingPorts.length === 0 ? (
          <div style={{ fontSize: 11, color: C.text2 }}>None detected</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {interestingPorts.map(port => (
              <div key={port} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: C.surface2, borderRadius: 5, padding: '3px 8px',
                border: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 11, color: C.text, fontFamily: C.mono }}>{port}</span>
                <span style={{ fontSize: 10, color: C.text2 }}>{serviceName(port)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {deviceId && (
        <button
          onClick={() => navigate(`/devices/${deviceId}?rbTarget=${encodeURIComponent(node.ip)}`)}
          style={{
            marginTop: 'auto', width: '100%', height: 30, borderRadius: 6,
            border: '1px solid rgba(239,68,68,0.3)', background: 'transparent',
            color: C.red, fontWeight: 700, fontSize: 12, cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Launch Rebind Attack
        </button>
      )}
    </div>
  );
}

// Main page
export default function LanMap() {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch('/api/devices/')
      .then(data => {
        const list = Array.isArray(data) ? data : (data.devices ?? []);
        setDevices(list);
        if (list.length) setSelectedDeviceId(String(list[0].id));
      })
      .catch(e => setError(e.message));
  }, []);

  const fetchEvents = useCallback(() => {
    if (!selectedDeviceId) return;
    setLoading(true);
    setError(null);
    apiFetch(`/api/devices/${selectedDeviceId}/events?limit=200`)
      .then(data => {
        const evList = Array.isArray(data) ? data : (data.events ?? []);
        setEvents(evList);
        setSelectedNode(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDeviceId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const hosts = React.useMemo(() => parseReconEvents(events), [events]);

  const lastScan = React.useMemo(() => {
    const reconEvs = events.filter(e => {
      const t = (e.type ?? '').toLowerCase();
      return t.includes('recon') || t.includes('lan_') || t.includes('port_scan') || t === 'scan_result';
    });
    if (!reconEvs.length) return null;
    const ts = reconEvs[reconEvs.length - 1]?.created_at;
    return ts ? parseUTC(ts) : null;
  }, [events]);

  const nodes = React.useMemo(() => {
    if (!hosts.length) return [];
    const gwIp = inferGateway(hosts);
    return hosts.map(h => ({
      ...h,
      isGateway: h.ip === gwIp,
      isCurrentDevice: false,
    }));
  }, [hosts]);

  const totalPorts = nodes.reduce((acc, n) => acc + n.openPorts.length, 0);
  const hasData = nodes.length > 0;

  return (
    <div style={{ color: C.text, fontFamily: C.sans }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.border}`,
        paddingBottom: 16, marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>LAN Map</h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: C.text2 }}>Network topology from device recon</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={selectedDeviceId}
            onChange={e => setSelectedDeviceId(e.target.value)}
            style={{
              background: C.surface2, border: `1px solid ${C.borderMd}`, borderRadius: 6,
              color: C.text, fontSize: 12, padding: '6px 10px', outline: 'none', cursor: 'pointer',
            }}
          >
            {devices.length === 0 && <option value="">No devices</option>}
            {devices.map(d => (
              <option key={d.id} value={String(d.id)}>
                {d.alias ?? d.name ?? d.user_agent?.slice(0, 30) ?? `Device ${d.id}`}
              </option>
            ))}
          </select>
          <button
            onClick={fetchEvents}
            disabled={loading || !selectedDeviceId}
            style={{
              height: 28, padding: '0 12px', borderRadius: 5,
              border: `1px solid ${C.borderMd}`,
              background: 'transparent',
              color: loading ? C.text2 : C.text,
              fontSize: 12, cursor: loading ? 'default' : 'pointer',
              fontWeight: 600,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {hasData && (
        <div style={{
          display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`,
          marginBottom: 16, overflowX: 'auto',
        }}>
          {[
            { label: 'Hosts Found', value: nodes.length },
            { label: 'Total Open Ports', value: totalPorts },
            { label: 'Gateways', value: nodes.filter(n => n.isGateway).length },
            { label: 'Last Scan', value: lastScan ? lastScan.toLocaleString() : 'Unknown' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '10px 20px', borderRight: `1px solid ${C.border}`,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <div style={{
                fontSize: 10, color: C.text2, textTransform: 'uppercase',
                letterSpacing: '0.06em', fontWeight: 700,
              }}>
                {s.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          marginBottom: 14, padding: '10px 12px', background: C.redBg,
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, fontSize: 12, color: C.red,
        }}>
          Error: {error}
        </div>
      )}

      {/* Main content */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {!loading && !hasData && !error && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 60, textAlign: 'center', gap: 14,
          }}>
            <div style={{ fontSize: 40, lineHeight: 1 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>No scan data yet</div>
            <div style={{ fontSize: 13, color: C.text2, maxWidth: 360 }}>
              Send a <strong style={{ color: C.text }}>LAN scan</strong> command from the device page to discover network hosts.
              Results will appear here automatically.
            </div>
            <button
              onClick={() => navigate('/devices')}
              style={{
                marginTop: 6, height: 30, padding: '0 20px', borderRadius: 6,
                border: 'none', background: C.accent, color: '#fff',
                fontWeight: 600, fontSize: 12, cursor: 'pointer',
              }}
            >
              Go to Devices
            </button>
          </div>
        )}

        {loading && !hasData && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 60, fontSize: 13, color: C.text2,
          }}>
            Loading scan data...
          </div>
        )}

        {hasData && (
          <>
            <div style={{
              flex: 1, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`,
              overflow: 'hidden', minHeight: SVG_H, display: 'flex', alignItems: 'stretch',
            }}>
              <NetworkGraph
                nodes={nodes}
                selectedIp={selectedNode?.ip ?? null}
                onSelectNode={setSelectedNode}
              />
            </div>

            {selectedNode && (
              <DetailPanel
                node={selectedNode}
                deviceId={selectedDeviceId}
                onClose={() => setSelectedNode(null)}
              />
            )}
          </>
        )}
      </div>

      {/* Legend */}
      {hasData && (
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { color: C.amber, label: 'Gateway / Router', shape: 'square' },
            { color: C.accent, label: 'Current Device', shape: 'circle' },
            { color: C.green, label: 'Open Ports Detected', shape: 'circle' },
            { color: C.text2, label: 'Alive (ping only)', shape: 'circle' },
            { color: 'rgba(255,255,255,0.08)', label: 'Unknown', shape: 'circle' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.shape === 'square' ? (
                <div style={{ width: 10, height: 10, background: item.color, borderRadius: 2, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 10, height: 10, background: item.color, borderRadius: '50%', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 11, color: C.text2 }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
