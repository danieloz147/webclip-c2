// Service Worker — push events, scheduled notifications, network intercept

// ── Network intercept ────────────────────────────────────────────────────────
let _interceptEnabled = false;
const _interceptLog = []; // { ts, method, url, status, ms }

self.addEventListener('message', function(event) {
  if (!event.data) return;
  if (event.data.type === 'intercept_toggle') {
    _interceptEnabled = !!event.data.enable;
    // Flush pending log to all clients when toggled off
    if (!_interceptEnabled && _interceptLog.length) {
      _flushIntercept();
    }
    return;
  }
  if (event.data.type === 'intercept_flush') {
    _flushIntercept();
    return;
  }
  if (event.data.type === 'showNow') {
    self.registration.showNotification(event.data.title || 'WebClip Demo', {
      body: event.data.body || '',
    });
  }
  if (event.data.type === 'scheduleNotif') {
    var delay = event.data.delay || 5000;
    setTimeout(function() {
      self.registration.showNotification(event.data.title || 'WebClip Demo', {
        body: event.data.body || ('Fired after ' + (delay/1000) + 's'),
      });
    }, delay);
  }
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'enumerate_clients') {
    var src = event.source;
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
      var list = cs.map(function(c) { return { id: c.id, url: c.url, focused: c.focused, visibilityState: c.visibilityState }; });
      // Reply to the requesting client only
      if (src) src.postMessage({ type: 'sw_clients', clients: list });
    });
  }
});

function _flushIntercept() {
  if (!_interceptLog.length) return;
  const batch = _interceptLog.splice(0);
  self.clients.matchAll().then(function(cs) {
    cs.forEach(function(c) {
      c.postMessage({ type: 'sw_intercept_log', entries: batch });
    });
  });
}

// Flush every 5s when intercept active
setInterval(function() {
  if (_interceptEnabled && _interceptLog.length) _flushIntercept();
}, 5000);

self.addEventListener('fetch', function(event) {
  if (!_interceptEnabled) return; // pass-through by default
  const req = event.request;
  // Skip our own beacon/WS requests to avoid log flooding
  if (req.url.includes('/api/beacon') || req.url.includes('/api/heartbeat')) return;

  const t0 = Date.now();
  event.respondWith(
    fetch(req).then(function(resp) {
      _interceptLog.push({
        ts: t0, method: req.method, url: req.url,
        status: resp.status, ms: Date.now() - t0,
      });
      return resp;
    }).catch(function(err) {
      _interceptLog.push({
        ts: t0, method: req.method, url: req.url,
        status: 0, ms: Date.now() - t0, error: err.message,
      });
      throw err;
    })
  );
});

self.addEventListener('push', function(event) {
  var data = {};
  try { data = event.data.json(); } catch(e) { data = {title:'WebClip Demo', body: event.data ? event.data.text() : ''}; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'WebClip Demo', {
      body: data.body || '',
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then(function(cs) {
    if (cs.length) return cs[0].focus();
    return clients.openWindow('/');
  }));
});
