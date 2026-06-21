import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!navigator.serial) {
    await forceEvent('serial', { supported: false });
    return { supported: false };
  }
  try {
    const port = await navigator.serial.requestPort();
    const info = port.getInfo();
    await forceEvent('serial', { usbVendorId: info.usbVendorId, usbProductId: info.usbProductId });
    return { usbVendorId: info.usbVendorId, usbProductId: info.usbProductId };
  } catch (e) {
    await forceEvent('serial', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
