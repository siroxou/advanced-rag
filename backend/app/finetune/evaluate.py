"""RAGAS-style eval: citation validity + refusal accuracy over a held-out set.

Runs the grounded answer path over the questions in a dataset file and scores how
often the model cites only real sources and refuses when it should. Re-run with
``LLM_MODEL`` pointed at the tuned/merged model to compare base vs LoRA. A full
RAGAS faithfulness/relevancy harness drops in behind the same loop.

    cd backend
    uv run python -m app.finetune.evaluate --data ../ml/datasets/valid.jsonl
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from app.core.db import SessionFactory
from app.guardrails.grounding import validate_citations
from app.llm.factory import get_llm
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


async def _run(records: list[dict[str, Any]]) -> None:
    llm = get_llm()

    answered = cited_ok = refusal_total = refused_ok = 0
    async with SessionFactory() as session:
        for record in records:
            question = _question(record)
            chunks = await retrieve(session, question, _ROLES)
            if not chunks:
                answer, n_sources = pipeline.NO_CONTEXT_MSG, 0
            else:
                msgs = pipeline.build_messages(question, [], chunks)
                answer = await llm.chat(msgs, temperature=0.1, max_tokens=512)
                n_sources = len(chunks)

            if _expects_refusal(record):
                refusal_total += 1
                refused_ok += int(_is_refusal(answer))
            else:
                answered += 1
                ok = validate_citations(answer, n_sources).allowed and not _is_refusal(answer)
                cited_ok += int(ok)

    print(f"model: {llm.model}  (n={len(records)})")
    if answered:
        rate = cited_ok / answered
        print(f"valid-citation answers: {cited_ok}/{answered} ({rate:.0%})")
    if refusal_total:
        rate = refused_ok / refusal_total
        print(f"correct refusals: {refused_ok}/{refusal_total} ({rate:.0%})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate grounded answering on a dataset.")
    parser.add_argument(
        "--data", required=True, help="JSONL dataset (e.g. ml/datasets/valid.jsonl)"
    )
    args = parser.parse_args()
    records = [
        json.loads(line)
        for line in Path(args.data).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    asyncio.run(_run(records))


if __name__ == "__main__":
    main()
