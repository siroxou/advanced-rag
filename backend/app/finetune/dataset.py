"""Generate a synthetic grounded fine-tuning dataset from the corpus.

For each chunk a teacher model writes a specific question answerable from the
chunk and a grounded answer that cites ``[1]`` - matching the production citation
contract. A fraction of records are hard-negative refusals (a question the chunk
does not answer, paired so the model must refuse). Output is MLX-LM chat JSONL.

    cd backend
    uv run python -m app.finetune.dataset --limit 200

Writes ``ml/datasets/{train,valid}.jsonl``.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
from pathlib import Path
from typing import Any

from sqlalchemy import select, text

from app.core.db import SessionFactory
from app.core.logging import configure_logging, get_logger
from app.db.models import Chunk
from app.llm.base import ChatMessage
from app.llm.factory import get_llm
from app.rag.pipeline import NO_CONTEXT_MSG, SYSTEM_PROMPT

logger = get_logger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]

_TEACHER_SYS = (
    "You write training data for a grounded question-answering model. Given a passage, "
    "produce ONE specific question a user could ask that is fully answered by the passage, "
    "and a concise answer that cites the source as [1]. Return ONLY JSON: "
    '{"question": "...", "answer": "... [1]"}.'
)


def to_chat_record(context: str, question: str, answer: str) -> dict[str, Any]:
    """Build one MLX-LM chat record teaching the grounded, cited answer style."""
    user = f"Context:\n[1] {context}\n\nQuestion: {question}"
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
            {"role": "assistant", "content": answer},
        ]
    }


def refusal_record(context: str, question: str) -> dict[str, Any]:
    """A hard negative: the context does not answer the question, so refuse."""
    user = f"Context:\n[1] {context}\n\nQuestion: {question}"
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
            {"role": "assistant", "content": NO_CONTEXT_MSG},
        ]
    }


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")


async def _generate_qa(llm: Any, content: str) -> tuple[str, str] | None:
    raw = await llm.chat(
        [
            ChatMessage(role="system", content=_TEACHER_SYS),
            ChatMessage(role="user", content=f"Passage:\n{content}"),
        ],
        temperature=0.3,
        max_tokens=400,
    )
    try:
        start, end = raw.index("{"), raw.rindex("}")
        obj = json.loads(raw[start : end + 1])
        question, answer = str(obj["question"]).strip(), str(obj["answer"]).strip()
    except (ValueError, KeyError, json.JSONDecodeError):
        return None
    return (question, answer) if question and answer else None


async def _run(args: argparse.Namespace) -> None:
    out_dir = Path(args.out) if args.out else _REPO_ROOT / "ml" / "datasets"
    out_dir.mkdir(parents=True, exist_ok=True)
    llm = get_llm()

    async with SessionFactory() as session:
        # Read across all roles (ingestion/dataset tooling is not a user request).
        await session.execute(
            text("SELECT set_config('app.user_roles', :roles, true)"),
            {"roles": "viewer,analyst,admin"},
        )
        rows = (await session.execute(select(Chunk.content).limit(args.limit))).all()

    contents = [r[0] for r in rows]
    if not contents:
        print("No chunks found. Ingest a corpus first (make ingest).")
        return

    positives: list[tuple[str, str, str]] = []
    for content in contents:
        qa = await _generate_qa(llm, content)
        if qa:
            positives.append((content, qa[0], qa[1]))
    logger.info("dataset_positives", generated=len(positives), chunks=len(contents))

    records = [to_chat_record(c, q, a) for c, q, a in positives]

    if len(positives) > 1:
        for _ in range(int(len(positives) * args.refusal_frac)):
            i, j = random.sample(range(len(positives)), 2)
            records.append(refusal_record(positives[j][0], positives[i][1]))

    random.shuffle(records)
    n_valid = max(1, len(records) // 10)
    _write_jsonl(out_dir / "valid.jsonl", records[:n_valid])
    _write_jsonl(out_dir / "train.jsonl", records[n_valid:])
    print(
        f"Wrote {len(records) - n_valid} train + {n_valid} valid records to {out_dir} "
        f"({len(positives)} grounded, {len(records) - len(positives)} refusals)."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a grounded LoRA dataset from the corpus.")
    parser.add_argument("--limit", type=int, default=200, help="Max chunks to sample")
    parser.add_argument("--refusal-frac", type=float, default=0.25, help="Hard-negative fraction")
    parser.add_argument("--out", default="", help="Output dir (default ml/datasets)")
    args = parser.parse_args()
    configure_logging("INFO")
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
