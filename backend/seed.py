"""Run once to create the first admin user. Usage: python -m backend.seed"""
import asyncio
import sys
from backend.database import init_db, AsyncSessionLocal
from backend.models import User
from backend.auth import hash_password, generate_api_key
from sqlalchemy import select


async def seed():
    await init_db()
    username = input("Admin username [admin]: ").strip() or "admin"
    password = input("Admin password: ").strip()
    if not password:
        print("Password required.")
        sys.exit(1)
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.username == username))
        if existing.scalar_one_or_none():
            print(f"User '{username}' already exists.")
            sys.exit(0)
        api_key = generate_api_key()
        admin = User(username=username, password_hash=hash_password(password), api_key=api_key, role="admin")
        db.add(admin)
        await db.commit()
        print(f"Admin created. API key: {api_key}")

if __name__ == "__main__":
    asyncio.run(seed())
