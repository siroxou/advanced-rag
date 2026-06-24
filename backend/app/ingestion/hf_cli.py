"""Ingest a HuggingFace text dataset into the corpus.

    # 500 patient-doctor conversations, clinician-only (analyst/admin):
    python -m app.ingestion.hf_cli --dataset Postzeun/Patient-Doctor \\
        --limit 500 --roles analyst,admin --sensitivity internal

    # let the LLM tier each row instead (slower: one model call per row):
    python -m app.ingestion.hf_cli --dataset Postzeun/Patient-Doctor --limit 200 --classify

Needs the ``ml`` extra (``uv sync --extra ml``) for the ``datasets`` library.
"""

from __future__ import annotations

import argparse
import asyncio

from app.core.db import SessionFactory
from app.core.logging import configure_logging, get_logger
from app.ingestion.hf_dataset import ingest_hf
from app.llm.factory import get_llm

logger = get_logger(__name__)


async def _run(args: argparse.Namespace) -> None:
    roles = [r.strip() for r in args.roles.split(",") if r.strip()]
    llm = get_llm() if args.classify else None
    async with SessionFactory() as session:
        total = await ingest_hf(
            session,
            dataset=args.dataset,
            split=args.split,
            text_column=args.text_column,
            source_id=args.source_id,
            allowed_roles=roles,
            sensitivity=args.sensitivity,
            limit=args.limit,
            record_prefix=args.record_prefix or None,
            classify_each=args.classify,
            llm=llm,
        )
    tier = "auto-classified" if args.classify else f"roles={roles}"
    print(
        f"Done: {total.documents} record(s), {total.chunks_inserted} chunk(s) inserted, "
        f"{total.chunks_skipped} skipped ({tier}, dataset={args.dataset})."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest a HuggingFace text dataset.")
    parser.add_argument(
        "--dataset", required=True, help="HF dataset id, e.g. Postzeun/Patient-Doctor"
    )
    parser.add_argument("--split", default="train", help="Dataset split (default: train)")
    parser.add_argument("--text-column", default="text", help="Column holding the document text")
    parser.add_argument(
        "--source-id", default=None, help="Logical source name (default: dataset slug)"
    )
    parser.add_argument(
        "--roles",
        default="analyst,admin",
        help="Roles allowed to retrieve these rows (ignored with --classify)",
    )
    parser.add_argument("--sensitivity", default="internal", help="public | internal | restricted")
    parser.add_argument("--limit", type=int, default=500, help="Max records to ingest (0 = all)")
    parser.add_argument(
        "--record-prefix",
        default="",
        help="Line-delimited datasets: start a new record when a line begins with this prefix",
    )
    parser.add_argument(
        "--classify",
        action="store_true",
        help="Let the LLM tier each row instead of --roles (one model call per row)",
    )
    args = parser.parse_args()
    if args.limit == 0:
        args.limit = None
    configure_logging("INFO")
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
