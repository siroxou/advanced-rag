import Link from "next/link";

const FEATURES = [
  {
    title: "RBAC at the retrieval layer",
    body: "Postgres Row-Level Security makes the database physically unable to return a chunk the caller isn't cleared for - killing RAG data-exfiltration.",
  },
  {
    title: "Multi-agent & context-aware",
    body: "A LangGraph supervisor routes each query through context-rewrite → retrieval / live web → grounded synthesis, with conversation memory.",
  },
  {
    title: "Layered guardrails",
    body: "ShieldGemma input/output safety, prompt-injection checks, and a grounding validator that refuses rather than hallucinates.",
  },
  {
    title: "Local Gemma 4 + LoRA",
    body: "Runs on-device via Ollama/MLX (Apple Metal). A LoRA adapter teaches strict citation format and faithful refusals. No proprietary API.",
  },
];

const PHASES = [
  { n: 0, label: "Scaffold + inference abstraction", done: true },
  { n: 1, label: "Core RAG (ingest → pgvector → rerank)", done: true },
  { n: 2, label: "RBAC via Postgres RLS", done: true },
  { n: 3, label: "Multi-agent + web search", done: true },
  { n: 4, label: "Guardrails", done: true },
  { n: 5, label: "LoRA fine-tune + RAGAS", done: false },
  { n: 6, label: "Eval gate + cloud demo", done: false },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-4xl flex-1 flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-4">
        <span className="w-fit rounded-full border border-black/10 px-3 py-1 text-xs font-medium tracking-wide uppercase dark:border-white/15">
          Portfolio · Enterprise AI Engineering
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Enterprise Agentic RAG
        </h1>
        <p className="max-w-2xl text-lg text-black/70 dark:text-white/70">
          A context-aware, multi-agent retrieval system with document-level access control,
          guardrails, and a locally fine-tuned <strong>Gemma 4</strong> - secure on a laptop,
          cheap to demo in the cloud.
        </p>
        <div className="flex flex-wrap gap-3 pt-2 text-sm">
          <Link
            className="rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90"
            href="/chat"
          >
            Open chat →
          </Link>
          <a
            className="rounded-md border border-black/15 px-4 py-2 font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            href="http://localhost:8000/docs"
          >
            API docs
          </a>
          <a
            className="rounded-md border border-black/15 px-4 py-2 font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            href="http://localhost:8000/api/health"
          >
            Health
          </a>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-black/10 p-5 dark:border-white/10"
          >
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-black/65 dark:text-white/65">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-black/50 uppercase dark:text-white/50">
          Roadmap
        </h2>
        <ul className="flex flex-col gap-2">
          {PHASES.map((p) => (
            <li key={p.n} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  p.done
                    ? "bg-green-600 text-white"
                    : "border border-black/20 text-black/40 dark:border-white/20 dark:text-white/40"
                }`}
              >
                {p.done ? "✓" : p.n}
              </span>
              <span className={p.done ? "" : "text-black/60 dark:text-white/60"}>
                Phase {p.n} - {p.label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto border-t border-black/10 pt-6 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
        Apache-2.0 · Gemma 4 (local) · FastAPI · Next.js · LangGraph · pgvector + RLS
      </footer>
    </main>
  );
}
