# ml/ - Fine-tuning & evaluation

Lands in **Phase 5-6**. Planned layout:

```
finetune/     LoRA training - MLX-LM (Apple Silicon) / Unsloth QLoRA (cloud GPU)
datasets/     synthetic grounded Q→A(+citations) + hard-negative refusals
eval/         RAGAS golden set (faithfulness, answer/context relevancy)
model_cards/  the published LoRA adapter's model card
```

**Objective of the LoRA:** teach Gemma 4 E4B (a) strict inline `[doc_id:chunk]` citation
format, (b) faithful refusal when context is insufficient, (c) a consistent answer style.
The adapter ships only if RAGAS faithfulness + citation accuracy improve over base.
