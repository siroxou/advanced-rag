"""BGE-M3 dense embeddings.

Loaded lazily on first use so the API process stays light until retrieval or
ingestion actually needs it. ``sentence-transformers`` + ``torch`` ship in the
``ml`` extra; without them, importing this module is fine and only constructing
the embedder raises a clear error.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def resolve_device(pref: str) -> str:
    """Map ``auto`` to the best available accelerator (mps on Apple Silicon)."""
    if pref != "auto":
        return pref
    try:
        import torch

        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:  # torch missing or probe failed
        pass
    return "cpu"


class Embedder:
    """Thin wrapper over a SentenceTransformer producing L2-normalized vectors.

    Normalizing means cosine distance reduces to a dot product, matching the
    ``vector_cosine_ops`` index used by the retriever.
    """

    def __init__(self, model_name: str, device: str) -> None:
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name
        self.device = device
        logger.info("loading_embedder", model=model_name, device=device)
        self._model = SentenceTransformer(model_name, device=device)

    def encode(self, texts: list[str], *, batch_size: int = 16) -> list[list[float]]:
        vectors = self._model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return [v.tolist() for v in vectors]

    def encode_one(self, text: str) -> list[float]:
        return self.encode([text])[0]


@lru_cache
def get_embedder() -> Embedder:
    return Embedder(settings.embedding_model, resolve_device(settings.embedding_device))
