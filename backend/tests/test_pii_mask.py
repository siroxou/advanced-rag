"""Unit tests for PII masking (pure, no DB or model)."""

from __future__ import annotations

from app.guardrails import pii


def test_mask_redacts_email_and_ssn():
    masked, found = pii.mask("Reach me at john@example.com or SSN 123-45-6789")
    assert "john@example.com" not in masked
    assert "123-45-6789" not in masked
    assert "[REDACTED_EMAIL]" in masked
    assert "[REDACTED_SSN]" in masked
    assert {"email", "ssn"} <= set(found)


def test_mask_clean_text_unchanged():
    masked, found = pii.mask("nothing sensitive here")
    assert masked == "nothing sensitive here"
    assert found == []


def test_mask_redacts_credit_card():
    masked, found = pii.mask("card 4111 1111 1111 1111 on file")
    assert "4111" not in masked
    assert "[REDACTED_CARD]" in masked
    assert "credit_card" in found
