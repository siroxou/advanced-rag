"""Ingest a built-in corpus preset (a ready-made public dataset).

    python -m app.ingestion.presets_cli --list
    python -m app.ingestion.presets_cli --name fred-core
    python -m app.ingestion.presets_cli --name patient-doctor --limit 50 --classify

For people with no PDFs of their own: pick a preset and go. ``--roles`` /
``--sensitivity`` override the preset's default tier; ``--classify`` lets the
LLM tier each document instead. Needs the ``ml`` extra (``uv sync --extra ml``).
"""

from __future__ import annotations

import argparse
import asyncio

from app.core.db import SessionFactory
from app.core.logging import configure_logging, get_logger
from app.ingestion.hf_dataset import ingest_hf, ingest_hf_pdfs
from app.ingestion.presets import Preset, get_preset, list_presets
from app.llm.factory import get_llm

logger = get_logger(__name__)


def _print_presets() -> None:
    print("\nBuilt-in corpus presets:\n")
    for p in list_presets():
        print(f"  {p.name}  [{p.kind}]  ->  {p.dataset}")
        print(f"      {p.description}")
        limit = "all" if p.default_limit is None else p.default_limit
        print(f"      default tier: {','.join(p.roles)} ({p.sensitivity}); default limit: {limit}")
        if p.notes:
            print(f"      note: {p.notes}")
        print()
    print("Run:  make preset NAME=<preset>")
    print("  or  python -m app.ingestion.presets_cli --name <preset>\n")


async def _ingest(preset: Preset, args: argparse.Namespace) -> None:
    roles = [r.strip() for r in args.roles.split(",") if r.strip()] if args.roles else preset.roles
    sensitivity = args.sensitivity or preset.sensitivity
    # --limit -1 (default) means "use the preset default"; 0 means "all".
    if args.limit < 0:
        limit = preset.default_limit
    else:
        limit = None if args.limit == 0 else args.limit
    llm = get_llm() if args.classify else None

    async with SessionFactory() as session:
        if preset.kind == "text":
            total = await ingest_hf(
                session,
                dataset=preset.dataset,
                split=preset.split,
                text_column=preset.text_column,
                allowed_roles=roles,
                sensitivity=sensitivity,
                limit=limit,
                record_prefix=preset.record_prefix,
                classify_each=args.classify,
                llm=llm,
            )
        else:
            total = await ingest_hf_pdfs(
                session,
                dataset=preset.dataset,
                split=preset.split,
                pdf_column=preset.pdf_column,
                allowed_roles=roles,
                sensitivity=sensitivity,
                limit=limit,
                classify_each=args.classify,
                llm=llm,
            )

    tier = "auto-classified" if args.classify else f"roles={roles}"
    print(
        f"Done: preset '{preset.name}', {total.documents} document(s), "
        f"{total.chunks_inserted} chunk(s) inserted, {total.chunks_skipped} skipped ({tier})."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest a built-in corpus preset.")
    parser.add_argument("--list", action="store_true", help="List the available presets and exit")
    parser.add_argument("--name", help="Preset to ingest (see --list)")
    parser.add_argument("--roles", default="", help="Override the preset's default roles")
    parser.add_argument("--sensitivity", default="", help="Override the preset's tier label")
    parser.add_argument(
        "--limit", type=int, default=-1, help="Max records (-1 preset default, 0 all)"
    )
    parser.add_argument(
        "--classify",
        action="store_true",
        help="Let the LLM tier each document instead of the preset's roles",
    )
    args = parser.parse_args()

    configure_logging("INFO")
    if args.list or not args.name:
        _print_presets()
        if not args.name and not args.list:
            parser.error("provide --name <preset> or --list")
        return

    preset = get_preset(args.name)
    asyncio.run(_ingest(preset, args))


if __name__ == "__main__":
    main()
