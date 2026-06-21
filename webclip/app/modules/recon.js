// recon.js — passive network intelligence: LAN scan, DNS oracle, tab awareness

// ─── 1. WebRTC local IP discovery ───────────────────────────────────────────

export function getLocalIPs() {
  return new Promise((resolve) => {
    const ips = new Set();
    const candidates = [];
    let settled = false;
    const done = () => {
      if (!settled) { settled = true; resolve({ ips: [...ips], candidates }); }
    };
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(done);
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) { pc.close(); done(); return; }
        const c = ev.candidate.candidate;
        // Extract IPv4 and IPv6
        const ip4 = c.match(/(?:udp|tcp) \d+ ([\d.]+) /i)?.[1];
        const ip6 = c.match(/(?:udp|tcp) \d+ ([a-f\d:]+) /i)?.[1];
        if (ip4 && !ip4.startsWith('0.')) ips.add(ip4);
        if (ip6 && ip6.includes(':')) ips.add(ip6);
        // Also save mDNS / full candidate line for topology clues
        const mdns = c.match(/([a-f\d-]+\.local)/i)?.[1];
        candidates.push({ raw: c, ip4, ip6, mdns: mdns ?? null, type: ev.candidate.type });
      };
      setTimeout(() => { try { pc.close(); } catch {} done(); }, 4000);
    } catch { done(); }
  });
}

// ─── 2. LAN host probe via HTTPS timing ─────────────────────────────────────
// Works from HTTPS context: probe internal IPs on HTTPS ports.
// Timing of cert/connection errors reveals whether host is alive.

export async function probeHost(ip, port = 443, timeout = 2000) {
  const url = `https://${ip}:${port}/`;
  const t0 = performance.now();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);
  try {
    await fetch(url, { signal: ctrl.signal, mode: 'no-cors', cache: 'no-store' });
    clearTimeout(tid);
    return { ip, port, status: 'open', ms: Math.round(performance.now() - t0) };
  } catch (e) {
    clearTimeout(tid);
    const ms = Math.round(performance.now() - t0);
    if (e.name === 'AbortError') return { ip, port, status: 'timeout', ms };
    // Fast TCP RST (<600ms) = host alive, port refused or cert invalid
    return { ip, port, status: ms < 600 ? 'alive' : 'dead', ms };
  }
}

// Probe known common gateway IPs to discover which subnet is active.
// Returns the first responsive gateway IP (fastest responder).
// Uses only 3 probe ports (80/443/8080) to keep concurrent connections manageable
// even with a large gateway list — gateway detection doesn't need full port coverage.
const _GW_PROBE_PORTS = [80, 443, 8080];
function _gwAlive(ip, timeout) {
  return new Promise(resolve => {
    const proto = window.location.protocol;
    const t0 = performance.now();
    let done = false;
    const finish = (alive, port = null) => {
      if (done) return; done = true;
      resolve({ ip, alive, port, ms: Math.round(performance.now() - t0) });
    };
    const timer = setTimeout(() => finish(false), timeout);
    _GW_PROBE_PORTS.forEach(port => {
      const img = new Image();
      img.onload = () => { clearTimeout(timer); finish(true, port); };
      img.onerror = () => { if (img.complete && img.naturalWidth === 0) { clearTimeout(timer); finish(true, port); } };
      img.src = `${proto}//${ip}:${port}/favicon.ico?_=${Date.now()}`;
    });
  });
}

export async function detectGateway(timeout = 2000) {
  const COMMON_GW = [
    // 192.168.x.1 and .254 — home / SMB
    '192.168.0.1',   '192.168.0.254', '192.168.1.1',   '192.168.1.254',
    '192.168.2.1',   '192.168.3.1',   '192.168.4.1',   '192.168.5.1',
    '192.168.10.1',  '192.168.11.1',  '192.168.20.1',  '192.168.50.1',
    '192.168.100.1', '192.168.101.1', '192.168.168.1', '192.168.200.1',
    // 10.x.x.1 — enterprise / VPN
    '10.0.0.1',    '10.0.0.138',  '10.0.1.1',    '10.0.2.1',
    '10.1.1.1',    '10.1.10.1',   '10.2.0.1',    '10.4.0.1',
    '10.8.0.1',    '10.9.0.1',    '10.10.0.1',   '10.10.1.1',
    '10.10.10.1',  '10.20.0.1',   '10.30.0.1',   '10.50.0.1',
    '10.100.0.1',  '10.100.1.1',  '10.128.0.1',  '10.200.0.1',
    '10.210.0.1',  '10.250.0.1',  '10.254.0.1',
    // 172.16-31.x.1 — full RFC1918 range
    '172.16.0.1',  '172.16.1.1',  '172.16.2.1',  '172.16.10.1',
    '172.16.20.1', '172.16.21.1', '172.17.0.1',  '172.17.1.1',
    '172.18.0.1',  '172.18.1.1',  '172.19.0.1',  '172.20.0.1',
    '172.20.1.1',  '172.21.0.1',  '172.22.0.1',  '172.24.0.1',
    '172.25.0.1',  '172.28.0.1',  '172.30.0.1',  '172.31.0.1',
    // Common .254 gateways in enterprise
    '10.0.0.254',  '10.1.1.254',  '172.16.0.254', '172.16.1.254',
  ];
  // Race all gateway IPs simultaneously, return fastest alive
  const results = await Promise.all(COMMON_GW.map(ip => _gwAlive(ip, timeout)));
  const alive = results.filter(r => r.alive);
  if (!alive.length) return null;
  alive.sort((a, b) => a.ms - b.ms);
  return alive[0].ip;
}

export async function scanSubnet(baseIP, ports = [443, 8443], topN = 30, onProgress) {
  // Build candidate IPs from /24 of baseIP
  const prefix = baseIP.split('.').slice(0, 3).join('.');
  // Prioritise likely interesting addresses
  const priority = [1, 254, 2, 100, 101, 200, 10, 20, 50, 150, 168];
  const rest = Array.from({ length: 254 }, (_, i) => i + 1)
    .filter(n => !priority.includes(n));
  const suffixes = [...new Set([...priority, ...rest])].slice(0, topN);
  const candidates = suffixes.map(s => `${prefix}.${s}`);

  const results = [];
  for (let i = 0; i < candidates.length; i += 8) {
    const batch = candidates.slice(i, i + 8);
    const batchRes = await Promise.all(
      batch.flatMap(ip => ports.map(port => probeHost(ip, port)))
    );
    const live = batchRes.filter(r => r.status !== 'timeout' && r.status !== 'dead');
    results.push(...live);
    onProgress?.({ done: Math.min(i + 8, candidates.length), total: candidates.length, live: results.length });
  }
  return results;
}

// ─── 5. WebRTC TURN TCP probe ────────────────────────────────────────────────
// Uses RTCPeerConnection with a fake TURN server to probe TCP ports on any IP.
// This bypasses HTTPS mixed-content and Private Network Access restrictions
// because WebRTC is not subject to those rules — it runs its own ICE/TURN stack.
//
// Timing semantics on a LAN:
//   Host alive  (any port): ARP succeeds → TCP SYN → fast RST or auth failure → < 800ms
//   Host dead             : ARP times out → onicecandidateerror after ~2s
export function probeTCPviaWebRTC(ip, port, timeout = 2500) {
  return new Promise(resolve => {
    const t0 = performance.now();
    let settled = false;
    const done = (status) => {
      if (settled) return;
      settled = true;
      try { pc.close(); } catch {}
      resolve({ ip, port, status, ms: Math.round(performance.now() - t0), method: 'webrtc' });
    };
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: `turn:${ip}:${port}?transport=tcp`, username: 'x', credential: 'x' }],
      iceTransportPolicy: 'relay', // force TURN-only — no local/srflx candidates
    });
    pc.createDataChannel('p');
    pc.createOffer()
      .then(o => pc.setLocalDescription(o))
      .catch(() => done('error'));
    pc.onicecandidateerror = () => {
      // TURN auth will always fail (we're not sending real creds).
      // Fast error = TCP connected = host alive.
      // Slow error (~2s) = no ARP reply = host dead.
      const ms = Math.round(performance.now() - t0);
      done(ms < 1400 ? 'alive' : 'dead');
    };
    pc.onicecandidate = (ev) => { if (!ev.candidate) done('no-relay'); };
    setTimeout(() => done('timeout'), timeout);
  });
}

// Ports to probe per host — browser bad-port list excludes 22/25/53/135/139/445 etc.
// Race all in parallel: first img.complete=true response wins → host is alive.
// ~200 most common safe ports (browser-blocked ports excluded, no duplicates).
const _PROBE_PORTS = [
  // HTTP / HTTPS & web variants
  80, 81, 82, 83, 84, 85, 88, 90, 99, 280, 300, 443, 591, 593, 832, 981,
  1010, 1080, 1194, 1311,
  // cPanel / hosting panels
  2082, 2083, 2086, 2087, 2095, 2096,
  // Docker / etcd / K8s / ZooKeeper
  2181, 2375, 2376, 2379, 2380, 4194,
  // Messaging (RabbitMQ, Erlang)
  4369, 5672,
  // Web dev servers
  3000, 3001, 3002, 3003, 3100, 3200,
  // Databases
  1433, 1434, 1521, 1830, 3306, 3351, 5432, 5433, 5984, 6379, 6380,
  9042, 9160, 11211, 15672, 27017, 27018, 28017,
  // Remote access / VNC / WinRM
  3389, 4899, 5800, 5900, 5901, 5902, 5985, 5986,
  // Dev tools / misc
  4000, 4001, 4040, 4443, 4567, 4848,
  5000, 5001, 5555, 5601, 6060, 6080, 6443, 6881,
  7000, 7001, 7002, 7070, 7080, 7171, 7199, 7443, 7474, 7777,
  // 8xxx web services
  8000, 8001, 8008, 8009, 8010, 8011,
  8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089,
  8090, 8091, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099,
  8161, 8181, 8243, 8280, 8281, 8300, 8301, 8302, 8333,
  8428, 8443, 8444, 8445, 8446, 8472,
  8500, 8530, 8531, 8761, 8787, 8800, 8834, 8880, 8888, 8889, 8899, 8983, 8989,
  // 9xxx services
  9000, 9001, 9002, 9003, 9009, 9043, 9060, 9080,
  9090, 9091, 9092, 9093, 9100, 9115, 9200, 9300, 9411, 9418, 9443, 9444, 9999,
  // 10xxx+ / K8s node ports
  10000, 10001, 10248, 10249, 10250, 10251, 10252, 10255, 10256, 10443,
  // AI / observability / big data
  11434, 14268, 15443, 16686,
  // Large / ephemeral / special
  32400, 49152, 49153, 50000, 50070,
];

// Probe a single IP for liveness by racing img probes across common ports.
// A port that responds (TCP open or TLS error) gives img.complete=true → alive.
// All ports DROP or host dead → img.complete=false → dead after timeout.
export function hostAlive(ip, timeout = 3000) {
  return new Promise(resolve => {
    const proto = window.location.protocol;
    const t0 = performance.now();
    let done = false;
    const finish = (alive, port = null) => {
      if (done) return; done = true;
      resolve({ ip, alive, port, ms: Math.round(performance.now() - t0) });
    };
    const timer = setTimeout(() => finish(false), timeout);
    _PROBE_PORTS.forEach(port => {
      const img = new Image();
      img.onload = () => { clearTimeout(timer); finish(true, port); };
      img.onerror = () => {
        if (img.complete && img.naturalWidth === 0) {
          clearTimeout(timer); finish(true, port);
        }
        // img.complete=false = no response yet / instant block — wait for next port or timer
      };
      img.src = `${proto}//${ip}:${port}/favicon.ico?_=${Date.now()}`;
    });
  });
}

// Parse a CIDR string like "192.168.1.0/24" or plain IP "192.168.1.1" (treated as /24).
// Returns array of all host IPs in the range. /32 returns the single host IP.
export function cidrToIPs(cidr) {
  const [base, mask] = (cidr ?? '').includes('/') ? cidr.split('/') : [cidr, '32'];
  const bits = parseInt(mask, 10);
  if (bits >= 32) return [base];
  const prefix = base.split('.').slice(0, 3).join('.');
  return Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
}

// Scan a CIDR range for live hosts.
// shouldStop: () => bool — polled between batches so operator can abort.
export async function scanCIDR(cidr, onProgress, shouldStop, onHostFound) {
  const ips = cidrToIPs(cidr);
  const alive = [];
  const BATCH = 8;
  for (let i = 0; i < ips.length; i += BATCH) {
    if (shouldStop?.()) break;
    const batch = ips.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(ip => hostAlive(ip)));
    for (const r of results) {
      if (r.alive) {
        alive.push(r);
        onHostFound?.(r);
      }
    }
    onProgress?.({ done: Math.min(i + BATCH, ips.length), total: ips.length, alive: alive.length });
  }
  return alive;
}

// ─── 6. Targeted single-IP port scan ────────────────────────────────────────
// Probe individual ports on a known IP. Unlike hostAlive (which races ports
// to detect liveness), this returns per-port status for service enumeration.
//
// Browser-safe list — excludes known browser-blocked ports:
// 21,22,23,25,53,110,111,113,115,117,119,123,135,139,143,161,
// 179,389,427,445,465,512-515,526,530,563,587,601,636,993,995,2049,5900
export const PORT_SCAN_DEFAULTS = [
  // Web / HTTP
  80, 443, 3000, 4000, 5000, 7000, 8000, 8001, 8008, 8080, 8081, 8082, 8443, 8888, 9000, 9090, 9443,
  // Admin panels / management
  2082, 2083, 4848, 5985, 5986, 7001, 7002, 8161, 8500, 8883, 9200, 10000,
  // Databases
  1433, 1521, 3306, 5432, 5984, 6379, 9300, 15672, 27017,
  // Windows / remote access
  3389, 5357,
  // Container / DevOps
  2375, 2376, 5601, 6443, 7474,
  // Misc
  1080, 1194, 1723, 4443, 7070, 7777, 9092, 11211,
];

async function _probePort(ip, port, timeout) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);
  const t0 = performance.now();
  try {
    await fetch(`https://${ip}:${port}/`, { signal: ctrl.signal, mode: 'no-cors', cache: 'no-store' });
    clearTimeout(tid);
    return { port, status: 'open', ms: Math.round(performance.now() - t0) };
  } catch (e) {
    clearTimeout(tid);
    const ms = Math.round(performance.now() - t0);
    if (e.name === 'AbortError') return { port, status: 'filtered', ms };
    if (ms < 20) return { port, status: 'blocked', ms };
    return { port, status: 'closed', ms };
  }
}

// Probe each port individually on a specific IP.
// status: 'open' | 'closed' | 'filtered' | 'blocked'
//   open     — fetch resolved (service accepted connection + responded)
//   closed   — TypeError ≥20ms (TCP RST or TLS error — service likely present)
//   filtered — AbortError at timeout (no response, port probably not listening)
//   blocked  — TypeError <20ms (browser port-block, not real network response)
export async function portScan(ip, ports, timeout, onProgress) {
  const _ports = ports ?? PORT_SCAN_DEFAULTS;
  const _timeout = timeout ?? 2000;
  const results = [];
  const BATCH = 12;
  for (let i = 0; i < _ports.length; i += BATCH) {
    const batch = _ports.slice(i, i + BATCH);
    const batchRes = await Promise.all(batch.map(port => _probePort(ip, port, _timeout)));
    results.push(...batchRes);
    const interesting = results.filter(r => r.status === 'open' || r.status === 'closed').length;
    onProgress?.({ done: Math.min(i + BATCH, _ports.length), total: _ports.length, interesting });
  }
  return results;
}

// Check if an mDNS name is a privacy-masked UUID (Apple iOS behaviour)
export function isUUIDmDNS(name) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.local$/i.test(name ?? '');
}

// ─── 3. DNS timing oracle ────────────────────────────────────────────────────
// Fetch HTTPS URLs and read Resource Timing API for DNS lookup times.
// Fast DNS resolution → internal hostname known to local DNS → infra exists.

export async function dnsProbe(hostnames, timeout = 3000) {
  const results = [];
  for (const host of hostnames) {
    const url = `https://${host}/`;
    performance.clearResourceTimings?.();
    const t0 = performance.now();
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeout);
    let gotResponse = false;
    try {
      // mode:'no-cors' → opaque response (status 0) on TCP success, TypeError on network fail
      await fetch(url, { signal: ctrl.signal, mode: 'no-cors', cache: 'no-store' });
      gotResponse = true;
    } catch (err) {
      // AbortError = timed out, TypeError = DNS/TCP failure
      gotResponse = false;
    }
    clearTimeout(tid);
    const ms = Math.round(performance.now() - t0);
    const entries = performance.getEntriesByName(url);
    const e = entries[entries.length - 1];
    // Prefer timing-based resolution; fall back to gotResponse
    const dnsMs = e ? Math.round(e.domainLookupEnd - e.domainLookupStart) : null;
    const tcpMs = e ? Math.round(e.connectEnd - e.connectStart) : null;
    const resolvedByTiming = e ? (e.domainLookupEnd > 0 || e.connectEnd > 0) : null;
    results.push({
      host,
      total_ms: ms,
      dns_ms: dnsMs,
      connect_ms: tcpMs,
      resolved: resolvedByTiming !== null ? resolvedByTiming : gotResponse,
    });
  }
  return results;
}

// ─── 4. Tab awareness via BroadcastChannel + SW clients ─────────────────────

let _tabChannel = null;
const _knownTabs = new Map(); // tabId → { url, title, ts, active }

export function initTabTracking(onUpdate) {
  if (_tabChannel) return _knownTabs;

  // Generate a stable per-tab ID
  let myTabId = sessionStorage.getItem('wc_tab_id');
  if (!myTabId) {
    myTabId = Math.random().toString(36).slice(2);
    sessionStorage.setItem('wc_tab_id', myTabId);
  }

  const announce = () => {
    _tabChannel.postMessage({
      type: 'tab_hello',
      id: myTabId,
      url: location.href,
      title: document.title,
      visible: !document.hidden,
      ts: Date.now(),
    });
  };

  _tabChannel = new BroadcastChannel('wc_tabs');
  _tabChannel.onmessage = (ev) => {
    const { type, id, url, title, visible, ts } = ev.data ?? {};
    if (!id || id === myTabId) return;
    if (type === 'tab_hello' || type === 'tab_update') {
      _knownTabs.set(id, { url, title, visible, ts });
      // Reply so newcomers learn about us
      if (type === 'tab_hello') announce();
      onUpdate?.([..._knownTabs.values()]);
    } else if (type === 'tab_bye') {
      _knownTabs.delete(id);
      onUpdate?.([..._knownTabs.values()]);
    }
  };

  // Announce ourselves on load and on visibility change
  announce();
  document.addEventListener('visibilitychange', () => {
    _tabChannel.postMessage({ type: 'tab_update', id: myTabId, url: location.href, title: document.title, visible: !document.hidden, ts: Date.now() });
  });
  window.addEventListener('pagehide', () => {
    _tabChannel.postMessage({ type: 'tab_bye', id: myTabId });
  });

  return _knownTabs;
}

export function tabSnapshot() {
  const myId = sessionStorage.getItem('wc_tab_id') ?? 'self';
  const tabs = [
    { id: myId, url: location.href, title: document.title, visible: !document.hidden, self: true },
    ...[..._knownTabs.entries()].map(([id, t]) => ({ id, ...t, self: false })),
  ];
  return tabs;
}
