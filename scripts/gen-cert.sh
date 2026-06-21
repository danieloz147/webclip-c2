#!/usr/bin/env bash
# Usage: ./scripts/gen-cert.sh <SERVER_IP_OR_HOSTNAME>
# Generates certs/cert.pem and certs/key.pem with SAN for the given IP/hostname.
set -euo pipefail

SERVER="${1:-}"
if [[ -z "$SERVER" ]]; then
  echo "Usage: $0 <IP_or_hostname>"
  echo "Example: $0 192.168.1.5"
  exit 1
fi

CERTS_DIR="$(dirname "$0")/../certs"
mkdir -p "$CERTS_DIR"

# Determine SAN type
if [[ "$SERVER" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SAN="IP:${SERVER}"
else
  SAN="DNS:${SERVER}"
fi

echo "[*] Generating self-signed cert for $SERVER (SAN: $SAN)..."

openssl req -x509 -newkey rsa:2048 \
  -keyout "$CERTS_DIR/key.pem" \
  -out "$CERTS_DIR/cert.pem" \
  -days 825 \
  -nodes \
  -subj "/CN=WebClip C2/O=Red Team/C=IL" \
  -addext "subjectAltName=${SAN}" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth" \
  2>/dev/null

echo "[+] Generated:"
echo "    $CERTS_DIR/cert.pem"
echo "    $CERTS_DIR/key.pem"
echo ""
echo "[*] Certificate fingerprint (SHA-256):"
openssl x509 -noout -fingerprint -sha256 -in "$CERTS_DIR/cert.pem" | sed 's/.*=//'
echo ""
echo "[!] Next: run scripts/gen-mobileconfig.py to create iOS trust profile"
