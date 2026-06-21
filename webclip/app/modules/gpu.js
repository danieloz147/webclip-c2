import { forceEvent } from '../beacon.js';

export async function requestPermission() {
  const result = { ts: Date.now() };

  if (!navigator.gpu) {
    result.supported = false;
    await forceEvent('gpu', result);
    return result;
  }

  result.supported = true;

  try {
    const adapter = await Promise.race([
      navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }),
      new Promise(r => setTimeout(() => r(null), 4000)),
    ]);

    if (!adapter) { result.adapterAvailable = false; await forceEvent('gpu', result); return result; }
    result.adapterAvailable = true;

    // Adapter info
    try {
      const info = await adapter.requestAdapterInfo();
      result.vendor = info.vendor || null;
      result.architecture = info.architecture || null;
      result.device = info.device || null;
      result.description = info.description || null;
    } catch { /* older API, skip */ }

    // Features
    try { result.features = [...adapter.features]; } catch {}

    // Key limits useful for device identification
    try {
      const l = adapter.limits;
      result.limits = {
        maxTextureDimension2D: l.maxTextureDimension2D,
        maxBufferSize: l.maxBufferSize,
        maxComputeWorkgroupsPerDimension: l.maxComputeWorkgroupsPerDimension,
        maxComputeInvocationsPerWorkgroup: l.maxComputeInvocationsPerWorkgroup,
        maxStorageBufferBindingSize: l.maxStorageBufferBindingSize,
        maxVertexBuffers: l.maxVertexBuffers,
        maxColorAttachments: l.maxColorAttachments,
      };
    } catch {}

    // WebGL as backup/comparison
    try {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        result.webgl = {
          renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          version: gl.getParameter(gl.VERSION),
          shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        };
      }
    } catch {}
  } catch (e) { result.error = e.message; }

  await forceEvent('gpu', result);
  return result;
}
