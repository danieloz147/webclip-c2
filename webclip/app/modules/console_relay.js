// Intercepts console.log/warn/error/info and relays them as beacon events.
// Use forceEvent so every call is sent even if content repeats.
import { forceEvent } from '../beacon.js';

const LEVELS = ['log', 'warn', 'error', 'info'];
const _orig = {};

export function startConsoleRelay() {
  LEVELS.forEach(level => {
    _orig[level] = console[level].bind(console);
    console[level] = (...args) => {
      _orig[level](...args);
      try {
        const msg = args.map(a => {
          if (a === null) return 'null';
          if (a === undefined) return 'undefined';
          if (a instanceof Error) return `${a.name}: ${a.message}`;
          try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
          catch { return '[circular]'; }
        }).join(' ').slice(0, 500);
        forceEvent('console_log', { level, msg, ts: Date.now() });
      } catch {}
    };
  });
}
