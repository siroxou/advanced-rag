"use client";

import { useEffect, useRef, useState } from "react";

import DocumentPreviewModal from "@/components/DocumentPreviewModal";
import Sidebar from "@/components/Sidebar";
import { API_BASE, type Source } from "@/lib/api";

type Guardrails = {
  input_blocked?: boolean;
  block_reason?: string | null;
  grounding_ok?: boolean;
  invalid_citations?: number[];
  pii_found?: string[];
};

type StepDetail = {
  rewritten_query?: string | null;
  need_web?: boolean;
  chunks?: number;
  results?: number;
  sources?: number;
};

type StepStatus = "pending" | "active" | "done";

type Step = {
  node: string;
  label: string;
  status: StepStatus;
  detail?: StepDetail;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  steps?: Step[];
  sources?: Source[];
  rewrittenQuery?: string;
  usedWeb?: boolean;
  guardrails?: Guardrails;
};

const EXAMPLES = [
  "What problem does this work address?",
  "Summarize the main method in three points.",
  "What are the reported limitations?",
];

// ── Step helpers (pure) ─────────────────────────────────────────────────────

/** Mark `node` done (inserting it before "answer" if the plan didn't list it),
 * then promote the earliest still-pending step to active. */
function applyStepDone(
  steps: Step[],
  node: string,
  label: string,
  detail?: StepDetail
): Step[] {
  const next = steps.map((s) => ({ ...s }));
  const idx = next.findIndex((s) => s.node === node);
  if (idx === -1) {
    const item: Step = { node, label, status: "done", detail };
    const ansIdx = next.findIndex((s) => s.node === "answer");
    if (ansIdx === -1) next.push(item);
    else next.splice(ansIdx, 0, item);
  } else {
    next[idx] = { ...next[idx], status: "done", detail };
  }
  const pending = next.find((s) => s.status === "pending");
  if (pending) pending.status = "active";
  return next;
}

/** First token arrived: everything before the answer is done, answer is active. */
function activateAnswer(steps: Step[]): Step[] {
  return steps.map((s) =>
    s.node === "answer"
      ? { ...s, status: "active" as StepStatus }
      : s.status === "done"
        ? s
        : { ...s, status: "done" as StepStatus }
  );
}

function finalizeSteps(steps: Step[]): Step[] {
  return steps.map((s) =>
    s.status === "done" ? s : { ...s, status: "done" as StepStatus }
  );
}

function stepDetailText(node: string, detail?: StepDetail): string | null {
  if (!detail) return null;
  if (node === "context") {
    const parts: string[] = [];
    if (detail.rewritten_query) parts.push(`“${detail.rewritten_query}”`);
    if (detail.need_web) parts.push("needs web");
    return parts.length ? parts.join(" · ") : null;
  }
  const n = (x: number | undefined, one: string) =>
    x == null ? null : `${x} ${one}${x === 1 ? "" : "s"}`;
  if (node === "retrieve") return n(detail.chunks, "chunk");
  if (node === "web") return n(detail.results, "result");
  if (node === "compose") return n(detail.sources, "source");
  return null;
}

// ── Step timeline component ─────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/15 text-[10px] text-green-600 dark:text-green-400">
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
    );
  }
  return (
    <span className="h-4 w-4 rounded-full border border-black/20 dark:border-white/20" />
  );
}

function AgentTimeline({ steps }: { steps: Step[] }) {
  return (
    <div className="mb-3 rounded-lg border border-black/10 bg-black/[0.015] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="mb-2 text-[10px] font-semibold tracking-wide text-black/40 uppercase dark:text-white/40">
        Agent steps
      </p>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s) => {
          const detail = stepDetailText(s.node, s.detail);
          return (
            <li key={s.node} className="flex items-center gap-2 text-xs">
              <StepIcon status={s.status} />
              <span
                className={
                  s.status === "pending"
                    ? "text-black/40 dark:text-white/40"
                    : s.status === "active"
                      ? "font-medium text-blue-600 dark:text-blue-400"
                      : "text-black/70 dark:text-white/70"
                }
              >
                {s.label}
              </span>
              {detail && s.status !== "pending" && (
                <span className="truncate text-[11px] text-black/40 dark:text-white/40">
                  {detail}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<Source | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Update the in-flight assistant message (always the last one).
  function patchLast(fn: (m: Msg) => Msg) {
    setMessages((m) => {
      const copy = [...m];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setError(null);

    const outgoing = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: q },
    ];
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    let answerStarted = false;

    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: outgoing, use_rag: true }),
      });
      if (!res.ok || !res.body) throw new Error(`API returned ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            patchLast((m) => (m.steps ? { ...m, steps: finalizeSteps(m.steps) } : m));
            continue;
          }

          let data: {
            plan?: { node: string; label: string }[];
            step?: { node: string; label: string; status?: string; detail?: StepDetail };
            sources?: Source[];
            delta?: string;
            content_masked?: string;
            rewritten_query?: string | null;
            used_web?: boolean;
            guardrails?: Guardrails;
          };
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }

          if (data.content_masked !== undefined) {
            // Output guardrails masked PII after streaming; swap in the clean answer.
            const masked = data.content_masked;
            patchLast((m) => ({ ...m, content: masked }));
          } else if (data.plan) {
            const steps: Step[] = data.plan.map((p, i) => ({
              node: p.node,
              label: p.label,
              status: i === 0 ? "active" : "pending",
            }));
            patchLast((m) => ({ ...m, steps }));
          } else if (data.step) {
            const { node, label, detail } = data.step;
            patchLast((m) => ({
              ...m,
              steps: applyStepDone(m.steps ?? [], node, label, detail),
            }));
          } else if (data.guardrails) {
            patchLast((m) => ({ ...m, guardrails: data.guardrails }));
          } else if (data.sources) {
            patchLast((m) => ({
              ...m,
              sources: data.sources,
              rewrittenQuery: data.rewritten_query ?? undefined,
              usedWeb: data.used_web,
            }));
          } else if (data.delta) {
            if (!answerStarted) {
              answerStarted = true;
              patchLast((m) => (m.steps ? { ...m, steps: activateAnswer(m.steps) } : m));
            }
            patchLast((m) => ({ ...m, content: m.content + data.delta }));
          }
        }
      }
      patchLast((m) => (m.steps ? { ...m, steps: finalizeSteps(m.steps) } : m));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "request failed");
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant" && !last.content) copy.pop();
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sidebar>
      <div className="mx-auto flex h-dvh max-w-3xl flex-col px-4">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-black/10 py-4 dark:border-white/10">
          <div>
            <h1 className="text-lg font-semibold">Grounded Chat</h1>
            <p className="text-xs text-black/50 dark:text-white/50">
              Ask questions grounded in your documents. Watch each agent step run live.
            </p>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 space-y-5 overflow-y-auto py-6">
          {messages.length === 0 && (
            <div className="flex flex-col gap-3 pt-10 text-center">
              <p className="text-sm text-black/50 dark:text-white/50">
                Ask a question grounded in the documents.
              </p>
              <div className="mx-auto flex max-w-md flex-col gap-2 pt-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    className="rounded-lg border border-black/10 px-3 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const prevUser = m.role === "assistant" ? messages[i - 1]?.content : undefined;
            const showRewrite =
              !!m.rewrittenQuery &&
              !!prevUser &&
              m.rewrittenQuery.trim().toLowerCase() !== prevUser.trim().toLowerCase();
            const isAssistant = m.role === "assistant";
            const thinking =
              isAssistant && !m.content && busy && i === messages.length - 1;
            return (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-black/10 dark:border-white/10"
                  }`}
                >
                  {isAssistant && m.steps && m.steps.length > 0 && (
                    <AgentTimeline steps={m.steps} />
                  )}
                  {m.content || (thinking ? <span className="text-black/40 dark:text-white/40">Thinking…</span> : "")}
                  {isAssistant && (m.usedWeb || showRewrite) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-black/40 dark:text-white/40">
                      {m.usedWeb && (
                        <span className="rounded-full border border-black/15 px-1.5 py-0.5 dark:border-white/20">
                          web
                        </span>
                      )}
                      {showRewrite && <span className="italic">searched: {m.rewrittenQuery}</span>}
                    </div>
                  )}
                  {isAssistant &&
                    m.guardrails &&
                    (m.guardrails.grounding_ok === false ||
                      (m.guardrails.pii_found?.length ?? 0) > 0) && (
                      <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
                        {m.guardrails.grounding_ok === false && (
                          <span>Guardrail: citation check flagged unsupported references. </span>
                        )}
                        {(m.guardrails.pii_found?.length ?? 0) > 0 && (
                          <span>Guardrail: possible PII in output ({m.guardrails.pii_found?.join(", ")}).</span>
                        )}
                      </div>
                    )}
                  {isAssistant && m.sources && m.sources.length > 0 && (
                    <div className="mt-3 flex flex-col gap-0.5 border-t border-black/10 pt-2 dark:border-white/10">
                      <span className="mb-1 text-[11px] font-semibold tracking-wide text-black/40 uppercase dark:text-white/40">
                        Sources
                      </span>
                      {m.sources.map((s) => (
                        <button
                          key={s.n}
                          onClick={() => setPreviewSource(s)}
                          className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left text-[11px] text-black/55 transition-colors hover:bg-black/5 hover:text-black/75 dark:text-white/55 dark:hover:bg-white/5 dark:hover:text-white/75"
                        >
                          <span className="shrink-0 font-mono">[{s.n}]</span>
                          <span className="flex-1">{s.citation_anchor}</span>
                          <span className="shrink-0 text-[10px] text-black/30 dark:text-white/30">
                            {s.score.toFixed(3)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {error && (
          <p className="pb-2 text-center text-xs text-red-500">
            {error}. Is the API up at {API_BASE}?
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2 border-t border-black/10 py-4 dark:border-white/10"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the corpus..."
            disabled={busy}
            className="flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-60 dark:border-white/20 dark:focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-blue-700 disabled:opacity-40"
          >
            {busy ? "..." : "Send"}
          </button>
        </form>
      </div>

      {previewSource && (
        <DocumentPreviewModal
          docId={previewSource.doc_id}
          title={previewSource.source_id}
          highlightPage={previewSource.page}
          onClose={() => setPreviewSource(null)}
        />
      )}
    </Sidebar>
  );
}
