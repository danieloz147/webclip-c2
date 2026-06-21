import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:       '#07080f',
  surface:  '#0c0d1a',
  surface2: '#10121f',
  surface3: '#141728',
  border:   'rgba(255,255,255,0.05)',
  borderMd: 'rgba(255,255,255,0.09)',
  text:     '#c9d1e8',
  text2:    '#4e5a70',
  accent:   '#3b82f6',
  accentBg: 'rgba(59,130,246,0.09)',
  green:    '#22c55e',
  greenBg:  'rgba(34,197,94,0.09)',
  amber:    '#f59e0b',
  amberBg:  'rgba(245,158,11,0.09)',
  red:      '#ef4444',
  redBg:    'rgba(239,68,68,0.09)',
  mono:     "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans:     "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

const btn = {
  primary: { height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: T.accent, color: '#fff', fontFamily: T.sans },
  ghost:   { height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: `1px solid ${T.borderMd}`, color: T.text, fontFamily: T.sans },
  danger:  { height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: T.red, fontFamily: T.sans },
  success: { height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: T.greenBg, border: '1px solid rgba(34,197,94,0.25)', color: T.green, fontFamily: T.sans },
};

const inputSt = {
  background: T.surface2, border: `1px solid ${T.borderMd}`, borderRadius: 6,
  padding: '7px 10px', fontSize: 13, color: T.text, outline: 'none',
  fontFamily: T.sans, width: '100%', boxSizing: 'border-box',
};

const fieldLabel = { fontSize: 11, fontWeight: 600, color: T.text2, marginBottom: 5, display: 'block' };

// Role badge configs
const ROLE_CONF = {
  admin:    { bg: 'rgba(59,130,246,0.09)', border: 'rgba(59,130,246,0.22)', color: T.accent },
  operator: { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.22)', color: T.amber },
  viewer:   { bg: T.surface2, border: T.borderMd, color: T.text2 },
};

export default function UserManagement() {
  const { userId: meId } = useAuth();
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState({ username: '', role: 'viewer' });
  const [addErr, setAddErr]       = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [copied, setCopied]       = useState(null); // 'created' | 'reset'

  async function fetchUsers() {
    try {
      const data = await apiFetch('/api/users');
      setUsers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!addForm.username.trim()) { setAddErr('Username required'); return; }
    setAddLoading(true); setAddErr('');
    try {
      const result = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(addForm) });
      setShowAdd(false);
      setAddForm({ username: '', role: 'viewer' });
      fetchUsers();
      setCreatedUser({ username: result.username, temp_password: result.temp_password });
    } catch (e) { setAddErr(e.message); }
    finally { setAddLoading(false); }
  }

  async function changeRole(userId, role) {
    try {
      await apiFetch(`/api/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    } catch (e) { alert(e.message); }
  }

  async function toggleActive(userId, isActive) {
    try {
      await apiFetch(`/api/users/${userId}/active`, { method: 'PATCH', body: JSON.stringify({ is_active: !isActive }) });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !isActive } : u));
    } catch (e) { alert(e.message); }
  }

  async function handleResetPassword(userId, username) {
    try {
      const result = await apiFetch(`/api/users/${userId}/reset-password`, { method: 'POST' });
      setResetUser({ username: result.username, temp_password: result.temp_password });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, needs_password_setup: true } : u));
    } catch (e) { alert(e.message); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) { alert(e.message); setDeleteTarget(null); }
  }

  function copyPw(pw, which) {
    navigator.clipboard.writeText(pw);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  // Overlay backdrop
  const Overlay = ({ children, onClose, zIndex = 1000 }) => (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        zIndex, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </motion.div>
  );

  // Modal box
  const Modal = ({ children, borderAccent = T.borderMd }) => (
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.96, opacity: 0 }}
      onClick={e => e.stopPropagation()}
      style={{
        background: T.surface, borderRadius: 10, padding: '24px 28px',
        border: `1px solid ${borderAccent}`, width: 400,
        fontFamily: T.sans,
      }}
    >
      {children}
    </motion.div>
  );

  const modalTitle  = { fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 };
  const modalSubtxt = { fontSize: 12, color: T.text2, marginBottom: 18, lineHeight: 1.5 };
  const pwDisplay   = {
    background: T.bg, border: `1px solid ${T.borderMd}`, borderRadius: 7,
    padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 18,
  };

  return (
    <div style={{ width: '100%', fontFamily: T.sans }}>

      {/* Add User button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={btn.primary}>+ Add User</button>
      </div>

      {error && <div style={{ color: T.red, marginBottom: 12, fontSize: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ color: T.text2, padding: '24px 0', textAlign: 'center', fontSize: 13 }}>Loading...</div>
      ) : (
        <div style={{
          background: T.surface, border: `1px solid ${T.borderMd}`, borderRadius: 8, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 140px 90px 160px 110px 80px 70px',
            padding: '9px 16px',
            borderBottom: `1px solid ${T.borderMd}`,
            fontSize: 10, color: T.text2, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            <span>Username</span>
            <span>Role</span>
            <span>Status</span>
            <span>Last Login</span>
            <span>Actions</span>
            <span>Reset PW</span>
            <span>Delete</span>
          </div>

          {/* Rows */}
          {users.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 140px 90px 160px 110px 80px 70px',
                padding: '11px 16px',
                borderBottom: i < users.length - 1 ? `1px solid ${T.border}` : 'none',
                alignItems: 'center',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Username */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{u.username}</span>
                {u.needs_password_setup && (
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                    background: T.amberBg, color: T.amber, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>temp pw</span>
                )}
              </div>

              {/* Role selector */}
              <div>
                <select
                  value={u.role}
                  disabled={u.id === meId}
                  onChange={e => changeRole(u.id, e.target.value)}
                  title={u.id === meId ? 'Cannot change your own role' : undefined}
                  style={{
                    background: (ROLE_CONF[u.role] ?? ROLE_CONF.viewer).bg,
                    border: `1px solid ${(ROLE_CONF[u.role] ?? ROLE_CONF.viewer).border}`,
                    borderRadius: 5, color: (ROLE_CONF[u.role] ?? ROLE_CONF.viewer).color,
                    fontSize: 11, fontWeight: 600, padding: '4px 8px',
                    outline: 'none', cursor: u.id === meId ? 'not-allowed' : 'pointer',
                    opacity: u.id === meId ? 0.4 : 1,
                    fontFamily: T.sans,
                  }}
                >
                  <option value="admin">admin</option>
                  <option value="operator">operator</option>
                  <option value="viewer">viewer</option>
                </select>
              </div>

              {/* Status badge */}
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  padding: '3px 8px', borderRadius: 20,
                  background: u.is_active ? T.greenBg : T.redBg,
                  color: u.is_active ? T.green : T.red,
                  border: `1px solid ${u.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                }}>
                  {u.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Last login */}
              <div style={{ fontSize: 12, color: T.text2 }}>
                {u.last_login
                  ? new Date(u.last_login + (u.last_login.endsWith('Z') ? '' : 'Z')).toLocaleString()
                  : 'Never'}
              </div>

              {/* Toggle active */}
              <div>
                <button
                  disabled={u.id === meId}
                  onClick={() => u.id !== meId && toggleActive(u.id, u.is_active)}
                  title={u.id === meId ? 'Cannot deactivate your own account' : undefined}
                  style={{
                    ...(u.is_active ? btn.danger : btn.success),
                    opacity: u.id === meId ? 0.4 : 1,
                    cursor: u.id === meId ? 'not-allowed' : 'pointer',
                  }}
                >
                  {u.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>

              {/* Reset password */}
              <div>
                <button
                  disabled={u.id === meId}
                  onClick={() => u.id !== meId && handleResetPassword(u.id, u.username)}
                  title={u.id === meId ? 'Cannot reset your own password here' : 'Generate new temporary password'}
                  style={{
                    ...btn.ghost,
                    opacity: u.id === meId ? 0.4 : 1,
                    cursor: u.id === meId ? 'not-allowed' : 'pointer',
                  }}
                >Reset PW</button>
              </div>

              {/* Delete */}
              <div>
                <button
                  disabled={u.id === meId}
                  onClick={() => u.id !== meId && setDeleteTarget({ id: u.id, username: u.username })}
                  title={u.id === meId ? 'Cannot delete your own account' : 'Delete user'}
                  style={{
                    ...btn.danger,
                    opacity: u.id === meId ? 0.4 : 1,
                    cursor: u.id === meId ? 'not-allowed' : 'pointer',
                  }}
                >Delete</button>
              </div>
            </motion.div>
          ))}

          {users.length === 0 && (
            <div style={{ padding: '28px', textAlign: 'center', color: T.text2, fontSize: 13 }}>
              No users found
            </div>
          )}
        </div>
      )}

      {/* ── Add User modal ── */}
      <AnimatePresence>
        {showAdd && (
          <Overlay onClose={() => setShowAdd(false)}>
            <Modal>
              <div style={modalTitle}>Add New User</div>
              <div style={modalSubtxt}>Password will be auto-generated (8 chars, secure random).</div>
              <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={fieldLabel}>Username</label>
                  <input
                    style={inputSt}
                    value={addForm.username}
                    onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))}
                    placeholder="username"
                    autoFocus
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Role</label>
                  <select
                    style={{ ...inputSt, cursor: 'pointer' }}
                    value={addForm.role}
                    onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                  >
                    <option value="viewer">viewer - read only</option>
                    <option value="operator">operator - full access</option>
                    <option value="admin">admin - full + user management</option>
                  </select>
                </div>
                {addErr && (
                  <div style={{
                    background: T.redBg, border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 6, padding: '8px 12px', color: T.red, fontSize: 12,
                  }}>{addErr}</div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                  <button type="button" onClick={() => setShowAdd(false)}
                    style={{ ...btn.ghost, flex: 1, height: 34 }}>Cancel</button>
                  <button type="submit" disabled={addLoading}
                    style={{ ...btn.primary, flex: 1, height: 34, opacity: addLoading ? 0.4 : 1 }}>
                    {addLoading ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ── Delete confirmation modal ── */}
      <AnimatePresence>
        {deleteTarget && (
          <Overlay onClose={() => setDeleteTarget(null)} zIndex={1002}>
            <Modal borderAccent="rgba(239,68,68,0.25)">
              <div style={modalTitle}>Delete User</div>
              <div style={modalSubtxt}>
                Are you sure you want to delete <strong style={{ color: T.text }}>{deleteTarget.username}</strong>?
              </div>
              <div style={{
                background: T.redBg, border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6, padding: '10px 12px', color: T.red, fontSize: 12, marginBottom: 18,
                lineHeight: 1.5,
              }}>
                This action is irreversible. All data associated with this user will be permanently deleted.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setDeleteTarget(null)}
                  style={{ ...btn.ghost, flex: 1, height: 34 }}>Cancel</button>
                <button onClick={confirmDelete}
                  style={{ ...btn.danger, flex: 1, height: 34, background: T.redBg }}>Delete</button>
              </div>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ── Password reset result modal ── */}
      <AnimatePresence>
        {resetUser && (
          <Overlay onClose={() => setResetUser(null)} zIndex={1001}>
            <Modal borderAccent="rgba(245,158,11,0.25)">
              <div style={modalTitle}>Password Reset</div>
              <div style={modalSubtxt}>
                New temporary password for <strong style={{ color: T.text }}>{resetUser.username}</strong>. They will be forced to change it on next login.
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Temporary Password
              </div>
              <div style={{ ...pwDisplay, border: '1px solid rgba(245,158,11,0.25)' }}>
                <code style={{ fontSize: 16, fontWeight: 700, color: T.amber, letterSpacing: 2, fontFamily: T.mono }}>
                  {resetUser.temp_password}
                </code>
                <button
                  onClick={() => copyPw(resetUser.temp_password, 'reset')}
                  style={{ ...btn.ghost, fontSize: 11, color: copied === 'reset' ? T.green : T.text2 }}
                >{copied === 'reset' ? 'Copied' : 'Copy'}</button>
              </div>
              <button onClick={() => setResetUser(null)}
                style={{ ...btn.ghost, width: '100%', height: 34, color: T.amber, borderColor: 'rgba(245,158,11,0.25)' }}>
                Done
              </button>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ── User created modal ── */}
      <AnimatePresence>
        {createdUser && (
          <Overlay onClose={() => setCreatedUser(null)} zIndex={1001}>
            <Modal borderAccent="rgba(34,197,94,0.25)">
              <div style={modalTitle}>User Created</div>
              <div style={modalSubtxt}>
                Share this temporary password with <strong style={{ color: T.text }}>{createdUser.username}</strong>. They will be prompted to change it on first login.
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Temporary Password
              </div>
              <div style={{ ...pwDisplay, border: '1px solid rgba(34,197,94,0.25)' }}>
                <code style={{ fontSize: 16, fontWeight: 700, color: T.green, letterSpacing: 2, fontFamily: T.mono }}>
                  {createdUser.temp_password}
                </code>
                <button
                  onClick={() => copyPw(createdUser.temp_password, 'created')}
                  style={{ ...btn.ghost, fontSize: 11, color: copied === 'created' ? T.green : T.text2 }}
                >{copied === 'created' ? 'Copied' : 'Copy'}</button>
              </div>
              <button onClick={() => setCreatedUser(null)}
                style={{ ...btn.primary, width: '100%', height: 34 }}>
                Done
              </button>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>
    </div>
  );
}
