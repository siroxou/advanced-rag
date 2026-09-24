"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import Modal from "@/components/Modal";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import {
  IconAlert,
  IconChat,
  IconClose,
  IconDocs,
  IconGithub,
  IconLibrary,
  IconMenu,
  IconSettings,
  IconShield,
  IconSparkle,
  IconUsers,
} from "@/components/icons";
import { IS_HOSTED_DEMO, login } from "@/lib/api";
import { project, springTo } from "@/lib/motion";

const NAV = [
  { label: "Chat", href: "/chat", Icon: IconChat, hint: "Ask the corpus" },
  { label: "Documents", href: "/documents", Icon: IconDocs, hint: "Corpus and access tiers" },
  { label: "Corpus", href: "/presets", Icon: IconLibrary, hint: "Loaded datasets" },
  { label: "People", href: "/admin", Icon: IconUsers, hint: "Users and roles" },
  { label: "Audit", href: "/security", Icon: IconShield, hint: "Query log and guardrails" },
  { label: "Settings", href: "/settings", Icon: IconSettings, hint: "Model, keys, guardrails" },
];

const DESKTOP = "(min-width: 64rem)";
const COLLAPSE_KEY = "rag_rail_collapsed";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  const asideRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const xRef = useRef(0);
  const cancelRef = useRef<() => void>(() => {});

  // ── Drawer position ───────────────────────────────────────────────────────
  // x is the live on-screen offset: 0 fully open, -width closed. Every animation
  // starts from this value, so an interrupting grab continues from where the
  // drawer actually is instead of snapping to where a transition assumed it was.

  const setX = useCallback((v: number) => {
    xRef.current = v;
    const el = asideRef.current;
    if (el) el.style.transform = `translate3d(${v}px,0,0)`;
    const scrim = scrimRef.current;
    const width = el?.offsetWidth || 1;
    // The scrim tracks the drawer 1:1 through the whole drag, rather than
    // fading only once the gesture is over.
    if (scrim) scrim.style.opacity = String(Math.max(0, 1 + v / width));
  }, []);

  const animateTo = useCallback(
    (target: number, velocity = 0) => {
      cancelRef.current();
      cancelRef.current = springTo(xRef.current, target, setX, {
        response: 0.3,
        velocity,
      });
    },
    [setX]
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Drive the drawer whenever the open state or the breakpoint changes. On
  // desktop the same element is a static rail, so the transform is cleared.
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    if (isDesktop) {
      cancelRef.current();
      el.style.transform = "";
      xRef.current = 0;
      return;
    }
    const width = el.offsetWidth;
    if (open) animateTo(0);
    else if (xRef.current === 0 && !el.style.transform) setX(-width);
    else animateTo(-width);
  }, [open, isDesktop, animateTo, setX]);

  // Escape closes, and focus returns to the control that opened it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => cancelRef.current(), []);

  // ── Swipe to dismiss ──────────────────────────────────────────────────────
  // Tracked with Pointer Events so it works for touch, pen and mouse alike, and
  // survives the pointer leaving the drawer mid-drag.

  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    active: boolean;
    history: { x: number; t: number }[];
  } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (isDesktop || !open) return;
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      history: [{ x: e.clientX, t: e.timeStamp }],
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    // Wait for a clear horizontal intent before claiming the gesture, so taps
    // on nav links and vertical scrolls still behave normally.
    if (!d.active) {
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
      d.active = true;
      cancelRef.current();
      try {
        // Keeps tracking if the finger leaves the drawer mid-drag. Throws if the
        // pointer is already gone, which is not a reason to drop the gesture.
        (e.currentTarget as HTMLElement).setPointerCapture(d.id);
      } catch {
        /* tracking continues without capture */
      }
    }

    d.history.push({ x: e.clientX, t: e.timeStamp });
    if (d.history.length > 6) d.history.shift();
    // Opening further is not a thing the drawer does, so resist past the edge
    // instead of letting it slide off to the right.
    setX(dx > 0 ? dx * 0.12 : dx);
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.active) return;

    const el = asideRef.current;
    const width = el?.offsetWidth ?? 260;
    const first = d.history[0];
    const last = d.history[d.history.length - 1];
    const dt = Math.max(1, last.t - first.t);
    const velocity = ((last.x - first.x) / dt) * 1000; // px/s

    // Commit on where the throw is heading, not on where the finger stopped.
    const projected = xRef.current + project(velocity);
    const shouldClose = projected < -width / 2;

    if (shouldClose) {
      animateTo(-width, velocity);
      setOpen(false);
      triggerRef.current?.focus();
    } else {
      animateTo(0, velocity);
    }
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      // Non-fatal: the choice still holds for this session.
    }
  }

  // The rail width is a single custom property. The collapse choice sets it
  // directly, and nothing else competes for the same declaration, so an explicit
  // choice can never be silently overruled by a layout default.
  const railWidth = collapsed ? "4.5rem" : "15rem";
  const drawerHidden = !isDesktop && !open;

  return (
    <div className="min-h-dvh bg-bg" style={{ ["--rail" as string]: railWidth }}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:text-on-accent"
      >
        Skip to content
      </a>

      {/* Mobile bar: floats over the content rather than reserving a strip. */}
      <div className="glass sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line px-3 lg:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-nav"
          className="btn btn-ghost btn-icon"
        >
          <IconMenu size={20} />
          <span className="sr-only">Open navigation</span>
        </button>
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Mark />
          Acme RAG
        </Link>
      </div>

      {/* Scrim: dims the page behind a task that blocks it. */}
      <div
        ref={scrimRef}
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-[var(--scrim)] opacity-0 lg:hidden ${
          drawerHidden ? "pointer-events-none" : ""
        }`}
      />

      <aside
        ref={asideRef}
        id="app-nav"
        inert={drawerHidden}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // The closed position is written to `transform`, the same channel the
        // drag and the spring write to. Tailwind's translate-x utilities use the
        // separate `translate` property, which would stack with it instead of
        // being overridden, leaving the drawer twice as far off screen.
        className="fixed top-0 bottom-0 left-0 z-50 flex w-64 touch-pan-y flex-col border-r border-line bg-surface [transform:translateX(-100%)] lg:w-[var(--rail)] lg:[transform:none]"
        style={{ willChange: "transform" }}
      >
        <div
          className={`flex h-14 shrink-0 items-center gap-2 px-4 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
        >
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Mark />
            <span className={collapsed ? "lg:hidden" : ""}>Acme RAG</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn btn-ghost btn-icon ml-auto lg:hidden"
          >
            <IconClose size={18} />
            <span className="sr-only">Close navigation</span>
          </button>
        </div>

        <div className={`px-3 pb-3 ${collapsed ? "lg:hidden" : ""}`}>
          <RoleSwitcher
            onSignIn={() => {
              setOpen(false);
              setSigningIn(true);
            }}
          />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {NAV.map(({ label, href, Icon, hint }) => {
            const active = pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                // The drawer covers the page it just navigated to, so it leaves
                // with the tap that caused the navigation.
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : hint}
                className={`group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors ${
                  collapsed ? "lg:justify-center lg:px-0" : ""
                } ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-sunken hover:text-fg"
                }`}
              >
                {/* Position marks the current page, so the answer to "where am
                    I" survives even when the label is hidden. */}
                <span
                  aria-hidden="true"
                  className={`absolute left-0 h-5 w-[3px] rounded-r-full bg-accent transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Icon size={17} />
                <span className={collapsed ? "lg:hidden" : ""}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={`space-y-3 border-t border-line p-3 ${collapsed ? "lg:hidden" : ""}`}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("open-tour"))}
            className="btn btn-secondary w-full"
          >
            <IconSparkle size={15} />
            Take the tour
          </button>
          <ThemeToggle />
          <a
            href="https://github.com/siroxou/advanced-rag"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-1 text-xs text-faint transition-colors hover:text-fg"
          >
            <IconGithub size={14} />
            Source on GitHub
          </a>
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          className="hidden border-t border-line py-2 text-faint transition-colors hover:bg-sunken hover:text-fg lg:flex lg:items-center lg:justify-center"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{
              transform: collapsed ? "rotate(180deg)" : "none",
              transition: "transform var(--dur-move) var(--ease-out)",
            }}
          >
            <path d="m14 6-6 6 6 6" />
          </svg>
          <span className="sr-only">{collapsed ? "Expand" : "Collapse"} navigation</span>
        </button>
      </aside>

      {/* Outside the aside: the drawer goes inert and captures swipes when hidden. */}
      {!IS_HOSTED_DEMO && <SignInDialog open={signingIn} onClose={() => setSigningIn(false)} />}

      <div
        className="lg:pl-[var(--rail)]"
        style={{ transition: "padding-left var(--dur-move) var(--ease-out)" }}
      >
        <main id="main">{children}</main>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      </svg>
    </span>
  );
}

function SignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await login(String(form.get("username")), String(form.get("password")));
      // Pages fetch on mount, so reload to refetch everything with the token.
      location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Sign in">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted">
          Reading needs no account. Changing documents, settings or people needs an admin
          account (<code>make seed</code> creates <strong>admin</strong>, password{" "}
          <strong>demo</strong>).
        </p>
        <div>
          <label className="label" htmlFor="signin-username">
            Username
          </label>
          <input
            id="signin-username"
            name="username"
            autoComplete="username"
            required
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="signin-password">
            Password
          </label>
          <input
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="field"
          />
        </div>
        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
            <IconAlert size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary self-start">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </Modal>
  );
}
