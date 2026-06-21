from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Event

router = APIRouter(tags=["killchain"])

_annotations: dict[tuple[int, int], str] = {}

_SUMMARY = {
    'device_register': '📱 Device registered',
    'heartbeat': '💓 Heartbeat',
    'command_sent': '📤 Command sent',
    'command_result': '📥 Command result',
    'console_log': '🖥 Console log',
    'location': '📍 Location update',
    'rebind_result': '🔗 DNS rebind result',
    'tunnel_ready': '🚇 Tunnel established',
    'tunnel_end': '🔚 Tunnel ended',
    'upnp_found': '🔌 UPnP device found',
}


def _serialize(e: Event) -> dict:
    return {
        "id": e.id,
        "type": e.type,
        "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        "data_json": e.data_json,
        "summary": _SUMMARY.get(e.type, '📋 Event'),
    }


@router.get("/killchain/{device_id}")
async def get_killchain(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(Event)
        .where(Event.device_id == device_id)
        .order_by(desc(Event.timestamp))
        .limit(500)
    )
    return [_serialize(e) for e in result.scalars().all()]


class AnnotateBody(BaseModel):
    event_id: int
    note: str


@router.post("/killchain/{device_id}/annotate")
async def annotate_event(
    device_id: int,
    body: AnnotateBody,
    user=Depends(get_current_user),
):
    if not body.note.strip():
        raise HTTPException(status_code=400, detail="note cannot be empty")
    _annotations[(device_id, body.event_id)] = body.note.strip()
    return {"ok": True}


@router.get("/killchain/{device_id}/annotations")
async def get_annotations(
    device_id: int,
    user=Depends(get_current_user),
):
    return [
        {"event_id": eid, "note": note}
        for (did, eid), note in _annotations.items()
        if did == device_id
    ]
