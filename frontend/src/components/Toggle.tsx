"use client";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

/** A labelled on/off switch used across the Settings page. */
export default function Toggle({ checked, onChange, label, description, disabled }: Props) {
  return (
    <label
      className={`flex items-center justify-between gap-4 py-3 ${
        disabled ? "opacity-45" : "cursor-pointer"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-faint">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-line-strong disabled:cursor-not-allowed"
        style={{
          background: checked ? "var(--accent)" : "var(--surface-sunken)",
          borderColor: checked ? "var(--accent)" : "var(--line-strong)",
          transition: "background-color var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out)",
        }}
      >
        {/* The knob overshoots very slightly on its way across, which reads as a
            physical throw rather than a value being set. */}
        <span
          className="block h-4.5 w-4.5 rounded-full bg-white shadow-[var(--shadow-1)]"
          style={{
            height: "1.125rem",
            width: "1.125rem",
            transform: `translateX(${checked ? "1.1875rem" : "0.1875rem"})`,
            transition: "transform var(--dur-move) var(--ease-spring)",
          }}
        />
      </button>
    </label>
  );
}
