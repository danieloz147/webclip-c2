import pytest
from sqlalchemy import select
from backend.models import Device, User, Event

@pytest.mark.asyncio
async def test_create_device(db_session):
    device = Device(name="test-user", user_agent="Mozilla/5.0 iOS", fingerprint_hash="abc123")
    db_session.add(device)
    await db_session.commit()
    result = await db_session.execute(select(Device).where(Device.name == "test-user"))
    found = result.scalar_one()
    assert found.fingerprint_hash == "abc123"
    assert found.engagement_score == 0

@pytest.mark.asyncio
async def test_create_user(db_session):
    user = User(username="admin", password_hash="hashed", role="admin")
    db_session.add(user)
    await db_session.commit()
    result = await db_session.execute(select(User).where(User.username == "admin"))
    found = result.scalar_one()
    assert found.role == "admin"
    assert found.is_active is True
