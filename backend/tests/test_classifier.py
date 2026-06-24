"""Auto-classifier tests: tier->roles mapping and fail-closed behaviour.

No DB or real model - a fake LLM returns canned verdicts so we can assert the
mapping and, crucially, that every uncertain path lands in the most restrictive
tier instead of the most open one.
"""

from __future__ import annotations

from collections.abc import Sequence

import pytest

from app.ingestion.classifier import Classification, classify
from app.llm.base import ChatMessage

CLEAN = "Quarterly marketing roadmap and product highlights for the public website."
WITH_SSN = "Employee record: SSN 123-45-6789, compensation details attached."


class FakeLLM:
    """Minimal LLMProvider: returns a fixed reply, or raises to simulate an outage."""

    name = "fake"
    model = "fake"

    def __init__(self, reply: str = "", *, raises: bool = False) -> None:
        self._reply = reply
        self._raises = raises
        self.calls = 0

    async def chat(
        self, messages: Sequence[ChatMessage], *, temperature: float = 0.0, max_tokens: int = 256
    ) -> str:
        self.calls += 1
        if self._raises:
            raise RuntimeError("backend down")
        return self._reply


def _verdict(tier: str, *, reason: str = "x", confidence: float = 0.9) -> str:
    return f'{{"sensitivity": "{tier}", "reason": "{reason}", "confidence": {confidence}}}'


async def test_public_maps_to_all_roles():
    c = await classify(FakeLLM(_verdict("public")), CLEAN)
    assert c.sensitivity == "public"
    assert c.allowed_roles == ["viewer", "analyst", "admin"]
    assert c.auto is True


async def test_internal_maps_to_analyst_and_admin():
    c = await classify(FakeLLM(_verdict("internal")), CLEAN)
    assert c.sensitivity == "internal"
    assert c.allowed_roles == ["analyst", "admin"]


async def test_restricted_maps_to_admin_only():
    c = await classify(FakeLLM(_verdict("restricted")), CLEAN)
    assert c.allowed_roles == ["admin"]


async def test_unparseable_verdict_fails_closed():
    c = await classify(FakeLLM("I think this is probably internal."), CLEAN)
    assert c.sensitivity == "restricted"
    assert c.allowed_roles == ["admin"]


async def test_unknown_tier_snaps_to_restricted():
    c = await classify(FakeLLM(_verdict("top-secret")), CLEAN)
    assert c.sensitivity == "restricted"


async def test_hard_pii_forces_restricted_and_skips_the_model():
    # Even if the model would call it public, an SSN is admin-only - and the
    # deterministic floor short-circuits before the LLM is ever consulted.
    llm = FakeLLM(_verdict("public"), raises=True)
    c = await classify(llm, WITH_SSN)
    assert c.sensitivity == "restricted"
    assert "ssn" in c.reason
    assert llm.calls == 0


async def test_empty_document_fails_closed_without_calling_model():
    llm = FakeLLM(raises=True)
    c = await classify(llm, "   ")
    assert c.sensitivity == "restricted"
    assert llm.calls == 0


async def test_llm_outage_fails_closed():
    c = await classify(FakeLLM(raises=True), CLEAN)
    assert c.sensitivity == "restricted"
    assert "failed closed" in c.reason


@pytest.mark.parametrize(
    ("tier", "roles"),
    [
        ("public", ["viewer", "analyst", "admin"]),
        ("internal", ["analyst", "admin"]),
        ("restricted", ["admin"]),
        ("bogus", ["admin"]),
    ],
)
def test_for_tier_role_mapping(tier: str, roles: list[str]):
    assert Classification.for_tier(tier, reason="x").allowed_roles == roles
