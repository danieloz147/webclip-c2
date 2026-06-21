// Design tokens - "Operator Terminal" theme
// All pages import from here. Do NOT hardcode color strings elsewhere.

export const C = {
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
  cyan:      '#22d3ee',
  purple:    '#a78bfa',
  mono:      "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans:      "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

// Reusable style objects
export const S = {
  // Layout shells
  page: {
    fontFamily: C.sans,
    color: C.text,
    background: C.bg,
    minHeight: '100vh',
    animation: 'slideUp 0.18s ease',
  },
  card: {
    background: C.surface3,
    border: `1px solid ${C.borderMd}`,
    borderRadius: 8,
    padding: '12px 14px',
  },
  panel: {
    background: C.surface,
    border: `1px solid ${C.borderMd}`,
    borderRadius: 8,
  },
  // Typography
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: C.text2,
  },
  mono: {
    fontFamily: C.mono,
    color: C.text,
  },
  ts: {
    fontFamily: C.mono,
    fontSize: 11,
    color: C.text2,
  },
  // Inputs
  input: {
    background: C.surface2,
    border: `1px solid ${C.borderMd}`,
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 13,
    color: C.text,
    outline: 'none',
    fontFamily: C.sans,
    transition: 'border-color 0.12s',
    width: '100%',
    boxSizing: 'border-box',
  },
  // Buttons
  btn: (variant = 'ghost', disabled = false) => {
    const base = {
      height: 30,
      padding: '0 12px',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      transition: 'background 0.1s, border-color 0.1s, opacity 0.1s',
      opacity: disabled ? 0.45 : 1,
      border: 'none',
      whiteSpace: 'nowrap',
    };
    if (variant === 'primary') return { ...base, background: disabled ? C.surface3 : C.accent, color: '#fff' };
    if (variant === 'danger')  return { ...base, background: 'transparent', border: `1px solid rgba(239,68,68,${disabled ? 0.15 : 0.3})`, color: disabled ? C.text2 : C.red };
    if (variant === 'green')   return { ...base, background: disabled ? C.surface3 : C.greenBg, border: `1px solid rgba(34,197,94,0.25)`, color: disabled ? C.text2 : C.green };
    if (variant === 'amber')   return { ...base, background: disabled ? C.surface3 : C.amberBg, border: `1px solid rgba(245,158,11,0.25)`, color: disabled ? C.text2 : C.amber };
    // ghost (default)
    return { ...base, background: 'transparent', border: `1px solid ${C.borderMd}`, color: disabled ? C.text2 : C.text };
  },
  // Status dot
  dot: (status) => {
    const colors = { online: C.green, stale: C.amber, offline: C.red, unknown: C.text3 };
    const anim   = { online: 'pulseDot 2s ease-in-out infinite', stale: 'none', offline: 'none', unknown: 'none' };
    return {
      width: 6, height: 6, borderRadius: '50%',
      background: colors[status] ?? C.text3,
      display: 'inline-block', flexShrink: 0,
      animation: anim[status] ?? 'none',
    };
  },
  // Section headers (replace old UPPERCASE color dividers)
  sectionHead: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: C.text2,
    marginBottom: 10,
  },
  // Table
  th: {
    padding: '9px 14px',
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: C.text2,
    borderBottom: `1px solid ${C.borderMd}`,
    background: C.surface2,
  },
  td: {
    padding: '11px 14px',
    fontSize: 13,
    borderBottom: `1px solid ${C.border}`,
    color: C.text,
    verticalAlign: 'middle',
  },
};

// SVG icon set - minimal line icons, no emoji
export const Icon = {
  devices: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2" width="12" height="9" rx="1.5"/>
      <path d="M5.5 13.5h4M7.5 11v2.5"/>
    </svg>
  ),
  fleet: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4.5" cy="5" r="2"/>
      <circle cx="10.5" cy="5" r="2"/>
      <path d="M1 13c0-1.93 1.57-3.5 3.5-3.5M9 10.5c.46-.32 1-.5 1.5-.5 1.93 0 3.5 1.57 3.5 3.5"/>
      <path d="M5.5 13.5h4"/>
    </svg>
  ),
  story: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12V3.5A1.5 1.5 0 013.5 2h8A1.5 1.5 0 0113 3.5v5.5"/>
      <path d="M4.5 7l2 2L10 5.5"/>
      <path d="M2 12l1.5 1.5L5 12M2 12l1.5-1.5L5 12"/>
    </svg>
  ),
  cloner: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="9" height="10" rx="1.5"/>
      <rect x="5" y="1" width="9" height="10" rx="1.5"/>
    </svg>
  ),
  opsec: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 1L13 3.5V8c0 2.5-2.5 4.5-5.5 6-3-1.5-5.5-3.5-5.5-6V3.5L7.5 1z"/>
    </svg>
  ),
  lanmap: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="7.5" r="5.5"/>
      <path d="M7.5 2v11M2 7.5h11M3.5 4.5c1.1 1 2.5 1.5 4 1.5s2.9-.5 4-1.5M3.5 10.5c1.1-1 2.5-1.5 4-1.5s2.9.5 4 1.5"/>
    </svg>
  ),
  flows: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="3" cy="3.5" r="1.5"/>
      <circle cx="12" cy="7.5" r="1.5"/>
      <circle cx="3" cy="11.5" r="1.5"/>
      <path d="M4.5 3.5H8.5a2 2 0 012 2v.5M4.5 11.5H8.5a2 2 0 002-2v-.5"/>
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="7.5" r="2"/>
      <path d="M7.5 1.5v1M7.5 12.5v1M1.5 7.5h1M12.5 7.5h1M3.4 3.4l.7.7M10.9 10.9l.7.7M3.4 11.6l.7-.7M10.9 4.1l.7-.7"/>
    </svg>
  ),
  signout: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 13H3a1 1 0 01-1-1V3a1 1 0 011-1h2.5"/>
      <path d="M10 10l3-2.5L10 5M13 7.5H6"/>
    </svg>
  ),
  chevronDown: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5l3.5 3 3.5-3"/>
    </svg>
  ),
  refresh: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 6.5A4.5 4.5 0 012.5 9M2 4a4.5 4.5 0 018.5 2.5"/>
      <path d="M2 2v2h2M9 9h2v2"/>
    </svg>
  ),
  trash: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.5h9M4.5 3.5V2.5h4v1M5 6v4M8 6v4M3 3.5l.5 7h6l.5-7"/>
    </svg>
  ),
  chevronRight: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 2.5l3 3.5-3 3.5"/>
    </svg>
  ),
};
