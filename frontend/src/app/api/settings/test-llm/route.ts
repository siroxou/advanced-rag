/** Probe the configured provider for reachability. */

import { health } from "@/lib/demo/openrouter";
import { getSettings, resolvedKey } from "@/lib/demo/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = getSettings(req);
  const key = resolvedKey(req);
  const ok = key ? await health(key, s.llm.base_url) : false;
  return Response.json({
    ok,
    provider: s.llm.provider,
    model: s.llm.model,
    detail: ok ? "reachable" : "unreachable (no API key configured for this demo)",
  });
}
