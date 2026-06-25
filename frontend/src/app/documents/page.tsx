"use client";

import { useState } from "react";

import Sidebar from "@/components/Sidebar";
import { API_BASE, type DocumentInfo } from "@/lib/api";

type UploadState = "idle" | "uploading" | "success" | "error";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [sensitivity, setSensitivity] = useState("internal");
  const [allowedRoles, setAllowedRoles] = useState("viewer");
  const [filterSensitivity, setFilterSensitivity] = useState<string>("all");

  async function fetchDocuments() {
    try {
      const res = await fetch(`${API_BASE}/api/documents`);
      if (res.ok) {
        const docs = await res.json();
        setDocuments(docs);
      }
    } catch (e) {
      console.error("Failed to fetch documents:", e);
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{doc.title || doc.source_id}</p>
                      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                        {doc.n_pages} pages • Uploaded {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                      {doc.classification_reason && (
                        <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                          Reason: {doc.classification_reason}
                        </p>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sensitivityColors[doc.sensitivity] || "bg-gray-100 text-gray-700"}`}>
                      {doc.sensitivity}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
