import asyncio, importlib, ipaddress, os, pathlib, re, signal, socket, subprocess, sys
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user

router = APIRouter()

_ROOT        = pathlib.Path(__file__).resolve().parents[3]
_REBIND_CERT = _ROOT / "certs" / "rebind" / "fullchain.pem"
_REBIND_KEY  = _ROOT / "certs" / "rebind" / "privkey.pem"
_SCRIPT      = _ROOT / "scripts" / "rebind_server.py"
_PID_FILE    = _ROOT / "data" / "rebind_server.pid"

# In-memory proc handle (single uvicorn worker; PID file is the cross-restart fallback)
_rebind_proc: subprocess.Popen | None = None


# ── PID file helpers ─────────────────────────────────────────────────────────

def _write_pid(pid: int):
    _PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PID_FILE.write_text(str(pid))

def _read_pid() -> int | None:
    try: return int(_PID_FILE.read_text().strip())
    except: return None

def _clear_pid():
    try: _PID_FILE.unlink(missing_ok=True)
    except: pass

def _pid_alive(pid: int) -> bool:
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False
    except PermissionError: return True  # process exists, root-owned — can't signal but it's alive


# ── Process state ────────────────────────────────────────────────────────────

def _proc_running() -> bool:
    global _rebind_proc
    # Check in-memory handle first
    if _rebind_proc is not None:
        if _rebind_proc.poll() is None:
            return True
        _rebind_proc = None
        _clear_pid()
    # Fall back to PID file (survives worker restart)
    pid = _read_pid()
    if pid and _pid_alive(pid):
        return True
    if pid:
        _clear_pid()
    return False

def _get_pid() -> int | None:
    if _rebind_proc is not None and _rebind_proc.poll() is None:
        return _rebind_proc.pid
    pid = _read_pid()
    return pid if (pid and _pid_alive(pid)) else None


# ── Dependency auto-install ──────────────────────────────────────────────────

async def _ensure_deps():
    missing = []
    for pkg, imp in [("dnslib", "dnslib"), ("flask", "flask")]:
        try: importlib.import_module(imp)
        except ImportError: missing.append(pkg)
    if not missing:
        return
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "pip", "install", *missing,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(500, f"pip install {' '.join(missing)} failed: {err.decode()[:300]}")


# ── TLS cert endpoints ───────────────────────────────────────────────────────

class RebindCertIn(BaseModel):
    cert: str
    key: str

@router.post("/settings/rebind-cert")
async def save_rebind_cert(payload: RebindCertIn, _=Depends(get_current_user)):
    if not payload.cert.strip().startswith("-----BEGIN"):
        raise HTTPException(400, "cert does not look like a PEM certificate")
    if not payload.key.strip().startswith("-----BEGIN"):
        raise HTTPException(400, "key does not look like a PEM private key")
    _REBIND_CERT.parent.mkdir(parents=True, exist_ok=True)
    _REBIND_CERT.write_text(payload.cert.strip() + "\n")
    _REBIND_KEY.write_text(payload.key.strip() + "\n")
    return {"ok": True, "cert_path": str(_REBIND_CERT), "key_path": str(_REBIND_KEY)}

@router.get("/settings/rebind-cert")
async def get_rebind_cert_status(_=Depends(get_current_user)):
    return {
        "has_cert": _REBIND_CERT.exists(),
        "has_key":  _REBIND_KEY.exists(),
        "cert_path": str(_REBIND_CERT),
        "key_path":  str(_REBIND_KEY),
    }


# ── Server control endpoints ─────────────────────────────────────────────────

_DOMAIN_RE = re.compile(r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)+$')

def _validate_domain(domain: str) -> str:
    domain = domain.strip().lower()
    if not _DOMAIN_RE.match(domain) or len(domain) > 253:
        raise HTTPException(400, "Invalid domain format")
    return domain

def _validate_ip(ip: str) -> str:
    ip = ip.strip()
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        raise HTTPException(400, "Invalid IP address format")
    return ip

class RebindServerStart(BaseModel):
    domain:     str
    vps_ip:     str
    dns_port:   int = 53
    http_port:  int = 15000   # nginx proxies port 80 → 15000; never bind :80 directly
    https_port: int = 14443

@router.get("/settings/rebind-server/status")
async def rebind_server_status(_=Depends(get_current_user)):
    running = _proc_running()
    return {"running": running, "pid": (_get_pid() if running else None)}

@router.post("/settings/rebind-server/start")
async def rebind_server_start(payload: RebindServerStart, _=Depends(get_current_user)):
    global _rebind_proc
    if _proc_running():
        return {"ok": True, "already_running": True, "pid": _get_pid()}

    domain = _validate_domain(payload.domain)
    vps_ip = _validate_ip(payload.vps_ip)

    await _ensure_deps()

    cmd = [
        "sudo", "-n", sys.executable, str(_SCRIPT),
        "--domain",     domain,
        "--vps-ip",     vps_ip,
        "--dns-port",   str(payload.dns_port),
        "--http-port",  str(payload.http_port),
        "--https-port", str(payload.https_port),
    ]
    log_path = _ROOT / "data" / "rebind_server.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_fh = open(log_path, "a")
    try:
        _rebind_proc = subprocess.Popen(
            cmd, cwd=str(_ROOT),
            stdout=log_fh, stderr=log_fh,
            text=True, preexec_fn=os.setsid,  # own process group for clean kill
        )
    except Exception as e:
        log_fh.close()
        raise HTTPException(500, f"Failed to start: {e}")

    # Give it 1.5 s to fail fast (port bind error, missing dep, etc.)
    await asyncio.sleep(1.5)
    if _rebind_proc.poll() is not None:
        log_fh.close()
        _rebind_proc = None
        tail = log_path.read_text()[-500:] if log_path.exists() else ""
        raise HTTPException(500, f"Process exited: {tail}")

    _write_pid(_rebind_proc.pid)
    return {"ok": True, "pid": _rebind_proc.pid}

@router.get("/settings/rebind-health")
async def rebind_health(domain: str = "", vps_ip: str = "", _=Depends(get_current_user)):
    result = {
        "server_running":   False,
        "certs_installed":  False,
        "port_53_listening": False,
        "ns_delegation":    {"ok": False, "detail": ""},
        "domain_resolves":  {"ok": False, "detail": ""},
    }

    # 1. Server running
    result["server_running"] = _proc_running()

    # 2. Certs installed
    result["certs_installed"] = _REBIND_CERT.exists() and _REBIND_KEY.exists()

    # 3. Port 53 listening (check if any process is bound to :53)
    try:
        r = subprocess.run(["ss", "-lnp", "sport", "=", ":53"],
                           capture_output=True, text=True, timeout=3)
        result["port_53_listening"] = ":53" in r.stdout
    except Exception:
        result["port_53_listening"] = False

    if not domain:
        return result

    # 4. NS delegation — query public DNS for NS records of the rebind domain
    try:
        r = subprocess.run(
            ["dig", "+short", "+time=3", "NS", domain, "@8.8.8.8"],
            capture_output=True, text=True, timeout=6,
        )
        ns_names = [n.strip().rstrip(".") for n in r.stdout.strip().splitlines() if n.strip()]
        if not ns_names:
            result["ns_delegation"] = {
                "ok": False,
                "detail": f"No NS records found for {domain} — add NS record in Cloudflare (step 2)"
            }
        else:
            # Resolve each NS name and check if any points to VPS IP
            found_vps = False
            resolved = []
            for ns in ns_names:
                try:
                    addrs = [ai[4][0] for ai in socket.getaddrinfo(ns, None, socket.AF_INET)]
                    resolved.append(f"{ns} → {', '.join(addrs)}")
                    if vps_ip and vps_ip in addrs:
                        found_vps = True
                except Exception:
                    resolved.append(f"{ns} → (unresolvable)")
            if vps_ip and found_vps:
                result["ns_delegation"] = {"ok": True, "detail": f"NS: {'; '.join(resolved)}"}
            elif vps_ip:
                result["ns_delegation"] = {
                    "ok": False,
                    "detail": f"NS records found but don't point to VPS ({vps_ip}): {'; '.join(resolved)}"
                }
            else:
                result["ns_delegation"] = {"ok": True, "detail": f"NS records present: {'; '.join(ns_names)}"}
    except Exception as e:
        result["ns_delegation"] = {"ok": False, "detail": f"dig error: {e}"}

    # 5. Domain resolves (ask our local DNS if running, else public DNS)
    try:
        dns_server = "127.0.0.1" if result["port_53_listening"] else "8.8.8.8"
        r = subprocess.run(
            ["dig", "+short", "+time=3", "A", domain, f"@{dns_server}"],
            capture_output=True, text=True, timeout=6,
        )
        answers = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
        if answers:
            ok = (vps_ip in answers) if vps_ip else True
            result["domain_resolves"] = {
                "ok": ok,
                "detail": f"{domain} → {', '.join(answers)} (via {dns_server})"
            }
        else:
            result["domain_resolves"] = {
                "ok": False,
                "detail": f"No A record for {domain} via {dns_server}"
            }
    except Exception as e:
        result["domain_resolves"] = {"ok": False, "detail": str(e)}

    return result


@router.post("/settings/rebind-server/stop")
async def rebind_server_stop(_=Depends(get_current_user)):
    global _rebind_proc
    pid = _get_pid()
    if not pid:
        return {"ok": True, "was_running": False}

    # SIGTERM to the process group (kills child threads too)
    try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        _rebind_proc = None
        _clear_pid()
        return {"ok": True, "was_running": False}

    # Wait non-blocking (poll every 200ms for up to 4s)
    for _ in range(20):
        await asyncio.sleep(0.2)
        if not _pid_alive(pid):
            break
    else:
        # Still alive → SIGKILL
        try: os.killpg(os.getpgid(pid), signal.SIGKILL)
        except: pass

    if _rebind_proc:
        try: _rebind_proc.wait(timeout=0)
        except: pass
    _rebind_proc = None
    _clear_pid()
    return {"ok": True, "was_running": True, "pid": pid}
