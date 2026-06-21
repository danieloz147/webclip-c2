import { queueEvent } from '../beacon.js';

let _watchId = null;

export function startLocation() {
  if (!navigator.geolocation || _watchId !== null) return;
  _watchId = navigator.geolocation.watchPosition(
    pos => queueEvent('location', {
      lat:  pos.coords.latitude,
      lon:  pos.coords.longitude,
      acc:  pos.coords.accuracy,
      alt:  pos.coords.altitude,
      spd:  pos.coords.speed,
      hdg:  pos.coords.heading,
      ts:   pos.timestamp,
    }),
    () => { _watchId = null; },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

export function stopLocation() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
}
