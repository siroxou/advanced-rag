"""Regression-gate eval: citation validity, refusal accuracy, latency, cost.

Runs the grounded answer path over a dataset and scores it, then enforces thresholds
so a quality/latency/cost regression fails CI instead of shipping:

    cd backend
    uv run python -m app.finetune.evaluate --data ../ml/datasets/golden.jsonl \\
        --min-citation-rate 0.8 --max-p95-latency-ms 8000 --max-cost-usd 0.02

Every threshold defaults to off (0.0) and only fires when set; ``--min-records``
defaults to 1, so an empty dataset always fails. A ``metrics.json``
summary is always written (``--out``) for CI to upload as an artifact.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from statistics import quantiles
from typing import Any

from app.core.db import SessionFactory
from app.guardrails.grounding import count_citations, validate_citations
from app.llm.factory import get_llm
from app.observability import pricing
from app.rag import pipeline
from app.rag.retriever import retrieve

_ROLES = ["viewer", "analyst", "admin"]


def _question(record: dict[str, Any]) -> str:
    user = record["messages"][1]["content"]
    return user.split("Question:", 1)[-1].strip()


def _expects_refusal(record: dict[str, Any]) -> bool:
    return record["messages"][-1]["content"].strip() == pipeline.NO_CONTEXT_MSG


def _is_refusal(answer: str) -> bool:
    return answer.strip().lower().startswith("i don't have enough")


def _p95(values: list[float]) -> float | None:
    """95th-percentile of a list (stdlib only). None when empty."""
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    # Inclusive, so a small sample never reports a tail beyond its own maximum.
    return quantiles(values, n=100, method="inclusive")[94]  # index 94 = 95th pct


async def _run(records: list[dict[str, Any]], args: argparse.Namespace) -> dict[str, Any]:
    llm = get_llm()

    answered = cited_ok = refusal_total = refused_ok = 0
    latencies: list[float] = []
    costs: list[float] = []

    async with SessionFactory() as session:
        for record in records:
            question = _question(record)
            t0 = time.perf_counter()
            chunks = await retrieve(session, question, _ROLES)
            usage = None
            if not chunks:
                answer, n_sources = pipeline.NO_CONTEXT_MSG, 0
            else:
                completion = await llm.chat(
                    pipeline.build_messages(question, [], chunks), temperature=0.1, max_tokens=512
                )
                answer, usage, n_sources = completion.text, completion.usage, len(chunks)
            latencies.append((time.perf_counter() - t0) * 1000)

            if _expects_refusal(record):
                refusal_total += 1
                refused_ok += int(_is_refusal(answer))
            else:
                answered += 1
                # An answer with no [n] at all is not a cited answer, however valid.
                ok = (
                    count_citations(answer) > 0
                    and validate_citations(answer, n_sources).allowed
                    and not _is_refusal(answer)
                )
                cited_ok += int(ok)
                cost = pricing.cost(llm.model, usage)
                if cost is not None:
                    costs.append(cost)

    # None, not 1.0: with nothing answered there is no rate, and the gate must say so.
    citation_rate = cited_ok / answered if answered else None
    p95_latency = _p95(latencies)
    metrics: dict[str, Any] = {
        "model": llm.model,
        "n": len(records),
        "answered": answered,
        "citation_rate": round(citation_rate, 4) if citation_rate is not None else None,
        "refusal_total": refusal_total,
        "refusal_accuracy": round(refused_ok / refusal_total, 4) if refusal_total else None,
        "p95_latency_ms": round(p95_latency, 1) if p95_latency is not None else None,
        "avg_cost_usd": round(sum(costs) / len(costs), 6) if costs else None,
        "total_cost_usd": round(sum(costs), 6) if costs else None,
    }

    print(f"model: {metrics['model']}  (n={metrics['n']})")
    if answered:
        print(f"valid-citation answers: {cited_ok}/{answered} ({citation_rate:.0%})")
    if refusal_total:
        print(f"correct refusals: {refused_ok}/{refusal_total} ({refused_ok / refusal_total:.0%})")
    for key in ("p95_latency_ms", "avg_cost_usd"):
        if metrics[key] is not None:
            print(f"{key}: {metrics[key]}")

    return metrics


def _gate(metrics: dict[str, Any], args: argparse.Namespace) -> None:
    """Fail the build if a set threshold is crossed. Optional/None metrics are skipped."""
    failures: list[str] = []
    cr = metrics["citation_rate"]
    if args.min_citation_rate and cr is None:
        failures.append("no answerable records to score")
    elif args.min_citation_rate and cr < args.min_citation_rate:
        failures.append(f"citation rate {cr:.0%} < {args.min_citation_rate:.0%}")
    p95 = metrics["p95_latency_ms"]
    if args.max_p95_latency_ms and p95 is not None and p95 > args.max_p95_latency_ms:
        failures.append(f"p95 latency {p95:.0f}ms > {args.max_p95_latency_ms:.0f}ms")
    cost = metrics["avg_cost_usd"]
    if args.max_cost_usd and cost is None:
        # An unpriced model or missing usage must not pass a cost gate unmeasured.
        failures.append(f"cost untracked for {metrics.get('model')!r}; add it to pricing")
    elif args.max_cost_usd and cost > args.max_cost_usd:
        failures.append(f"cost/req ${cost:.4f} > ${args.max_cost_usd:.4f}")
    if failures:
        print("FAIL: " + "; ".join(failures))
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate grounded answering on a dataset.")
    parser.add_argument(
        "--data", required=True, help="JSONL dataset (e.g. ml/datasets/golden.jsonl)"
    )
    parser.add_argument("--out", default="metrics.json", help="Summary artifact path")
    parser.add_argument(
        "--min-records",
        type=int,
        default=1,
        help="Exit non-zero if the dataset has fewer records than this",
    )
    parser.add_argument(
        "--min-citation-rate",
        type=float,
        default=0.0,
        help="Exit non-zero if the valid-citation rate falls below this (CI gate)",
    )
    parser.add_argument(
        "--max-p95-latency-ms",
        type=float,
        default=0.0,
        help="Exit non-zero if P95 end-to-end latency exceeds this",
    )
    parser.add_argument(
        "--max-cost-usd",
        type=float,
        default=0.0,
        help="Exit non-zero if average cost per answered request exceeds this",
    )
    args = parser.parse_args()
    records = [
        json.loads(line)
        for line in Path(args.data).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    # Checked before any DB or model call: an empty or truncated dataset must fail
    # the gate, not pass it having measured nothing.
    if len(records) < args.min_records:
        sys.exit(f"FAIL: {len(records)} records < --min-records {args.min_records}")
    metrics = asyncio.run(_run(records, args))
    Path(args.out).write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"wrote {args.out}")
    _gate(metrics, args)


if __name__ == "__main__":
    main()
