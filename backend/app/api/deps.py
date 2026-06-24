"""Shared FastAPI dependencies (auth)."""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.security.tokens import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=True)


@dataclass(slots=True)
class CurrentUser:
    username: str
    roles: list[str]


async def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        claims = decode_access_token(token)
    except jwt.PyJWTError as exc:
        raise cred_exc from exc
    username = claims.get("sub")
    if not username:
        raise cred_exc
    return CurrentUser(username=username, roles=list(claims.get("roles") or []))
