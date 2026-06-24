"""Unit tests for the LoRA dataset record builders (pure)."""

from __future__ import annotations

from app.finetune.dataset import refusal_record, to_chat_record
from app.rag.pipeline import NO_CONTEXT_MSG, SYSTEM_PROMPT


def test_to_chat_record_shape():
    rec = to_chat_record("ctx text", "Q?", "A [1]")
    assert [m["role"] for m in rec["messages"]] == ["system", "user", "assistant"]
    assert rec["messages"][0]["content"] == SYSTEM_PROMPT
    assert "Context:" in rec["messages"][1]["content"]
    assert "Question: Q?" in rec["messages"][1]["content"]
    assert rec["messages"][2]["content"] == "A [1]"


def test_refusal_record_uses_refusal_message():
    rec = refusal_record("ctx", "unanswerable?")
    assert rec["messages"][-1]["content"] == NO_CONTEXT_MSG
