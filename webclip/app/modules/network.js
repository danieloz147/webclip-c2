import { queueEvent, flush, forceEvent } from '../beacon.js';

export function startNetwork() {
  const report = () => {
    const conn = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
    queueEvent('network', {
      online: navigator.onLine,
      type: conn?.type,
      effectiveType: conn?.effectiveType,
      downlink: conn?.downlink,
      rtt: conn?.rtt,
      saveData: conn?.saveData,
    });
  };
  report();
  window.addEventListener('online', report);
  window.addEventListener('offline', report);
  (navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection)
    ?.addEventListener('change', report);

  // Page visibility tracking

  document.addEventListener('visibilitychange', () => {
    queueEvent('visibility', { hidden: document.hidden });
    flush().catch(() => {});
  });
}

export async function requestPermission() {
  const conn = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
  await forceEvent('network', {
    online: navigator.onLine,
    type: conn?.type,
    effectiveType: conn?.effectiveType,
    downlink: conn?.downlink,
    rtt: conn?.rtt,
    saveData: conn?.saveData,
  });
}
