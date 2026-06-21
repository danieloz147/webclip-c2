import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!navigator.hid) {
    await forceEvent('hid', { supported: false });
    return { supported: false };
  }
  try {
    const devices = await navigator.hid.requestDevice({ filters: [] });
    await forceEvent('hid', {
      devices: devices.map(d => ({ productName: d.productName, vendorId: d.vendorId })),
    });
    return { count: devices.length };
  } catch (e) {
    await forceEvent('hid', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
