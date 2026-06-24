"""LoRA fine-tuning support (Phase 5): dataset generation and evaluation.

The MLX-LM training run itself lives in ``ml/`` (config + adapters + model card);
the data and eval code lives here because it reuses the corpus, DB, and LLM.
"""
