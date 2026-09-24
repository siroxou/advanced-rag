"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { IconLock } from "@/components/icons";
import { IS_HOSTED_DEMO, signOut, useSession } from "@/lib/api";

const ROLES = [
  { value: "viewer", label: "Viewer", hint: "Public documents only", tiers: 1 },
  { value: "analyst", label: "Analyst", hint: "Public and internal", tiers: 2 },
  { value: "admin", label: "Admin", hint: "Every tier, including restricted", tiers: 3 },
];

// With no cookie the hosted demo grants every role, while FastAPI falls back to
// its least-privilege demo role, so the switcher must say the same thing.
const DEFAULT_ROLE = IS_HOSTED_DEMO ? "admin" : "viewer";

function readRole(): string {
  if (typeof document === "undefined") return DEFAULT_ROLE;
  const m = document.cookie.match(/(?:^|;\s*)demo_roles=([^;]+)/);
  const raw = m ? decodeURIComponent(m[1]) : "";
  if (raw === "") return DEFAULT_ROLE;
  if (raw.includes("admin")) return "admin";
  if (raw.includes("analyst")) return "analyst";
  return "viewer";
}

export default function RoleSwitcher({ onSignIn }: { onSignIn?: () => void }) {
  const router = useRouter();
  const me = useSession();
  const [role, setRole] = useState(DEFAULT_ROLE);

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

  // A signed token overrides the switcher on the backend, so show whose it is.
  if (me) {
    return (
      <div className="rounded-xl border border-line bg-sunken p-2.5">
        <p className="eyebrow mb-1.5 flex items-center gap-1.5 text-[0.625rem]">
          <IconLock size={11} />
          Signed in
        </p>
        <p className="truncate text-sm font-medium">{me.sub}</p>
        <p className="mt-0.5 text-[0.6875rem] leading-snug text-faint">{me.roles.join(", ")}</p>
        <button
          type="button"
          onClick={() => {
            signOut();
            location.reload();
          }}
          className="btn btn-ghost btn-sm mt-2 w-full"
        >
          Sign out
        </button>
      </div>
    );
  }

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
      {onSignIn && !IS_HOSTED_DEMO && (
        <button type="button" onClick={onSignIn} className="btn btn-ghost btn-sm mt-2 w-full">
          Sign in to make changes
        </button>
      )}
    </div>
  );
}
