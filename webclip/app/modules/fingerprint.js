import { CONFIG } from '../config.js';
import { queueEvent } from '../beacon.js';

export async function collectPassive() {
  const [webrtcIPs, speechVoices, deviceCounts, gpuFp] = await Promise.all([
    getWebRTCLocalIPs(),
    getSpeechVoices(),
    getDeviceCounts(),
    getGPU(),
  ]);

  const data = {
    ua: navigator.userAgent,
    platform: navigator.platform,
    vendor: navigator.vendor,
    language: navigator.language,
    languages: [...(navigator.languages ?? [])],
    screen: {
      w: screen.width,
      h: screen.height,
      depth: screen.colorDepth,
      ratio: devicePixelRatio,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      orientation: screen.orientation?.type ?? null,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cookiesEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    standalone: !!navigator.standalone,
    touchPoints: navigator.maxTouchPoints,
    plugins: [...(navigator.plugins ?? [])].map(p => p.name),
    webgl: getWebGL(),
    audioFp: await getAudioFp(),
    fontsFp: getFontsFp(),
    storageQuota: await getStorageQuota(),
    connection: getConnection(),
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null,
    pdfViewerEnabled: navigator.pdfViewerEnabled ?? null,
    historyLength: window.history.length,
    media: getCSSMediaFeatures(),
    webrtcIPs,
    speechVoices,
    deviceCounts,
    platformSignals: getPlatformSignals(),
    gpu: gpuFp,
  };
  await queueEvent('fingerprint', data);
  return data;
}

function getWebGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl') ?? document.createElement('canvas').getContext('experimental-webgl');
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    };
  } catch { return null; }
}

async function getGPU() {
  try {
    if (!navigator.gpu) return { supported: false };
    const adapter = await Promise.race([
      navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }),
      new Promise(r => setTimeout(() => r(null), 3000)),
    ]);
    if (!adapter) return { supported: true, adapterAvailable: false };
    const result = { supported: true, adapterAvailable: true };
    try {
      const info = await adapter.requestAdapterInfo();
      result.vendor = info.vendor || null;
      result.architecture = info.architecture || null;
      result.device = info.device || null;
      result.description = info.description || null;
    } catch {}
    try {
      const l = adapter.limits;
      result.maxTextureDimension2D = l.maxTextureDimension2D;
      result.maxBufferSize = l.maxBufferSize;
      result.maxComputeInvocationsPerWorkgroup = l.maxComputeInvocationsPerWorkgroup;
    } catch {}
    return result;
  } catch { return { supported: false, error: true }; }
}

async function getAudioFp() {
  const run = async () => {
    const ctx = new (window.AudioContext ?? window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const analyser = ctx.createAnalyser();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    await new Promise(r => setTimeout(r, 100));
    const buf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(buf);
    try { await ctx.close(); } catch { /* ignore */ }
    let hash = 0;
    for (const v of buf) hash = ((hash << 5) - hash) + Math.floor(v * 1000) | 0;
    return hash;
  };
  try {
    return await Promise.race([run(), new Promise(r => setTimeout(() => r(null), 1500))]);
  } catch { return null; }
}

function getFontsFp() {
  const fonts = ['Arial','Helvetica','Times New Roman','Courier New','Verdana','Georgia','Palatino','Garamond','Bookman','Comic Sans MS','Trebuchet MS','Arial Black','Impact'];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let hash = '';
  for (const font of fonts) {
    ctx.font = `16px "${font}", monospace`;
    hash += ctx.measureText('Sphinx').width.toFixed(2);
  }
  return hash;
}

async function getStorageQuota() {
  try {
    const est = await Promise.race([
      navigator.storage?.estimate() ?? Promise.resolve(null),
      new Promise(r => setTimeout(() => r(null), 1000)),
    ]);
    return est ? { quota: est.quota, usage: est.usage } : null;
  } catch { return null; }
}

function getConnection() {
  const conn = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
  if (!conn) return null;
  return { type: conn.type, effectiveType: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt };
}

function getCSSMediaFeatures() {
  const mq = (q) => window.matchMedia(q).matches;
  return {
    prefersColorScheme: mq('(prefers-color-scheme: dark)') ? 'dark' : mq('(prefers-color-scheme: light)') ? 'light' : 'no-preference',
    prefersReducedMotion: mq('(prefers-reduced-motion: reduce)'),
    pointer: mq('(pointer: coarse)') ? 'coarse' : mq('(pointer: fine)') ? 'fine' : 'none',
    hover: mq('(hover: hover)'),
  };
}

async function getWebRTCLocalIPs() {
  return new Promise((resolve) => {
    const publicIPs = new Set();   // srflx — real public IP via STUN
    const localIPs  = new Set();   // host  — LAN / loopback
    let pc;
    const finish = () => {
      try { pc?.close(); } catch { /* ignore */ }
      // Deduplicate: remove local IPs already captured as public
      localIPs.forEach(ip => { if (publicIPs.has(ip)) localIPs.delete(ip); });
      resolve({ public: [...publicIPs], local: [...localIPs] });
    };
    const timeout = setTimeout(finish, 3000);
    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('');
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const cand = e.candidate.candidate;
        const typ = cand.match(/typ (\w+)/)?.[1];
        const m = cand.match(/(\d{1,3}(?:\.\d{1,3}){3})/g);
        if (!m) return;
        const [first] = m.filter(ip => ip !== '0.0.0.0');
        if (!first) return;
        if (typ === 'srflx') publicIPs.add(first);
        else localIPs.add(first);
      };
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => { clearTimeout(timeout); resolve({ public: [], local: [] }); });
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); finish(); }
      };
    } catch { clearTimeout(timeout); resolve({ public: [], local: [] }); }
  });
}

async function getSpeechVoices() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve([]), 1000);
    const finish = () => {
      clearTimeout(timeout);
      resolve(speechSynthesis.getVoices().map(v => v.name));
    };
    if (typeof speechSynthesis === 'undefined') { clearTimeout(timeout); return resolve([]); }
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) { clearTimeout(timeout); return resolve(voices.map(v => v.name)); }
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
  });
}

async function getDeviceCounts() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audioinput: devices.filter(d => d.kind === 'audioinput').length,
      videoinput: devices.filter(d => d.kind === 'videoinput').length,
      audiooutput: devices.filter(d => d.kind === 'audiooutput').length,
    };
  } catch { return null; }
}

function getPlatformSignals() {
  const flags = [];
  // Chrome/Chromium only — not available in any Safari/iOS
  if ('userAgentData' in navigator) flags.push('userAgentData');
  // Battery API removed from iOS Safari in 2019; present in Chrome/Android
  if ('getBattery' in navigator) flags.push('getBattery');
  // iOS always exposes standalone as boolean; undefined = not iOS
  if (typeof navigator.standalone === 'undefined') flags.push('standalone_undefined');
  // Chrome plugins list is usually non-empty on desktop; iOS/Safari always empty
  if (navigator.plugins?.length > 0) flags.push('plugins_present');
  // DeviceMemory exposed by Chrome; undefined on Safari/iOS
  if (typeof navigator.deviceMemory !== 'undefined') flags.push('deviceMemory');
  // iOS UA always contains "iPhone" or "iPad"
  const ua = navigator.userAgent;
  const isIphoneUA = /iPhone|iPad/.test(ua);
  if (!isIphoneUA) flags.push('ua_not_iphone');
  // WebGL renderer on iOS always reports Apple GPU
  const gl = (() => { try { return document.createElement('canvas').getContext('webgl'); } catch { return null; } })();
  if (gl) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (renderer && !/Apple/i.test(renderer)) flags.push('webgl_not_apple');
  }
  const suspect = flags.length >= 2 || flags.includes('ua_not_iphone') || flags.includes('userAgentData');
  return { flags, suspect };
}
