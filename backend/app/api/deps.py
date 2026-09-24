"""Shared FastAPI dependencies (auth).

Two kinds of caller reach the API:

* an **authenticated** user, proven by a signed JWT whose ``roles`` claim drives
  the Postgres RLS policy;
* the **demo identity**, used when ``auth_required`` is off so the portfolio UI
  works with no login wall.

The distinction matters, so ``CurrentUser.authenticated`` records it. Demo roles
are client-asserted (see ``_demo_user``), which is exactly why every mutating
endpoint sits behind :func:`require_roles` and demands a real token. Reads stay
open to the demo identity because RLS still decides what it can actually see.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from app.security.tokens import decode_access_token

# auto_error=False so the token is optional: in demo mode a request with no
# Authorization header is allowed and resolved to the demo identity below.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

DEMO_ROLES_HEADER = "X-Demo-Roles"


@dataclass(slots=True)
class CurrentUser:
    username: str
    roles: list[str] = field(default_factory=list)
    # True only when a valid signed token was presented. The demo identity may
    # carry privileged-looking roles, so never authorize a mutation on roles alone.
    authenticated: bool = False


def _demo_user(header_roles: str | None) -> CurrentUser:
    """The no-login identity, with roles the client may choose.

    Letting the caller assert roles sounds alarming and is deliberate: it makes the
    RBAC story demonstrable (switch to ``viewer`` and watch Postgres refuse the
    rows) without a login wall. The roles only reach read paths: the RLS policy,
    and whether the agent may search the web. ``authenticated`` stays False, so no
    mutation, and no read of other users' audit rows, accepts this identity.
    """
    roles = [r.strip() for r in (header_roles or "").split(",") if r.strip()]
    return CurrentUser(username=settings.demo_username, roles=roles or settings.demo_role_list)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    demo_roles: str | None = Header(default=None, alias=DEMO_ROLES_HEADER),
) -> CurrentUser:
    """Resolve the caller from the JWT, or fall back to the demo identity.

    A valid token always wins. With ``auth_required`` off, a missing or invalid
    token resolves to the demo identity instead of a 401; with it on, the JWT gate
    is enforced.
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
                return CurrentUser(
                    username=username,
                    roles=list(claims.get("roles") or []),
                    authenticated=True,
                )
        except jwt.PyJWTError as exc:
            if settings.auth_required:
                raise cred_exc from exc

    if settings.auth_required:
        raise cred_exc
    return _demo_user(demo_roles)


def require_roles(*needed: str) -> Callable[..., Awaitable[CurrentUser]]:
    """Dependency factory gating an endpoint on a real token carrying a role.

    401 when the caller is unauthenticated (including the demo identity, whatever
    roles it claims), 403 when authenticated but lacking every listed role.
    """

    async def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not user.authenticated:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This operation requires a signed token; sign in first",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not set(needed) & set(user.roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of these roles: {', '.join(needed)}",
            )
        return user

    return dependency


# Built once and shared, so every mutating endpoint is gated identically and the
# role name is written in exactly one place.
RequireAdmin = Depends(require_roles("admin"))
