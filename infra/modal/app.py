"""Modal deployment: the FastAPI backend plus a scale-to-zero vLLM GPU service.

    modal deploy infra/modal/app.py

This is the cloud-demo path (ADR-0004): a serverless GPU that scales to zero, so
the recruiter-facing demo costs ~nothing while idle. Secrets (DATABASE_URL,
JWT_SECRET, TAVILY_API_KEY, ...) come from a Modal Secret named "advanced-rag";
DATABASE_URL points at managed Postgres (Neon/Supabase) with pgvector.
"""

from __future__ import annotations

import modal

app = modal.App("advanced-rag")

backend_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("uv")
    .add_local_dir("backend", "/app/backend", copy=True)
    .run_commands("cd /app/backend && uv sync --extra ml")
)

vllm_image = modal.Image.debian_slim(python_version="3.12").pip_install("vllm>=0.6")

secrets = [modal.Secret.from_name("advanced-rag")]


@app.function(image=vllm_image, gpu="L4", scaledown_window=300, secrets=secrets)
@modal.web_server(port=8000, startup_timeout=600)
def vllm() -> None:
    import subprocess

    # Serve a merged Gemma 4 (+ optional LoRA) over the OpenAI-compatible API.
    subprocess.Popen(
        ["vllm", "serve", "google/gemma-4-e4b-it", "--port", "8000"]
    )


@app.function(image=backend_image, secrets=secrets, min_containers=0)
@modal.asgi_app()
def api():
    import sys

    sys.path.insert(0, "/app/backend")
    from app.main import app as fastapi_app

    return fastapi_app
