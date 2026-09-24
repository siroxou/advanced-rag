"""Static OpenRouter price table -> local cost estimate.

Langfuse computes cost for *traces* from the model id; this gives the always-on
audit store (Postgres) its own cost number so the /metrics dashboard works even when
Langfuse is disabled. Prices are USD per 1M tokens ``(input, output)`` and drift over
time - refresh from https://openrouter.ai/models when they change.

ponytail: a dict, not a pricing service. An unknown model (or missing usage, e.g. a
local Ollama run) returns ``None`` - the dashboard treats that as "cost untracked"
and SQL ``avg()`` skips it, rather than us inventing a misleading $0.00.
"""

from __future__ import annotations

from app.llm.base import Usage

# model id -> ($/1M input tokens, $/1M output tokens). Source: openrouter.ai/models.
_PRICES: dict[str, tuple[float, float]] = {
    "anthropic/claude-sonnet-4.5": (3.0, 15.0),
    "anthropic/claude-haiku-4.5": (1.0, 5.0),
    "openai/gpt-4o": (2.5, 10.0),
    "openai/gpt-4o-mini": (0.15, 0.6),
    "google/gemini-2.0-flash-001": (0.1, 0.4),
    "meta-llama/llama-3.3-70b-instruct": (0.12, 0.3),
}


def cost(model: str, usage: Usage | None) -> float | None:
    """Estimate USD cost for one completion; None when usage or the model price is unknown."""
    if usage is None:
        return None
    price = _PRICES.get(model)
    if price is None:
        return None
    in_per_m, out_per_m = price
    return round(
        usage.prompt_tokens / 1_000_000 * in_per_m
        + usage.completion_tokens / 1_000_000 * out_per_m,
        6,
    )


if __name__ == "__main__":  # ponytail self-check: the money path is non-trivial
    u = Usage(prompt_tokens=1_000_000, completion_tokens=1_000_000, total_tokens=2_000_000)
    assert cost("openai/gpt-4o", u) == 12.5  # 2.5 in + 10.0 out
    assert cost("unknown/model", u) is None  # unknown price -> untracked
    assert cost("openai/gpt-4o", None) is None  # no usage -> untracked
    print("pricing self-check ok")
