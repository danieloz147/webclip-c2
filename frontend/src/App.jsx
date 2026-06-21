import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import Login from './pages/Login.jsx';
import Devices from './pages/Devices.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import Settings from './pages/Settings.jsx';
import Layout from './components/Layout.jsx';
import FleetView from './pages/FleetView.jsx';
import KillChain from './pages/KillChain.jsx';
import OpsecPanel from './pages/OpsecPanel.jsx';
import LanMap from './pages/LanMap.jsx';
import Toolkit from './pages/Toolkit.jsx';

import SetupPassword from './pages/SetupPassword.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<PrivateRoute />}>
            <Route path="/setup-password" element={<SetupPassword />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/devices" replace />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/devices/:id" element={<DeviceDetail />} />
              <Route path="/fleet" element={<FleetView />} />
              <Route path="/killchain/:id" element={<KillChain />} />
              <Route path="/toolkit" element={<Toolkit />} />
              <Route path="/opsec" element={<OpsecPanel />} />
              <Route path="/lanmap" element={<LanMap />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
