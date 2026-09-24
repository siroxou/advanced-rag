"use client";

import { useCallback, useEffect, useState } from "react";

import Sidebar from "@/components/Sidebar";
import { getMetrics, type MetricPoint, type MetricsResponse } from "@/lib/api";

const SELECT =
  "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400";

const RANGES = ["24h", "7d", "30d"];
const BUCKETS = ["hour", "day", "week"];

const fmtMs = (v: number | null) => (v == null ? "—" : `${Math.round(v).toLocaleString()} ms`);
const fmtCost = (v: number | null) => (v == null ? "—" : `$${v.toFixed(4)}`);
const fmtPct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
      <p className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-black/40 dark:text-white/40">{hint}</p>}
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
}: {
  title: string;
  points: Point[];
  format: (v: number | null) => string;
  tone: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
      <p className="text-sm font-semibold">{title}</p>
      {points.length === 0 ? (
        <p className="mt-6 text-sm text-black/40 dark:text-white/40">No data in this window.</p>
      ) : (
        <div className="mt-4 flex h-32 items-end gap-1">
          {points.map((p) => (
            <div
              key={p.bucket}
              className="flex-1"
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
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [range, setRange] = useState("7d");
  const [bucket, setBucket] = useState("day");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getMetrics(range, bucket));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    }
  }, [range, bucket]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- async fetch; state lands post-await */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const o: MetricPoint | undefined = data?.overall;
  const series = data?.series ?? [];

  return (
    <Sidebar>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Metrics</h1>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              Quality, latency and cost from the audit log. P50/P95 latency, not averages, which
              hide the worst case.
            </p>
          </div>
          <div className="flex gap-2">
            <select value={range} onChange={(e) => setRange(e.target.value)} className={SELECT}>
              {RANGES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select value={bucket} onChange={(e) => setBucket(e.target.value)} className={SELECT}>
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
            {error.includes("403") ? " — metrics are admin-only." : ""}
          </div>
        )}

        {!data && !error && (
          <p className="mt-8 text-sm text-black/50 dark:text-white/50">Loading…</p>
        )}

        {o && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Card label="P50 latency" value={fmtMs(o.p50_ms)} hint={`${o.n} requests`} />
              <Card label="P95 latency" value={fmtMs(o.p95_ms)} />
              <Card label="Cost / request" value={fmtCost(o.avg_cost_usd)} />
              <Card label="Citation coverage" value={fmtPct(o.citation_coverage)} />
              <Card label="Failure rate" value={fmtPct(o.failure_rate)} />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Bars
                title="P95 latency"
                points={series.map((s) => ({ bucket: s.bucket, value: s.p95_ms }))}
                format={fmtMs}
                tone="bg-blue-500/70"
              />
              <Bars
                title="Cost / request"
                points={series.map((s) => ({ bucket: s.bucket, value: s.avg_cost_usd }))}
                format={fmtCost}
                tone="bg-emerald-500/70"
              />
              <Bars
                title="Citation coverage"
                points={series.map((s) => ({ bucket: s.bucket, value: s.citation_coverage }))}
                format={fmtPct}
                tone="bg-violet-500/70"
              />
              <Bars
                title="Failure rate"
                points={series.map((s) => ({ bucket: s.bucket, value: s.failure_rate }))}
                format={fmtPct}
                tone="bg-red-500/70"
              />
            </div>
          </>
        )}
      </div>
    </Sidebar>
  );
}
