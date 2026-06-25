"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { label: "Chat", href: "/chat", icon: "💬" },
  { label: "Documents", href: "/documents", icon: "📄" },
  { label: "Presets", href: "/presets", icon: "📚" },
  { label: "Admin", href: "/admin", icon: "👥" },
  { label: "Security", href: "/security", icon: "🔒" },
];

export default function Sidebar({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
        <Link href="/" className="mb-6 block text-sm font-bold tracking-tight">
          RAG System
        </Link>

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
          <p className="text-xs text-black/40 dark:text-white/40">
            Demo Mode<br />
            <span className="font-medium text-black/70 dark:text-white/70">Open Source Portfolio</span>
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
