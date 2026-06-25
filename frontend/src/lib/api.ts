/**
 * API client for the Enterprise Agentic RAG backend.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "rag_token";

export type User = { username: string; roles: string[] };

export type TokenResponse = {
  access_token: string;
  token_type: string;
  username: string;
  roles: string[];
};

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export type Source = {
  n: number;
  doc_id: string;
  source_id: string;
  citation_anchor: string;
  page: number;
  score: number;
};

export type GuardrailReport = {
  input_blocked: boolean;
  block_reason: string | null;
  grounding_ok: boolean;
  invalid_citations: number[];
  pii_found: string[];
};

export type ChatResponse = {
  content: string;
  model: string;
  sources: Source[];
  rewritten_query: string | null;
  used_web: boolean;
  guardrails: GuardrailReport;
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

export type SensitivityLevel = {
  value: string;
  label: string;
  description: string;
  color: string;
};

export type HealthStatus = {
  status: string;
  environment: string;
  llm_provider: string;
  llm_model: string;
  llm_reachable: boolean;
  db_reachable: boolean;
};

// ── Auth ─────────────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(
  username: string,
  password: string
): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 ? "Invalid username or password" : `Login failed (${res.status})`
    );
  }
  return res.json();
}

export async function fetchMe(token: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("unauthorized");
  return res.json();
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function sendChat(
  token: string,
  messages: ChatTurn[],
  options?: { temperature?: number; max_tokens?: number; use_rag?: boolean }
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.max_tokens ?? 1024,
      use_rag: options?.use_rag ?? true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function* streamChat(
  token: string,
  messages: ChatTurn[],
  options?: { temperature?: number; max_tokens?: number; use_rag?: boolean }
): AsyncIterable<{
  type: "meta" | "delta" | "guardrails" | "done";
  sources?: Source[];
  rewritten_query?: string;
  used_web?: boolean;
  delta?: string;
  guardrails?: GuardrailReport;
}> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.max_tokens ?? 1024,
      use_rag: options?.use_rag ?? true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat stream failed (${res.status}): ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6);
      if (json === "[DONE]") {
        yield { type: "done" };
        continue;
      }
      try {
        const parsed = JSON.parse(json);
        if (parsed.sources !== undefined || parsed.rewritten_query !== undefined) {
          yield {
            type: "meta",
            sources: parsed.sources,
            rewritten_query: parsed.rewritten_query,
            used_web: parsed.used_web,
          };
        } else if (parsed.delta !== undefined) {
          yield { type: "delta", delta: parsed.delta };
        } else if (parsed.guardrails) {
          yield { type: "guardrails", guardrails: parsed.guardrails };
        }
      } catch {
        // skip malformed frames
      }
    }
  }
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function uploadDocument(
  token: string,
  file: File,
  sensitivity: string,
  roles: string
): Promise<Record<string, unknown>> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sensitivity", sensitivity);
  formData.append("allowed_roles", roles);

  const res = await fetch(`${API_BASE}/api/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function listDocuments(
  token: string
): Promise<DocumentInfo[]> {
  const res = await fetch(`${API_BASE}/api/documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List documents failed (${res.status})`);
  return res.json();
}

export async function deleteDocument(
  token: string,
  docId: string
): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/documents/${docId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
  return res.json();
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function listUsers(token: string): Promise<AdminUser[]> {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List users failed (${res.status})`);
  return res.json();
}

export async function createUser(
  token: string,
  username: string,
  password: string,
  roles: string
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ username, password, roles });
  const res = await fetch(`${API_BASE}/api/admin/users?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create user failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function updateUserRoles(
  token: string,
  username: string,
  roles: string
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${API_BASE}/api/admin/users/${encodeURIComponent(username)}/roles?roles=${encodeURIComponent(roles)}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error(`Update roles failed (${res.status})`);
  return res.json();
}

export async function toggleUserActive(
  token: string,
  username: string
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${API_BASE}/api/admin/users/${encodeURIComponent(username)}/toggle`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error(`Toggle user failed (${res.status})`);
  return res.json();
}

export async function getSensitivityLevels(): Promise<{
  levels: SensitivityLevel[];
  default: string;
}> {
  const res = await fetch(`${API_BASE}/api/admin/sensitivity-levels`);
  if (!res.ok) throw new Error(`Get sensitivity levels failed (${res.status})`);
  return res.json();
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export async function getAuditLog(
  token: string,
  limit: number,
  offset: number
): Promise<{ total: number; entries: AuditEntry[] }> {
  const res = await fetch(
    `${API_BASE}/api/audit?limit=${limit}&offset=${offset}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error(`Get audit log failed (${res.status})`);
  return res.json();
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}
