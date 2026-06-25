"""Built-in corpus presets.

Ready-made public HuggingFace datasets so anyone can populate the corpus and try
the system without supplying their own PDFs. Each preset records where the data
lives, how to read it (text rows vs. embedded PDFs), and a sensible default RBAC
tier. Run ``python -m app.ingestion.presets --list`` to see them.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Preset:
    name: str
    kind: str  # "text" | "pdf"
    dataset: str
    description: str
    roles: list[str]
    sensitivity: str = "internal"
    split: str = "train"
    # text datasets
    text_column: str = "text"
    record_prefix: str | None = None
    # pdf datasets
    pdf_column: str = "pdf"
    # default rows/records to ingest (None = all); keeps big sets from running away
    default_limit: int | None = None
    notes: str = ""


PRESETS: dict[str, Preset] = {
    "patient-doctor": Preset(
        name="patient-doctor",
        kind="text",
        dataset="Postzeun/Patient-Doctor",
        description="~60k medical patient-doctor conversations. Sensitive by nature, so a "
        "clean RBAC story: tag clinician-only and a viewer is refused every chunk.",
        roles=["analyst", "admin"],
        sensitivity="internal",
        text_column="text",
        record_prefix="This is a conversation between a patient and a doctor",
        default_limit=100,
        notes="Line-delimited; grouped back into whole conversations before chunking.",
    ),
    "fred-core": Preset(
        name="fred-core",
        kind="pdf",
        dataset="fredk8/fred_core_document_corpus_v1",
        description="32 mixed-domain PDFs: ECB economics papers, OECD French policy, and "
        "arXiv AI preprints. Good cross-domain retrieval and auto-classifier demo.",
        roles=["viewer", "analyst", "admin"],
        sensitivity="public",
        pdf_column="pdf",
        default_limit=None,
        notes="Real PDFs embedded in the dataset; decoded and run through the PDF pipeline.",
    ),
}


def get_preset(name: str) -> Preset:
    try:
        return PRESETS[name]
    except KeyError:
        known = ", ".join(sorted(PRESETS))
        raise KeyError(f"unknown preset '{name}'. Available: {known}") from None


def list_presets() -> list[Preset]:
    return list(PRESETS.values())
