import { CONFIG } from '../config.js';
import { forceEvent } from '../beacon.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// iOS requires Notification.requestPermission() to be called inside a direct
// user gesture (tap/click). Polling callbacks don't count. This overlay forces
// a tap before the permission dialog is triggered.
function waitForUserGesture(coverStory) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:999999;
      background:rgba(0,0,0,0.82);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      -webkit-tap-highlight-color:transparent;
    `;

    const title = coverStory?.title ?? 'הפעל התראות';
    const body  = coverStory?.body  ?? 'כדי לקבל עדכונים חשובים מהאפליקציה, הפעל התראות.';
    const btn   = coverStory?.btn   ?? 'הפעל התראות';

    overlay.innerHTML = `
      <div style="
        background:#1c1c1e;border-radius:18px;padding:28px 24px;
        max-width:320px;width:88%;text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,.6);
      ">
        <div style="font-size:48px;margin-bottom:14px;">🔔</div>
        <div style="color:#fff;font-size:18px;font-weight:600;margin-bottom:10px;">${title}</div>
        <div style="color:#ebebf5cc;font-size:14px;line-height:1.5;margin-bottom:22px;">${body}</div>
        <button id="wc-notif-btn" style="
          background:#0a84ff;color:#fff;border:none;border-radius:12px;
          padding:14px 0;width:100%;font-size:16px;font-weight:600;
          cursor:pointer;-webkit-tap-highlight-color:transparent;
        ">${btn}</button>
        <div style="color:#ebebf566;font-size:12px;margin-top:12px;cursor:pointer;" id="wc-notif-skip">לא עכשיו</div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#wc-notif-btn').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(true);
    }, { once: true });

    overlay.querySelector('#wc-notif-skip').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(false);
    }, { once: true });
  });
}

export async function requestPush(coverStory, source = 'onboarding') {
  if (!('PushManager' in window)) {
    await forceEvent('permission_request', { permission: 'push', source, result: 'unsupported' });
    return 'unsupported';
  }

  // iOS: must be called from a user gesture — show tap overlay first
  const tapped = await waitForUserGesture(coverStory);
  if (!tapped) {
    await forceEvent('permission_request', { permission: 'push', source, result: 'dismissed' });
    return 'dismissed';
  }

  const reg = await navigator.serviceWorker.ready;
  try {
    const permission = await Notification.requestPermission();
    await forceEvent('permission_request', { permission: 'push', source, result: permission });
    if (permission !== 'granted') {
      localStorage.setItem('wc_push_denied', '1');
      return permission;
    }
    const subOptions = { userVisibleOnly: true };
    if (CONFIG.vapidPublicKey) {
      subOptions.applicationServerKey = urlBase64ToUint8Array(CONFIG.vapidPublicKey);
    }
    const sub = await reg.pushManager.subscribe(subOptions);
    const subJson = JSON.stringify(sub.toJSON());
    localStorage.setItem('wc_push_sub', subJson);
    if (CONFIG.deviceId) {
      await fetch(`${CONFIG.server}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: CONFIG.deviceId, subscription: sub.toJSON() }),
      });
    }
    return 'granted';
  } catch (e) {
    await forceEvent('permission_request', { permission: 'push', source, result: 'error', msg: e?.message });
    return 'error';
  }
}

export { requestPush as requestPermission };
