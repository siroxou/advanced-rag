/**
 * Guardrails for the self-contained demo, ported from the backend's regex checks
 * so behaviour matches: injection blocking on input, citation grounding and PII
 * detection / masking on output.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|messages?|rules?)/i,
  /disregard\s+(the\s+)?(above|previous|prior|all|your)/i,
  /forget\s+(everything|all|your)\b/i,
  /reveal\s+(the\s+|your\s+)?(system\s+)?(prompt|instructions?)/i,
  /(print|show|repeat|output)\s+(me\s+)?(the\s+|your\s+)?(system\s+)?(prompt|instructions?)/i,
  /you\s+are\s+now\b/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /\bDAN\b/,
  /act\s+as\s+(an?\s+)?(unfiltered|unrestricted|uncensored)/i,
  /bypass\s+(your\s+)?(safety|guardrails?|restrictions?|filters?)/i,
];

export function checkInjection(text: string): { blocked: boolean; reason: string } {
  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      return { blocked: true, reason: "possible prompt injection or jailbreak attempt" };
    }
  }
  return { blocked: false, reason: "" };
}

export function validateCitations(answer: string, nSources: number): {
  ok: boolean;
  invalid: number[];
} {
  const cited = new Set<number>();
  for (const m of answer.matchAll(/\[(\d+)\]/g)) cited.add(parseInt(m[1], 10));
  const invalid = [...cited].filter((n) => n < 1 || n > nSources).sort((a, b) => a - b);
  return { ok: invalid.length === 0, invalid };
}

const PII = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d[ -]?){13,16}\b/g,
  phone: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
} as const;

const REDACTIONS: Record<string, string> = {
  email: "[REDACTED_EMAIL]",
  ssn: "[REDACTED_SSN]",
  credit_card: "[REDACTED_CARD]",
  phone: "[REDACTED_PHONE]",
};

// Most-specific first so a card or SSN is not partially eaten by the phone matcher.
const MASK_ORDER = ["email", "ssn", "credit_card", "phone"] as const;

export function detectPii(text: string): string[] {
  return Object.keys(PII)
    .filter((name) => new RegExp(PII[name as keyof typeof PII].source).test(text))
    .sort();
}

export function maskPii(text: string): { masked: string; found: string[] } {
  let masked = text;
  const found: string[] = [];
  for (const name of MASK_ORDER) {
    const re = new RegExp(PII[name].source, "g");
    if (re.test(masked)) {
      found.push(name);
      masked = masked.replace(new RegExp(PII[name].source, "g"), REDACTIONS[name]);
    }
  }
  return { masked, found: found.sort() };
}
