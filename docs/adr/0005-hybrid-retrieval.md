# 5. Hybrid retrieval: dense + sparse fused with RRF, then cross-encoder rerank

- **Status:** Accepted
- **Date:** 2026-06-23

## Context

Phase 1 needs retrieval that is both semantically strong and robust to exact-term
queries (names, codenames, identifiers) that dense embeddings alone often miss. It also
has to honour the per-row ACLs from [ADR-0004](0004-iac-as-artifact.md) /
[ADR-0003](0003-pgvector-rls-for-rbac.md) without leaking unauthorized rows into ranking.

## Decision

Run a **single SQL statement** that computes two first-stage rankings over the `chunks`
table and fuses them:

- **dense** - pgvector cosine nearest neighbours (`embedding <=> :qvec`) over an HNSW index,
  embeddings from **BGE-M3** (1024-dim, L2-normalized so cosine is a dot product).
- **sparse** - Postgres full-text `ts_rank_cd` over a generated `tsvector` GIN index.

The two arms are combined with **Reciprocal Rank Fusion** (`1/(k+rank)`, k=60). RRF needs no
score calibration between the two very different scales, which keeps the fusion robust and
parameter-light. The fused candidate pool (default 40) is then reranked by a **BGE
cross-encoder** (`bge-reranker-v2-m3`) and truncated to the top-k (default 6) sent to Gemma 4.

The ACL predicate `allowed_roles && :roles` is applied inside **both** arms, so a caller is
never even ranked against rows they cannot see. Phase 2 lifts this predicate into a Postgres
RLS policy; the application query stays the same.

## Consequences

- Strong recall (semantic + lexical) with high final precision from the cross-encoder, at the
  cost of loading a second model; both are lazy-loaded and run on Apple Metal (MPS) locally.
- One round-trip to Postgres for first-stage retrieval; reranking is in-process over a small pool.
- RRF avoids hand-tuned dense/sparse weighting. If needed later, weights can be added per arm.
- Chunking is a dependency-free recursive character splitter (target ~1800 chars, 200 overlap),
  which keeps ingestion simple and unit-testable; a semantic chunker can drop in later.
