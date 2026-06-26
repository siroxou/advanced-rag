"""Unit tests for the runtime settings overlay and LLM cache reset."""

from __future__ import annotations

import json

from app.core.config import settings
from app.core.runtime_settings import RuntimeSettings
from app.llm import factory


def test_override_wins_over_env_default():
    rs = RuntimeSettings()
    assert rs.get_llm_model() == settings.llm_model  # empty cache -> env fallback
    rs._cache["llm.model"] = "anthropic/claude-3.5-sonnet"
    assert rs.get_llm_model() == "anthropic/claude-3.5-sonnet"


def test_master_kill_switch_gates_each_flag():
    rs = RuntimeSettings()
    rs._cache["guardrails.injection"] = True
    rs._cache["guardrails.enabled"] = False
    assert rs.guard_injection() is False
    rs._cache["guardrails.enabled"] = True
    assert rs.guard_injection() is True


def test_byo_key_resolution_and_demo_flag(monkeypatch):
    import app.core.runtime_settings as mod

    monkeypatch.setattr(mod.settings, "openrouter_api_key", "demo-key", raising=False)
    rs = RuntimeSettings()
    # No user key: the shared demo key is used.
    assert rs.using_demo_key() is True
    assert rs.get_resolved_api_key() == "demo-key"
    # A bring-your-own key wins and lifts the demo flag.
    rs._cache["llm.openrouter_api_key"] = "user-key"
    assert rs.using_demo_key() is False
    assert rs.get_resolved_api_key() == "user-key"


def test_snapshot_never_leaks_the_key():
    rs = RuntimeSettings()
    rs._cache["llm.openrouter_api_key"] = "sk-or-supersecret"
    snap = rs.snapshot()
    assert snap["llm"]["openrouter_user_key_set"] is True
    assert "sk-or-supersecret" not in json.dumps(snap)


def test_reset_llm_rebuilds_instance():
    factory.reset_llm()
    first = factory.get_llm()
    assert factory.get_llm() is first  # cached
    factory.reset_llm()
    assert factory.get_llm() is not first  # rebuilt after reset
