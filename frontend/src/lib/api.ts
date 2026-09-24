/**
 * API client for the Enterprise Agentic RAG backend.
 *
 * Only what the pages actually import lives here. Chat streaming is deliberately
 * absent: the stream carries `plan`, `step`, and `content_masked` frames that
 * drive the agent timeline and PII masking, so `chat/page.tsx` consumes it
 * directly rather than through a wrapper that would have to mirror every frame.
 */

import { useSyncExternalStore } from "react";

// Empty default = same-origin: the app talks to its own Next.js route handlers
// (the self-contained Vercel demo). Point NEXT_PUBLIC_API_URL at the FastAPI
// backend (e.g. http://localhost:8000) to run against the full local stack.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * True when the app is serving its own bundled corpus rather than talking to the
 * FastAPI stack. Ingestion, uploads and user management need the real backend, so
 * the UI says so up front instead of offering controls that can only fail.
 */
export const IS_HOSTED_DEMO = API_BASE === "";

/**
 * Headers every request to the backend carries.
 *
 * Signed in (full stack only), that is the bearer token: writes demand a signed
 * token carrying `admin`, and the token's roles are what RLS then sees. Signed
 * out, it is the role switcher's choice. The Next.js demo handlers read the
 * `demo_roles` cookie directly, but a request to a separate origin never carries
 * it, so the header forwards it. The backend honours that header only for reads
 * (the RLS policy and whether the agent may search the web); it never unlocks a
 * write or anyone else's audit rows.
 */
export function demoHeaders(): Record<string, string> {
  if (typeof document === "undefined") return {};
  if (session()) return { Authorization: `Bearer ${readToken()}` };
  const m = document.cookie.match(/(?:^|;\s*)demo_roles=([^;]+)/);
  return m ? { "X-Demo-Roles": decodeURIComponent(m[1]) } : {};
}

// ── Session (full stack only) ─────────────────────────────────────────────────

const TOKEN_KEY = "rag_token";

export type Session = { sub: string; roles: string[]; exp: number };

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // storage blocked (private window, disabled site data)
  }
}

/**
 * The signed-in user, decoded from the stored JWT. Verifying the signature is the
 * backend's job. Expiry is checked here because the backend answers an expired
 * token as the demo identity rather than with a 401, so nothing else would notice.
 */
export function session(): Session | null {
  if (IS_HOSTED_DEMO || typeof window === "undefined") return null;
  const token = readToken();
  if (!token) return null;
  try {
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!(claims.exp * 1000 > Date.now())) return null;
    return { sub: String(claims.sub), roles: claims.roles ?? [], exp: claims.exp };
  } catch {
    return null;
  }
}

function onStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

/** Render-safe session: null on the server and during hydration, then the token's claims. */
export function useSession(): Session | null {
  const token = useSyncExternalStore(
    onStorage,
    () => (session() ? readToken() : null),
    () => null
  );
  return token ? session() : null;
}

/** Every write needs a signed token carrying `admin`; any other role gets a 403. */
export function useIsAdmin(): boolean {
  return !!useSession()?.roles.includes("admin");
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) throw new Error("Invalid username or password");
  if (!res.ok) throw new Error(`Sign-in failed (${res.status})`);
  const { access_token } = await res.json();
  localStorage.setItem(TOKEN_KEY, access_token);
}

export function signOut(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing stored, nothing to clear
  }
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
    /** True when this provider needs a key and none is stored yet. */
    needs_key?: boolean;
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
  /** Provider-neutral key field; an empty string clears the stored key. */
  api_key: string;
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

// ── Metrics ───────────────────────────────────────────────────────────────────

export type MetricPoint = {
  n: number;
  p50_ms: number | null;
  p95_ms: number | null;
  avg_cost_usd: number | null;
  citation_coverage: number | null;
  failure_rate: number | null;
};

export type MetricsResponse = {
  window: string;
  bucket: string;
  overall: MetricPoint;
  series: (MetricPoint & { bucket: string })[];
};

/** Admin-only: the aggregate covers every user's queries in the audit log. */
export async function getMetrics(windowSize = "7d", bucket = "day"): Promise<MetricsResponse> {
  const res = await fetch(`${API_BASE}/api/metrics?window=${windowSize}&bucket=${bucket}`, {
    headers: demoHeaders(),
  });
  if (!res.ok) throw new Error(`Get metrics failed (${res.status})`);
  return res.json();
}
