import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool
from backend.database import Base, get_db
from backend.models import User
from backend.auth import hash_password, create_access_token

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    """Shared test client that targets the collection_app with an in-memory DB."""
    import backend.models  # ensure ORM classes registered
    from backend.main import collection_app
    engine = create_async_engine(
        TEST_DB_URL,
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
    async with AsyncClient(transport=ASGITransport(app=collection_app), base_url="http://test") as c:
        yield c
    collection_app.dependency_overrides.clear()
    await engine.dispose()


@pytest_asyncio.fixture
async def dashboard_client_with_users():
    """Dashboard client with viewer and operator users pre-seeded."""
    import backend.models
    from backend.main import dashboard_app
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        admin = User(username="admin", password_hash=hash_password("adminpass"), role="admin", is_active=True)
        viewer = User(username="viewer_user", password_hash=hash_password("viewerpass"), role="viewer", is_active=True)
        operator = User(username="operator_user", password_hash=hash_password("operatorpass"), role="operator", is_active=True)
        s.add_all([admin, viewer, operator])
        await s.commit()
        await s.refresh(viewer)
        await s.refresh(operator)

    async def override_db():
        async with factory() as s:
            yield s

    dashboard_app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=dashboard_app), base_url="http://test") as c:
        yield c
    dashboard_app.dependency_overrides.clear()
    await engine.dispose()


@pytest_asyncio.fixture
async def viewer_token(dashboard_client_with_users: AsyncClient) -> str:
    """Return a valid JWT for the viewer role."""
    resp = await dashboard_client_with_users.post(
        "/api/auth/login", json={"username": "viewer_user", "password": "viewerpass"}
    )
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def operator_token(dashboard_client_with_users: AsyncClient) -> str:
    """Return a valid JWT for the operator role."""
    resp = await dashboard_client_with_users.post(
        "/api/auth/login", json={"username": "operator_user", "password": "operatorpass"}
    )
    return resp.json()["access_token"]
