/**
 * Access tier to badge style.
 *
 * One table, because the tiers are a shared vocabulary between the documents
 * list, the preview modal, and the corpus browser. The styles are token-based
 * badge classes, so a tier looks the same in both themes without any component
 * carrying a `dark:` variant of its own.
 */

export const SENSITIVITY_CLASSES: Record<string, string> = {
  public: "badge-ok",
  internal: "badge-info",
  confidential: "badge-warn",
  restricted: "badge-danger",
  mixed: "badge-accent",
};

/** Falls back to the most restrictive styling for an unknown tier. */
export function sensitivityClass(value: string | undefined): string {
  return SENSITIVITY_CLASSES[value ?? ""] ?? SENSITIVITY_CLASSES.restricted;
}
