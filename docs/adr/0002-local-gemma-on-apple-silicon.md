# 2. Local Gemma 4 on Apple Silicon (Ollama / MLX, not vLLM)

- **Status:** Accepted
- **Date:** 2026-06-23

## Context

The local/secure profile must run on a MacBook (Apple Silicon). vLLM - the standard
high-throughput server - is effectively CUDA-only and does not run well on Macs.
Gemma 4 is also a *reasoning* model: it emits chain-of-thought separately from the final
answer, and a small token budget can be entirely consumed by reasoning, returning empty
`content`.

## Decision

- **Local inference:** Ollama (default) or MLX-LM, both Metal-accelerated, both exposing an
  OpenAI-compatible API. **Cloud inference:** vLLM on a serverless GPU (Modal).
- A single `OpenAICompatibleProvider` abstracts all three; only `base_url` / `model` change.
- Handle Gemma 4 reasoning explicitly: a `think` toggle (Ollama extension, default off for
  the answer path) **and** a token-budget floor so the final answer always lands.
- **Local LoRA** uses MLX-LM (Apple Silicon native); **cloud LoRA** uses Unsloth QLoRA.

## Consequences

- One codebase, two profiles, switched by env vars.
- We accept a small "wasted" token cost when Gemma still thinks; correctness over savings.
- vLLM-specific reasoning control is configured at serve time, not in app code.
