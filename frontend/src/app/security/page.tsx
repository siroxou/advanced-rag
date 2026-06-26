"use client";

import { useCallback, useEffect, useState } from "react";

import Sidebar from "@/components/Sidebar";
import { API_BASE, type AuditEntry } from "@/lib/api";

export default function SecurityPage() {
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/audit?limit=${LIMIT}&offset=${page * LIMIT}`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.entries);
      }
    } catch (e) {
      console.error("Failed to fetch audit logs:", e);
    }
  }, [page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async on-mount fetch; state lands post-await
    fetchAudit();
  }, [fetchAudit]);

  const filteredLogs = filterRole === "all"
    ? auditLogs
    : auditLogs.filter(log => log.roles.includes(filterRole));

  const allRoles = Array.from(new Set(auditLogs.flatMap(l => l.roles)));

  return (
    <Sidebar>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold">Security Dashboard</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Monitor guardrails, audit queries, and track security events.
        </p>

        {/* Stats Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
            <p className="text-xs text-black/50 dark:text-white/50">Total Queries</p>
            <p className="mt-1 text-2xl font-bold">{auditLogs.length}</p>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
            <p className="text-xs text-black/50 dark:text-white/50">Avg Latency</p>
            <p className="mt-1 text-2xl font-bold">
              {auditLogs.length > 0
                ? `${Math.round(auditLogs.reduce((sum, l) => sum + l.latency_ms, 0) / auditLogs.length)}ms`
                : "n/a"}
            </p>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
            <p className="text-xs text-black/50 dark:text-white/50">Web Search Used</p>
            <p className="mt-1 text-2xl font-bold">
              {auditLogs.filter(l => l.used_web).length}
            </p>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
            <p className="text-xs text-black/50 dark:text-white/50">Active Users</p>
            <p className="mt-1 text-2xl font-bold">
              {new Set(auditLogs.map(l => l.username)).size}
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="mt-6 flex items-center gap-3">
          <label className="text-xs font-medium text-black/60 dark:text-white/60">Filter by role:</label>
          <select
            value={filterRole}
            onChange={(e) => { setFilterRole(e.target.value); setPage(0); }}
            className="rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
          >
            <option value="all">All Roles</option>
            {allRoles.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Audit Log Table */}
        <div className="mt-4 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black">
          <div className="border-b border-black/10 px-6 py-4 dark:border-white/10">
            <h2 className="text-lg font-semibold">Audit Log</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/5 bg-black/[0.02] text-xs uppercase text-black/50 dark:bg-white/[0.02] dark:text-white/50">
                <tr>
                  <th className="px-6 py-3 font-medium">Time</th>
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Query</th>
                  <th className="px-6 py-3 font-medium">Docs</th>
                  <th className="px-6 py-3 font-medium">Latency</th>
                  <th className="px-6 py-3 font-medium">Web</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-black/40 dark:text-white/40">
                      No audit entries found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                      <td className="px-6 py-3 text-xs text-black/50 dark:text-white/50">
                        {new Date(log.ts).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-medium text-sm">{log.username}</span>
                      </td>
                      <td className="px-6 py-3 max-w-xs">
                        <span className="text-sm text-black/70 dark:text-white/70 truncate block">
                          {log.query}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-black/50 dark:text-white/50">
                        {log.retrieved_doc_ids.length} docs
                      </td>
                      <td className="px-6 py-3 text-xs font-mono text-black/50 dark:text-white/50">
                        {log.latency_ms}ms
                      </td>
                      <td className="px-6 py-3">
                        {log.used_web ? (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            Yes
                          </span>
                        ) : (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
                            No
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {auditLogs.length >= LIMIT && (
            <div className="flex items-center justify-between border-t border-black/5 px-6 py-3 dark:border-white/5">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-black/60 disabled:opacity-40 dark:border-white/20 dark:text-white/60"
              >
                Previous
              </button>
              <span className="text-xs text-black/40 dark:text-white/40">
                Page {page + 1}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-black/60 dark:border-white/20 dark:text-white/60"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Sensitivity Legend */}
        <div className="mt-6 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-black">
          <h2 className="text-lg font-semibold">Sensitivity Levels</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              { level: "public", desc: "Available to everyone", icon: "🟢" },
              { level: "internal", desc: "Internal organization only", icon: "🔵" },
              { level: "confidential", desc: "Requires explicit clearance", icon: "🟡" },
              { level: "restricted", desc: "Highest clearance required", icon: "🔴" },
            ].map((item) => (
              <div key={item.level} className="flex items-center gap-3 rounded-lg border border-black/5 p-3 dark:border-white/5">
                <span className="text-xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium capitalize">{item.level}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
