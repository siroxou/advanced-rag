import Link from "next/link";

const FEATURES = [
  {
    icon: "🔒",
    title: "RBAC at the retrieval layer",
    body: "Postgres Row-Level Security makes the database physically unable to return a chunk the caller isn't cleared for.",
  },
  {
    icon: "🤖",
    title: "Multi-agent orchestration",
    body: "A LangGraph supervisor routes each query through context-rewrite → retrieval / live web → grounded synthesis.",
  },
  {
    icon: "🛡️",
    title: "Layered guardrails",
    body: "Input/output safety, prompt-injection checks, and a grounding validator that refuses rather than hallucinates.",
  },
  {
    icon: "📄",
    title: "Document management",
    body: "Upload PDFs with sensitivity labels and role-based access. Auto-classification and audit trails included.",
  },
];

const QUICK_LINKS = [
  { label: "Start Chatting", href: "/chat", icon: "💬", desc: "Ask questions grounded in your documents", primary: true },
  { label: "Browse Presets", href: "/presets", icon: "📚", desc: "Load ready-made public datasets", primary: false },
  { label: "Manage Documents", href: "/documents", icon: "📄", desc: "Upload and classify PDFs", primary: false },
  { label: "Admin Panel", href: "/admin", icon: "👥", desc: "User and role management", primary: false },
  { label: "Security Dashboard", href: "/security", icon: "🔒", desc: "Monitor queries and guardrails", primary: false },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-4xl flex-1 flex-col px-6 py-12">
      {/* Hero */}
      <header className="flex flex-col gap-4 text-center">
        <span className="mx-auto w-fit rounded-full border border-black/10 px-3 py-1 text-xs font-medium tracking-wide uppercase text-black/50 dark:border-white/15 dark:text-white/50">
          Enterprise Agentic RAG
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Secure AI Document Assistant
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-black/70 dark:text-white/70">
          A context-aware, multi-agent retrieval system with document-level access control,
          guardrails, and local inference. Secure on a laptop, ready for the cloud.
        </p>
      </header>

      {/* Quick Links */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`group rounded-xl border p-5 transition-all hover:shadow-md ${
              link.primary
                ? "border-blue-500/30 bg-blue-50/50 dark:border-blue-400/30 dark:bg-blue-900/10"
                : "border-black/10 bg-white dark:border-white/10 dark:bg-black"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{link.icon}</span>
              <div>
                <h2 className={`font-semibold ${link.primary ? "text-blue-700 dark:text-blue-400" : ""}`}>
                  {link.label}
                </h2>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">{link.desc}</p>
                <span className={`mt-2 inline-block text-xs font-medium ${link.primary ? "text-blue-600 dark:text-blue-400" : "text-black/40 dark:text-white/40"}`}>
                  Open →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* Features */}
      <section className="mt-12">
        <h2 className="mb-4 text-sm font-semibold tracking-wide text-black/50 uppercase dark:text-white/50">
          Key Features
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-black/10 p-5 dark:border-white/10"
            >
              <span className="text-xl">{f.icon}</span>
              <h3 className="mt-2 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-black/65 dark:text-white/65">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-12 border-t border-black/10 pt-6 text-center text-xs text-black/40 dark:border-white/10 dark:text-white/40">
        <p>
          API docs:{" "}
          <a href="http://localhost:8000/docs" className="underline hover:text-black/60 dark:hover:text-white/60">
            localhost:8000/docs
          </a>
          {" · "}
          Health:{" "}
          <a href="http://localhost:8000/api/health" className="underline hover:text-black/60 dark:hover:text-white/60">
            localhost:8000/api/health
          </a>
        </p>
      </footer>
    </main>
  );
}
