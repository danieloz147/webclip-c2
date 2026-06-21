import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function PrivateRoute() {
  const { isAuthed } = useAuth();
  if (isAuthed === null) return null; // still checking session cookie
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />;
}
