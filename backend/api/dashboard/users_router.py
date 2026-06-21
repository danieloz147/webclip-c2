import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from backend.database import get_db
from backend.auth import hash_password, generate_api_key, require_role, get_current_user
from backend.models import User

router = APIRouter(prefix="/users", tags=["users"])

VALID_ROLES = {"admin", "operator", "viewer"}


@router.get("")
async def list_users(db: AsyncSession = Depends(get_db), user=Depends(require_role("admin"))):
    result = await db.execute(select(User).order_by(User.id))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "is_active": u.is_active,
            "needs_password_setup": u.needs_password_setup,
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "created_by": u.created_by,
        }
        for u in users
    ]


@router.post("", status_code=201)
async def create_user(body: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_role("admin"))):
    username = (body.get("username") or "").strip()
    role = body.get("role", "viewer")
    if not username or len(username) > 128:
        raise HTTPException(400, "username_invalid")
    if role not in VALID_ROLES:
        raise HTTPException(400, "role_invalid")
    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "username_taken")
    temp_password = secrets.token_urlsafe(6)  # 8 URL-safe chars
    new_user = User(
        username=username,
        password_hash=hash_password(temp_password),
        api_key=generate_api_key(),
        role=role,
        is_active=True,
        needs_password_setup=True,
        created_by=admin.id,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"id": new_user.id, "username": new_user.username, "role": new_user.role, "needs_password_setup": True, "temp_password": temp_password}


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), admin=Depends(require_role("admin"))):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "not_found")
    if target.id == admin.id:
        raise HTTPException(400, "cannot_delete_self")
    if target.role == "admin" and target.is_active:
        active_admins = (await db.execute(
            select(func.count()).select_from(User).where(User.role == "admin", User.is_active == True)
        )).scalar()
        if active_admins < 2:
            raise HTTPException(400, "last_active_admin")
    await db.delete(target)
    await db.commit()


@router.patch("/{user_id}/role")
async def change_role(user_id: int, body: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_role("admin"))):
    role = body.get("role")
    if role not in VALID_ROLES:
        raise HTTPException(400, "role_invalid")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "not_found")
    if target.id == admin.id:
        raise HTTPException(400, "cannot_change_own_role")
    if target.role == "admin" and role != "admin":
        active_admins = (await db.execute(
            select(func.count()).select_from(User).where(User.role == "admin", User.is_active == True)
        )).scalar()
        if active_admins < 2:
            raise HTTPException(400, "last_active_admin")
    target.role = role
    await db.commit()
    return {"id": target.id, "role": target.role}


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: int, db: AsyncSession = Depends(get_db), admin=Depends(require_role("admin"))):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "not_found")
    temp_password = secrets.token_urlsafe(6)
    target.password_hash = hash_password(temp_password)
    target.needs_password_setup = True
    await db.commit()
    return {"id": target.id, "username": target.username, "temp_password": temp_password}


@router.patch("/{user_id}/active")
async def toggle_active(user_id: int, body: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_role("admin"))):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "not_found")
    if target.id == admin.id:
        raise HTTPException(400, "cannot_deactivate_self")
    new_active = body.get("is_active", not target.is_active)
    if target.role == "admin" and target.is_active and not new_active:
        active_admins = (await db.execute(
            select(func.count()).select_from(User).where(User.role == "admin", User.is_active == True)
        )).scalar()
        if active_admins < 2:
            raise HTTPException(400, "last_active_admin")
    target.is_active = new_active
    await db.commit()
    return {"id": target.id, "is_active": target.is_active}
