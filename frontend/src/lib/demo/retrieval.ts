/**
 * Lightweight lexical retrieval over the bundled corpus, RBAC-filtered by the
 * caller's roles. The real backend uses hybrid dense + sparse retrieval with a
 * cross-encoder rerank over pgvector; here a transparent term-overlap score is
 * enough to demonstrate the behaviour that matters for the demo: only chunks the
 * role is cleared for are even considered, and the answer cites what it used.
 */

import { DEMO_CHUNKS, type DemoChunk } from "./corpus";

export type DocOverride = { sensitivity: string; allowed_roles: string[] };

export type Retrieved = {
  chunk: DemoChunk;
  score: number;
  n: number;
};

const STOP = new Set([
  "the", "a", "an", "is", "are", "was", "were", "of", "to", "in", "on", "for",
  "and", "or", "what", "which", "who", "how", "does", "do", "did", "with", "at",
  "by", "this", "that", "it", "its", "as", "be", "can", "about", "tell", "me",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

function effectiveRoles(chunk: DemoChunk, overrides: Record<string, DocOverride>): string[] {
  return overrides[chunk.doc_id]?.allowed_roles ?? chunk.allowed_roles;
}

export function retrieve(
  query: string,
  roles: string[],
  overrides: Record<string, DocOverride> = {},
  topK = 4
): Retrieved[] {
  const roleSet = new Set(roles);
  const qTerms = tokenize(query);
  const qSet = new Set(qTerms);

  const scored = DEMO_CHUNKS
    // RBAC: only chunks the caller's roles overlap are visible at all.
    .filter((c) => effectiveRoles(c, overrides).some((r) => roleSet.has(r)))
    .map((chunk) => {
      const terms = tokenize(`${chunk.title} ${chunk.content}`);
      let overlap = 0;
      for (const t of terms) if (qSet.has(t)) overlap += 1;
      const score = qTerms.length ? overlap / Math.sqrt(qTerms.length * terms.length) : 0;
      return { chunk, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map((s, i) => ({ chunk: s.chunk, score: s.score, n: i + 1 }));
}
