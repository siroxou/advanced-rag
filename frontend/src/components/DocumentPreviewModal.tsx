"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE, type DocumentChunk } from "@/lib/api";

const SENSITIVITY_CLASSES: Record<string, string> = {
  public: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  internal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  confidential: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  restricted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

type Props = {
  docId: string;
  title: string;
  sensitivity?: string;
  highlightPage?: number;
  onClose: () => void;
};

export default function DocumentPreviewModal({
  docId,
  title,
  sensitivity,
  highlightPage,
  onClose,
}: Props) {
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadChunks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/documents/${docId}/chunks`);
      if (!r.ok) throw new Error(`${r.status}`);
      const data: DocumentChunk[] = await r.json();
      setChunks(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    loadChunks();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadChunks]);

  // Scroll to first highlighted chunk after load
  useEffect(() => {
    if (highlightPage == null || !containerRef.current || chunks.length === 0) return;
    const el = containerRef.current.querySelector("[data-highlight]");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [chunks, highlightPage]);

  const sensitivityClass =
    sensitivity ? (SENSITIVITY_CLASSES[sensitivity] ?? "bg-gray-100 text-gray-700") : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-2xl max-h-[80vh] flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-950">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-black/10 px-5 py-4 dark:border-white/10">
          <div className="flex flex-col gap-1.5 min-w-0">
            <h2 className="truncate font-semibold leading-tight">{title}</h2>
            {sensitivity && (
              <span
                className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sensitivityClass}`}
              >
                {sensitivity}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-black/40 transition-colors hover:bg-black/5 hover:text-black/70 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white/70"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div ref={containerRef} className="flex-1 overflow-y-auto p-5">
          {loading && (
            <p className="text-center text-sm text-black/40 dark:text-white/40 py-8">
              Loading content...
            </p>
          )}
          {error && (
            <p className="text-center text-sm text-red-500 py-8">Error: {error}</p>
          )}
          {!loading && !error && chunks.length === 0 && (
            <p className="text-center text-sm text-black/40 dark:text-white/40 py-8">
              No content available (access may be restricted).
            </p>
          )}
          <div className="space-y-3">
            {chunks.map((chunk) => {
              const isHighlight = highlightPage != null && chunk.page === highlightPage;
              return (
                <div
                  key={chunk.id}
                  {...(isHighlight ? { "data-highlight": "true" } : {})}
                  className={`rounded-lg p-3.5 ${
                    isHighlight
                      ? "border border-blue-200 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-950/30"
                      : "bg-black/[0.025] dark:bg-white/[0.04]"
                  }`}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-medium text-black/40 dark:text-white/40">
                      {chunk.citation_anchor}
                    </span>
                    {isHighlight && (
                      <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                        cited
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-black/80 dark:text-white/80">
                    {chunk.content}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
