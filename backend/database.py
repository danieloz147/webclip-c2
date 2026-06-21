from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from backend.config import settings
import os
import secrets
import logging

logger = logging.getLogger(__name__)

os.makedirs("backend/data", exist_ok=True)

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE devices ADD COLUMN target_version_hash TEXT"))
            await conn.commit()
        except Exception:
            pass
        try:
            await conn.execute(text("CREATE TABLE IF NOT EXISTS wc_templates (id INTEGER PRIMARY KEY, name TEXT, description TEXT, is_default INTEGER DEFAULT 0, app_name TEXT, app_icon_b64 TEXT, ui_type TEXT DEFAULT 'white', ui_html TEXT, theme_json TEXT DEFAULT '{}', splash_json TEXT, install_page_json TEXT, onboarding_json TEXT DEFAULT '[]', harvest_json TEXT DEFAULT '[]', created_at DATETIME, updated_at DATETIME)"))
            await conn.commit()
        except Exception:
            pass
        try:
            await conn.execute(text("CREATE TABLE IF NOT EXISTS wc_targets (id INTEGER PRIMARY KEY, token TEXT UNIQUE, label TEXT, template_id INTEGER, device_id INTEGER, first_seen DATETIME, created_at DATETIME)"))
            await conn.commit()
        except Exception:
            pass
        try:
            await conn.execute(text("CREATE TABLE IF NOT EXISTS wc_flows (id INTEGER PRIMARY KEY, name TEXT, description TEXT, steps_json TEXT DEFAULT '[]', created_at DATETIME)"))
            await conn.commit()
        except Exception:
            pass
        try:
            await conn.execute(text("CREATE TABLE IF NOT EXISTS wc_flow_runs (id INTEGER PRIMARY KEY, flow_id INTEGER, device_id INTEGER, status TEXT DEFAULT 'pending', current_step INTEGER DEFAULT 0, started_at DATETIME, completed_at DATETIME)"))
            await conn.commit()
        except Exception:
            pass

    # Seed first admin if no users exist
    from backend.models import User
    from backend.auth import hash_password, generate_api_key
    from sqlalchemy import select, func
    async with AsyncSessionLocal() as session:
        count_result = await session.execute(select(func.count()).select_from(User))
        user_count = count_result.scalar()
        if user_count == 0:
            temp_pw = secrets.token_urlsafe(12)
            admin = User(
                username="admin",
                password_hash=hash_password(temp_pw),
                api_key=generate_api_key(),
                role="admin",
                is_active=True,
                needs_password_setup=True,
            )
            session.add(admin)
            await session.commit()
            print(f"\n{'='*60}")
            print(f"FIRST INSTALL — admin user created")
            print(f"  Username: admin")
            print(f"  Temp password: {temp_pw}")
            print(f"  Change password on first login.")
            print(f"{'='*60}\n")
