import { queueEvent, flush } from '../beacon.js';

// Permissions API names relevant to iOS WebKit — unsupported ones return 'unsupported'
const ALL_PERMISSION_NAMES = [
  'geolocation', 'camera', 'microphone', 'notifications',
  'clipboard-read', 'clipboard-write',
  'accelerometer', 'gyroscope', 'magnetometer', 'ambient-light-sensor',
  'display-capture',
  'push', 'background-sync', 'background-fetch',
  'window-management', 'payment-handler', 'compute-pressure',
  'speaker-selection', 'captured-surface-control',
  'xr-spatial-tracking',
];

export async function checkPermissions() {
  const result = {};

  if (navigator.permissions) {
    await Promise.all(ALL_PERMISSION_NAMES.map(async (name) => {
      try {
        const s = await navigator.permissions.query({ name });
        if (s.state === 'prompt' && name === 'geolocation') {
          // iOS WebClip: Permissions API returns 'prompt' even when OS grant exists.
          result[name] = localStorage.getItem('wc_geo_granted') ? 'granted' : 'indeterminate';
        } else {
          result[name] = s.state;
        }
      } catch {
        result[name] = 'unsupported';
      }
    }));
  } else {
    for (const name of ALL_PERMISSION_NAMES) result[name] = 'unsupported';
  }

  // Motion sensors — iOS 13+ requires DeviceMotionEvent.requestPermission()
  if (typeof DeviceMotionEvent === 'undefined') {
    result['motion'] = 'unsupported';
  } else if (typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS 13+: calling without a gesture returns cached state if already granted this session,
    // or rejects if not yet granted (requiring a gesture). We use this to detect granted state.
    try {
      const perm = await DeviceMotionEvent.requestPermission();
      result['motion'] = perm; // 'granted' or 'denied'
    } catch {
      result['motion'] = 'prompt'; // not yet granted this session — needs tap overlay
    }
  } else {
    result['motion'] = 'granted';
  }

  // Push — infer from localStorage (PushManager doesn't expose state via Permissions API reliably)
  if (!('PushManager' in window)) {
    result['push'] = 'unsupported';
  } else if (localStorage.getItem('wc_push_sub')) {
    result['push'] = 'granted';
  } else if (localStorage.getItem('wc_push_denied')) {
    result['push'] = 'denied';
  } else {
    result['push'] = result['push'] ?? 'prompt';
  }

  // Web Audio — gesture-unlocked, zero system permission
  result['web-audio'] = (window.__bgCtx?.state === 'running') ? 'granted' : 'prompt';

  queueEvent('permissions', result);
  flush().catch(() => {});
}
