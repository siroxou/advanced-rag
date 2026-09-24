"use client";

import { useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { IconAlert, IconLock } from "@/components/icons";
import {
  getMetrics,
  IS_HOSTED_DEMO,
  useIsAdmin,
  type MetricPoint,
  type MetricsResponse,
} from "@/lib/api";

const RANGES = ["24h", "7d", "30d"];
const BUCKETS = ["hour", "day", "week"];

const fmtMs = (v: number | null) => (v == null ? "-" : `${Math.round(v).toLocaleString()} ms`);
const fmtCost = (v: number | null) => (v == null ? "-" : `$${v.toFixed(4)}`);
const fmtPct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

type Point = { bucket: string; value: number | null };

// Hand-rolled CSS bars: a few dozen buckets don't justify a charting dependency.
function Bars({
  title,
  points,
  format,
  tone,
  ceil,
}: {
  title: string;
  points: Point[];
  format: (v: number | null) => string;
  tone: string;
  /** Fixed top of the scale (1 for rates); otherwise the data's own maximum. */
  ceil?: number;
}) {
  // Scale to the data, or cost (fractions of a cent) never draws a visible bar.
  const max = ceil ?? (Math.max(0, ...points.map((p) => p.value ?? 0)) || 1);
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold">{title}</p>
      {points.length === 0 ? (
        <p className="mt-6 text-sm text-faint">No data in this window.</p>
      ) : (
        <div
          className={`mt-4 flex h-32 items-end overflow-hidden ${points.length > 60 ? "" : "gap-1"}`}
        >
          {points.map((p) => (
            <div
              key={p.bucket}
              className="flex h-full flex-1 items-end"
              title={`${new Date(p.bucket).toLocaleString()}: ${format(p.value)}`}
            >
              <div
                className={`w-full rounded-t ${tone}`}
                style={{ height: `${((p.value ?? 0) / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MetricsPage() {
  const isAdmin = useIsAdmin();
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [range, setRange] = useState("7d");
  const [bucket, setBucket] = useState("day");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Metrics read the whole audit log, so the backend serves them to a signed
    // admin only; the hosted demo has no audit log to aggregate.
    if (IS_HOSTED_DEMO || !isAdmin) return;
    // A response for a window the user has already changed away from is ignored.
    let stale = false;
    getMetrics(range, bucket)
      .then((d) => {
        if (!stale) {
          setError(null);
          setData(d);
        }
      })
      .catch((e) => {
        if (!stale) setError(e instanceof Error ? e.message : "Failed to load metrics");
      });
    return () => {
      stale = true;
    };
  }, [range, bucket, isAdmin]);

  const o: MetricPoint | undefined = data?.overall;
  const series = data?.series ?? [];
  const live = !IS_HOSTED_DEMO && isAdmin;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <PageHeader
          title="Metrics"
          subtitle="Quality, latency and cost from the audit log. P50/P95 latency, not averages, which hide the worst case."
          actions={
            live && (
              <div className="flex gap-2">
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  aria-label="Time window"
                  className="field w-auto py-1 text-xs"
                >
                  {RANGES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  aria-label="Bucket size"
                  className="field w-auto py-1 text-xs"
                >
                  {BUCKETS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )
          }
        />

        {!live && (
          <p className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
            <IconLock size={15} className="mt-0.5 shrink-0 text-faint" />
            {IS_HOSTED_DEMO
              ? "Metrics are aggregated from the FastAPI audit log, which the hosted demo does not run. Start the full stack to see them."
              : "Metrics cover every user's queries, so they need an admin. Sign in from the sidebar."}
          </p>
        )}

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-2.5 text-sm text-danger">
            <IconAlert size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        {live && !data && !error && <p className="mt-8 text-sm text-faint">Loading...</p>}

        {o && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="P50 latency" value={fmtMs(o.p50_ms)} hint={`${o.n} requests`} />
              <Stat label="P95 latency" value={fmtMs(o.p95_ms)} />
              <Stat label="Cost / request" value={fmtCost(o.avg_cost_usd)} />
              <Stat label="Citation coverage" value={fmtPct(o.citation_coverage)} />
              <Stat label="Failure rate" value={fmtPct(o.failure_rate)} />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Bars
                title="P95 latency"
                points={series.map((s) => ({ bucket: s.bucket, value: s.p95_ms }))}
                format={fmtMs}
                tone="bg-accent"
              />
              <Bars
                title="Cost / request"
                points={series.map((s) => ({ bucket: s.bucket, value: s.avg_cost_usd }))}
                format={fmtCost}
                tone="bg-ok"
              />
              <Bars
                title="Citation coverage"
                points={series.map((s) => ({ bucket: s.bucket, value: s.citation_coverage }))}
                format={fmtPct}
                tone="bg-info"
                ceil={1}
              />
              <Bars
                title="Failure rate"
                points={series.map((s) => ({ bucket: s.bucket, value: s.failure_rate }))}
                format={fmtPct}
                tone="bg-danger"
                ceil={1}
              />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
