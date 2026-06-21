import { forceEvent } from '../beacon.js';

export async function requestPermission(coverStory, options) {
  if (!window.PublicKeyCredential) {
    await forceEvent('webauthn', { supported: false });
    return { supported: false };
  }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

    // Minimal challenge — random 16 bytes
    const challenge = crypto.getRandomValues(new Uint8Array(16));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'WebClip', id: location.hostname },
        user: { id: userId, name: 'user@webclip', displayName: 'User' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        timeout: 30000,
      },
    });

    const transport = credential.response?.getTransports?.() ?? [];
    await forceEvent('webauthn', {
      available,
      credentialType: credential.type,
      transport,
    });
    return { available, credentialType: credential.type };
  } catch (e) {
    // Still report authenticator availability even if create failed
    let available = false;
    try { available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch {}
    await forceEvent('webauthn', { available, supported: true, error: e.message });
    return { available, error: e.message };
  }
}
