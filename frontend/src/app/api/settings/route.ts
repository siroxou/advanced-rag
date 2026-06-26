/** Runtime settings (self-contained), persisted per-browser in cookies. The raw key
 * is stored in an httpOnly cookie and never returned - the snapshot exposes only
 * whether a user key is set and whether the shared demo key is in use. */

import { cookie, COOKIE, getSettings, snapshot, type DemoSettings } from "@/lib/demo/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(snapshot(req));
}

type Patch = Partial<{
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

export async function PUT(req: Request) {
  const p = (await req.json().catch(() => ({}))) as Patch;
  const cur = getSettings(req);

  const next: DemoSettings = {
    llm: {
      provider: p.provider ?? cur.llm.provider,
      model: p.model ?? cur.llm.model,
      base_url: p.base_url ?? cur.llm.base_url,
      enable_thinking: p.enable_thinking ?? cur.llm.enable_thinking,
    },
    gen: {
      temperature: p.temperature ?? cur.gen.temperature,
      max_tokens: p.max_tokens ?? cur.gen.max_tokens,
    },
    guardrails: {
      enabled: p.guardrails_enabled ?? cur.guardrails.enabled,
      injection: p.injection ?? cur.guardrails.injection,
      grounding: p.grounding ?? cur.guardrails.grounding,
      pii_detect: p.pii_detect ?? cur.guardrails.pii_detect,
      safety: p.safety ?? cur.guardrails.safety,
      pii_mask: p.pii_mask ?? cur.guardrails.pii_mask,
      safety_model: p.safety_model ?? cur.guardrails.safety_model,
    },
    ratelimit: {
      enabled: p.ratelimit_enabled ?? cur.ratelimit.enabled,
      per_minute: p.ratelimit_per_minute ?? cur.ratelimit.per_minute,
    },
  };

  const headers = new Headers();
  headers.append("Set-Cookie", cookie(COOKIE.settings, JSON.stringify(next)));
  // BYO key: an empty string clears it (revert to the shared demo key).
  if (p.openrouter_api_key !== undefined) {
    headers.append("Set-Cookie", cookie(COOKIE.key, p.openrouter_api_key, { httpOnly: true }));
  }

  // Return a snapshot reflecting the just-applied changes (no round-trip needed).
  const parts = [req.headers.get("cookie") ?? ""];
  parts.push(`${COOKIE.settings}=${encodeURIComponent(JSON.stringify(next))}`);
  if (p.openrouter_api_key !== undefined) {
    parts.push(`${COOKIE.key}=${encodeURIComponent(p.openrouter_api_key)}`);
  }
  const merged = new Request(req.url, { headers: { cookie: parts.filter(Boolean).join("; ") } });

  return Response.json(snapshot(merged), { headers });
}
