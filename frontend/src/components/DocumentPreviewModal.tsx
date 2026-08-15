"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Modal from "@/components/Modal";
import { API_BASE, demoHeaders, type DocumentChunk } from "@/lib/api";
import { sensitivityClass } from "@/lib/sensitivity";

export type PreviewDoc = {
  id: string;
  title: string;
  sensitivity?: string;
  /** Scrolls to and marks the chunk a citation pointed at. */
  highlightPage?: number;
};

type Props = {
  doc: PreviewDoc | null;
  onClose: () => void;
};

export default function DocumentPreviewModal({ doc, onClose }: Props) {
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const docId = doc?.id;

  const loadChunks = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/documents/${docId}/chunks`, {
        headers: demoHeaders(),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setChunks(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- async fetch; state lands post-await */
    setChunks([]);
    loadChunks();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadChunks]);

  // Bring the cited passage into view once the content is there.
  useEffect(() => {
    if (doc?.highlightPage == null || chunks.length === 0) return;
    bodyRef.current
      ?.querySelector("[data-highlight]")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [chunks, doc?.highlightPage]);

  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title={doc?.title ?? ""}
      meta={
        doc?.sensitivity ? (
          <span className={`badge ${sensitivityClass(doc.sensitivity)}`}>{doc.sensitivity}</span>
        ) : null
      }
    >
      <div ref={bodyRef}>
        {loading && <p className="py-8 text-center text-sm text-faint">Loading content...</p>}
        {error && <p className="py-8 text-center text-sm text-danger">Error: {error}</p>}
        {!loading && !error && chunks.length === 0 && (
          <p className="py-8 text-center text-sm text-faint">
            No content available at your access level.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {chunks.map((chunk) => {
            const isHighlight =
              doc?.highlightPage != null && chunk.page === doc.highlightPage;
            return (
              <div
                key={chunk.id}
                {...(isHighlight ? { "data-highlight": "true" } : {})}
                className={`rounded-xl border p-3.5 ${
                  isHighlight
                    ? "border-accent-line bg-accent-soft"
                    : "border-line bg-surface-2"
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="font-mono text-[0.6875rem] text-faint">
                    {chunk.citation_anchor}
                  </span>
                  {isHighlight && <span className="badge badge-accent">cited</span>}
                </div>
                <p className="text-sm leading-relaxed text-muted">{chunk.content}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
