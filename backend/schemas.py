from pydantic import BaseModel
from typing import Optional, Any


class DeviceRegisterRequest(BaseModel):
    name: str
    user_agent: Optional[str] = None
    fingerprint_hash: Optional[str] = None
    push_subscription: Optional[str] = None

class DeviceRegisterResponse(BaseModel):
    device_id: int
    name: str
    version_hash: Optional[str] = None
    commands: list[dict] = []
    c2_token: Optional[str] = None

class EventItem(BaseModel):
    type: str
    data: Any = {}
    delta_hash: Optional[str] = None

class BeaconRequest(BaseModel):
    events: list[EventItem] = []

class BeaconResponse(BaseModel):
    received: int
    commands: list[dict] = []

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    needs_password_setup: bool = False

class SessionResponse(BaseModel):
    role: str
    needs_password_setup: bool = False
    user_id: int
