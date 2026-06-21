#!/usr/bin/env bash
# Serve dist/ over plain HTTP so iPhone can download mobileconfigs
# Usage: ./scripts/serve-dist.sh [PORT]
PORT="${1:-9999}"
DIST_DIR="$(dirname "$0")/../dist"
mkdir -p "$DIST_DIR"
echo "[*] Serving $DIST_DIR on http://0.0.0.0:$PORT"
echo "[*] On device: open http://<YOUR_IP>:$PORT/ca-trust.mobileconfig"
python3 -m http.server "$PORT" --directory "$DIST_DIR"
