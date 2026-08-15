"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { IconClose } from "@/components/icons";

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Rendered next to the title, e.g. an access tier badge. */
  meta?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * Modal built on the native <dialog>.
 *
 * `showModal()` gives focus trapping, focus restore on close, Escape handling,
 * background inertness and top-layer stacking from the platform. The previous
 * hand-rolled overlay divs had none of those: focus stayed loose behind the
 * scrim and a keyboard user could tab into the page they could not see.
 */
export default function Modal({ open, onClose, title, meta, footer, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Escape is handled here rather than left to the element's own `cancel`/`close`
  // events. Those do not fire in every engine, and when the platform closes the
  // dialog without telling React, the state still says open: the dialog is gone
  // from the screen and clicking the same row again does nothing, because `open`
  // never transitions. Owning the key means every exit path ends in the same
  // state change, and the platform's own close is then a no-op on top of it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      // Belt and braces for engines that do fire these: closing is idempotent.
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        // A click that lands on the dialog box itself is a click on the backdrop:
        // the children cover the padded box entirely.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {meta}
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon shrink-0">
            <IconClose size={16} />
            <span className="sr-only">Close</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
