import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { C, S } from '../theme.jsx';

const gridBg = {
  backgroundImage: `
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
  `,
  backgroundSize: '32px 32px',
};

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="8" width="11" height="8.5" rx="2"/>
    <path d="M5.5 8V6a3.5 3.5 0 017 0v2"/>
    <circle cx="9" cy="12.5" r="1.2" fill="#fff" stroke="none"/>
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await login(username, password);
      signIn(data);
      if (data.needs_password_setup) {
        navigate('/setup-password', { replace: true });
      } else {
        navigate('/devices', { replace: true });
      }
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
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            margin: '0 auto 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <LockIcon />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>
            WebClip C2
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: C.text2,
            marginTop: 4,
          }}>
            Operator Authentication
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 10 }}>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              required
              style={{ ...S.input, display: 'block' }}
              dir="ltr"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
              style={{ ...S.input, display: 'block' }}
              dir="ltr"
            />
          </div>

          {error && (
            <div style={{
              color: C.red,
              fontSize: 12,
              marginBottom: 12,
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
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
