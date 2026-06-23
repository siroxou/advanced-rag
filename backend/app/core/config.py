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

    # --- Embeddings / retrieval (Phase 1) ---------------------------------------
    embedding_model: str = "BAAI/bge-m3"
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    retrieval_top_k: int = 20
    rerank_top_k: int = 5

    # --- Database (Phase 1+) -----------------------------------------------------
    # App boots even if the DB is down; /api/health reports reachability.
    database_url: str = "postgresql+asyncpg://rag:rag@localhost:5432/rag"

    # --- Web search (Phase 3) ----------------------------------------------------
    tavily_api_key: str = ""

    # --- Observability (Phase 6) -------------------------------------------------
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # --- CORS --------------------------------------------------------------------
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
