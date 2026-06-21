from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Event

router = APIRouter(tags=["events"])


def _serialize(e):
    return {
        "id": e.id, "type": e.type, "data_json": e.data_json,
        "delta_hash": e.delta_hash,
        "timestamp": e.timestamp.isoformat() if e.timestamp else None,
    }


@router.get("/{device_id}/events")
async def get_device_events(
    device_id: int,
    limit: int = Query(200, le=1000),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(Event).where(Event.device_id == device_id)
        .order_by(desc(Event.timestamp))
        .limit(limit)
    )
    return [_serialize(e) for e in result.scalars().all()]


@router.get("/{device_id}/latest-by-type")
async def get_latest_by_type(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Returns the single most-recent event for every type. Never affected by event volume."""
    subq = (
        select(Event.type, func.max(Event.id).label("max_id"))
        .where(Event.device_id == device_id)
        .group_by(Event.type)
        .subquery()
    )
    result = await db.execute(
        select(Event).join(subq, Event.id == subq.c.max_id)
    )
    return [_serialize(e) for e in result.scalars().all()]
