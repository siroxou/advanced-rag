"use client";

import { useEffect, useState } from "react";

import { IconMonitor, IconMoon, IconSun } from "@/components/icons";

export const THEME_KEY = "rag_theme";

type Choice = "system" | "light" | "dark";

const CHOICES: { value: Choice; label: string; Icon: typeof IconSun }[] = [
  { value: "system", label: "System", Icon: IconMonitor },
  { value: "light", label: "Light", Icon: IconSun },
  { value: "dark", label: "Dark", Icon: IconMoon },
];

/**
 * Applied to <html> before paint by the inline script in the layout, and again
 * here on change. "system" removes the attribute so the media query decides;
 * anything else is an explicit choice and outranks it.
 */
function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    // The stored choice is only readable after hydration; the pre-paint script
    // has already applied it, so this just syncs the control to what is on screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice((localStorage.getItem(THEME_KEY) as Choice | null) ?? "system");
  }, []);

  function change(next: Choice) {
    setChoice(next);
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode: the choice still applies for this session.
    }
  }

  const index = CHOICES.findIndex((c) => c.value === choice);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="relative grid grid-cols-3 gap-0.5 rounded-[10px] border border-line bg-sunken p-0.5"
    >
      {/* The indicator slides between segments rather than blinking on, so the
          eye tracks which one is now selected. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc((100%-0.25rem)/3)] rounded-lg bg-surface shadow-[var(--shadow-1)]"
        style={{
          transform: `translateX(${index * 100}%)`,
          transition: "transform var(--dur-move) var(--ease-out)",
        }}
      />
      {CHOICES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          onClick={() => change(value)}
          title={label}
          className={`relative z-10 flex h-7 items-center justify-center rounded-lg transition-colors ${
            choice === value ? "text-fg" : "text-faint hover:text-muted"
          }`}
        >
          <Icon size={14} />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
