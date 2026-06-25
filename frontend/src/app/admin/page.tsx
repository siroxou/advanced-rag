"use client";

import { useEffect, useState } from "react";

import Sidebar from "@/components/Sidebar";
import { API_BASE, type AdminUser } from "@/lib/api";

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRoles, setNewRoles] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error("Failed to fetch users:", e);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          roles: newRoles,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setSuccess(`User "${result.username}" created with roles: ${result.roles.join(", ")}`);
        setNewUsername("");
        setNewPassword("");
        setShowCreate(false);
        fetchUsers();
      } else {
        const err = await res.text();
        setError(err || "Failed to create user");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const roleColors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    analyst: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    viewer: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  };

  return (
    <Sidebar>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              Manage users, roles, and access control.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-blue-700"
          >
            {showCreate ? "Cancel" : "+ Add User"}
          </button>
        </div>

        {/* Create User Form */}
        {showCreate && (
          <div className="mt-6 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-black">
            <h2 className="text-lg font-semibold">Create New User</h2>
            <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                    Username
                  </label>
                  <input
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g., john_doe"
                    required
                    className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                    Password
                  </label>
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    type="password"
                    placeholder="Set password"
                    required
                    className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                  Roles
                </label>
                <select
                  value={newRoles}
                  onChange={(e) => setNewRoles(e.target.value)}
                  className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
                >
                  <option value="viewer">Viewer (read-only)</option>
                  <option value="analyst">Analyst (read + query)</option>
                  <option value="admin">Admin (full access)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={busy || !newUsername || !newPassword}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-blue-700 disabled:opacity-40"
              >
                {busy ? "Creating..." : "Create User"}
              </button>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </p>
              )}
              {success && (
                <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-600 dark:bg-green-900/20 dark:text-green-400">
                  {success}
                </p>
              )}
            </form>
          </div>
        )}

        {/* User List */}
        <div className="mt-6 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black">
          <div className="border-b border-black/10 px-6 py-4 dark:border-white/10">
            <h2 className="text-lg font-semibold">Users ({users.length})</h2>
          </div>

          <div className="divide-y divide-black/5 dark:divide-white/5">
            {users.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-black/40 dark:text-white/40">
                No users found. Create your first user above.
              </p>
            ) : (
              users.map((u) => (
                <div key={u.id} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{u.username}</p>
                        <p className="text-xs text-black/40 dark:text-white/40">
                          Created {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${roleColors[u.roles[0]] || "bg-gray-100 text-gray-700"}`}>
                        {u.roles.join(", ")}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${u.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
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
