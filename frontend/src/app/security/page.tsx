"use client";

import { useCallback, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { IconGlobe, IconLock } from "@/components/icons";
import { API_BASE, demoHeaders, type AuditEntry } from "@/lib/api";

const LIMIT = 20;

const TIERS = [
  { level: "public", desc: "Anyone with access to the assistant", cls: "badge-ok" },
  { level: "internal", desc: "Analysts and admins", cls: "badge-info" },
  { level: "confidential", desc: "Admins, with the reason recorded", cls: "badge-warn" },
  { level: "restricted", desc: "Admins only, never retrievable below that", cls: "badge-danger" },
];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filterRole, setFilterRole] = useState("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/audit?limit=${LIMIT}&offset=${page * LIMIT}`, {
        headers: demoHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
      }
    } catch (e) {
      console.error("Failed to fetch audit logs:", e);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async on-mount fetch; state lands post-await
    fetchAudit();
  }, [fetchAudit]);

  const roles = Array.from(new Set(entries.flatMap((e) => e.roles)));
  const shown = filterRole === "all" ? entries : entries.filter((e) => e.roles.includes(filterRole));

  const refused = entries.filter((e) => e.retrieved_doc_ids.length === 0).length;
  const avgLatency = entries.length
    ? Math.round(entries.reduce((sum, e) => sum + e.latency_ms, 0) / entries.length)
    : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <PageHeader
          title="Audit"
          subtitle="Every question is recorded with the role that asked it and the documents retrieval was allowed to return."
        />

        {/* Four short numbers pair up on a phone rather than each taking a row. */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Queries" value={String(entries.length)} hint="in this window" />
          <Stat
            label="Returned nothing"
            value={String(refused)}
            hint="blocked or out of clearance"
          />
          <Stat label="Avg latency" value={`${avgLatency}ms`} hint="end to end" />
          <Stat
            label="Distinct users"
            value={String(new Set(entries.map((e) => e.username)).size)}
          />
        </div>

        {/* Query log */}
        <section className="card mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="font-semibold">Query log</h2>
            <div className="flex items-center gap-2">
              <label htmlFor="role-filter" className="text-xs text-faint">
                Role
              </label>
              <select
                id="role-filter"
                value={filterRole}
                onChange={(e) => {
                  setFilterRole(e.target.value);
                  setPage(0);
                }}
                className="field w-auto py-1 text-xs"
              >
                <option value="all">All</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* A wide table scrolls inside its own box; the page never scrolls sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-faint">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Time</th>
                  <th className="px-5 py-2.5 font-medium">User</th>
                  <th className="px-5 py-2.5 font-medium">Query</th>
                  <th className="px-5 py-2.5 font-medium">Retrieved</th>
                  <th className="px-5 py-2.5 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-faint">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading && shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-faint">
                      No entries for this role.
                    </td>
                  </tr>
                )}
                {shown.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-3 text-xs whitespace-nowrap text-faint">
                      {new Date(log.ts).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium">{log.username}</span>
                    </td>
                    <td className="max-w-sm px-5 py-3">
                      <span className="flex items-center gap-1.5 truncate text-sm text-muted">
                        {log.used_web && <IconGlobe size={12} className="shrink-0 text-faint" />}
                        {log.query}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {log.retrieved_doc_ids.length === 0 ? (
                        <span className="badge badge-danger">
                          <IconLock size={10} /> none
                        </span>
                      ) : (
                        <span className="badge badge-neutral">
                          {log.retrieved_doc_ids.length} doc
                          {log.retrieved_doc_ids.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs tabular-nums text-faint">
                      {log.latency_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {entries.length >= LIMIT && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-secondary btn-sm"
              >
                Previous
              </button>
              <span className="text-xs text-faint">Page {page + 1}</span>
              <button onClick={() => setPage((p) => p + 1)} className="btn btn-secondary btn-sm">
                Next
              </button>
            </div>
          )}
        </section>

        {/* Tier legend */}
        <section className="card mt-6 p-5">
          <h2 className="font-semibold">Access tiers</h2>
          <p className="mt-1 text-sm text-muted">
            A document&apos;s tier decides which roles retrieval may return it to. In the full
            stack this is a Postgres row-level security policy, so the database refuses the rows
            rather than trusting the application to filter them.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {TIERS.map(({ level, desc, cls }) => (
              <div key={level} className="card-flat flex items-center gap-3 p-3">
                <span className={`badge ${cls}`}>{level}</span>
                <p className="text-xs text-muted">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
