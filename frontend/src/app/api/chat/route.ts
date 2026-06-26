/** Non-streaming grounded chat (self-contained), returning the ChatResponse shape. */

import { checkInjection, detectPii, maskPii, validateCitations } from "@/lib/demo/guardrails";
import { chatOnce } from "@/lib/demo/openrouter";
import { buildMessages, NO_CONTEXT_MSG } from "@/lib/demo/prompt";
import { retrieve } from "@/lib/demo/retrieval";
import { getOverrides, getRoles, getSettings, resolvedKey } from "@/lib/demo/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  messages?: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  max_tokens?: number;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const messages = body.messages ?? [];
  const last = [...messages].reverse().find((m) => m.role === "user");
  const query = (last?.content ?? "").trim();
  const history = messages.filter((m) => m !== last);

  const roles = getRoles(req);
  const settings = getSettings(req);
  const g = settings.guardrails;

  if (g.enabled && g.injection && checkInjection(query).blocked) {
    return Response.json({
      content: "Your request was blocked by input guardrails. (possible prompt injection or jailbreak attempt)",
      model: settings.llm.model,
      sources: [],
      rewritten_query: query,
      used_web: false,
      guardrails: { input_blocked: true, block_reason: "possible prompt injection or jailbreak attempt", grounding_ok: true, invalid_citations: [], pii_found: [] },
    });
  }

  const retrieved = retrieve(query, roles, getOverrides(req));
  const sources = retrieved.map((r) => ({
    n: r.n,
    doc_id: r.chunk.doc_id,
    source_id: r.chunk.source_id,
    citation_anchor: r.chunk.citation_anchor,
    page: r.chunk.page,
    score: Number(r.score.toFixed(3)),
  }));

  if (sources.length === 0) {
    return Response.json({
      content: NO_CONTEXT_MSG,
      model: settings.llm.model,
      sources: [],
      rewritten_query: query,
      used_web: false,
      guardrails: { input_blocked: false, block_reason: null, grounding_ok: true, invalid_citations: [], pii_found: [] },
    });
  }

  let content: string;
  try {
    content = await chatOnce({
      key: resolvedKey(req),
      model: settings.llm.model,
      baseUrl: settings.llm.base_url,
      messages: buildMessages(query, retrieved, history),
      temperature: body.temperature ?? settings.gen.temperature,
      maxTokens: body.max_tokens ?? settings.gen.max_tokens,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unavailable";
    return Response.json({ content: `The demo model is unavailable: ${msg}.`, model: settings.llm.model, sources, rewritten_query: query, used_web: false, guardrails: { input_blocked: false, block_reason: null, grounding_ok: true, invalid_citations: [], pii_found: [] } });
  }

  const grounding = g.enabled && g.grounding ? validateCitations(content, sources.length) : { ok: true, invalid: [] as number[] };
  let piiFound: string[] = [];
  if (g.enabled && g.pii_mask) {
    const masked = maskPii(content);
    if (masked.found.length) {
      content = masked.masked;
      piiFound = masked.found;
    }
  } else if (g.enabled && g.pii_detect) {
    piiFound = detectPii(content);
  }

  return Response.json({
    content,
    model: settings.llm.model,
    sources,
    rewritten_query: query,
    used_web: false,
    guardrails: { input_blocked: false, block_reason: null, grounding_ok: grounding.ok, invalid_citations: grounding.invalid, pii_found: piiFound },
  });
}
