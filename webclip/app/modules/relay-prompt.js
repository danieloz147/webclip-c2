let _shown = false;

const WIFI_STEPS = [
  ['Settings',                  'Open the Settings app'],
  ['Wi-Fi',                     'Tap the name of your connected network'],
  ['Limit IP Address Tracking', 'Scroll down and toggle it off'],
];

const CELLULAR_STEPS = [
  ['Settings',             'Open the Settings app'],
  ['Privacy & Security',   'Scroll down and tap Privacy & Security'],
  ['iCloud Private Relay', 'Tap iCloud Private Relay'],
  ['Turn Off Private Relay', 'Toggle Private Relay off'],
];

function buildSteps(steps) {
  return steps.map(([title, desc], i) => `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;${i < steps.length - 1 ? 'border-bottom:0.5px solid #e5e5ea' : ''}">
      <div style="width:30px;height:30px;border-radius:50%;background:#005baa;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;flex-shrink:0">${i + 1}</div>
      <div style="flex:1">
        <div style="font-size:15px;font-weight:600;color:#1c1c1e">${title}</div>
        <div style="font-size:13px;color:#636366;margin-top:2px;line-height:1.4">${desc}</div>
      </div>
    </div>
  `).join('');
}

export function showRelayPrompt() {
  if (_shown) return;
  _shown = true;

  const screenH  = window.screen.height;
  const vpH      = window.innerHeight;
  const topInset = Math.max(0, screenH - vpH);

  const overlay = document.createElement('div');
  overlay.id = 'wc-relay-prompt';
  overlay.style.cssText = [
    'position:absolute', `top:${-topInset}px`, 'left:0', 'right:0',
    `height:${screenH}px`, 'z-index:99998',
    'background:transparent',
  ].join(';');

  const card = document.createElement('div');
  card.id = 'wc-relay-card';
  // Start offscreen (bottom), animate up to final position
  card.style.cssText = [
    'position:absolute', `top:${vpH}px`, 'left:0', 'right:0',
    `height:${vpH - 250}px`, 'z-index:100000',
    'background:#f2f2f7',
    'border-radius:14px 14px 0 0',
    'display:flex', 'flex-direction:column', 'box-sizing:border-box',
    'overflow:hidden',
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
    'transition:top 0.38s cubic-bezier(0.32,0.72,0,1)',
  ].join(';');

  card.innerHTML = `
    <!-- header -->
    <div style="background:#005baa;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;padding:16px 20px;border-bottom:0.5px solid rgba(255,255,255,0.12)">
      <div style="position:absolute;left:16px">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <rect x="9" y="2" width="6" height="20" rx="2"/>
          <rect x="2" y="9" width="20" height="6" rx="2"/>
        </svg>
      </div>
      <div style="font-size:17px;font-weight:600;color:#fff">Updates App</div>
    </div>

    <!-- scrollable body -->
    <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;padding:16px">

      <!-- alert card -->
      <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:16px;display:flex;gap:12px;align-items:flex-start;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
        <div style="width:38px;height:38px;border-radius:9px;background:#fff4e5;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e07b00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="#e07b00"/>
          </svg>
        </div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700;color:#1c1c1e;margin-bottom:5px">Connection Verification Required</div>
          <div style="font-size:14px;color:#636366;line-height:1.5">Your IP address is hidden by iCloud Private Relay. Please disable it temporarily to continue.</div>
        </div>
      </div>

      <!-- segmented control -->
      <div style="background:#e5e5ea;border-radius:10px;padding:2px;display:flex;margin-bottom:16px">
        <button id="wc-seg-wifi" style="flex:1;padding:7px 0;border-radius:8px;border:none;background:#fff;color:#1c1c1e;font-size:14px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:-apple-system,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,0.12)">Wi-Fi</button>
        <button id="wc-seg-cell" style="flex:1;padding:7px 0;border-radius:8px;border:none;background:transparent;color:#636366;font-size:14px;font-weight:500;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:-apple-system,sans-serif">Cellular Data</button>
      </div>

      <!-- section label -->
      <div style="font-size:12px;color:#6d6d72;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:0 4px 8px">Setup Steps</div>

      <!-- wifi steps -->
      <div id="wc-steps-wifi" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
        ${buildSteps(WIFI_STEPS)}
      </div>

      <!-- cellular steps (hidden by default) -->
      <div id="wc-steps-cell" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);display:none">
        ${buildSteps(CELLULAR_STEPS)}
      </div>

      <!-- info note -->
      <div style="display:flex;align-items:flex-start;gap:8px;margin-top:16px;padding:0 4px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="#636366"/>
        </svg>
        <div style="font-size:12px;color:#636366;line-height:1.5">You can re-enable iCloud Private Relay after your session is complete.</div>
      </div>

      <!-- button sits directly below content, no gap -->
      <button id="wc-relay-done-btn" style="display:block;width:100%;margin-top:20px;margin-bottom:calc(env(safe-area-inset-bottom,34px) + 4px);padding:15px;border-radius:14px;border:none;background:#005baa;color:#fff;font-size:17px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:-apple-system,sans-serif">Got It — Continue</button>

    </div>
  `;

  // Landscape lock screen — covers everything and asks the user to rotate back
  const rotateLock = document.createElement('div');
  rotateLock.id = 'wc-rotate-lock';
  rotateLock.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
    'z-index:200000',
    'background:#005baa',
    'display:none', 'flex-direction:column',
    'align-items:center', 'justify-content:center',
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
  ].join(';');
  rotateLock.innerHTML = `
    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <path d="M12 18h.01"/>
    </svg>
    <div style="color:#fff;font-size:19px;font-weight:600;margin-top:20px;text-align:center;padding:0 32px">Rotate to Portrait</div>
    <div style="color:rgba(255,255,255,0.72);font-size:14px;margin-top:8px;text-align:center;padding:0 40px;line-height:1.5">Please hold your device upright to continue</div>
  `;

  const handleOrientation = () => {
    const isLandscape = window.innerWidth > window.innerHeight;
    rotateLock.style.display = isLandscape ? 'flex' : 'none';
  };
  window.addEventListener('resize', handleOrientation);
  window.addEventListener('orientationchange', handleOrientation);

  const dismiss = () => {
    window.removeEventListener('resize', handleOrientation);
    window.removeEventListener('orientationchange', handleOrientation);
    rotateLock.remove();
    overlay.remove();
    card.remove();
    _shown = false;
  };

  document.body.appendChild(overlay);
  document.body.appendChild(rotateLock);
  document.body.appendChild(card);

  // Trigger slide-up after paint
  requestAnimationFrame(() => requestAnimationFrame(() => {
    card.style.top = '250px';
  }));

  card.querySelector('#wc-relay-done-btn').addEventListener('click', dismiss);

  // segmented control toggle
  const segWifi = card.querySelector('#wc-seg-wifi');
  const segCell = card.querySelector('#wc-seg-cell');
  const stepsWifi = card.querySelector('#wc-steps-wifi');
  const stepsCell = card.querySelector('#wc-steps-cell');

  const SEG_ACTIVE   = 'flex:1;padding:7px 0;border-radius:8px;border:none;background:#fff;color:#1c1c1e;font-size:14px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:-apple-system,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,0.12)';
  const SEG_INACTIVE = 'flex:1;padding:7px 0;border-radius:8px;border:none;background:transparent;color:#636366;font-size:14px;font-weight:500;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:-apple-system,sans-serif';

  segWifi.addEventListener('click', () => {
    segWifi.style.cssText = SEG_ACTIVE;
    segCell.style.cssText = SEG_INACTIVE;
    stepsWifi.style.display = 'block';
    stepsCell.style.display = 'none';
  });
  segCell.addEventListener('click', () => {
    segCell.style.cssText = SEG_ACTIVE;
    segWifi.style.cssText = SEG_INACTIVE;
    stepsCell.style.display = 'block';
    stepsWifi.style.display = 'none';
  });
}

export function resetRelayPrompt() {
  _shown = false;
  document.getElementById('wc-relay-prompt')?.remove();
  document.getElementById('wc-relay-card')?.remove();
}
