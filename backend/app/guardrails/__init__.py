"""Layered guardrails (Phase 4): input safety + output grounding/PII checks.

Each check is small and pluggable behind a common ``Verdict`` so a heavier
implementation (a trained injection classifier, ShieldGemma, Presidio) can drop in
without changing callers.
"""
