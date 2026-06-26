"use client";

import { useState, useEffect, useCallback } from "react";

import DocumentPreviewModal from "@/components/DocumentPreviewModal";
import Sidebar from "@/components/Sidebar";
import { API_BASE, updateDocument, type DocumentInfo } from "@/lib/api";

// Default role set per tier, mirroring the backend auto-classifier. Selecting a
// sensitivity prefills these; the operator can still override.
const TIER_ROLES: Record<string, string> = {
  public: "viewer, analyst, admin",
  internal: "analyst, admin",
  confidential: "admin",
  restricted: "admin",
};

type UploadState = "idle" | "uploading" | "success" | "error";

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

type UploadResult = {
  status: string;
  filename: string;
  sensitivity: string;
  roles: string[];
  documents: number;
  chunks_inserted: number;
  chunks_skipped: number;
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [sensitivity, setSensitivity] = useState("internal");
  const [allowedRoles, setAllowedRoles] = useState("viewer");
  const [filterSensitivity, setFilterSensitivity] = useState<string>("all");
  const [selectedDoc, setSelectedDoc] = useState<DocumentInfo | null>(null);
  // Inline re-classification editor.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSensitivity, setEditSensitivity] = useState("internal");
  const [editRoles, setEditRoles] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  
  // Presets state
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [ingestingPreset, setIngestingPreset] = useState<string | null>(null);
  const [presetResult, setPresetResult] = useState<IngestResult | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [showPresetOptions, setShowPresetOptions] = useState<Record<string, boolean>>({});
  const [presetLimit, setPresetLimit] = useState<Record<string, string>>({});
  const [presetSensitivity, setPresetSensitivity] = useState<Record<string, string>>({});
  const [presetRoles, setPresetRoles] = useState<Record<string, string>>({});
  const [presetClassify, setPresetClassify] = useState<Record<string, boolean>>({});

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/documents`);
      if (res.ok) {
        const docs = await res.json();
        setDocuments(docs);
      }
    } catch (e) {
      console.error("Failed to fetch documents:", e);
    }
  }, []);

  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/presets`);
      if (res.ok) {
        const data = await res.json();
        setPresets(data);
      }
    } catch (e) {
      console.error("Failed to fetch presets:", e);
    } finally {
      setLoadingPresets(false);
    }
  }, []);

  useEffect(() => {
    // On-mount load. State is set only after each fetch resolves (post-await), so
    // the synchronous cascading-render case this rule guards against doesn't apply.
    /* eslint-disable react-hooks/set-state-in-effect */
    fetchPresets();
    fetchDocuments();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchPresets, fetchDocuments]);

  async function handleIngestPreset(name: string) {
    setIngestingPreset(name);
    setPresetError(null);
    setPresetResult(null);

    const limit = presetLimit[name] ? parseInt(presetLimit[name]) : -1;
    const sensitivity = presetSensitivity[name] || "";
    const roles = presetRoles[name] || "";
    const classify = presetClassify[name] || false;

    try {
      const res = await fetch(`${API_BASE}/api/presets/${name}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, sensitivity, roles, classify }),
      });

      if (res.ok) {
        const data = await res.json();
        setPresetResult(data);
        fetchDocuments(); // Refresh document list
      } else {
        const err = await res.text();
        setPresetError(err || "Ingestion failed");
      }
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIngestingPreset(null);
    }
  }

  const togglePresetOptions = (name: string) => {
    setShowPresetOptions(prev => ({ ...prev, [name]: !prev[name] }));
  };

  function startEdit(doc: DocumentInfo) {
    setEditingId(doc.id);
    setEditSensitivity(doc.sensitivity);
    setEditRoles(TIER_ROLES[doc.sensitivity] ?? "viewer");
    setEditError(null);
  }

  function changeEditSensitivity(value: string) {
    setEditSensitivity(value);
    setEditRoles(TIER_ROLES[value] ?? editRoles);
  }

  async function saveEdit(docId: string) {
    setSavingEdit(true);
    setEditError(null);
    try {
      const roles = editRoles.split(",").map(r => r.trim()).filter(Boolean);
      await updateDocument(docId, editSensitivity, roles);
      setEditingId(null);
      fetchDocuments();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleUpload(file: File) {
    setUploadState("uploading");
    setUploadError(null);
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(
        `${API_BASE}/api/documents/upload?sensitivity=${encodeURIComponent(sensitivity)}&allowed_roles=${encodeURIComponent(allowedRoles)}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (res.ok) {
        const result = await res.json();
        setUploadResult(result);
        setUploadState("success");
        fetchDocuments(); // Refresh list
      } else {
        const err = await res.text();
        setUploadError(err || "Upload failed");
        setUploadState("error");
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Network error");
      setUploadState("error");
    }
  }

  const filteredDocs = filterSensitivity === "all"
    ? documents
    : documents.filter(d => d.sensitivity === filterSensitivity);

  const sensitivityColors: Record<string, string> = {
    public: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    internal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    confidential: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    restricted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <Sidebar>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold">Document Management</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Upload, classify, and manage document access.
        </p>

        {/* Upload Section */}
        <div className="mt-6 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-black">
          <h2 className="text-lg font-semibold">Upload Document</h2>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            PDF files only. Set sensitivity and access roles before uploading.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                Sensitivity Level
              </label>
              <select
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value)}
                className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                Allowed Roles (comma-separated)
              </label>
              <input
                value={allowedRoles}
                onChange={(e) => setAllowedRoles(e.target.value)}
                placeholder="viewer, analyst"
                className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-black/15 px-8 py-10 transition-colors hover:border-blue-500 dark:border-white/20 dark:hover:border-blue-400">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
              <span className="text-2xl">📄</span>
              <span className="mt-2 text-sm text-black/60 dark:text-white/60">
                {uploadState === "uploading"
                  ? "Uploading..."
                  : "Click to select PDF or drag here"}
              </span>
            </label>
          </div>

          {/* Upload Results */}
          {uploadState === "success" && uploadResult && (
            <div className="mt-4 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                ✓ Upload successful
              </p>
              <p className="mt-1 text-xs text-green-600 dark:text-green-500">
                File: {uploadResult.filename} | Chunks inserted: {uploadResult.chunks_inserted} | Skipped: {uploadResult.chunks_skipped}
              </p>
              <button
                onClick={() => setUploadState("idle")}
                className="mt-2 text-xs text-green-600 underline dark:text-green-500"
              >
                Dismiss
              </button>
            </div>
          )}

          {uploadState === "error" && (
            <div className="mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Upload failed
              </p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-500">{uploadError}</p>
              <button
                onClick={() => setUploadState("idle")}
                className="mt-2 text-xs text-red-600 underline dark:text-red-500"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Presets Section */}
        <div className="mt-6 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Corpus Presets</h2>
              <p className="mt-1 text-sm text-black/50 dark:text-white/50">
                Ready-made public datasets. No PDFs required.
              </p>
            </div>
            {loadingPresets && (
              <span className="text-xs text-black/40 dark:text-white/40">Loading presets...</span>
            )}
          </div>

          {presetResult && (
            <div className="mt-4 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <p className="text-xs font-medium text-green-700 dark:text-green-400">
                ✓ Ingested &ldquo;{presetResult.preset}&rdquo;: {presetResult.documents} docs, {presetResult.chunks_inserted} chunks
              </p>
              <button
                onClick={() => setPresetResult(null)}
                className="mt-1 text-xs text-green-600 underline dark:text-green-500"
              >
                Dismiss
              </button>
            </div>
          )}

          {presetError && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-xs font-medium text-red-700 dark:text-red-400">Error: {presetError}</p>
              <button
                onClick={() => setPresetError(null)}
                className="mt-1 text-xs text-red-600 underline dark:text-red-500"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {presets.map((preset) => (
              <div key={preset.name} className="rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{preset.name}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                        preset.kind === "text" 
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      }`}>
                        {preset.kind}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                        preset.sensitivity === "public" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        preset.sensitivity === "internal" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                        preset.sensitivity === "confidential" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {preset.sensitivity}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-black/60 dark:text-white/60">{preset.description}</p>
                    <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                      Dataset: {preset.dataset}
                      {preset.default_limit && ` • Default limit: ${preset.default_limit} records`}
                      {preset.notes && ` • ${preset.notes}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleIngestPreset(preset.name)}
                    disabled={ingestingPreset === preset.name}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:bg-blue-700 disabled:opacity-50"
                  >
                    {ingestingPreset === preset.name ? "Ingesting..." : "Ingest"}
                  </button>
                </div>

                {/* Advanced Options */}
                {showPresetOptions[preset.name] && (
                  <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-black/60 dark:text-white/60">
                          Limit Records (default: {preset.default_limit || "all"})
                        </label>
                        <input
                          type="number"
                          value={presetLimit[preset.name] || ""}
                          onChange={(e) => setPresetLimit(prev => ({ ...prev, [preset.name]: e.target.value }))}
                          placeholder="Leave empty for preset default"
                          className="w-full rounded border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-black/60 dark:text-white/60">
                          Override Sensitivity
                        </label>
                        <select
                          value={presetSensitivity[preset.name] || ""}
                          onChange={(e) => setPresetSensitivity(prev => ({ ...prev, [preset.name]: e.target.value }))}
                          className="w-full rounded border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                        >
                          <option value="">Use preset default</option>
                          <option value="public">Public</option>
                          <option value="internal">Internal</option>
                          <option value="confidential">Confidential</option>
                          <option value="restricted">Restricted</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-black/60 dark:text-white/60">
                          Override Roles (comma-separated)
                        </label>
                        <input
                          value={presetRoles[preset.name] || ""}
                          onChange={(e) => setPresetRoles(prev => ({ ...prev, [preset.name]: e.target.value }))}
                          placeholder="viewer, analyst"
                          className="w-full rounded border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`classify-${preset.name}`}
                          checked={presetClassify[preset.name] || false}
                          onChange={(e) => setPresetClassify(prev => ({ ...prev, [preset.name]: e.target.checked }))}
                          className="h-3 w-3 rounded border-black/30 text-blue-600 focus:ring-blue-500 dark:border-white/30"
                        />
                        <label htmlFor={`classify-${preset.name}`} className="text-xs text-black/60 dark:text-white/60">
                          LLM auto-classify
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => togglePresetOptions(preset.name)}
                  className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  {showPresetOptions[preset.name] ? "Hide Options ▲" : "Advanced Options ▼"}
                </button>
              </div>
            ))}
          </div>

          {presets.length === 0 && !loadingPresets && (
            <p className="mt-4 text-center text-xs text-black/40 dark:text-white/40">
              No presets available. Check your backend configuration.
            </p>
          )}
        </div>

        {/* Document List */}
        <div className="mt-6 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
            <h2 className="text-lg font-semibold">Ingested Documents</h2>
            <select
              value={filterSensitivity}
              onChange={(e) => setFilterSensitivity(e.target.value)}
              className="rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
            >
              <option value="all">All Levels</option>
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>

          <div className="divide-y divide-black/5 dark:divide-white/5">
            {filteredDocs.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-black/40 dark:text-white/40">
                No documents yet. Upload a PDF to get started.
              </p>
            ) : (
              filteredDocs.map((doc) => (
                <div key={doc.id} className="px-6 py-4">
                  {editingId === doc.id ? (
                    <div className="flex flex-col gap-3">
                      <p className="font-medium text-sm">{doc.title || doc.source_id}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-black/60 dark:text-white/60">
                            Sensitivity
                          </label>
                          <select
                            value={editSensitivity}
                            onChange={(e) => changeEditSensitivity(e.target.value)}
                            className="w-full rounded border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                          >
                            <option value="public">Public</option>
                            <option value="internal">Internal</option>
                            <option value="confidential">Confidential</option>
                            <option value="restricted">Restricted</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-black/60 dark:text-white/60">
                            Allowed roles (comma-separated)
                          </label>
                          <input
                            value={editRoles}
                            onChange={(e) => setEditRoles(e.target.value)}
                            placeholder="analyst, admin"
                            className="w-full rounded border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-black/40 dark:text-white/40">
                        Saving cascades the new roles to every chunk, so RLS reflects the change immediately.
                      </p>
                      {editError && <p className="text-xs text-red-500">{editError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(doc.id)}
                          disabled={savingEdit}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                        >
                          {savingEdit ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditError(null); }}
                          disabled={savingEdit}
                          className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-black/60 hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:text-white/60 dark:hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <button
                        className="min-w-0 flex-1 text-left transition-opacity hover:opacity-70"
                        onClick={() => setSelectedDoc(doc)}
                      >
                        <p className="font-medium text-sm">{doc.title || doc.source_id}</p>
                        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                          {doc.n_pages} pages • Uploaded {new Date(doc.created_at).toLocaleDateString()}
                          <span className="ml-2 text-blue-500 dark:text-blue-400">Click to preview</span>
                        </p>
                        {doc.classification_reason && (
                          <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                            Reason: {doc.classification_reason}
                          </p>
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sensitivityColors[doc.sensitivity] || "bg-gray-100 text-gray-700"}`}>
                          {doc.sensitivity}
                        </span>
                        <button
                          onClick={() => startEdit(doc)}
                          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedDoc && (
        <DocumentPreviewModal
          docId={selectedDoc.id}
          title={selectedDoc.title || selectedDoc.source_id}
          sensitivity={selectedDoc.sensitivity}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </Sidebar>
  );
}
