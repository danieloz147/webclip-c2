import React, { useState } from 'react';
import { parseUTC } from '../api/client.js';
import { C, S } from '../theme.jsx';

const TYPE_META = {
  fingerprint:        { color: C.purple,  bg: 'rgba(167,139,250,0.10)' },
  battery:            { color: C.green,   bg: C.greenBg },
  network:            { color: C.accent,  bg: C.accentBg },
  geolocation:        { color: C.amber,   bg: C.amberBg },
  camera:             { color: C.red,     bg: C.redBg },
  audio:              { color: C.red,     bg: C.redBg },
  clipboard:          { color: C.amber,   bg: C.amberBg },
  credentials:        { color: C.red,     bg: C.redBg },
  permission_request: { color: C.purple,  bg: 'rgba(167,139,250,0.10)' },
  visibility:         { color: C.text2,   bg: 'rgba(78,90,112,0.12)' },
  app_open:           { color: C.accent,  bg: C.accentBg },
};

const fallbackMeta = { color: C.text2, bg: 'rgba(78,90,112,0.12)' };

export default function EventFeed({ events }) {
  const [expanded, setExpanded] = useState(null);

  if (!events?.length) return (
    <div style={{ padding: 32, textAlign: 'center', color: C.text2, fontSize: 13, fontFamily: C.sans }}>
      No events
    </div>
  );

  const groups = {};
  events.forEach(ev => {
    if (!groups[ev.type]) groups[ev.type] = [];
    groups[ev.type].push(ev);
  });
  const sorted = Object.entries(groups).sort(
    ([, a], [, b]) => parseUTC(b[0].timestamp) - parseUTC(a[0].timestamp)
  );

  return (
    <div style={{ fontFamily: C.sans }}>
      {sorted.map(([type, evs]) => {
        const latest = evs[0];
        let parsed = latest.data_json;
        try { if (typeof parsed === 'string') parsed = JSON.parse(parsed); } catch { /* keep raw */ }
        const isOpen = expanded === type;
        const meta = TYPE_META[type] ?? fallbackMeta;

        return (
          <div key={type} style={{ borderBottom: `1px solid ${C.border}` }}>
            <div
              onClick={() => setExpanded(isOpen ? null : type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                cursor: 'pointer',
                background: 'transparent',
                transition: 'background 0.08s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: meta.color,
                background: meta.bg,
                borderRadius: 4,
                padding: '2px 7px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {type}
              </span>

              <span style={{
                fontFamily: C.mono,
                fontSize: 11,
                color: C.text2,
                background: C.surface2,
                borderRadius: 4,
                padding: '1px 6px',
                flexShrink: 0,
              }}>
                {evs.length}x
              </span>

              <span style={{
                flex: 1,
                fontSize: 12,
                color: C.text2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: C.mono,
              }}>
                {JSON.stringify(parsed)}
              </span>

              <span style={{
                fontFamily: C.mono,
                fontSize: 10,
                color: C.text2,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {latest.timestamp
                  ? parseUTC(latest.timestamp).toLocaleTimeString('en-IL', { timeZone: 'Asia/Jerusalem' })
                  : ''}
              </span>

              <span style={{
                color: C.text2,
                fontSize: 10,
                flexShrink: 0,
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
                display: 'inline-block',
              }}>
                &#9654;
              </span>
            </div>

            {isOpen && (
              <div style={{
                fontFamily: C.mono,
                fontSize: 11,
                color: C.text,
                background: C.bg,
                borderRadius: 6,
                padding: 10,
                margin: '0 14px 10px',
                maxHeight: 300,
                overflowY: 'auto',
              }}>
                {evs.map(ev => {
                  let d = ev.data_json;
                  try { if (typeof d === 'string') d = JSON.parse(d); } catch { /* keep raw */ }
                  return (
                    <div key={ev.id} style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                      <span style={{ color: C.text2, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {ev.timestamp
                          ? parseUTC(ev.timestamp).toLocaleTimeString('en-IL', { timeZone: 'Asia/Jerusalem' })
                          : '-'}
                      </span>
                      <pre style={{
                        margin: 0,
                        color: C.text,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        fontFamily: C.mono,
                      }}>
                        {JSON.stringify(d, null, 2)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
