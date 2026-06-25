"use client";

import { useEffect, useRef, useState } from "react";

import Sidebar from "@/components/Sidebar";
import { API_BASE, type Source } from "@/lib/api";

type Guardrails = {
  input_blocked?: boolean;
  block_reason?: string | null;
  grounding_ok?: boolean;
  invalid_citations?: number[];
  pii_found?: string[];
};

type Msg = {
  role: "user" | "assistant";
  content: string;
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

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
          if (payload === "[DONE]") continue;

          let data: {
            sources?: Source[];
            delta?: string;
            rewritten_query?: string;
            used_web?: boolean;
            guardrails?: Guardrails;
          };
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }

          if (data.guardrails) {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], guardrails: data.guardrails };
              return copy;
            });
          } else if (data.sources) {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                sources: data.sources,
                rewrittenQuery: data.rewritten_query,
                usedWeb: data.used_web,
              };
              return copy;
            });
          } else if (data.delta) {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: last.content + data.delta };
              return copy;
            });
          }
        }
      }
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
              Ask questions grounded in your documents.
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
            return (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-black/10 dark:border-white/10"
                  }`}
                >
                  {m.content || (busy && i === messages.length - 1 ? "..." : "")}
                  {m.role === "assistant" && (m.usedWeb || showRewrite) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-black/40 dark:text-white/40">
                      {m.usedWeb && (
                        <span className="rounded-full border border-black/15 px-1.5 py-0.5 dark:border-white/20">
                          web
                        </span>
                      )}
                      {showRewrite && <span className="italic">searched: {m.rewrittenQuery}</span>}
                    </div>
                  )}
                  {m.role === "assistant" &&
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
                  {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1 border-t border-black/10 pt-2 dark:border-white/10">
                      <span className="text-[11px] font-semibold tracking-wide text-black/40 uppercase dark:text-white/40">
                        Sources
                      </span>
                      {m.sources.map((s) => (
                        <div key={s.n} className="text-[11px] text-black/55 dark:text-white/55">
                          <span className="font-mono">[{s.n}]</span> {s.citation_anchor}{" "}
                          <span className="text-black/35 dark:text-white/35">
                            ({s.source_id} · {s.score.toFixed(3)})
                          </span>
                        </div>
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
    </Sidebar>
  );
}
