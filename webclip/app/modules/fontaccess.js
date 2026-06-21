import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!window.queryLocalFonts) {
    await forceEvent('font_access', { supported: false });
    return { supported: false };
  }
  try {
    const fonts = await window.queryLocalFonts();
    const families = [...new Set(fonts.map(f => f.family))].slice(0, 100);
    await forceEvent('font_access', { count: fonts.length, families });
    return { count: fonts.length, families };
  } catch (e) {
    await forceEvent('font_access', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
