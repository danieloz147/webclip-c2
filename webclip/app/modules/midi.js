import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!navigator.requestMIDIAccess) {
    await forceEvent('midi', { supported: false });
    return { supported: false };
  }
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    const inputs = [];
    const outputs = [];
    access.inputs.forEach(i => inputs.push({ id: i.id, name: i.name, manufacturer: i.manufacturer }));
    access.outputs.forEach(o => outputs.push({ id: o.id, name: o.name, manufacturer: o.manufacturer }));
    await forceEvent('midi', { inputs, outputs });
    return { inputs, outputs };
  } catch (e) {
    await forceEvent('midi', { supported: false, error: e.message });
    return { supported: false, error: e.message };
  }
}
