"""JWT issuing and decoding (HS256).

The token carries the user's roles as a claim. The API trusts only these
server-signed roles - never a role list supplied in the request body - and
pushes them into the Postgres RLS policy at query time.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.core.config import settings


def create_access_token(subject: str, roles: list[str]) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "roles": roles,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Return the verified claims. Raises jwt.PyJWTError if invalid or expired."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
