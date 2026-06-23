"""The provider abstraction is structurally an LLMProvider (no network needed)."""

from __future__ import annotations

from app.llm.base import LLMProvider
from app.llm.factory import get_llm


def test_factory_returns_provider() -> None:
    llm = get_llm()
    assert isinstance(llm, LLMProvider)
    assert llm.model
    assert hasattr(llm, "chat")
    assert hasattr(llm, "stream")
