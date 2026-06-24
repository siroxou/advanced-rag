"""Guardrail orchestration: one entry point each for input and output."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.config import settings
from app.core.logging import get_logger
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


async def run_input_guardrails(text: str) -> InputReport:
    if not settings.guardrails_enabled:
        return InputReport()
    inj = injection.check(text)
    if not inj.allowed:
        logger.info("guardrail_block", category="injection", reason=inj.reason)
        return InputReport(blocked=True, reason=inj.reason, category="injection")
    saf = await safety.check(text)
    if not saf.allowed:
        logger.info("guardrail_block", category="safety", reason=saf.reason)
        return InputReport(blocked=True, reason=saf.reason, category="safety")
    return InputReport()


def run_output_guardrails(answer: str, n_sources: int) -> OutputReport:
    if not settings.guardrails_enabled:
        return OutputReport()
    ground = grounding.validate_citations(answer, n_sources)
    personal = pii.detect(answer)
    report = OutputReport(
        grounding_ok=ground.allowed,
        invalid_citations=ground.details.get("invalid_citations", []),
        pii_found=personal.details.get("categories", []),
    )
    if not report.grounding_ok or report.pii_found:
        logger.info(
            "guardrail_output",
            grounding_ok=report.grounding_ok,
            invalid_citations=report.invalid_citations,
            pii=report.pii_found,
        )
    return report
