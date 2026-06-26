"""Admin endpoints (Phase 2+).

User management, role assignment, and sensitivity classification.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.db import get_session
from app.db.models import User
from app.security.passwords import hash_password

router = APIRouter()


@router.get("/admin/users")
async def list_users(
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List all users with their roles and active status."""
    result = await session.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "roles": u.roles,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.post("/admin/users")
async def create_user(
    username: str,
    password: str,
    roles: str = "viewer",
    session: AsyncSession = Depends(get_session),
    admin: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Create a new user with specified roles."""
    # Check if user already exists
    existing = await session.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Username already exists")

    roles_list = [r.strip() for r in roles.split(",") if r.strip()]
    if not roles_list:
        roles_list = ["viewer"]

    new_user = User(
        username=username,
        hashed_password=hash_password(password),
        roles=roles_list,
        is_active=True,
    )
    session.add(new_user)
    await session.commit()

    return {
        "status": "created",
        "username": username,
        "roles": roles_list,
    }


@router.put("/admin/users/{username}/roles")
async def update_user_roles(
    username: str,
    roles: str,
    session: AsyncSession = Depends(get_session),
    admin: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Update a user's roles."""
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    new_roles = [r.strip() for r in roles.split(",") if r.strip()]
    if not new_roles:
        new_roles = ["viewer"]

    user.roles = new_roles
    await session.commit()

    return {
        "status": "updated",
        "username": username,
        "roles": new_roles,
    }


@router.put("/admin/users/{username}/toggle")
async def toggle_user_active(
    username: str,
    session: AsyncSession = Depends(get_session),
    admin: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Enable/disable a user account."""
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    user.is_active = not user.is_active
    await session.commit()

    return {
        "status": "toggled",
        "username": username,
        "is_active": user.is_active,
    }


@router.get("/admin/sensitivity-levels")
async def get_sensitivity_levels() -> dict[str, Any]:
    """Return available sensitivity levels and their meanings."""
    return {
        "levels": [
            {
                "value": "public",
                "label": "Public",
                "description": "Accessible to all users",
                "color": "green",
            },
            {
                "value": "internal",
                "label": "Internal",
                "description": "Accessible to authenticated users",
                "color": "blue",
            },
            {
                "value": "confidential",
                "label": "Confidential",
                "description": "Restricted to specific roles only",
                "color": "yellow",
            },
            {
                "value": "restricted",
                "label": "Restricted",
                "description": "Admin-only access with audit logging",
                "color": "red",
            },
        ],
        "default": "internal",
    }
