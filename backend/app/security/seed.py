"""Seed demo users for the RBAC demo.

    python -m app.security.seed [--password demo]

Roles are cumulative so each tier sees everything below it:
  viewer  -> [viewer]
  analyst -> [viewer, analyst]
  admin   -> [viewer, analyst, admin]
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.core.db import SessionFactory
from app.db.models import User
from app.security.passwords import hash_password

DEMO_USERS: dict[str, list[str]] = {
    "viewer": ["viewer"],
    "analyst": ["viewer", "analyst"],
    "admin": ["viewer", "analyst", "admin"],
}


async def _run(password: str) -> None:
    async with SessionFactory() as session:
        for username, roles in DEMO_USERS.items():
            existing = await session.execute(select(User).where(User.username == username))
            if existing.scalar_one_or_none() is not None:
                print(f"skip    {username} (already exists)")
                continue
            session.add(
                User(username=username, hashed_password=hash_password(password), roles=roles)
            )
            print(f"created {username:8} roles={roles}")
        await session.commit()
    print(f"\nDemo users ready (password: {password!r}).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo users.")
    parser.add_argument("--password", default="demo", help="Shared demo password")
    args = parser.parse_args()
    asyncio.run(_run(args.password))


if __name__ == "__main__":
    main()
