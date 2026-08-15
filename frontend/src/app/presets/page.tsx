"use client";

import { useCallback, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { IconAlert, IconBook, IconCheck, IconLock } from "@/components/icons";
import { API_BASE, IS_HOSTED_DEMO } from "@/lib/api";
import { sensitivityClass } from "@/lib/sensitivity";

type PresetInfo = {
  name: string;
  kind: string;
  dataset: string;
  description: string;
  roles: string[];
  sensitivity: string;
  default_limit: number | null;
  notes: string;
};

type IngestResult = {
  status: string;
  preset: string;
  documents: number;
  chunks_inserted: number;
  chunks_skipped: number;
  detail?: string;
};

export default function CorpusPage() {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<Record<string, string>>({});
  const [classify, setClassify] = useState<Record<string, boolean>>({});

  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/presets`);
      if (res.ok) setPresets(await res.json());
      else setError("Failed to fetch datasets");
    } catch {
      setError("Failed to fetch datasets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async on-mount fetch; state lands post-await
    fetchPresets();
  }, [fetchPresets]);

  async function handleIngest(name: string) {
    setIngesting(name);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/presets/${name}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: limit[name] ? parseInt(limit[name], 10) : -1,
          sensitivity: "",
          roles: "",
          classify: classify[name] ?? false,
        }),
      });
      if (res.ok) setResult(await res.json());
      else setError((await res.text()) || "Ingestion failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIngesting(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <PageHeader
          title="Corpus"
          subtitle="The datasets behind the assistant. Each one carries an access tier that the retriever enforces per role."
        />

        {IS_HOSTED_DEMO && (
          <p className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
            <IconLock size={15} className="mt-0.5 shrink-0 text-faint" />
            This corpus ships with the demo and is already loaded. Live ingestion - fetching a
            dataset, chunking it, embedding with BGE-M3 and writing to pgvector - runs in the
            local FastAPI stack, so those controls are disabled here.
          </p>
        )}

        {result && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-ok-line bg-ok-soft px-4 py-3 text-sm text-ok">
            <IconCheck size={15} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              Ingested {result.preset}: {result.documents} documents,{" "}
              {result.chunks_inserted} chunks written, {result.chunks_skipped} already present.
              {result.detail && <span className="block opacity-80">{result.detail}</span>}
            </span>
            <button onClick={() => setResult(null)} className="btn btn-ghost btn-sm">
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
            <IconAlert size={15} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="btn btn-ghost btn-sm">
              Dismiss
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4">
          {loading && <p className="py-10 text-center text-sm text-faint">Loading datasets...</p>}

          {presets.map((preset) => (
            <section key={preset.name} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">
                  <IconBook size={16} />
                </span>
                <h2 className="font-semibold">{preset.name}</h2>
                <span className="badge badge-neutral">{preset.kind}</span>
                <span className={`badge ${sensitivityClass(preset.sensitivity)}`}>
                  {preset.sensitivity}
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-muted">{preset.description}</p>

              <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-xs sm:grid-cols-3">
                <div>
                  <dt className="eyebrow">Source</dt>
                  <dd className="mt-1 font-mono text-muted">{preset.dataset}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Documents</dt>
                  <dd className="mt-1 text-muted">{preset.default_limit ?? "all"}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Roles</dt>
                  <dd className="mt-1 text-muted">{preset.roles.join(", ")}</dd>
                </div>
              </dl>

              {preset.notes && <p className="mt-3 text-xs text-faint">{preset.notes}</p>}

              {!IS_HOSTED_DEMO && (
                <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                  <div className="w-32">
                    <label className="label" htmlFor={`limit-${preset.name}`}>
                      Record limit
                    </label>
                    <input
                      id={`limit-${preset.name}`}
                      type="number"
                      min={1}
                      value={limit[preset.name] ?? ""}
                      onChange={(e) =>
                        setLimit((p) => ({ ...p, [preset.name]: e.target.value }))
                      }
                      placeholder={String(preset.default_limit ?? "all")}
                      className="field"
                    />
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={classify[preset.name] ?? false}
                      onChange={(e) =>
                        setClassify((p) => ({ ...p, [preset.name]: e.target.checked }))
                      }
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    Auto-classify each document
                  </label>
                  <button
                    onClick={() => handleIngest(preset.name)}
                    disabled={ingesting === preset.name}
                    className="btn btn-primary btn-sm ml-auto"
                  >
                    {ingesting === preset.name ? "Ingesting..." : "Ingest"}
                  </button>
                </div>
              )}
            </section>
          ))}

          {!loading && presets.length === 0 && (
            <p className="card py-10 text-center text-sm text-faint">No datasets configured.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
