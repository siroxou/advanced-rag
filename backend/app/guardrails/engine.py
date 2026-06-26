"""Guardrail orchestration: one entry point each for input and output."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.logging import get_logger
from app.core.runtime_settings import runtime
from app.guardrails import grounding, injection, pii, safety

logger = get_logger(__name__)

INPUT_BLOCKED_MSG = "Your request was blocked by input guardrails."


@dataclass(slots=True)
class InputReport:
    blocked: bool = False
    reason: str | None = None
    category: str | None = None


@dataclass(slots=True)
class OutputReport:
    grounding_ok: bool = True
    invalid_citations: list[int] = field(default_factory=list)
    pii_found: list[str] = field(default_factory=list)
    # Set only when PII masking is on and PII was found - the answer with PII
    # spans replaced by typed placeholders. None means "leave the answer as is".
    masked_answer: str | None = None


async def run_input_guardrails(text: str) -> InputReport:
    """Run enabled input guardrails. Each toggle already AND-s the master switch."""
    if runtime.guard_injection():
        inj = injection.check(text)
        if not inj.allowed:
            logger.info("guardrail_block", category="injection", reason=inj.reason)
            return InputReport(blocked=True, reason=inj.reason, category="injection")
    if runtime.guard_safety():
        saf = await safety.check(text)
        if not saf.allowed:
            logger.info("guardrail_block", category="safety", reason=saf.reason)
            return InputReport(blocked=True, reason=saf.reason, category="safety")
    return InputReport()


def run_output_guardrails(answer: str, n_sources: int) -> OutputReport:
    """Validate citations and detect/mask PII per the enabled output guardrails."""
    report = OutputReport()
    if runtime.guard_grounding():
        ground = grounding.validate_citations(answer, n_sources)
        report.grounding_ok = ground.allowed
        report.invalid_citations = ground.details.get("invalid_citations", [])

    if runtime.guard_pii_mask():
        masked, categories = pii.mask(answer)
        if categories:
            report.pii_found = categories
            report.masked_answer = masked
    elif runtime.guard_pii_detect():
        report.pii_found = pii.detect(answer).details.get("categories", [])

    if not report.grounding_ok or report.pii_found:
        logger.info(
            "guardrail_output",
            grounding_ok=report.grounding_ok,
            invalid_citations=report.invalid_citations,
            pii=report.pii_found,
        )
    return report
