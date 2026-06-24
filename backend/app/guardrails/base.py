"""Common guardrail verdict type."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Verdict:
    allowed: bool
    category: str  # injection | safety | grounding | pii
    reason: str = ""
    details: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def ok(cls, category: str) -> Verdict:
        return cls(allowed=True, category=category)
