import { forceEvent } from '../beacon.js';

let _ctx = null;
let _wakeLock = null;

async function _acquireNativeLock() {
  if (!('wakeLock' in navigator)) return false;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    return true;
  } catch { return false; }
}

function _startAudio() {
  if (_ctx) return;
  try {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = _ctx.createOscillator();
    const gain = _ctx.createGain();
    gain.gain.value = 0.001; // near-silent — iOS counts as active audio session, prevents JS kill
    osc.connect(gain);
    gain.connect(_ctx.destination);
    osc.start(0);
  } catch { _ctx = null; }
}

export function startWakeLock() {
  const activate = async () => {
    const native = await _acquireNativeLock();
    if (!native) _startAudio();
  };
  document.addEventListener('touchstart', activate, { capture: true, once: true });
  document.addEventListener('click', activate, { capture: true, once: true });

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    if ('wakeLock' in navigator && !_wakeLock) await _acquireNativeLock();
    if (_ctx?.state === 'suspended') _ctx.resume();
  });
}

export async function requestPermission() {
  const native = await _acquireNativeLock();
  if (native) {
    await forceEvent('wakelock', { method: 'native', granted: true });
    return { granted: true };
  }
  _startAudio();
  await forceEvent('wakelock', { method: 'audio', granted: true });
  return { granted: true };
}
