"""Output grounding: every inline [n] citation must point to a real source."""

from __future__ import annotations

import re

from app.guardrails.base import Verdict

_CITATION = re.compile(r"\[(\d+)\]")


def validate_citations(answer: str, n_sources: int) -> Verdict:
    cited = {int(n) for n in _CITATION.findall(answer)}
    invalid = sorted(n for n in cited if n < 1 or n > n_sources)
    if invalid:
        return Verdict(
            allowed=False,
            category="grounding",
            reason="answer cites sources that do not exist",
            details={"invalid_citations": invalid, "n_sources": n_sources},
        )
    return Verdict(allowed=True, category="grounding", details={"cited": sorted(cited)})
