#!/bin/bash
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO/frontend"
npm install --legacy-peer-deps
npm run build
echo "Frontend built → $REPO/frontend-dist/"
