"""Authentication endpoints (Phase 2).

Login verifies credentials and returns a signed JWT whose ``roles`` claim is the
only source of authorization the rest of the API trusts.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.db import get_session
from app.db.models import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.security.passwords import verify_password
from app.security.tokens import create_access_token

router = APIRouter()


@router.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, session: AsyncSession = Depends(get_session)) -> TokenResponse:
    result = await session.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    if (
        user is None
        or not user.is_active
        or not verify_password(req.password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
        )
    token = create_access_token(subject=user.username, roles=list(user.roles))
    return TokenResponse(access_token=token, username=user.username, roles=list(user.roles))


@router.get("/auth/me", response_model=UserOut)
async def me(user: CurrentUser = Depends(get_current_user)) -> UserOut:
    return UserOut(username=user.username, roles=user.roles)
