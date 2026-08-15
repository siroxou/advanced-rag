import type { ReactNode } from "react";

/**
 * Every console page opens the same way: what this page is, in one line, and its
 * actions on the right. Repeating the shape is what makes the pages feel like one
 * product rather than six.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      {/* The description gives up width before the action drops to its own row. */}
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
