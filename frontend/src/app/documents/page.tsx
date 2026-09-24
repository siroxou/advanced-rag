"use client";

import { useCallback, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import DocumentPreviewModal, { type PreviewDoc } from "@/components/DocumentPreviewModal";
import PageHeader from "@/components/PageHeader";
import { IconAlert, IconLock, IconUpload } from "@/components/icons";
import {
  API_BASE,
  demoHeaders,
  IS_HOSTED_DEMO,
  useIsAdmin,
  updateDocument,
  type DocumentInfo,
} from "@/lib/api";
import { sensitivityClass } from "@/lib/sensitivity";

// Default role set per tier, mirroring the backend auto-classifier. Selecting a
// sensitivity prefills these; the operator can still override.
const TIER_ROLES: Record<string, string> = {
  public: "viewer, analyst, admin",
  internal: "analyst, admin",
  confidential: "admin",
  restricted: "admin",
};

const TIERS = ["all", "public", "internal", "confidential", "restricted"];

export default function DocumentsPage() {
  const isAdmin = useIsAdmin();
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [preview, setPreview] = useState<PreviewDoc | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Inline re-classification editor.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSensitivity, setEditSensitivity] = useState("internal");
  const [editRoles, setEditRoles] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/documents`, { headers: demoHeaders() });
      if (res.ok) setDocuments(await res.json());
    } catch (e) {
      console.error("Failed to fetch documents:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // On-mount load. State is set only after the fetch resolves (post-await), so
    // the synchronous cascading-render case this rule guards against doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDocuments();
  }, [fetchDocuments]);

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
      const roles = editRoles.split(",").map((r) => r.trim()).filter(Boolean);
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
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/documents/upload`, {
        method: "POST",
        // No Content-Type: the browser sets the multipart boundary itself.
        headers: demoHeaders(),
        body: formData,
      });
      if (res.ok) fetchDocuments();
      else setUploadError((await res.text()) || "Upload failed");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Network error");
    }
  }

  const filtered =
    filter === "all" ? documents : documents.filter((d) => d.sensitivity === filter);

  const counts = documents.reduce<Record<string, number>>((acc, d) => {
    acc[d.sensitivity] = (acc[d.sensitivity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <PageHeader
          title="Documents"
          subtitle="The corpus behind every answer, and the access tier that decides who can retrieve from it."
        />

        {/* Filter. Buttons rather than a dropdown: five options, and the counts
            are worth seeing without opening anything. */}
        <div className="mt-6 flex flex-wrap gap-1.5">
          {TIERS.map((tier) => {
            const active = filter === tier;
            const count = tier === "all" ? documents.length : (counts[tier] ?? 0);
            return (
              <button
                key={tier}
                onClick={() => setFilter(tier)}
                aria-pressed={active}
                className={`btn btn-sm capitalize ${active ? "btn-primary" : "btn-secondary"}`}
              >
                {tier}
                <span className={active ? "opacity-70" : "text-faint"}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Documents */}
        <div className="mt-4 flex flex-col gap-2">
          {loading && <p className="py-10 text-center text-sm text-faint">Loading corpus...</p>}

          {!loading && filtered.length === 0 && (
            <p className="card py-10 text-center text-sm text-faint">
              No documents in this tier.
            </p>
          )}

          {filtered.map((doc) =>
            editingId === doc.id ? (
              <div key={doc.id} className="card border-accent-line p-4">
                <p className="text-sm font-medium">{doc.title || doc.source_id}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`tier-${doc.id}`}>
                      Access tier
                    </label>
                    <select
                      id={`tier-${doc.id}`}
                      value={editSensitivity}
                      onChange={(e) => changeEditSensitivity(e.target.value)}
                      className="field"
                    >
                      <option value="public">Public</option>
                      <option value="internal">Internal</option>
                      <option value="confidential">Confidential</option>
                      <option value="restricted">Restricted</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`roles-${doc.id}`}>
                      Allowed roles
                    </label>
                    <input
                      id={`roles-${doc.id}`}
                      value={editRoles}
                      onChange={(e) => setEditRoles(e.target.value)}
                      placeholder="analyst, admin"
                      className="field"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-faint">
                  Saving cascades the new roles to every chunk, so retrieval reflects the change
                  on the next question.
                </p>
                {editError && <p className="mt-2 text-xs text-danger">{editError}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => saveEdit(doc.id)}
                    disabled={savingEdit}
                    className="btn btn-primary btn-sm"
                  >
                    {savingEdit ? "Saving..." : "Save and cascade"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditError(null);
                    }}
                    disabled={savingEdit}
                    className="btn btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={doc.id}
                className="card flex items-start gap-4 p-4 transition-[border-color] hover:border-line-strong"
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    setPreview({
                      id: doc.id,
                      title: doc.title || doc.source_id,
                      sensitivity: doc.sensitivity,
                    })
                  }
                >
                  <p className="truncate text-sm font-medium">{doc.title || doc.source_id}</p>
                  <p className="mt-1 text-xs text-faint">
                    {doc.n_pages} page{doc.n_pages === 1 ? "" : "s"} ·{" "}
                    {new Date(doc.created_at).toLocaleDateString()}
                    {doc.auto_classified && " · auto-classified"}
                  </p>
                  {doc.classification_reason && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted">
                      {doc.classification_reason}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`badge ${sensitivityClass(doc.sensitivity)}`}>
                    {doc.sensitivity}
                  </span>
                  {/* The hosted demo re-tiers in a cookie; the full stack needs an admin token. */}
                  {(IS_HOSTED_DEMO || isAdmin) && (
                    <button onClick={() => startEdit(doc)} className="btn btn-ghost btn-sm">
                      Re-tier
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Upload */}
        <section className="card mt-8 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <IconUpload size={16} />
            Add a document
          </h2>

          {IS_HOSTED_DEMO ? (
            <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-muted">
              <IconLock size={15} className="mt-0.5 shrink-0 text-faint" />
              Uploads need the ingestion pipeline - PDF parsing, BGE-M3 embeddings and pgvector -
              which the hosted demo does not run. Clone the repo and start the FastAPI stack to
              ingest your own PDFs; everything else here works against the bundled corpus.
            </p>
          ) : !isAdmin ? (
            <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-muted">
              <IconLock size={15} className="mt-0.5 shrink-0 text-faint" />
              Sign in as an admin (sidebar) to upload PDFs or re-tier documents.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                PDF only. Uploads are stored as internal (analyst and admin); re-tier them above.
              </p>
              <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line-strong px-8 py-10 transition-colors hover:border-accent">
                <input
                  type="file"
                  accept=".pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                />
                <IconUpload size={22} className="text-faint" />
                <span className="mt-2 text-sm text-muted">Choose a PDF</span>
              </label>
            </>
          )}

          {uploadError && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
              <IconAlert size={14} className="mt-px shrink-0" />
              {uploadError}
            </p>
          )}
        </section>
      </div>

      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />
    </AppShell>
  );
}
