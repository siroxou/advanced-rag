"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = [
  { value: "admin", label: "Admin", hint: "All documents" },
  { value: "analyst", label: "Analyst", hint: "Public + internal" },
  { value: "viewer", label: "Viewer", hint: "Public only" },
];

function readRole(): string {
  if (typeof document === "undefined") return "admin";
  const m = document.cookie.match(/(?:^|;\s*)demo_roles=([^;]+)/);
  const raw = m ? decodeURIComponent(m[1]) : "";
  // The cookie may hold a single role; default (all roles) presents as Admin.
  if (raw.includes("admin") || raw === "") return "admin";
  if (raw.includes("analyst")) return "analyst";
  return "viewer";
}

export default function RoleSwitcher() {
  const router = useRouter();
  const [role, setRole] = useState("admin");

  useEffect(() => {
    // Client-only: the role lives in a cookie, read after hydration to avoid a mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readRole());
  }, []);

  function change(next: string) {
    setRole(next);
    document.cookie = `demo_roles=${next}; path=/; max-age=2592000; samesite=lax`;
    router.refresh();
  }

  const current = ROLES.find((r) => r.value === role) ?? ROLES[0];

  return (
    <div className="rounded-lg border border-black/10 bg-white/60 p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
        Viewing as
      </label>
      <select
        value={role}
        onChange={(e) => change(e.target.value)}
        className="w-full rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm font-medium outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[10px] text-black/40 dark:text-white/40">{current.hint}</p>
    </div>
  );
}
