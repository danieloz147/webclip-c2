import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!window.IdleDetector) {
    await forceEvent('idle', { supported: false });
    return { supported: false };
  }
  try {
    const state = await IdleDetector.requestPermission();
    if (state !== 'granted') {
      await forceEvent('idle', { supported: false, error: 'permission denied' });
      return { supported: false, error: 'permission denied' };
    }
    const detector = new IdleDetector();
    detector.addEventListener('change', async () => {
      await forceEvent('idle', {
        userState: detector.userState,
        screenState: detector.screenState,
      });
    });
    await detector.start({ threshold: 60000 });
    return { monitoring: true };
  } catch (e) {
    await forceEvent('idle', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
