/**
 * Badge colours for a document's access tier.
 *
 * One table, because the tiers are a shared vocabulary between the documents
 * list, the preview modal, and the preset browser - four copies of it had already
 * drifted into three constants and an inline ternary chain.
 */

export const SENSITIVITY_CLASSES: Record<string, string> = {
  public: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  internal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  confidential: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  restricted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

/** Falls back to the most restrictive styling for an unknown tier. */
export function sensitivityClass(value: string | undefined): string {
  return SENSITIVITY_CLASSES[value ?? ""] ?? SENSITIVITY_CLASSES.restricted;
}
