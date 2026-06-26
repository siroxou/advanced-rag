/**
 * Per-browser demo state, persisted in cookies so the self-contained demo behaves
 * statefully on serverless (no database). Roles drive the simulated RBAC; settings
 * carry the guardrail toggles and model choice; overrides hold in-place document
 * re-tiering. A bring-your-own OpenRouter key is kept in an httpOnly cookie so it
 * is never readable by client JS, and is used server-side in place of the shared
 * demo key.
 */

import type { DocOverride } from "./retrieval";

export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const ALL_ROLES = ["viewer", "analyst", "admin"];

export const COOKIE = {
  roles: "demo_roles",
  settings: "demo_settings",
  overrides: "demo_overrides",
  key: "demo_key",
} as const;

export type DemoSettings = {
  llm: {
    provider: string;
    model: string;
    base_url: string;
    enable_thinking: boolean;
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

export const DEFAULT_SETTINGS: DemoSettings = {
  llm: {
    provider: "openrouter",
    model: DEFAULT_MODEL,
    base_url: OPENROUTER_BASE,
    enable_thinking: false,
  },
  gen: { temperature: 0.2, max_tokens: 1024 },
  guardrails: {
    enabled: true,
    injection: true,
    grounding: true,
    pii_detect: true,
    safety: true,
    pii_mask: false,
    safety_model: "",
  },
  ratelimit: { enabled: false, per_minute: 20 },
};

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function readJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getRoles(req: Request): string[] {
  const raw = parseCookies(req)[COOKIE.roles];
  if (!raw) return [...ALL_ROLES];
  const roles = raw.split(",").map((r) => r.trim()).filter(Boolean);
  return roles.length ? roles : [...ALL_ROLES];
}

function deepMerge(base: DemoSettings, patch: Partial<DemoSettings>): DemoSettings {
  return {
    llm: { ...base.llm, ...(patch.llm ?? {}) },
    gen: { ...base.gen, ...(patch.gen ?? {}) },
    guardrails: { ...base.guardrails, ...(patch.guardrails ?? {}) },
    ratelimit: { ...base.ratelimit, ...(patch.ratelimit ?? {}) },
  };
}

export function getSettings(req: Request): DemoSettings {
  const stored = readJson<Partial<DemoSettings>>(parseCookies(req)[COOKIE.settings], {});
  return deepMerge(DEFAULT_SETTINGS, stored);
}

export function getOverrides(req: Request): Record<string, DocOverride> {
  return readJson<Record<string, DocOverride>>(parseCookies(req)[COOKIE.overrides], {});
}

export function getUserKey(req: Request): string {
  return parseCookies(req)[COOKIE.key] ?? "";
}

export function usingDemoKey(req: Request): boolean {
  return !getUserKey(req) && !!process.env.OPENROUTER_API_KEY;
}

export function resolvedKey(req: Request): string {
  return getUserKey(req) || process.env.OPENROUTER_API_KEY || "";
}

/** Public snapshot for GET /api/settings - never includes the raw key. */
export function snapshot(req: Request): Record<string, unknown> {
  const s = getSettings(req);
  return {
    llm: {
      ...s.llm,
      openrouter_user_key_set: !!getUserKey(req),
      using_demo_key: usingDemoKey(req),
    },
    gen: s.gen,
    guardrails: s.guardrails,
    ratelimit: s.ratelimit,
  };
}

export function cookie(name: string, value: string, opts: { httpOnly?: boolean } = {}): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "Max-Age=2592000",
    "SameSite=Lax",
  ];
  if (opts.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}
