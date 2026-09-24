"""Guards for the eval gate: the percentile helper, and that the committed golden
set stays parseable by the grader (a malformed golden file would silently weaken CI)."""

from __future__ import annotations

import json
from pathlib import Path

from app.finetune.evaluate import _expects_refusal, _p95, _question

GOLDEN = Path(__file__).resolve().parents[2] / "ml" / "datasets" / "golden.jsonl"


def test_p95_picks_the_tail():
    assert _p95([]) is None
    assert _p95([5.0]) == 5.0
    p = _p95([float(i) for i in range(1, 101)])
    assert p is not None and 94 <= p <= 100  # ~95th percentile of 1..100


def test_golden_set_parses_and_splits():
    records = [json.loads(line) for line in GOLDEN.read_text().splitlines() if line.strip()]
    assert len(records) >= 8
    answerable = [r for r in records if not _expects_refusal(r)]
    refusals = [r for r in records if _expects_refusal(r)]
    assert answerable and refusals  # the set exercises both citation and refusal paths
    assert all(_question(r) for r in records)  # every record yields a non-empty question
