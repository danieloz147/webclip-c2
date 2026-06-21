import { queueEvent } from '../beacon.js';

let _battery = null;

export async function startBattery() {
  if (!('getBattery' in navigator)) return;
  try {
    _battery = await navigator.getBattery();
    const report = () => queueEvent('battery', {
      level: _battery.level,
      charging: _battery.charging,
      chargingTime: _battery.chargingTime,
      dischargingTime: _battery.dischargingTime,
    });
    report();
    ['chargingchange','levelchange','chargingtimechange','dischargingtimechange'].forEach(e => _battery.addEventListener(e, report));
  } catch { /* unsupported */ }
}

export async function requestPermission() {
  return startBattery();
}
