"""Shared FastAPI dependencies (auth)."""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from app.security.tokens import decode_access_token

# auto_error=False so the token is optional: in demo mode a request with no
# Authorization header is allowed and resolved to the demo identity below.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


@dataclass(slots=True)
class CurrentUser:
    username: str
    roles: list[str]


def _demo_user() -> CurrentUser:
    return CurrentUser(username=settings.demo_username, roles=settings.demo_role_list)


async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> CurrentUser:
    """Resolve the caller from the JWT, or fall back to the demo user.

    A valid token always wins (its roles drive RLS). With ``auth_required`` off, a
    missing or invalid token resolves to the demo identity instead of a 401, so the
    no-login portfolio UI works; with it on, the JWT gate is enforced as before.
    """
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if token:
        try:
            claims = decode_access_token(token)
            username = claims.get("sub")
            if username:
                return CurrentUser(username=username, roles=list(claims.get("roles") or []))
        except jwt.PyJWTError as exc:
            if settings.auth_required:
                raise cred_exc from exc

    if settings.auth_required:
        raise cred_exc
    return _demo_user()
