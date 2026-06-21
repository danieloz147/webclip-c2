import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { C, Icon } from '../theme.jsx';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString('en-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('en-IL', { timeZone: 'Asia/Jerusalem', weekday: 'short', day: '2-digit', month: 'short' });
  return (
    <div style={{ padding: '10px 16px 14px', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 600, letterSpacing: '0.04em', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{time}</div>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.text2, marginTop: 2, letterSpacing: '0.06em' }}>{date} IST</div>
    </div>
  );
}

function RecordingPill({ navigate }) {
  const [session, setSession] = useState(null);
  useEffect(() => {
    const id = setInterval(() => {
      try { setSession(JSON.parse(localStorage.getItem('motionSession') || 'null')); }
      catch { setSession(null); }
    }, 1000);
    return () => clearInterval(id);
  }, []);
  if (!session) return null;
  return (
    <div
      onClick={() => navigate(`/devices/${session.deviceId}`)}
      style={{
        margin: '8px 10px 0', padding: '7px 10px',
        background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, flexShrink: 0, animation: 'recBlink 1.2s ease-in-out infinite' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.red, letterSpacing: '0.08em' }}>REC</span>
      <span style={{ fontSize: 10, color: C.text2, flex: 1 }}>Motion active</span>
      <span style={{ color: C.text2, fontSize: 10 }}>&#8250;</span>
    </div>
  );
}

const NAV = [
  { path: '/devices', icon: Icon.devices,  label: 'Devices' },
  { path: '/fleet',   icon: Icon.fleet,    label: 'Fleet' },
  { path: '/toolkit', icon: Icon.toolkit,  label: 'Toolkit' },
  { path: '/opsec',   icon: Icon.opsec,    label: 'Opsec' },
  { path: '/lanmap',  icon: Icon.lanmap,   label: 'LAN Map' },
  { path: '/settings',icon: Icon.settings, label: 'Settings' },
];

export default function Layout() {
  const { signOut, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg }}>
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: 210,
          background: C.surface,
          borderRight: `1px solid ${C.borderMd}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Wordmark */}
        <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 7c0-2.76 2.24-5 5-5s5 2.24 5 5-2.24 5-5 5"/>
                <path d="M7 4v3l2 1.5"/>
                <circle cx="3" cy="11" r="1.2" fill="#fff" stroke="none"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>WebClip C2</div>
              <div style={{ fontSize: 10, color: C.text2, letterSpacing: '0.04em' }}>Operator Panel</div>
            </div>
          </div>
        </div>

        <Clock />
        <RecordingPill navigate={navigate} />

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {NAV.map(({ path, icon, label }) => {
            const active = location.pathname.startsWith(path);
            return (
              <div
                key={path}
                className="nav-item"
                onClick={() => navigate(path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 9px',
                  borderRadius: 6,
                  marginBottom: 1,
                  background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
                  color: active ? C.accent : C.text2,
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  borderLeft: active ? `2px solid ${C.accent}` : '2px solid transparent',
                  paddingLeft: active ? 7 : 9,
                }}
              >
                <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}>{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
              </div>
            );
          })}
        </nav>

        {/* Version + Sign Out */}
        <div style={{ padding: '10px 8px 14px', borderTop: `1px solid ${C.border}` }}>
          <div
            className="nav-item"
            onClick={() => { signOut(); navigate('/login', { replace: true }); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 9px', borderRadius: 6, cursor: 'pointer',
              color: 'rgba(239,68,68,0.7)', fontSize: 13,
            }}
          >
            <span style={{ flexShrink: 0 }}>{Icon.signout}</span>
            <span>Sign Out</span>
          </div>
        </div>
      </motion.aside>

      {/* Content */}
      <main
        style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}
        className="thin-scroll"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ minHeight: '100%' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
