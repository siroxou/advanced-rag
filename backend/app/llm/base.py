"""Provider-agnostic LLM interface.

Every concrete backend (Ollama/MLX on the Mac, vLLM in the cloud) implements this
protocol and speaks the OpenAI chat-completions wire format, so the rest of the app
never depends on *where* Gemma 4 runs.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable


@dataclass(slots=True)
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass(slots=True)
class Usage:
    """Token accounting for a single completion."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    @classmethod
    def from_openai(cls, usage: Any) -> Usage | None:
        """Map an OpenAI ``CompletionUsage`` (or None) onto our Usage."""
        if usage is None:
            return None
        return cls(
            prompt_tokens=usage.prompt_tokens or 0,
            completion_tokens=usage.completion_tokens or 0,
            total_tokens=usage.total_tokens or 0,
        )


@dataclass(slots=True)
class Completion:
    """A non-streaming chat result: the assistant text plus optional token usage."""

    text: str
    usage: Usage | None = None


@dataclass(slots=True)
class ChatChunk:
    delta: str
    done: bool = False
    # Set only on the terminal (done=True) chunk, when the provider reports usage.
    usage: Usage | None = None


@runtime_checkable
class LLMProvider(Protocol):
    name: str
    model: str

    async def chat(
        self, messages: Sequence[ChatMessage], *, temperature: float = ..., max_tokens: int = ...
    ) -> Completion:
        """Return the full assistant message and its token usage."""

    def stream(
        self, messages: Sequence[ChatMessage], *, temperature: float = ..., max_tokens: int = ...
    ) -> AsyncIterator[ChatChunk]:
        """Yield incremental deltas, terminated by a chunk with ``done=True``."""

    async def health(self) -> bool:
        """Return True if the backend is reachable."""
