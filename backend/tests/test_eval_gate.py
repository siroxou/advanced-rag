"""Guards for the eval gate: the percentile helper, and that the committed golden
set stays parseable by the grader (a malformed golden file would silently weaken CI)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import pytest

from app.finetune.evaluate import _expects_refusal, _gate, _p95, _question, main

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


def _metrics(n: int, citation_rate: float | None) -> dict[str, Any]:
    return {
        "n": n,
        "citation_rate": citation_rate,
        "p95_latency_ms": None,
        "avg_cost_usd": None,
    }


def test_gate_fails_instead_of_passing_vacuously():
    args = argparse.Namespace(min_citation_rate=0.8, max_p95_latency_ms=0.0, max_cost_usd=0.0)
    for bad in (_metrics(10, None), _metrics(10, 0.5)):
        with pytest.raises(SystemExit):
            _gate(bad, args)
    _gate(_metrics(10, 0.9), args)  # a real, passing rate does not exit


def test_empty_dataset_fails_before_touching_the_db(tmp_path, monkeypatch):
    empty = tmp_path / "empty.jsonl"
    empty.write_text("")
    monkeypatch.setattr(sys, "argv", ["evaluate", "--data", str(empty), "--min-records", "5"])
    with pytest.raises(SystemExit) as exc:
        main()
    assert "min-records" in str(exc.value)
