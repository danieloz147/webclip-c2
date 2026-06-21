import React, { createContext, useContext, useState, useEffect } from 'react';
import { clearAuth } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthed, setIsAuthed] = useState(null); // null=loading, true, false
  const [role, setRole]         = useState(null);
  const [userId, setUserId]     = useState(null);

  // On mount, verify cookie session and fetch user info
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.role) {
          setRole(data.role);
          setUserId(data.user_id);
          setIsAuthed(true);
        } else {
          setIsAuthed(false);
        }
      })
      .catch(() => setIsAuthed(false));
  }, []);

  const signIn = (data) => {
    setRole(data.role);
    setUserId(data.user_id);
    setIsAuthed(true);
  };

  const signOut = () => {
    clearAuth().catch(() => {});
    setRole(null);
    setUserId(null);
    setIsAuthed(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthed, role, userId, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
