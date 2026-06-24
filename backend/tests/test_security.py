"""Unit tests for password hashing and JWT issuing (pure, no DB)."""

from __future__ import annotations

import jwt
import pytest

from app.security.passwords import hash_password, verify_password
from app.security.tokens import create_access_token, decode_access_token


def test_password_roundtrip():
    hashed = hash_password("s3cret-pw")
    assert hashed != "s3cret-pw"
    assert verify_password("s3cret-pw", hashed)
    assert not verify_password("wrong-pw", hashed)


def test_verify_handles_non_bcrypt_hash():
    assert not verify_password("anything", "not-a-real-hash")


def test_token_roundtrip_carries_roles():
    token = create_access_token("alice", ["viewer", "analyst"])
    claims = decode_access_token(token)
    assert claims["sub"] == "alice"
    assert claims["roles"] == ["viewer", "analyst"]


def test_token_rejects_tampered_signature():
    token = create_access_token("bob", ["admin"])
    with pytest.raises(jwt.PyJWTError):
        jwt.decode(token, "wrong-secret", algorithms=["HS256"])


def test_decode_rejects_garbage():
    with pytest.raises(jwt.PyJWTError):
        decode_access_token("not.a.jwt")
