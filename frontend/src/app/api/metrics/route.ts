/** Illustrative metrics so the /metrics dashboard is populated in the self-contained demo.
 *
 * The real numbers come from the FastAPI backend's SQL over audit_log; this static
 * stand-in mirrors that response shape (overall + daily series) and bakes in one
 * degraded day so the dashboard visibly tells its "what happened Tuesday?" story. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

// Seven days, healthy except a degraded "Tuesday" (index 4): a P95 spike, a cost
// jump, a citation-coverage drop, and a failure-rate bump - all at once.
const SHAPE = [
  { p50: 720, p95: 1180, cost: 0.0021, cov: 0.97, fail: 0.04 },
  { p50: 690, p95: 1090, cost: 0.0019, cov: 0.98, fail: 0.03 },
  { p50: 760, p95: 1240, cost: 0.0022, cov: 0.96, fail: 0.05 },
  { p50: 705, p95: 1150, cost: 0.002, cov: 0.97, fail: 0.04 },
  { p50: 1180, p95: 3420, cost: 0.0061, cov: 0.78, fail: 0.19 },
  { p50: 740, p95: 1210, cost: 0.0021, cov: 0.95, fail: 0.06 },
  { p50: 700, p95: 1120, cost: 0.002, cov: 0.97, fail: 0.04 },
];

function startOfDay(ts: number): string {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const windowParam = url.searchParams.get("window") ?? "7d";
  const bucket = url.searchParams.get("bucket") ?? "day";

  const now = Date.now();
  const series = SHAPE.map((s, i) => ({
    bucket: startOfDay(now - (SHAPE.length - 1 - i) * DAY),
    n: 40 + i * 3,
    p50_ms: s.p50,
    p95_ms: s.p95,
    avg_cost_usd: s.cost,
    citation_coverage: s.cov,
    failure_rate: s.fail,
  }));

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const overall = {
    n: series.reduce((a, b) => a + b.n, 0),
    p50_ms: Math.round(mean(series.map((s) => s.p50_ms))),
    p95_ms: Math.max(...series.map((s) => s.p95_ms)),
    avg_cost_usd: Number(mean(series.map((s) => s.avg_cost_usd)).toFixed(4)),
    citation_coverage: Number(mean(series.map((s) => s.citation_coverage)).toFixed(3)),
    failure_rate: Number(mean(series.map((s) => s.failure_rate)).toFixed(3)),
  };

  return Response.json({ window: windowParam, bucket, overall, series });
}
