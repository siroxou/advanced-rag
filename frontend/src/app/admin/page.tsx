"use client";

import { useCallback, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { IconAlert, IconCheck, IconLock } from "@/components/icons";
import { API_BASE, IS_HOSTED_DEMO, type AdminUser } from "@/lib/api";

const ROLE_BADGE: Record<string, string> = {
  admin: "badge-danger",
  analyst: "badge-info",
  viewer: "badge-ok",
};

const ROLE_REACH: Record<string, string> = {
  admin: "Every tier, including restricted",
  analyst: "Public and internal documents",
  viewer: "Public documents only",
};

export default function PeoplePage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`);
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      console.error("Failed to fetch users:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async on-mount fetch; state lands post-await
    fetchUsers();
  }, [fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, roles }),
      });
      if (res.ok) {
        const result = await res.json();
        setSuccess(`Created ${result.username} with roles: ${result.roles.join(", ")}`);
        setUsername("");
        setPassword("");
        setShowCreate(false);
        fetchUsers();
      } else {
        setError((await res.text()) || "Failed to create user");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <PageHeader
          title="People"
          subtitle="Accounts and the roles they carry. A role is the only thing that decides which documents retrieval will return."
          actions={
            !IS_HOSTED_DEMO && (
              <button
                onClick={() => setShowCreate((s) => !s)}
                aria-expanded={showCreate}
                className={showCreate ? "btn btn-secondary" : "btn btn-primary"}
              >
                {showCreate ? "Cancel" : "Add person"}
              </button>
            )
          }
        />

        {IS_HOSTED_DEMO && (
          <p className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
            <IconLock size={15} className="mt-0.5 shrink-0 text-faint" />
            These three accounts are fixed in the hosted demo. Use the role switcher in the
            sidebar to browse as any of them; creating accounts needs the auth backend from the
            full stack.
          </p>
        )}

        {showCreate && (
          <form onSubmit={handleCreate} className="card mt-5 flex flex-col gap-4 p-5">
            <h2 className="font-semibold">New person</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="new-username">
                  Username
                </label>
                <input
                  id="new-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="new-password">
                  Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="field"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="new-roles">
                Role
              </label>
              <select
                id="new-roles"
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                className="field"
              >
                <option value="viewer">Viewer - public documents only</option>
                <option value="analyst">Analyst - public and internal</option>
                <option value="admin">Admin - every tier</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={busy || !username || !password}
              className="btn btn-primary self-start"
            >
              {busy ? "Creating..." : "Create"}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger">
            <IconAlert size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
        {success && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-ok-line bg-ok-soft px-4 py-3 text-sm text-ok">
            <IconCheck size={15} className="mt-0.5 shrink-0" />
            {success}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {loading && <p className="py-10 text-center text-sm text-faint">Loading people...</p>}
          {users.map((u) => (
            <div key={u.id} className="card flex items-center gap-3 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                {u.username.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{u.username}</p>
                <p className="text-xs text-faint">
                  {ROLE_REACH[u.roles[0]] ?? "Custom role set"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {u.roles.map((r) => (
                  <span key={r} className={`badge ${ROLE_BADGE[r] ?? "badge-neutral"}`}>
                    {r}
                  </span>
                ))}
                {!u.is_active && <span className="badge badge-neutral">inactive</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
