"""Ingest PDFs into the corpus.

    python -m app.ingestion.cli --input data/raw --source-id arxiv --roles viewer,analyst

Roles set who may retrieve the resulting chunks; this is the RBAC demo lever
(ingest the same corpus under different roles to prove a viewer cannot see a
restricted document).
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.core.db import SessionFactory
from app.core.logging import configure_logging, get_logger
from app.ingestion.pipeline import IngestStats, ingest_pdf

logger = get_logger(__name__)


def _pdf_paths(input_path: Path) -> list[Path]:
    if input_path.is_dir():
        return sorted(input_path.rglob("*.pdf"))
    if input_path.suffix.lower() == ".pdf":
        return [input_path]
    return []


async def _run(args: argparse.Namespace) -> None:
    paths = _pdf_paths(Path(args.input))
    if not paths:
        logger.warning("no_pdfs_found", input=args.input)
        print(f"No PDFs found at {args.input}")
        return

    roles = [r.strip() for r in args.roles.split(",") if r.strip()]
    total = IngestStats()
    async with SessionFactory() as session:
        for path in paths:
            stats = await ingest_pdf(
                session,
                path,
                source_id=args.source_id,
                allowed_roles=roles,
                sensitivity=args.sensitivity,
            )
            total.documents += stats.documents
            total.chunks_inserted += stats.chunks_inserted
            total.chunks_skipped += stats.chunks_skipped

    print(
        f"Done: {len(paths)} file(s), {total.chunks_inserted} chunk(s) inserted, "
        f"{total.chunks_skipped} skipped (roles={roles}, source={args.source_id})."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest PDFs into the RAG corpus.")
    parser.add_argument("--input", required=True, help="PDF file or directory of PDFs")
    parser.add_argument("--source-id", required=True, help="Logical source name, e.g. arxiv")
    parser.add_argument(
        "--roles",
        default="viewer",
        help="Comma-separated roles allowed to retrieve these chunks",
    )
    parser.add_argument("--sensitivity", default="internal", help="public | internal | restricted")
    args = parser.parse_args()
    configure_logging("INFO")
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
