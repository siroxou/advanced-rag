"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { IconLock } from "@/components/icons";

const ROLES = [
  { value: "viewer", label: "Viewer", hint: "Public documents only", tiers: 1 },
  { value: "analyst", label: "Analyst", hint: "Public and internal", tiers: 2 },
  { value: "admin", label: "Admin", hint: "Every tier, including restricted", tiers: 3 },
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
    <div className="rounded-xl border border-line bg-sunken p-2.5">
      <label
        htmlFor="role-switcher"
        className="eyebrow mb-1.5 flex items-center gap-1.5 text-[0.625rem]"
      >
        <IconLock size={11} />
        Viewing as
      </label>
      <select
        id="role-switcher"
        value={role}
        onChange={(e) => change(e.target.value)}
        className="field font-medium"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {/* Clearance shown as filled segments: the reach of the role is visible
          without reading the sentence under it. */}
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((tier) => (
          <span
            key={tier}
            className={`h-1 flex-1 rounded-full ${
              tier <= current.tiers ? "bg-accent" : "bg-line-strong"
            }`}
            style={{ transition: "background-color var(--dur) var(--ease-out)" }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[0.6875rem] leading-snug text-faint">{current.hint}</p>
    </div>
  );
}
