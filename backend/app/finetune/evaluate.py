"""Regression-gate eval: citation validity, refusal accuracy, faithfulness, latency, cost.

Runs the grounded answer path over a dataset and scores it, then enforces thresholds
so a quality/latency/cost regression fails CI instead of shipping:

    cd backend
    uv run python -m app.finetune.evaluate --data ../ml/datasets/golden.jsonl \\
        --min-citation-rate 0.8 --min-faithfulness 0.7 --max-p95-latency-ms 8000 --max-cost-usd 0.02

Every threshold defaults to off (0.0) and only fires when set. RAGAS faithfulness is
optional (the ``eval`` extra): if ragas/the judge LLM is unavailable it reports null and
its gate is skipped, so the citation/latency/cost gates still run. A ``metrics.json``
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

from app.core.config import settings
from app.core.db import SessionFactory
from app.guardrails.grounding import validate_citations
from app.llm.base import LLMProvider
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
    return quantiles(values, n=100)[94]  # 99 cut points -> index 94 is the 95th pct


def _faithfulness(samples: list[tuple[str, str, list[str]]], llm: LLMProvider) -> float | None:
    """Mean RAGAS faithfulness over (question, answer, contexts), or None if unavailable.

    Optional and fully fail-soft: needs the ``eval`` extra (ragas + langchain-openai)
    and a reachable judge LLM. Any import/config/runtime error -> None, so the gate
    keeps running its citation/latency/cost checks. Uses the eval LLM as the judge via
    the OpenAI-compatible endpoint, so no embeddings/OpenAI key are required.
    """
    if not samples:
        return None
    try:
        from datasets import Dataset
        from langchain_openai import ChatOpenAI
        from ragas import evaluate as ragas_evaluate
        from ragas.llms import LangchainLLMWrapper
        from ragas.metrics import faithfulness
    except Exception:
        print("note: ragas not installed; skipping faithfulness (install the 'eval' extra)")
        return None
    try:
        judge = LangchainLLMWrapper(
            ChatOpenAI(
                model=llm.model,
                base_url=settings.llm_base_url,
                api_key=settings.llm_api_key,
                temperature=0.0,
            )
        )
        ds = Dataset.from_dict(
            {
                "question": [q for q, _, _ in samples],
                "answer": [a for _, a, _ in samples],
                "contexts": [c for _, _, c in samples],
            }
        )
        result = ragas_evaluate(ds, metrics=[faithfulness], llm=judge)
        return float(result.to_pandas()["faithfulness"].mean())
    except Exception as exc:
        print(f"note: ragas scoring failed ({exc}); skipping faithfulness")
        return None


async def _run(records: list[dict[str, Any]], args: argparse.Namespace) -> dict[str, Any]:
    llm = get_llm()

    answered = cited_ok = refusal_total = refused_ok = 0
    latencies: list[float] = []
    costs: list[float] = []
    faith_samples: list[tuple[str, str, list[str]]] = []

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
                ok = validate_citations(answer, n_sources).allowed and not _is_refusal(answer)
                cited_ok += int(ok)
                cost = pricing.cost(llm.model, usage)
                if cost is not None:
                    costs.append(cost)
                faith_samples.append((question, answer, [c.content for c in chunks]))

    citation_rate = cited_ok / answered if answered else 1.0
    p95_latency = _p95(latencies)
    metrics: dict[str, Any] = {
        "model": llm.model,
        "n": len(records),
        "answered": answered,
        "citation_rate": round(citation_rate, 4),
        "refusal_total": refusal_total,
        "refusal_accuracy": round(refused_ok / refusal_total, 4) if refusal_total else None,
        "faithfulness": _faithfulness(faith_samples, llm),
        "p95_latency_ms": round(p95_latency, 1) if p95_latency is not None else None,
        "avg_cost_usd": round(sum(costs) / len(costs), 6) if costs else None,
        "total_cost_usd": round(sum(costs), 6) if costs else None,
    }

    print(f"model: {metrics['model']}  (n={metrics['n']})")
    if answered:
        print(f"valid-citation answers: {cited_ok}/{answered} ({citation_rate:.0%})")
    if refusal_total:
        print(f"correct refusals: {refused_ok}/{refusal_total} ({refused_ok / refusal_total:.0%})")
    for key in ("faithfulness", "p95_latency_ms", "avg_cost_usd"):
        if metrics[key] is not None:
            print(f"{key}: {metrics[key]}")

    return metrics


def _gate(metrics: dict[str, Any], args: argparse.Namespace) -> None:
    """Fail the build if a set threshold is crossed. Optional/None metrics are skipped."""
    failures: list[str] = []
    cr = metrics["citation_rate"]
    if args.min_citation_rate and cr < args.min_citation_rate:
        failures.append(f"citation rate {cr:.0%} < {args.min_citation_rate:.0%}")
    faith = metrics["faithfulness"]
    if args.min_faithfulness and faith is not None and faith < args.min_faithfulness:
        failures.append(f"faithfulness {faith:.2f} < {args.min_faithfulness:.2f}")
    p95 = metrics["p95_latency_ms"]
    if args.max_p95_latency_ms and p95 is not None and p95 > args.max_p95_latency_ms:
        failures.append(f"p95 latency {p95:.0f}ms > {args.max_p95_latency_ms:.0f}ms")
    cost = metrics["avg_cost_usd"]
    if args.max_cost_usd and cost is not None and cost > args.max_cost_usd:
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
        "--min-citation-rate",
        type=float,
        default=0.0,
        help="Exit non-zero if the valid-citation rate falls below this (CI gate)",
    )
    parser.add_argument(
        "--min-faithfulness",
        type=float,
        default=0.0,
        help="Exit non-zero if RAGAS faithfulness falls below this (skipped if ragas absent)",
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
    metrics = asyncio.run(_run(records, args))
    Path(args.out).write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"wrote {args.out}")
    _gate(metrics, args)


if __name__ == "__main__":
    main()
