#!/usr/bin/env bash
# Start WebClip C2 server
# Usage: ./scripts/start.sh [--ip <SERVER_IP>]
set -euo pipefail

REPO="$(dirname "$0")/.."
cd "$REPO"

# Parse args
SERVER_IP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip) SERVER_IP="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "[*] WebClip C2 startup"
echo ""

# .env check
if [[ ! -f ".env" ]]; then
  echo "[*] No .env found — creating from .env.example"
  cp backend/.env.example .env
fi

# Inject VAPID keys if present in vapid_keys.json
if [[ -f "vapid_keys.json" ]] && command -v python3 &>/dev/null; then
  python3 - <<'PYEOF'
import json, re
from pathlib import Path

keys = json.loads(Path("vapid_keys.json").read_text())
env  = Path(".env").read_text()

def inject(env, key, value):
    # Replace KEY= (with empty or existing value) with KEY=value
    pattern = rf'^{key}=.*$'
    replacement = f'{key}={value}'
    if re.search(pattern, env, re.MULTILINE):
        return re.sub(pattern, replacement, env, flags=re.MULTILINE)
    return env + f'\n{replacement}\n'

env = inject(env, 'VAPID_PUBLIC_KEY',  keys['public'])
env = inject(env, 'VAPID_PRIVATE_KEY', keys['private_raw'])
Path(".env").write_text(env)
print("[+] VAPID keys injected into .env")
PYEOF
fi

# Create data dir
mkdir -p data

# Generate certs if needed
if [[ -n "$SERVER_IP" ]] && [[ ! -f "certs/cert.pem" ]]; then
  echo "[*] Generating self-signed cert for $SERVER_IP..."
  bash scripts/gen-cert.sh "$SERVER_IP"
  python3 scripts/gen-mobileconfig.py "$SERVER_IP"
fi

if [[ -f "certs/cert.pem" ]]; then
  # Inject cert paths into .env
  python3 - <<'PYEOF'
import re
from pathlib import Path
env = Path(".env").read_text()
def inject(env, key, value):
    pattern = rf'^{key}=.*$'
    replacement = f'{key}={value}'
    if re.search(pattern, env, re.MULTILINE):
        return re.sub(pattern, replacement, env, flags=re.MULTILINE)
    return env + f'\n{replacement}\n'
env = inject(env, 'SSL_CERTFILE', 'certs/cert.pem')
env = inject(env, 'SSL_KEYFILE',  'certs/key.pem')
Path(".env").write_text(env)
PYEOF
  echo "[+] TLS: certs/cert.pem"
else
  echo "[!] No certs found — running plain HTTP (push/camera/geo won't work on iOS)"
fi

# Seed admin if DB is empty
if [[ ! -f "data/webclip.db" ]] || ! python3 -c "
import asyncio, sys
async def check():
    from backend.database import init_db, AsyncSessionLocal
    from backend.models import User
    from sqlalchemy import select
    await init_db()
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).limit(1))
        sys.exit(0 if r.scalar_one_or_none() else 1)
asyncio.run(check())
" 2>/dev/null; then
  echo "[*] No admin user — creating default admin:admin (CHANGE IN PRODUCTION)"
  python3 - <<'PYEOF'
import asyncio
from backend.database import init_db, AsyncSessionLocal
from backend.models import User
from backend.auth import hash_password, generate_api_key
from sqlalchemy import select

async def seed():
    await init_db()
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
        if existing:
            print("[+] admin user already exists")
            return
        api_key = generate_api_key()
        admin = User(username="admin", password_hash=hash_password("admin"), api_key=api_key, role="admin")
        db.add(admin)
        await db.commit()
        print(f"[+] Admin created  username=admin  password=admin  api_key={api_key}")
        print("[!] CHANGE PASSWORD IMMEDIATELY: /api/auth/login then update via dashboard")

asyncio.run(seed())
PYEOF
fi

echo ""
echo "[*] Starting server..."
echo "    Collection (WebClip): port 8443"
echo "    Dashboard:            port 8080"
echo ""

python3 -m backend.main
