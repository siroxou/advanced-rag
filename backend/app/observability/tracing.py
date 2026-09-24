"""Optional Langfuse tracing.

A true no-op unless ``LANGFUSE_PUBLIC_KEY``/``LANGFUSE_SECRET_KEY`` are set and the
``obs`` extra (langfuse) is installed - the default path allocates one ``RequestTrace``
holding ``None`` and every method returns immediately, so there is zero network/SDK
overhead and no extra dependency.

Wire one ``RequestTrace`` per request from the chat endpoint, then record spans and a
generation as the pipeline runs::

    trace = RequestTrace.start("chat", user_id=user.username, input=query)
    trace.span("retrieve", output=chunks, start=t0, end=t1)
    trace.generation("synthesis", model=llm.model, input=msgs, output=answer, usage=usage)
    trace.score("grounding", 1.0)
    trace.finish()

ponytail: targets the Langfuse v2 client API (matches the ``obs`` pin and the previous
scaffold). Every call is wrapped so an SDK error or a v3 install degrades to "no trace"
rather than breaking the user-facing response.
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.llm.base import Usage

logger = get_logger(__name__)


def is_enabled() -> bool:
    return bool(settings.langfuse_public_key and settings.langfuse_secret_key)


@lru_cache
def _client() -> Any | None:
    if not is_enabled():
        return None
    try:
        from langfuse import Langfuse

        return Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
    except Exception:  # SDK missing or init failed
        logger.warning("langfuse_init_failed", exc_info=True)
        return None


def _usage_payload(usage: Usage | None) -> dict[str, Any] | None:
    """Langfuse v2 usage shape; Langfuse computes cost from this + the model id."""
    if usage is None:
        return None
    return {
        "input": usage.prompt_tokens,
        "output": usage.completion_tokens,
        "total": usage.total_tokens,
        "unit": "TOKENS",
    }


class RequestTrace:
    """One Langfuse trace for a single chat request, or a no-op when tracing is off."""

    __slots__ = ("_client", "_trace")

    def __init__(self, client: Any | None, trace: Any | None) -> None:
        self._client = client
        self._trace = trace

    @classmethod
    def start(
        cls,
        name: str,
        *,
        user_id: str,
        input: Any = None,
        metadata: dict[str, Any] | None = None,
    ) -> RequestTrace:
        client = _client()
        if client is None:
            return cls(None, None)
        try:
            trace = client.trace(name=name, user_id=user_id, input=input, metadata=metadata or {})
        except Exception:
            logger.warning("langfuse_trace_failed", exc_info=True)
            trace = None
        return cls(client, trace)

    def span(
        self,
        name: str,
        *,
        input: Any = None,
        output: Any = None,
        metadata: dict[str, Any] | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> None:
        if self._trace is None:
            return
        try:
            self._trace.span(
                name=name,
                input=input,
                output=output,
                metadata=metadata,
                start_time=start,
                end_time=end,
            )
        except Exception:
            logger.warning("langfuse_span_failed", name=name, exc_info=True)

    def generation(
        self,
        name: str,
        *,
        model: str,
        input: Any = None,
        output: Any = None,
        usage: Usage | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> None:
        if self._trace is None:
            return
        try:
            self._trace.generation(
                name=name,
                model=model,
                input=input,
                output=output,
                usage=_usage_payload(usage),
                start_time=start,
                end_time=end,
            )
        except Exception:
            logger.warning("langfuse_generation_failed", name=name, exc_info=True)

    def score(self, name: str, value: float, *, comment: str | None = None) -> None:
        if self._trace is None:
            return
        try:
            self._trace.score(name=name, value=value, comment=comment)
        except Exception:
            logger.warning("langfuse_score_failed", name=name, exc_info=True)

    def finish(self) -> None:
        if self._client is None:
            return
        try:
            self._client.flush()
        except Exception:
            logger.warning("langfuse_flush_failed", exc_info=True)
