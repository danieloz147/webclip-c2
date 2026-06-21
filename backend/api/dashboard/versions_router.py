from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, desc
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import AppVersion, Device
from datetime import datetime, timezone
import hashlib, json

router = APIRouter(prefix="/versions", tags=["versions"])


@router.get("/")
async def list_versions(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(AppVersion).order_by(desc(AppVersion.published_at)))
    versions = result.scalars().all()
    out = []
    for v in versions:
        dev_r = await db.execute(
            select(func.count()).select_from(Device).where(Device.current_version == v.version_hash)
        )
        out.append({
            "id": v.id, "version_hash": v.version_hash,
            "published_at": v.published_at.isoformat() if v.published_at else None,
            "is_current": v.is_current,
            "device_count": dev_r.scalar() or 0,
        })
    return out


@router.post("/")
async def publish_version(body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    bundle = body.get("bundle", {})
    bundle_json = json.dumps(bundle, sort_keys=True)
    version_hash = hashlib.sha256(bundle_json.encode()).hexdigest()[:16]

    await db.execute(update(AppVersion).values(is_current=False))

    new_ver = AppVersion(
        version_hash=version_hash,
        bundle_json=bundle_json,
        published_at=datetime.now(timezone.utc),
        is_current=True,
    )
    db.add(new_ver)
    await db.commit()
    await db.refresh(new_ver)
    return {"id": new_ver.id, "version_hash": version_hash, "is_current": True}


@router.post("/{version_id}/set-current")
async def set_current_version(version_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    await db.execute(update(AppVersion).values(is_current=False))
    await db.execute(update(AppVersion).where(AppVersion.id == version_id).values(is_current=True))
    await db.commit()
    return {"ok": True}
