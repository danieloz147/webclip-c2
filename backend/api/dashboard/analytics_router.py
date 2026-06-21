from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Device, Event, PermissionRequest

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
async def analytics_overview(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    dev_r = await db.execute(
        select(Device.id, Device.name, Device.engagement_score, Device.last_seen)
        .order_by(desc(Device.engagement_score))
        .limit(20)
    )
    devices = [{"id": r.id, "name": r.name, "score": r.engagement_score or 0,
                "last_seen": r.last_seen.isoformat() if r.last_seen else None} for r in dev_r]

    perm_r = await db.execute(
        select(PermissionRequest.permission_type, PermissionRequest.result, func.count().label("cnt"))
        .group_by(PermissionRequest.permission_type, PermissionRequest.result)
    )
    perm_stats: dict = {}
    for row in perm_r:
        pt = row.permission_type
        if pt not in perm_stats:
            perm_stats[pt] = {}
        perm_stats[pt][row.result] = row.cnt

    ev_r = await db.execute(
        select(Event.type, func.count().label("cnt"))
        .group_by(Event.type)
        .order_by(desc("cnt"))
        .limit(10)
    )
    event_counts = [{"type": r.type, "count": r.cnt} for r in ev_r]

    total_devices = (await db.execute(select(func.count()).select_from(Device))).scalar()
    total_events  = (await db.execute(select(func.count()).select_from(Event))).scalar()

    return {
        "total_devices":     total_devices,
        "total_events":      total_events,
        "top_devices":       devices,
        "permission_stats":  perm_stats,
        "event_frequency":   event_counts,
    }
