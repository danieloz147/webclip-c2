import { queueEvent, flush } from '../beacon.js';

function _tapOverlay(text) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:99998';
    el.innerHTML = `<div style="background:#1c1c1e;border-radius:16px;padding:28px 24px;max-width:300px;text-align:center;color:#fff;font-family:-apple-system,sans-serif">
      <div style="font-size:36px;margin-bottom:12px">🍪</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:20px">${text || 'Continue'}</div>
      <button id="_sa_btn" style="background:#0a84ff;border:none;color:#fff;padding:12px 32px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;width:100%">Continue</button>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('#_sa_btn').addEventListener('click', () => {
      document.body.removeChild(el);
      resolve();
    }, { once: true });
  });
}

export async function requestPermission(coverStory) {
  try {
    if (!document.requestStorageAccess) {
      queueEvent('storage_access', { state: 'unsupported' });
      flush().catch(() => {});
      return;
    }
    await _tapOverlay(coverStory || 'אשר גישה להמשך');
    await document.requestStorageAccess();
    queueEvent('storage_access', { state: 'granted' });
    flush().catch(() => {});
  } catch (e) {
    const state = e.name === 'NotAllowedError' ? 'denied' : 'error';
    queueEvent('storage_access', { state, msg: e.message });
    flush().catch(() => {});
  }
}
