import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from backend.database import get_db
from backend.models import User
from backend.auth import verify_password, create_access_token, create_refresh_token, hash_password, get_current_user
from backend.schemas import LoginRequest, SessionResponse

_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60.0
_RATE_MAX    = 10

_SETUP_ATTEMPTS: list[float] = []
_SETUP_MAX = 5

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_NAME = "wc_session"
_COOKIE_OPTS = dict(httponly=True, samesite="strict", secure=True, path="/")


def _set_session_cookie(response: Response, user: User):
    token_data = {"sub": str(user.id), "role": user.role}
    access_token = create_access_token(token_data)
    response.set_cookie(key=_COOKIE_NAME, value=access_token, max_age=8 * 3600, **_COOKIE_OPTS)
    return access_token


@router.post("/login", response_model=SessionResponse)
async def login(req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    now = time.time()
    key = req.username
    _login_attempts[key] = [t for t in _login_attempts[key] if now - t < _RATE_WINDOW]
    if len(_login_attempts[key]) >= _RATE_MAX:
        raise HTTPException(status_code=429, detail="Too many login attempts")
    _login_attempts[key].append(now)
    result = await db.execute(select(User).where(User.username == req.username, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    _set_session_cookie(response, user)
    return SessionResponse(role=user.role, needs_password_setup=user.needs_password_setup, user_id=user.id)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key=_COOKIE_NAME, **_COOKIE_OPTS)
    return {"ok": True}


@router.get("/me", response_model=SessionResponse)
async def me(user: User = Depends(get_current_user)):
    return SessionResponse(role=user.role, needs_password_setup=user.needs_password_setup, user_id=user.id)


@router.post("/setup-password", response_model=SessionResponse)
async def setup_password(body: dict, response: Response, db: AsyncSession = Depends(get_db)):
    now = time.time()
    global _SETUP_ATTEMPTS
    _SETUP_ATTEMPTS = [t for t in _SETUP_ATTEMPTS if now - t < _RATE_WINDOW]
    if len(_SETUP_ATTEMPTS) >= _SETUP_MAX:
        raise HTTPException(status_code=429, detail="Too many setup attempts")
    _SETUP_ATTEMPTS.append(now)
    result = await db.execute(select(User).where(User.api_key == body.get("api_key")))
    user = result.scalar_one_or_none()
    if not user or not user.needs_password_setup:
        raise HTTPException(status_code=400, detail="Invalid request")
    new_username = (body.get("username") or "").strip()
    new_password = body.get("password") or ""
    if not new_username or len(new_username) > 128:
        raise HTTPException(status_code=400, detail="username_invalid")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="password_too_short")
    user.username = new_username
    user.password_hash = hash_password(new_password)
    user.needs_password_setup = False
    await db.commit()
    _set_session_cookie(response, user)
    return SessionResponse(role=user.role, needs_password_setup=False, user_id=user.id)


@router.post("/change-password", response_model=SessionResponse)
async def change_password(body: dict, response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    new_password = body.get("new_password") or ""
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="password_too_short")
    if not user.needs_password_setup:
        current_password = body.get("current_password") or ""
        if not current_password or not verify_password(current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="current_password_invalid")
    user.password_hash = hash_password(new_password)
    user.needs_password_setup = False
    await db.commit()
    _set_session_cookie(response, user)
    return SessionResponse(role=user.role, needs_password_setup=False, user_id=user.id)
