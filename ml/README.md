# ml/ - LoRA fine-tuning and evaluation

Scaffold for specializing Gemma 4 E4B for grounded, cited answering. No adapter
has been trained yet. The data and evaluation code live in the backend (they reuse
the corpus, DB, and LLM); this directory holds the MLX training config, the model
card template, and the committed golden eval set.

```
finetune/     MLX-LM LoRA config (lora.yaml)
datasets/     golden.jsonl (committed eval set); generated train/valid splits are gitignored
adapters/     trained / merged adapters             (gitignored)
model_cards/  model card template (metrics TBD until a training run)
```

## Pipeline

```bash
# 1. Build a grounded dataset from the ingested corpus (teacher = local Gemma 4).
make dataset                       # -> ml/datasets/{train,valid}.jsonl

# 2. Train the LoRA on Apple Silicon (MLX-LM).
cd ml/finetune && mlx_lm.lora --config lora.yaml

# 3. Evaluate base vs adapter (citation validity + refusal accuracy).
make eval-lora                                   # base model
LLM_MODEL=gemma4-rag-merged make eval-lora       # after merge, compare

# 4. Merge + serve: fuse the adapter, convert to GGUF, load into Ollama.
cd ml/finetune && mlx_lm.fuse --model <base> \
    --adapter-path ../adapters/gemma4-rag-lora --save-path ../adapters/gemma4-rag-merged
```

**Objective of the LoRA:** teach Gemma 4 E4B (a) strict inline `[n]` citation format,
(b) faithful refusal when context is insufficient, (c) a consistent answer style. The
adapter ships only if `app.finetune.evaluate` shows it beats the base model. See the
[model card](model_cards/gemma4-rag-lora.md).
