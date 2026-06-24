"""Ingest PDFs into the corpus.

Two ways to assign the RBAC tier that gates retrieval:

  # 1. Tag every file explicitly (the manual RBAC demo lever):
  python -m app.ingestion.cli --input data/raw --source-id arxiv --roles viewer,analyst

  # 2. Let the LLM propose a tier per file (drop files, no hand-tagging):
  python -m app.ingestion.cli --input data/raw --source-id arxiv --classify --dry-run  # preview
  python -m app.ingestion.cli --input data/raw --source-id arxiv --classify            # commit

Auto-classification fails closed (an unreadable or risky document becomes
admin-only, never public). ``--dry-run`` prints the proposed tiers without
touching the database so a human can review before committing.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.core.db import SessionFactory
from app.core.logging import configure_logging, get_logger
from app.ingestion.classifier import Classification, classify_pdf
from app.ingestion.pipeline import IngestStats, ingest_pdf
from app.llm.factory import get_llm

logger = get_logger(__name__)


def _pdf_paths(input_path: Path) -> list[Path]:
    if input_path.is_dir():
        return sorted(input_path.rglob("*.pdf"))
    if input_path.suffix.lower() == ".pdf":
        return [input_path]
    return []


def _print_classification_table(rows: list[tuple[Path, Classification]]) -> None:
    name_w = max((len(p.name) for p, _ in rows), default=4)
    print(f"\n{'FILE':<{name_w}}  {'TIER':<10}  {'CONF':<5}  ROLES / REASON")
    print("-" * (name_w + 40))
    for path, c in rows:
        roles = ",".join(c.allowed_roles)
        print(
            f"{path.name:<{name_w}}  {c.sensitivity:<10}  {c.confidence:<5.2f}  "
            f"{roles}  ({c.reason})"
        )
    print()


async def _classify_all(paths: list[Path]) -> list[tuple[Path, Classification]]:
    llm = get_llm()
    rows: list[tuple[Path, Classification]] = []
    for path in paths:
        rows.append((path, await classify_pdf(llm, path)))
    return rows


async def _ingest_classified(
    rows: list[tuple[Path, Classification]], *, source_id: str
) -> IngestStats:
    total = IngestStats()
    async with SessionFactory() as session:
        for path, c in rows:
            stats = await ingest_pdf(
                session,
                path,
                source_id=source_id,
                allowed_roles=c.allowed_roles,
                sensitivity=c.sensitivity,
                classification_reason=c.reason,
                auto_classified=True,
            )
            total.documents += stats.documents
            total.chunks_inserted += stats.chunks_inserted
            total.chunks_skipped += stats.chunks_skipped
    return total


async def _ingest_explicit(
    paths: list[Path], *, source_id: str, roles: list[str], sensitivity: str
) -> IngestStats:
    total = IngestStats()
    async with SessionFactory() as session:
        for path in paths:
            stats = await ingest_pdf(
                session,
                path,
                source_id=source_id,
                allowed_roles=roles,
                sensitivity=sensitivity,
            )
            total.documents += stats.documents
            total.chunks_inserted += stats.chunks_inserted
            total.chunks_skipped += stats.chunks_skipped
    return total


async def _run(args: argparse.Namespace) -> None:
    paths = _pdf_paths(Path(args.input))
    if not paths:
        logger.warning("no_pdfs_found", input=args.input)
        print(f"No PDFs found at {args.input}")
        return

    if args.classify:
        rows = await _classify_all(paths)
        _print_classification_table(rows)
        if args.dry_run:
            print("Dry run: nothing ingested. Re-run without --dry-run to commit.")
            return
        total = await _ingest_classified(rows, source_id=args.source_id)
        print(
            f"Done (auto-classified): {len(paths)} file(s), "
            f"{total.chunks_inserted} chunk(s) inserted, {total.chunks_skipped} skipped "
            f"(source={args.source_id})."
        )
        return

    roles = [r.strip() for r in args.roles.split(",") if r.strip()]
    total = await _ingest_explicit(
        paths, source_id=args.source_id, roles=roles, sensitivity=args.sensitivity
    )
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
        help="Comma-separated roles allowed to retrieve these chunks (ignored with --classify)",
    )
    parser.add_argument("--sensitivity", default="internal", help="public | internal | restricted")
    parser.add_argument(
        "--classify",
        action="store_true",
        help="Let the LLM assign a tier per file instead of --roles (fails closed)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="With --classify: print proposed tiers and exit without ingesting",
    )
    args = parser.parse_args()
    if args.dry_run and not args.classify:
        parser.error("--dry-run requires --classify")
    configure_logging("INFO")
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
