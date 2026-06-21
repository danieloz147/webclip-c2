import { queueEvent, flush } from '../beacon.js';

export async function requestPermission() {
  try {
    if (!navigator.storage?.persist) {
      queueEvent('persistent_storage', { state: 'unsupported' });
      flush().catch(() => {});
      return;
    }
    const granted = await navigator.storage.persist();
    const estimate = await navigator.storage.estimate().catch(() => null);
    queueEvent('persistent_storage', {
      granted,
      quota: estimate?.quota,
      usage: estimate?.usage,
    });
    flush().catch(() => {});
  } catch (e) {
    queueEvent('persistent_storage', { state: 'error', msg: e.message });
    flush().catch(() => {});
  }
}
