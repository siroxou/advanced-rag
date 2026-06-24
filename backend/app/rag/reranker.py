"""BGE cross-encoder reranker (bge-reranker-v2-m3).

A cross-encoder scores the full (query, passage) pair jointly, so it is far more
precise than the bi-encoder used for first-stage retrieval, but too expensive to
run over the whole corpus. The retriever therefore reranks only the hybrid
candidate pool. Loaded lazily, same as the embedder.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.core.logging import get_logger
from app.rag.embedder import resolve_device

logger = get_logger(__name__)


class Reranker:
    def __init__(self, model_name: str, device: str) -> None:
        from sentence_transformers import CrossEncoder

        self.model_name = model_name
        logger.info("loading_reranker", model=model_name, device=device)
        self._model = CrossEncoder(model_name, device=device, max_length=512)

    def score(self, query: str, passages: list[str]) -> list[float]:
        """Relevance logit per passage; higher is more relevant."""
        if not passages:
            return []
        pairs = [[query, p] for p in passages]
        scores = self._model.predict(pairs, show_progress_bar=False)
        return [float(s) for s in scores]


@lru_cache
def get_reranker() -> Reranker:
    return Reranker(settings.reranker_model, resolve_device(settings.embedding_device))
