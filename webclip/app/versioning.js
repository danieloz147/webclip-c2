import { CONFIG } from './config.js';

const _timeout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));

export async function checkVersion(shouldReload = true) {
  try {
    const did = CONFIG.deviceId;
    const url = did
      ? `${CONFIG.server}/api/version?device_id=${did}`
      : `${CONFIG.server}/api/version`;
    const resp = await Promise.race([fetch(url), _timeout(4000)]);
    const { hash } = await resp.json();
    if (!hash) return;
    const current = CONFIG.appVersion();
    if (hash === current) return;
    CONFIG.setAppVersion(hash);
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      }
    }
    if (shouldReload) setTimeout(() => location.reload(), 500);
  } catch { /* server unreachable */ }
}
