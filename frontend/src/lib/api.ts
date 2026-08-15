/**
 * API client for the Enterprise Agentic RAG backend.
 *
 * Only what the pages actually import lives here. Chat streaming is deliberately
 * absent: the stream carries `plan`, `step`, and `content_masked` frames that
 * drive the agent timeline and PII masking, so `chat/page.tsx` consumes it
 * directly rather than through a wrapper that would have to mirror every frame.
 */

// Empty default = same-origin: the app talks to its own Next.js route handlers
// (the self-contained Vercel demo). Point NEXT_PUBLIC_API_URL at the FastAPI
// backend (e.g. http://localhost:8000) to run against the full local stack.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Forward the role switcher's choice to the FastAPI backend.
 *
 * The Next.js demo handlers read the `demo_roles` cookie directly, but a request
 * to a separate origin never carries it, so the role switcher would silently do
 * nothing against the real backend. The header is only honoured while auth is
 * off, and it authorizes nothing: the roles are handed to the Postgres RLS
 * policy, which is what actually decides the answer.
 */
export function demoHeaders(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const m = document.cookie.match(/(?:^|;\s*)demo_roles=([^;]+)/);
  return m ? { "X-Demo-Roles": decodeURIComponent(m[1]) } : {};
}

export type Source = {
  n: number;
  doc_id: string;
  source_id: string;
  citation_anchor: string;
  page: number;
  score: number;
};

export type DocumentInfo = {
  id: string;
  source_id: string;
  title: string;
  uri: string | null;
  n_pages: number;
  sensitivity: string;
  classification_reason: string | null;
  auto_classified: boolean;
  created_at: string;
};

export type DocumentChunk = {
  id: string;
  page: number;
  chunk_index: number;
  content: string;
  citation_anchor: string;
};

export type AuditEntry = {
  id: string;
  ts: string;
  username: string;
  roles: string[];
  query: string;
  retrieved_doc_ids: string[];
  latency_ms: number;
  used_web: boolean;
};

export type AdminUser = {
  id: string;
  username: string;
  roles: string[];
  is_active: boolean;
  created_at: string;
};

// ── Documents ─────────────────────────────────────────────────────────────────

export async function updateDocument(
  docId: string,
  sensitivity: string,
  roles: string[]
): Promise<DocumentInfo> {
  const res = await fetch(`${API_BASE}/api/documents/${docId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...demoHeaders() },
    body: JSON.stringify({ sensitivity, allowed_roles: roles }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Update failed (${res.status}): ${err}`);
  }
  return res.json();
}

// ── Settings ───────────────────────────────────────────────────────────────────

export type RuntimeSettings = {
  llm: {
    provider: string;
    model: string;
    base_url: string;
    enable_thinking: boolean;
    openrouter_user_key_set: boolean;
    using_demo_key: boolean;
  };
  gen: { temperature: number; max_tokens: number };
  guardrails: {
    enabled: boolean;
    injection: boolean;
    grounding: boolean;
    pii_detect: boolean;
    safety: boolean;
    pii_mask: boolean;
    safety_model: string;
  };
  ratelimit: { enabled: boolean; per_minute: number };
};

export type SettingsPatch = Partial<{
  provider: string;
  model: string;
  base_url: string;
  enable_thinking: boolean;
  openrouter_api_key: string;
  temperature: number;
  max_tokens: number;
  guardrails_enabled: boolean;
  injection: boolean;
  grounding: boolean;
  pii_detect: boolean;
  safety: boolean;
  pii_mask: boolean;
  safety_model: string;
  ratelimit_enabled: boolean;
  ratelimit_per_minute: number;
}>;

export async function getSettings(): Promise<RuntimeSettings> {
  const res = await fetch(`${API_BASE}/api/settings`, { headers: demoHeaders() });
  if (!res.ok) throw new Error(`Get settings failed (${res.status})`);
  return res.json();
}

export async function updateSettings(patch: SettingsPatch): Promise<RuntimeSettings> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...demoHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Update settings failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function listModels(): Promise<{ models: string[]; source: string }> {
  const res = await fetch(`${API_BASE}/api/settings/models`, { headers: demoHeaders() });
  if (!res.ok) throw new Error(`List models failed (${res.status})`);
  return res.json();
}

export async function testLlm(): Promise<{
  ok: boolean;
  provider: string;
  model: string;
  detail: string;
}> {
  const res = await fetch(`${API_BASE}/api/settings/test-llm`, {
    method: "POST",
    headers: demoHeaders(),
  });
  if (!res.ok) throw new Error(`Test failed (${res.status})`);
  return res.json();
}
