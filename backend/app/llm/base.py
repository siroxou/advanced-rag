"""Provider-agnostic LLM interface.

Every concrete backend (Ollama/MLX on the Mac, vLLM in the cloud) implements this
protocol and speaks the OpenAI chat-completions wire format, so the rest of the app
never depends on *where* Gemma 4 runs.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(slots=True)
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass(slots=True)
class ChatChunk:
    delta: str
    done: bool = False


@runtime_checkable
class LLMProvider(Protocol):
    name: str
    model: str

    async def chat(
        self, messages: Sequence[ChatMessage], *, temperature: float = ..., max_tokens: int = ...
    ) -> str:
        """Return the full assistant message."""

    def stream(
        self, messages: Sequence[ChatMessage], *, temperature: float = ..., max_tokens: int = ...
    ) -> AsyncIterator[ChatChunk]:
        """Yield incremental deltas, terminated by a chunk with ``done=True``."""

    async def health(self) -> bool:
        """Return True if the backend is reachable."""
