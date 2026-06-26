# 9. Runtime settings and a provider gateway

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

Every operational knob lived in env vars read once at boot (`settings` singleton,
plus an `@lru_cache` on `get_llm`). Changing the model, plugging in an API key,
re-tiering a document, or toggling a guardrail meant editing `.env` and
restarting. For a portfolio that is meant to be poked at live, that is the wrong
ergonomics: an operator should be able to reconfigure the running system from the
UI and see the effect on the next request.

Two sub-decisions fall out of this: where runtime config lives, and how a viewer
of the demo can try a real frontier model without us shipping a vendor SDK per
provider or handing out our key uncapped.

## Decision

**A DB-backed runtime-settings overlay with hot-reload.** A key-value
`app_settings` table (migration 0004) plus a `RuntimeSettings` singleton
(`core/runtime_settings.py`) that loads once on startup and overlays the env
`settings` as defaults. Writes go through `update(patch)`, which upserts the row,
refreshes the in-memory cache, and resets the cached LLM provider so the next
`get_llm` rebuilds. `load` fails soft, so the app still boots with the DB down and
simply serves env defaults. Secrets are never returned by the API: the snapshot
reports `using_demo_key` / `*_key_set` booleans, not the key.

**OpenRouter as the model gateway.** OpenRouter speaks the OpenAI API, so the
existing `OpenAICompatibleProvider` reaches OpenAI, Anthropic, Google and dozens
more by model string with no per-vendor SDK. A shared demo key (gitignored
`backend/.env`, never committed) lets a visitor try Claude or GPT immediately; a
visitor can also paste their own OpenRouter key from the Settings page, which
overrides the demo key.

**A rate limit that protects the shared key, not the app.** A dependency-free
sliding-window ASGI middleware (`core/ratelimit.py`, pure ASGI so the SSE stream
is untouched) caps `/api/chat*` per client. It is enforced only when a request
would actually spend the shared demo key: local providers and bring-your-own keys
are never throttled.

## Consequences

- The model, generation defaults, per-guardrail toggles, PII masking, and the
  rate limit are all changeable from the UI and apply on the next request, with no
  restart. `/api/health` reports the live model.
- Re-classifying a document (`PUT /api/documents/{id}`) cascades the new
  `allowed_roles` to every chunk, because RLS is enforced at the chunk level; the
  UPDATE runs under the `app.user_roles` GUC so it passes the FORCE-RLS policy.
- Adding a native vendor SDK (for streaming features OpenRouter does not expose)
  remains possible behind the same `LLMProvider` protocol; nothing here forecloses
  it.
- The demo stores a BYO key in plaintext in the demo DB and keeps the shared key
  in a local env file. That is a demo posture, not production: a real deployment
  would use a secrets manager or an encrypted column. The shared key is masked on
  read and capped by the rate limit.
