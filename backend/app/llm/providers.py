"""Concrete LLM providers.

A single ``OpenAICompatibleProvider`` covers everything we need: Ollama (local,
Apple Metal) and vLLM (cloud GPU) both expose the OpenAI ``/v1`` API. The only
differences are ``base_url`` / ``model`` / ``api_key``, all injected from config.

Gemma 4 is a *reasoning* model: with thinking enabled, Ollama streams chain-of-
thought into a separate ``reasoning`` field and leaves ``content`` empty until it
finishes. For the RAG answer path we keep thinking off (fast, always-populated
``content``); ``think`` is an Ollama extension, so we only send it there.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from typing import Any, cast

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from app.llm.base import ChatChunk, ChatMessage

# Gemma 4 is a reasoning model and may spend part of its budget thinking even with
# thinking disabled. Floor the answer budget so the final `content` always lands
# (empirically, <512 tokens can be fully consumed by reasoning, yielding "").
_MIN_ANSWER_TOKENS = 512


class OpenAICompatibleProvider:
    """OpenAI chat-completions client pointed at any compatible endpoint."""

    def __init__(
        self,
        *,
        name: str,
        model: str,
        base_url: str,
        api_key: str = "not-needed",
        timeout: float = 120.0,
        enable_thinking: bool = False,
    ) -> None:
        self.name = name
        self.model = model
        self.enable_thinking = enable_thinking
        self._client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=timeout)

    @staticmethod
    def _wire(messages: Sequence[ChatMessage]) -> list[ChatCompletionMessageParam]:
        return [
            cast(ChatCompletionMessageParam, {"role": m.role, "content": m.content})
            for m in messages
        ]

    def _extra_body(self) -> dict[str, Any] | None:
        # `think` is an Ollama-specific extension; vLLM controls reasoning at
        # serve time, so only forward this when talking to Ollama.
        if self.name == "ollama":
            return {"think": self.enable_thinking}
        return None

    async def chat(
        self, messages: Sequence[ChatMessage], *, temperature: float = 0.2, max_tokens: int = 1024
    ) -> str:
        resp = await self._client.chat.completions.create(
            model=self.model,
            messages=self._wire(messages),
            temperature=temperature,
            max_tokens=max(max_tokens, _MIN_ANSWER_TOKENS),
            stream=False,
            extra_body=self._extra_body(),
        )
        return resp.choices[0].message.content or ""

    async def stream(
        self, messages: Sequence[ChatMessage], *, temperature: float = 0.2, max_tokens: int = 1024
    ) -> AsyncIterator[ChatChunk]:
        stream = await self._client.chat.completions.create(
            model=self.model,
            messages=self._wire(messages),
            temperature=temperature,
            max_tokens=max(max_tokens, _MIN_ANSWER_TOKENS),
            stream=True,
            extra_body=self._extra_body(),
        )
        async for event in stream:
            if not event.choices:
                continue
            delta = event.choices[0].delta.content or ""
            if delta:
                yield ChatChunk(delta=delta)
        yield ChatChunk(delta="", done=True)

    async def health(self) -> bool:
        try:
            await self._client.models.list()
            return True
        except Exception:
            return False
