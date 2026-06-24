"""Download a small sample PDF corpus (AI / RAG papers from arXiv) into backend/data/raw.

These are public papers; the script just gives the demo something to retrieve over.
To use your own documents instead, drop PDFs into backend/data/raw and skip this.

    python scripts/fetch_sample_corpus.py
    make ingest          # then load them into the corpus
"""

from __future__ import annotations

import sys
import time
import urllib.request
from pathlib import Path

# arXiv id -> output slug. A compact, on-theme set for an AI-engineering portfolio.
PAPERS = {
    "1706.03762": "attention-is-all-you-need",
    "2005.11401": "rag-knowledge-intensive-nlp",
    "2312.10997": "rag-for-llms-survey",
    "2310.11511": "self-rag",
    "2004.04906": "dense-passage-retrieval",
}

DEST = Path(__file__).resolve().parent.parent / "backend" / "data" / "raw"


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for arxiv_id, slug in PAPERS.items():
        out = DEST / f"{slug}.pdf"
        if out.exists():
            print(f"skip  {out.name} (already present)")
            continue
        url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        req = urllib.request.Request(url, headers={"User-Agent": "advanced-rag-demo/0.1"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                out.write_bytes(resp.read())
            print(f"saved {out.name}  ({out.stat().st_size // 1024} KB)")
        except Exception as exc:  # network/rate-limit; keep going with the rest
            print(f"FAIL  {arxiv_id}: {exc}", file=sys.stderr)
        time.sleep(2)  # be polite to arXiv
    print(f"\nCorpus directory: {DEST}\nNext: make ingest")


if __name__ == "__main__":
    main()
