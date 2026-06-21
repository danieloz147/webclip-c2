import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { C, S } from '../theme.jsx';

const gridBg = {
  backgroundImage: `
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
  `,
  backgroundSize: '32px 32px',
};

const KeyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="8" r="4"/>
    <path d="M10.5 10.5L16 16M13 13.5l2-2"/>
  </svg>
);

export default function SetupPassword() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPw !== confirmPw) { setError('Passwords do not match'); return; }
    if (newPw.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ new_password: newPw }),
      });
      signIn(data);
      navigate('/devices', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: C.bg,
      ...gridBg,
      padding: '24px',
      fontFamily: C.sans,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        background: C.surface,
        border: `1px solid ${C.borderMd}`,
        borderRadius: 10,
        padding: '36px 32px',
        animation: 'fadeIn 0.15s ease',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: 'linear-gradient(135deg, #d97706, #b45309)',
            margin: '0 auto 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <KeyIcon />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>
            Set Password
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: C.text2,
            marginTop: 4,
          }}>
            Password Change Required
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ ...S.label, marginBottom: 6 }}>New Password</div>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="8+ characters"
              style={{ ...S.input, display: 'block' }}
              autoFocus
            />
          </div>
          <div>
            <div style={{ ...S.label, marginBottom: 6 }}>Confirm Password</div>
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="Repeat password"
              style={{ ...S.input, display: 'block' }}
            />
          </div>

          {error && (
            <div style={{
              color: C.red,
              fontSize: 12,
              textAlign: 'center',
              opacity: error ? 1 : 0,
              transition: 'opacity 0.1s',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: 36,
              borderRadius: 6,
              border: 'none',
              background: loading ? C.surface3 : C.accent,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              fontFamily: C.sans,
              transition: 'background 0.1s',
              opacity: loading ? 0.7 : 1,
              marginTop: 6,
            }}
          >
            {loading ? 'Updating...' : 'Set Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
