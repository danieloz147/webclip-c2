from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database import get_db, AsyncSessionLocal
from backend.auth import get_current_user
from backend.models import Device
from backend.config import settings
import json
import asyncio
from datetime import datetime, timezone

router = APIRouter(prefix="/push", tags=["push"])

# Track scheduled tasks so the UI can show them
_scheduled: list[dict] = []


async def _send_push(device: Device, title: str, body: str, url: str = "/") -> dict:
    if not device.push_subscription:
        return {"ok": False, "error": "no_subscription"}
    try:
        sub = json.loads(device.push_subscription)
    except Exception:
        return {"ok": False, "error": "bad_subscription_json"}
    if not settings.vapid_private_key:
        return {"ok": False, "error": "vapid_not_configured"}
    try:
        from pywebpush import webpush, WebPushException
        webpush(
            subscription_info=sub,
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_contact},
        )
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


async def _scheduled_send(task_id: str, delay_secs: float, target: str,
                           title: str, message: str, url: str):
    await asyncio.sleep(delay_secs)
    # Open a fresh DB session (request session is gone by now)
    async with AsyncSessionLocal() as db:
        if target == "all":
            result = await db.execute(select(Device).where(Device.push_subscription.isnot(None)))
        else:
            result = await db.execute(select(Device).where(Device.id == int(target)))
        devices = result.scalars().all()
        for d in devices:
            await _send_push(d, title, message, url)
    # Remove from tracking list
    global _scheduled
    _scheduled = [t for t in _scheduled if t["id"] != task_id]


@router.post("/send")
async def send_push(body: dict, background_tasks: BackgroundTasks,
                    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    title    = body.get("title", "הודעה חדשה")
    message  = body.get("body", "")
    url      = body.get("url", "/")
    target   = body.get("target", "all")
    send_at  = body.get("send_at")  # ISO 8601 string, optional

    if send_at:
        try:
            fire_dt = datetime.fromisoformat(send_at.replace("Z", "+00:00"))
            now     = datetime.now(timezone.utc)
            delay   = max(0.0, (fire_dt - now).total_seconds())
        except ValueError:
            return {"ok": False, "error": "invalid send_at format — use ISO 8601"}

        import uuid
        task_id = str(uuid.uuid4())[:8]
        _scheduled.append({
            "id": task_id,
            "fire_at": send_at,
            "title": title,
            "body": message,
            "target": target,
        })
        asyncio.create_task(_scheduled_send(task_id, delay, target, title, message, url))
        return {"ok": True, "scheduled": True, "task_id": task_id,
                "fire_in_secs": round(delay), "fire_at": send_at}

    # Immediate send
    if target == "all":
        result = await db.execute(select(Device).where(Device.push_subscription.isnot(None)))
    else:
        result = await db.execute(select(Device).where(Device.id == int(target)))
    devices = result.scalars().all()

    results = []
    for d in devices:
        r = await _send_push(d, title, message, url)
        results.append({"device_id": d.id, "name": d.name, **r})

    return {
        "sent":    len([r for r in results if r["ok"]]),
        "failed":  len([r for r in results if not r["ok"]]),
        "results": results,
    }


@router.get("/scheduled")
async def list_scheduled(user=Depends(get_current_user)):
    return {"tasks": _scheduled}


@router.get("/subscribers")
async def list_subscribers(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Device))
    devices = result.scalars().all()
    return [{"id": d.id, "name": d.name, "subscribed": bool(d.push_subscription)} for d in devices]
