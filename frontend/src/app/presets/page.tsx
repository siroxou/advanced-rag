"use client";

import { useState, useEffect, useCallback } from "react";

import Sidebar from "@/components/Sidebar";
import { API_BASE } from "@/lib/api";

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
};

export default function PresetsPage() {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});
  const [customLimit, setCustomLimit] = useState<Record<string, string>>({});
  const [customSensitivity, setCustomSensitivity] = useState<Record<string, string>>({});
  const [customRoles, setCustomRoles] = useState<Record<string, string>>({});
  const [classify, setClassify] = useState<Record<string, boolean>>({});

  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/presets`);
      if (res.ok) {
        const data = await res.json();
        setPresets(data);
      }
    } catch {
      setError("Failed to fetch presets");
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

    const limit = customLimit[name] ? parseInt(customLimit[name]) : -1;
    const sensitivity = customSensitivity[name] || "";
    const roles = customRoles[name] || "";
    const classifyFlag = classify[name] || false;

    try {
      const res = await fetch(`${API_BASE}/api/presets/${name}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, sensitivity, roles, classify: classifyFlag }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        const err = await res.text();
        setError(err || "Ingestion failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIngesting(null);
    }
  }

  const toggleAdvanced = (name: string) => {
    setShowAdvanced(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const kindColors: Record<string, string> = {
    text: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    pdf: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };

  const sensitivityColors: Record<string, string> = {
    public: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    internal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    confidential: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    restricted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  if (loading) {
    return (
      <Sidebar>
        <div className="mx-auto flex h-dvh max-w-4xl flex-col items-center justify-center px-6">
          <p className="text-sm text-black/50 dark:text-white/50">Loading presets...</p>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold">Corpus Presets</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Ready-made public datasets to populate your RAG corpus. No PDFs required.
        </p>

        {/* Presets Grid */}
        <div className="mt-6 grid gap-6">
          {presets.map((preset) => (
            <div
              key={preset.name}
              className="rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-black"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{preset.name}</h2>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${kindColors[preset.kind] || "bg-gray-100 text-gray-700"}`}>
                      {preset.kind.toUpperCase()}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${sensitivityColors[preset.sensitivity] || "bg-gray-100 text-gray-700"}`}>
                      {preset.sensitivity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-black/70 dark:text-white/70">{preset.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-black/50 dark:text-white/50">
                    <span>Dataset: <code className="font-mono">{preset.dataset}</code></span>
                    {preset.default_limit && <span>Default limit: {preset.default_limit} records</span>}
                    {preset.notes && <span>• {preset.notes}</span>}
                  </div>
                </div>
              </div>

              {/* Advanced Options */}
              {showAdvanced[preset.name] && (
                <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                        Limit Records (default: {preset.default_limit || "all"})
                      </label>
                      <input
                        type="number"
                        value={customLimit[preset.name] || ""}
                        onChange={(e) => setCustomLimit(prev => ({ ...prev, [preset.name]: e.target.value }))}
                        placeholder="Leave empty for preset default"
                        className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                        Override Sensitivity
                      </label>
                      <select
                        value={customSensitivity[preset.name] || ""}
                        onChange={(e) => setCustomSensitivity(prev => ({ ...prev, [preset.name]: e.target.value }))}
                        className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                      >
                        <option value="">Use preset default</option>
                        <option value="public">Public</option>
                        <option value="internal">Internal</option>
                        <option value="confidential">Confidential</option>
                        <option value="restricted">Restricted</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                        Override Roles (comma-separated)
                      </label>
                      <input
                        value={customRoles[preset.name] || ""}
                        onChange={(e) => setCustomRoles(prev => ({ ...prev, [preset.name]: e.target.value }))}
                        placeholder="viewer, analyst"
                        className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`classify-${preset.name}`}
                        checked={classify[preset.name] || false}
                        onChange={(e) => setClassify(prev => ({ ...prev, [preset.name]: e.target.checked }))}
                        className="h-4 w-4 rounded border-black/30 text-blue-600 focus:ring-blue-500 dark:border-white/30"
                      />
                      <label htmlFor={`classify-${preset.name}`} className="text-sm text-black/70 dark:text-white/70">
                        LLM auto-classify each document
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => handleIngest(preset.name)}
                  disabled={ingesting === preset.name}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-blue-700 disabled:opacity-50"
                >
                  {ingesting === preset.name ? "Ingesting..." : "Ingest This Dataset"}
                </button>
                <button
                  onClick={() => toggleAdvanced(preset.name)}
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  {showAdvanced[preset.name] ? "Hide Options ▲" : "Advanced Options ▼"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Ingestion Result */}
        {result && (
          <div className="mt-6 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              ✓ Ingestion complete
            </p>
            <p className="mt-1 text-xs text-green-600 dark:text-green-500">
              Preset: {result.preset} | Documents: {result.documents} | Chunks inserted: {result.chunks_inserted} | Skipped: {result.chunks_skipped}
            </p>
            <button
              onClick={() => setResult(null)}
              className="mt-2 text-xs text-green-600 underline dark:text-green-500"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Error
            </p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-500">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-xs text-red-600 underline dark:text-red-500"
            >
              Dismiss
            </button>
          </div>
        )}

        {presets.length === 0 && !loading && (
          <p className="mt-6 text-center text-sm text-black/40 dark:text-white/40">
            No presets available. Check your backend configuration.
          </p>
        )}
      </div>
    </Sidebar>
  );
}
