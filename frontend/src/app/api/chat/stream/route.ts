/**
 * Self-contained grounded chat (SSE), mirroring the FastAPI contract the UI speaks:
 * a plan frame, a step frame per agent node, a sources frame, streamed token deltas
 * from OpenRouter, an optional masked-content frame, then a guardrails frame.
 */

import {
  checkInjection,
  maskPii,
  detectPii,
  validateCitations,
} from "@/lib/demo/guardrails";
import { streamChat } from "@/lib/demo/openrouter";
import { buildMessages, NO_CONTEXT_MSG } from "@/lib/demo/prompt";
import { retrieve } from "@/lib/demo/retrieval";
import { getOverrides, getRoles, getSettings, resolvedKey } from "@/lib/demo/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEP_LABELS: Record<string, string> = {
  context: "Understanding the question",
  retrieve: "Searching the knowledge base",
  compose: "Assembling grounded context",
  answer: "Generating the answer",
};
const PLAN = ["context", "retrieve", "compose", "answer"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const overrides = getOverrides(req);
  const key = resolvedKey(req);
  const g = settings.guardrails;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const done = () => {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      // --- Input guardrails (blocking) ---
      if (g.enabled && g.injection && checkInjection(query).blocked) {
        send({ guardrails: { input_blocked: true, block_reason: "possible prompt injection or jailbreak attempt" } });
        send({ delta: "Your request was blocked by input guardrails. (possible prompt injection or jailbreak attempt)" });
        done();
        return;
      }

      try {
        // --- Plan + agent steps ---
        send({ plan: PLAN.map((n) => ({ node: n, label: STEP_LABELS[n] })) });
        await sleep(250);
        send({ step: { node: "context", label: STEP_LABELS.context, status: "done", detail: { rewritten_query: query, need_web: false } } });

        await sleep(300);
        const retrieved = retrieve(query, roles, overrides);
        send({ step: { node: "retrieve", label: STEP_LABELS.retrieve, status: "done", detail: { chunks: retrieved.length } } });

        await sleep(250);
        const sources = retrieved.map((r) => ({
          n: r.n,
          doc_id: r.chunk.doc_id,
          source_id: r.chunk.source_id,
          citation_anchor: r.chunk.citation_anchor,
          page: r.chunk.page,
          score: Number(r.score.toFixed(3)),
        }));
        send({ step: { node: "compose", label: STEP_LABELS.compose, status: "done", detail: { sources: sources.length } } });
        send({ sources, rewritten_query: query, used_web: false });

        if (sources.length === 0) {
          // RBAC refusal or genuinely no match: never fabricate.
          send({ delta: NO_CONTEXT_MSG });
          done();
          return;
        }

        // --- Synthesis (real streaming) ---
        const msgs = buildMessages(query, retrieved, history);
        let answer = "";
        for await (const delta of streamChat({
          key,
          model: settings.llm.model,
          baseUrl: settings.llm.base_url,
          messages: msgs,
          temperature: body.temperature ?? settings.gen.temperature,
          maxTokens: body.max_tokens ?? settings.gen.max_tokens,
        })) {
          answer += delta;
          send({ delta });
        }

        // --- Output guardrails ---
        const grounding = g.enabled && g.grounding ? validateCitations(answer, sources.length) : { ok: true, invalid: [] as number[] };
        let piiFound: string[] = [];
        if (g.enabled && g.pii_mask) {
          const masked = maskPii(answer);
          if (masked.found.length) {
            piiFound = masked.found;
            send({ content_masked: masked.masked });
          }
        } else if (g.enabled && g.pii_detect) {
          piiFound = detectPii(answer);
        }
        send({
          guardrails: {
            grounding_ok: grounding.ok,
            invalid_citations: grounding.invalid,
            pii_found: piiFound,
          },
        });
        done();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "model unavailable";
        send({ delta: `\n\n_The demo model is unavailable: ${msg}. Set OPENROUTER_API_KEY to enable live answers._` });
        done();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
