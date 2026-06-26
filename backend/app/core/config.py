"""Application configuration (12-factor, env-driven).

The same codebase serves the **local/secure** (MacBook, Ollama) and **cloud/demo**
(vLLM on Modal) profiles. Only these env vars change between them.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    app_name: str = "Enterprise Agentic RAG"
    environment: str = "local"  # local | cloud
    log_level: str = "INFO"

    # --- LLM (OpenAI-compatible) -------------------------------------------------
    # Local default = Ollama serving Gemma 4. Cloud = vLLM (same interface).
    llm_provider: str = "ollama"
    llm_model: str = "gemma4:latest"
    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = "ollama"  # Ollama ignores this; vLLM may require a token.
    # Gemma 4 is a reasoning model. Off by default so the answer path is fast and
    # always returns final `content` (not chain-of-thought). Agents can opt in.
    llm_enable_thinking: bool = False
    # Shared OpenRouter key for the hosted demo (one OpenAI-compatible gateway that
    # routes to OpenAI / Anthropic / Google / many models). Empty locally; the real
    # key lives only in the gitignored .env. Users can override with their own key
    # from the Settings page, which also lifts the demo rate limit.
    openrouter_api_key: str = ""
    # Default generation params, used when a request omits them. Runtime-overridable.
    gen_temperature: float = 0.2
    gen_max_tokens: int = 1024

    # --- Embeddings / retrieval (Phase 1) ---------------------------------------
    embedding_model: str = "BAAI/bge-m3"
    embedding_dim: int = 1024  # BGE-M3 dense dimension
    embedding_device: str = "auto"  # auto resolves to mps on Apple Silicon, else cpu
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    chunk_chars: int = 1800  # target chunk window (~450 tokens)
    chunk_overlap: int = 200
    retrieval_candidates: int = 40  # hybrid pool size fed to the reranker
    retrieval_top_k: int = 6  # chunks kept after rerank and sent to the LLM
    rrf_k: int = 60  # reciprocal-rank-fusion damping constant
    # Roles a request carries until Phase 2 derives them from a verified JWT.
    default_roles: str = "viewer"

    # --- Database (Phase 1+) -----------------------------------------------------
    # App boots even if the DB is down; /api/health reports reachability.
    database_url: str = "postgresql+asyncpg://rag:rag@localhost:5432/rag"

    # --- Auth (Phase 2) ----------------------------------------------------------
    # CHANGE in production. The signed JWT carries the user's roles, which the
    # retriever pushes into the Postgres RLS policy - so roles cannot be spoofed.
    jwt_secret: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720  # 12h dev sessions
    # Portfolio demo runs without a login wall: requests with no/invalid JWT fall
    # back to a demo identity carrying ``demo_roles``. The RLS machinery is
    # unchanged - these roles still flow into the Postgres policy. Set
    # ``auth_required=true`` to restore the hard JWT gate.
    auth_required: bool = False
    demo_username: str = "demo"
    demo_roles: str = "viewer,analyst,admin"

    # --- Web search (Phase 3) ----------------------------------------------------
    tavily_api_key: str = ""

    # --- Guardrails (Phase 4) ----------------------------------------------------
    # Master kill switch. Per-guardrail toggles below are AND-ed with this, and all
    # are runtime-overridable from the Settings page.
    guardrails_enabled: bool = True
    guardrails_injection: bool = True
    guardrails_grounding: bool = True
    guardrails_pii_detect: bool = True
    guardrails_safety: bool = True
    # Mask detected PII (emails, SSNs, cards) in the answer instead of only flagging
    # it. Off by default so answers stay verbatim unless an operator opts in.
    guardrails_pii_mask: bool = False
    # Optional ShieldGemma-style safety model served via the same OpenAI-compatible
    # endpoint. Empty = safety classification skipped (injection + grounding + PII
    # still run, with no extra latency).
    guardrails_safety_model: str = ""

    # --- Rate limiting -----------------------------------------------------------
    # Protects the shared demo OpenRouter key. Only enforced when a request would
    # actually spend the demo key (skipped for local providers and BYO keys), so
    # local development is never throttled. Runtime-overridable.
    ratelimit_enabled: bool = True
    ratelimit_per_minute: int = 1

    # --- Observability (Phase 6) -------------------------------------------------
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # --- CORS --------------------------------------------------------------------
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def default_role_list(self) -> list[str]:
        return [r.strip() for r in self.default_roles.split(",") if r.strip()]

    @property
    def demo_role_list(self) -> list[str]:
        return [r.strip() for r in self.demo_roles.split(",") if r.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
