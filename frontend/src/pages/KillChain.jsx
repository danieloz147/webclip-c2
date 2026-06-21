import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

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

const EVENT_TYPES = [
  'device_register', 'heartbeat', 'command_sent', 'command_result',
  'console_log', 'location', 'rebind_result', 'tunnel_ready', 'tunnel_end', 'upnp_found',
];

function lineColor(type) {
  if (['tunnel_ready', 'device_register'].includes(type)) return DS.green;
  if (['command_sent', 'command_result', 'rebind_result', 'upnp_found'].includes(type)) return DS.accent;
  if (['console_log', 'location'].includes(type)) return DS.amber;
  if (type === 'tunnel_end') return DS.red;
  return DS.text2;
}

function formatTime(iso) {
  if (!iso) return '--:--:--';
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function EventRow({ ev, annotation, onAnnotate }) {
  const [expanded, setExpanded] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  let parsed = null;
  try { parsed = JSON.parse(ev.data_json); } catch {}

  const color = lineColor(ev.type);

  const saveNote = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/killchain/${ev._device_id}/annotate`, {
        method: 'POST',
        body: JSON.stringify({ event_id: ev.id, note: draft.trim() }),
      });
      onAnnotate(ev.id, draft.trim());
      setAnnotating(false);
      setDraft('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      display: 'flex', gap: 0, alignItems: 'flex-start',
      padding: '10px 0', borderBottom: `1px solid ${DS.border}`,
    }}>
      {/* Timestamp */}
      <div style={{
        width: 72, flexShrink: 0, paddingTop: 2,
        fontFamily: DS.mono, fontSize: 11,
        color: DS.text2, textAlign: 'right', paddingRight: 12,
        userSelect: 'none',
      }}>
        {formatTime(ev.timestamp)}
      </div>

      {/* Timeline indicator: thin left border line approach */}
      <div style={{ flexShrink: 0, width: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
        <div style={{
          width: 2, height: 10, borderRadius: 1,
          background: color, flexShrink: 0,
        }} />
        <div style={{ width: 1, flex: 1, background: DS.border, marginTop: 3 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingLeft: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setExpanded(x => !x)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: DS.text, fontSize: 13, fontWeight: 500, textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              color: DS.text2, fontSize: 12, display: 'inline-block',
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.12s easeOut',
            }}>›</span>
            {ev.summary}
          </button>
          <button
            onClick={() => { setAnnotating(a => !a); setDraft(''); }}
            title="Add annotation"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px',
              fontSize: 11, color: DS.text2, lineHeight: 1,
              fontFamily: DS.mono,
            }}
          >note</button>
        </div>

        {expanded && (
          <pre style={{
            marginTop: 8, padding: '10px 12px', borderRadius: 6,
            background: DS.bg, border: `1px solid ${DS.border}`,
            fontFamily: DS.mono, fontSize: 12,
            color: DS.text, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            overflowX: 'auto',
          }}>
            {parsed !== null ? JSON.stringify(parsed, null, 2) : ev.data_json}
          </pre>
        )}

        {annotation && (
          <div style={{
            marginTop: 6, padding: '5px 10px', borderRadius: 6,
            background: 'rgba(59,130,246,0.07)', border: `1px solid ${DS.borderHi}`,
            fontSize: 11, color: DS.text2, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ color: DS.accent, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>note</span>
            {annotation}
          </div>
        )}

        {annotating && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Add note..."
              rows={2}
              style={{
                flex: 1, background: DS.surface2, border: `1px solid ${DS.borderMd}`,
                borderRadius: 6, color: DS.text, fontSize: 12, padding: '6px 8px',
                fontFamily: DS.sans, resize: 'vertical', outline: 'none',
              }}
            />
            <button
              onClick={saveNote}
              disabled={saving || !draft.trim()}
              style={{
                height: 30, padding: '0 12px', borderRadius: 6, border: 'none',
                cursor: saving || !draft.trim() ? 'default' : 'pointer',
                background: DS.accent, color: '#fff',
                fontSize: 12, fontWeight: 600, flexShrink: 0,
                opacity: saving || !draft.trim() ? 0.4 : 1,
              }}
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KillChain() {
  const { id: deviceId } = useParams();
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [annotations, setAnnotations] = useState({});
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [evs, anns] = await Promise.all([
        apiFetch(`/api/killchain/${deviceId}`),
        apiFetch(`/api/killchain/${deviceId}/annotations`),
      ]);
      setEvents(evs.map(e => ({ ...e, _device_id: parseInt(deviceId, 10) })));
      const annMap = {};
      (anns || []).forEach(a => { annMap[a.event_id] = a.note; });
      setAnnotations(annMap);
      setError(null);
    } catch (err) {
      setError(err.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 5000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const handleAnnotate = useCallback((eventId, note) => {
    setAnnotations(prev => ({ ...prev, [eventId]: note }));
  }, []);

  const filtered = events.filter(ev => {
    if (typeFilter && ev.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return ev.summary.toLowerCase().includes(q) || ev.data_json.toLowerCase().includes(q) || ev.type.toLowerCase().includes(q);
    }
    return true;
  });

  const inputStyle = {
    background: DS.surface2, border: `1px solid ${DS.borderMd}`, borderRadius: 6,
    color: DS.text, fontSize: 13, padding: '7px 10px', outline: 'none',
    fontFamily: DS.sans,
  };

  return (
    <div style={{ background: DS.bg, minHeight: '100vh', color: DS.text, fontFamily: DS.sans }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => navigate(`/devices/${deviceId}`)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: DS.accent, fontSize: 22, lineHeight: 1, padding: '0 4px 0 0',
              display: 'flex', alignItems: 'center',
            }}
            title="Back to device"
          >‹</button>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: DS.text2, marginBottom: 2 }}>
              Kill Chain
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: DS.text }}>
              Device {deviceId}
            </h1>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%', background: DS.green,
              boxShadow: `0 0 6px ${DS.green}88`, animation: 'pulse 2s infinite',
            }} />
            <span style={{ fontSize: 11, color: DS.text2 }}>live</span>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16,
          background: DS.surface, borderRadius: 8, border: `1px solid ${DS.border}`, padding: 12,
        }}>
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="">All types</option>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: DS.text2, whiteSpace: 'nowrap', paddingLeft: 4, fontFamily: DS.mono }}>
            {filtered.length} / {events.length}
          </div>
        </div>

        {/* Event list */}
        <div style={{ background: DS.surface, borderRadius: 8, border: `1px solid ${DS.border}`, padding: '0 16px' }}>
          {loading && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: DS.text2, fontSize: 13 }}>Loading...</div>
          )}
          {error && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: DS.red, fontSize: 13 }}>{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: DS.text2, fontSize: 13 }}>No events</div>
          )}
          {filtered.map(ev => (
            <EventRow
              key={ev.id}
              ev={ev}
              annotation={annotations[ev.id]}
              onAnnotate={handleAnnotate}
            />
          ))}
        </div>

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
