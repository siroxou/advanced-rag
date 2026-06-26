/** Health for the self-contained demo. */

import { getSettings, resolvedKey } from "@/lib/demo/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = getSettings(req);
  return Response.json({
    status: "ok",
    environment: "vercel-demo",
    llm_provider: s.llm.provider,
    llm_model: s.llm.model,
    llm_reachable: !!resolvedKey(req),
    db_reachable: true,
  });
}
