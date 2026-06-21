import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from backend.database import Base, get_db
from backend.models import User
from backend.auth import hash_password, generate_api_key

TEST_DB = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def dashboard_client():
    import backend.models  # ensure ORM classes are registered with Base before create_all
    from backend.main import dashboard_app
    engine = create_async_engine(
        TEST_DB,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        admin = User(username="admin", password_hash=hash_password("adminpass"), role="admin")
        s.add(admin)
        await s.commit()
    async def override_db():
        async with factory() as s:
            yield s
    dashboard_app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=dashboard_app), base_url="http://test") as client:
        yield client
    dashboard_app.dependency_overrides.clear()
    await engine.dispose()

@pytest.mark.asyncio
async def test_login_success(dashboard_client):
    resp = await dashboard_client.post("/api/auth/login", json={"username": "admin", "password": "adminpass"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "admin"

@pytest.mark.asyncio
async def test_login_wrong_password(dashboard_client):
    resp = await dashboard_client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401

@pytest.mark.asyncio
async def test_devices_requires_auth(dashboard_client):
    resp = await dashboard_client.get("/api/devices/")
    assert resp.status_code == 401

@pytest.mark.asyncio
async def test_devices_with_token(dashboard_client):
    login = await dashboard_client.post("/api/auth/login", json={"username": "admin", "password": "adminpass"})
    token = login.json()["access_token"]
    resp = await dashboard_client.get("/api/devices/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
