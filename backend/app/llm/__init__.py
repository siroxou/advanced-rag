"""LLM abstraction: one OpenAI-compatible interface over Ollama / MLX / vLLM."""

from app.llm.base import ChatChunk, ChatMessage, LLMProvider
from app.llm.factory import get_llm

__all__ = ["ChatChunk", "ChatMessage", "LLMProvider", "get_llm"]
