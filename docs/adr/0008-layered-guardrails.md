# 8. Layered guardrails

- **Status:** Accepted
- **Date:** 2026-06-24

## Context

A production RAG system needs defense at more than one layer: stop malicious or unsafe input
before it reaches the model, and check the model's output before it reaches the user. Phase 4
adds these without coupling the app to any one heavy dependency.

## Decision

A small `app/guardrails/` package, each check returning a common `Verdict` so a heavier
implementation can drop in behind the same signature:

**Input (blocking, before any retrieval or generation):**
- **injection** - a dependency-free regex detector for prompt-injection / jailbreak phrases
  ("ignore previous instructions", "reveal the system prompt", "developer mode", ...). Blocks
  the request outright. A trained classifier can replace it behind `injection.check`.
- **safety** - optional ShieldGemma-style classification via the existing LLM abstraction. A
  no-op unless `GUARDRAILS_SAFETY_MODEL` is set, so the default path adds no latency; fails open
  on infra error.

**Output (annotating, after generation):**
- **grounding** - every inline `[n]` citation must point to a real source; out-of-range
  citations are flagged. This catches the most visible form of hallucination in a cited answer.
- **pii** - a regex reference detector (email, phone, SSN, card) standing in for Presidio behind
  the same `detect` call.

Verdicts are returned to the client (a `guardrails` field / SSE frame the UI surfaces) and
written to the structured logs; the audit log already records the query and answer hash.

## Consequences

- Demonstrable: an injection prompt is blocked before retrieval; an answer citing a non-existent
  source is flagged in the UI.
- Output checks are non-blocking by default (informational), so a flagged-but-harmless answer
  still reaches the user with a visible warning rather than being silently dropped. Blocking
  output policies can be layered on the same verdicts later.
- The heavy options (ShieldGemma, Presidio, a trained injection model) are wired as drop-in
  points, not hard dependencies - matching the project's lean-by-default posture.
- A second-pass critic/grounding *agent* (re-retrieve and refine) remains future work.
