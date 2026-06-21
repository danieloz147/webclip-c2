import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from backend.database import Base, get_db

TEST_DB = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def collection_client():
    import backend.models  # ensure ORM classes are registered with Base before create_all
    from backend.main import collection_app
    engine = create_async_engine(
        TEST_DB,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async def override_db():
        async with factory() as s:
            yield s
    collection_app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=collection_app), base_url="http://test") as client:
        yield client
    collection_app.dependency_overrides.clear()
    await engine.dispose()

@pytest.mark.asyncio
async def test_register_device(collection_client):
    resp = await collection_client.post("/api/register", json={
        "name": "יוסי",
        "user_agent": "Mozilla/5.0 iPhone",
        "fingerprint_hash": "fp_abc123"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "device_id" in data
    assert data["name"] == "יוסי"
    assert data["commands"] == []

@pytest.mark.asyncio
async def test_beacon_event(collection_client):
    reg = await collection_client.post("/api/register", json={"name": "test", "fingerprint_hash": "fp_test"})
    device_id = reg.json()["device_id"]
    resp = await collection_client.post(f"/api/beacon/{device_id}", json={
        "events": [{"type": "fingerprint", "data": {"battery": 0.8}, "delta_hash": "h1"}]
    })
    assert resp.status_code == 200
    assert resp.json()["received"] == 1

@pytest.mark.asyncio
async def test_version_endpoint(collection_client):
    resp = await collection_client.get("/api/version")
    assert resp.status_code == 200
    data = resp.json()
    assert "hash" in data

@pytest.mark.asyncio
async def test_register_upsert_by_fingerprint(collection_client):
    await collection_client.post("/api/register", json={"name": "first", "fingerprint_hash": "fp_same"})
    resp = await collection_client.post("/api/register", json={"name": "second", "fingerprint_hash": "fp_same"})
    assert resp.json()["device_id"] == 1  # same device, not a new one
    assert resp.json()["name"] == "second"
