import { CONFIG } from '../config.js';
import { showRelayPrompt, resetRelayPrompt } from './relay-prompt.js';

function _orientation() {
  const t = screen.orientation?.type
    ?? (window.orientation === 0 || window.orientation === 180 ? 'portrait-primary' : 'landscape-primary');
  return t;
}

let _last = {};
let _beatFn = null;

export function forceBeat() { _beatFn?.(); }

export function startHeartbeat(intervalMs = 3000) {
  if (!CONFIG.deviceId) return;

  _last = {};

  const beat = () => {
    if (!CONFIG.deviceId) return;
    // visible + audio always sent; orientation only on change.
    const cur = {
      orientation: _orientation(),
    };
    const delta = {
      visible: !document.hidden,
      audio:   window.__bgCtx?.state ?? null,
    };
    for (const k of Object.keys(cur)) {
      if (JSON.stringify(cur[k]) !== JSON.stringify(_last[k])) {
        delta[k] = cur[k];
        _last[k] = cur[k];
      }
    }
    fetch(`${CONFIG.server}/api/heartbeat/${CONFIG.deviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(delta),
    }).then(r => r.json()).then(data => {
      if (data.reset_cache) {
        Object.keys(localStorage).filter(k => k.startsWith('wc_hash_')).forEach(k => localStorage.removeItem(k));
        window.location.reload();
      }
      if (data.show_relay_prompt) {
        showRelayPrompt();
      }
      if (data.hide_relay_prompt) {
        resetRelayPrompt();
      }
    }).catch(() => {});
  };

  _beatFn = beat;
  beat();
  setInterval(beat, intervalMs);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
}
