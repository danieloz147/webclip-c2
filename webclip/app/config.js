// Collection server base URL — override by setting window.WEBCLIP_SERVER before this loads
const _SERVER = window.WEBCLIP_SERVER ?? `${location.protocol}//${location.hostname}:8443`;

export const CONFIG = {
  server: _SERVER,
  wsUrl: _SERVER.replace(/^http/, 'ws'),
  // WebTransport URL — only set if server exposes an HTTP/3 endpoint
  wtUrl: window.WEBCLIP_WT_URL ?? null,
  vapidPublicKey: window.WEBCLIP_VAPID_KEY ?? '',
  // Device identity stored in localStorage
  get deviceId() { return localStorage.getItem('wc_device_id'); },
  set deviceId(v) { localStorage.setItem('wc_device_id', v); },
  get deviceName() { return localStorage.getItem('wc_device_name'); },
  set deviceName(v) { localStorage.setItem('wc_device_name', v); },
  isOnboarded: () => localStorage.getItem('wc_onboarded') === '1',
  setOnboarded: () => localStorage.setItem('wc_onboarded', '1'),
  appVersion: () => localStorage.getItem('wc_version'),
  setAppVersion: (v) => localStorage.setItem('wc_version', v),
};
