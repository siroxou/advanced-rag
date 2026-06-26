"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import RoleSwitcher from "@/components/RoleSwitcher";

const NAV = [
  { label: "Chat", href: "/chat", icon: "💬" },
  { label: "Documents", href: "/documents", icon: "📄" },
  { label: "Presets", href: "/presets", icon: "📚" },
  { label: "Admin", href: "/admin", icon: "👥" },
  { label: "Security", href: "/security", icon: "🔒" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

export default function Sidebar({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
        <Link href="/" className="mb-4 block text-sm font-bold tracking-tight">
          RAG System
        </Link>

        <div className="mb-4">
          <RoleSwitcher />
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-black/8 font-medium text-black dark:bg-white/15 dark:text-white"
                    : "text-black/60 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 border-t border-black/10 pt-4 dark:border-white/10">
          <button
            onClick={() => window.dispatchEvent(new Event("open-tour"))}
            className="mb-3 flex w-full items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs font-medium text-black/60 transition-colors hover:bg-black/5 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
          >
            <span>🧭</span> Take the tour
          </button>
          <p className="text-xs text-black/40 dark:text-white/40">
            Live Demo<br />
            <span className="font-medium text-black/70 dark:text-white/70">Enterprise Agentic RAG</span>
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
