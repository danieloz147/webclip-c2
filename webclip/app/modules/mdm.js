/**
 * MDM detection module — probes browser signals and enrollment URLs
 * to infer device management status without requiring native access.
 */

export async function detectMDM() {
  const result = {
    enrolled: false,
    vendor: null,
    managed_apps_restricted: false,
    supervised: false,
  };

  // iOS WebClip always runs in standalone mode — if not standalone we're in Safari (unusual)
  result.supervised = !!navigator.standalone;

  // Test managed-app cookie restriction: some MDM policies block cookie writes on managed WebClips
  try {
    const testKey = '__wc_mdm_test__';
    document.cookie = testKey + '=1; path=/; SameSite=Strict';
    result.managed_apps_restricted = !document.cookie.includes(testKey);
    // Clean up
    document.cookie = testKey + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict';
  } catch (_) {
    result.managed_apps_restricted = true;
  }

  // User-agent hints (MDM software sometimes injects UA strings on supervised devices)
  const ua = navigator.userAgent || '';
  if (/Jamf/i.test(ua)) { result.enrolled = true; result.vendor = 'jamf'; }
  else if (/Intune/i.test(ua)) { result.enrolled = true; result.vendor = 'intune'; }
  else if (/Kandji/i.test(ua)) { result.enrolled = true; result.vendor = 'kandji'; }

  // Probe known MDM enrollment check endpoints (fire-and-forget, timeout 1500ms)
  const probes = [
    { url: 'https://jamf-mdm.clalit.co.il/', vendor: 'jamf' },
    { url: location.origin + '/.well-known/mdm-enrollment', vendor: null },
  ];

  const probeResults = await Promise.allSettled(probes.map(async ({ url, vendor }) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store', mode: 'no-cors' });
      clearTimeout(timer);
      return { url, vendor, ok: true, status: r.status };
    } catch (_) {
      clearTimeout(timer);
      return { url, vendor, ok: false };
    }
  }));

  for (const pr of probeResults) {
    if (pr.status === 'fulfilled' && pr.value.ok) {
      result.enrolled = true;
      if (pr.value.vendor && !result.vendor) result.vendor = pr.value.vendor;
    }
  }

  // If enrolled but no vendor identified, mark unknown
  if (result.enrolled && !result.vendor) result.vendor = 'unknown';

  return result;
}
