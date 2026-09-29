import { MAX_ROLE_LENGTH, ROLE_KEYWORDS } from "@/lib/config";
import type { NormalizedMessage } from "./normalize";

export type RoleExtraction = { role?: string; reasons: string[] };

// A7: search the subject first, then the body, for these patterns.
const ROLE_PATTERNS = [
  { name: '"for the X position/role"', re: /\bfor the\s+(.+?)\s+(?:position|role)\b/i },
  { name: '"application for X"', re: /\bapplication for\s+(.+?)(?=\s+(?:position|role|has|have|was|is|will|been)\b|[.,;\n]|$)/i },
  { name: '"applied to X at"', re: /\bapplied to\s+(.+?)\s+at\b/i },
  { name: '"X – Application Received"', re: /^(.+?)\s*[–-]\s*application received\b/im },
];

/** Filler-only captures ("the", "this position") are never a real role. */
const FILLER_ONLY = /^(?:the|a|an|this|that|our|your|it|this position|the position|that role|this role)$/i;

/** A capture is valid if it isn't empty, isn't too long, has no sentence punctuation, and isn't just filler (A7). */
function isValidCapture(s: string): boolean {
  return s.length > 0 && s.length <= MAX_ROLE_LENGTH && !/[.!?]/.test(s) && !FILLER_ONLY.test(s.trim());
}

function candidatePhrases(text: string): string[] {
  return text
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function containsRoleKeyword(s: string): boolean {
  const lower = s.toLowerCase();
  return ROLE_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Role extraction (A7). Tries the four named patterns first, then falls back to any
 * phrase containing a role keyword (Engineer, SWE, New Grad, 2027, …). Never guesses:
 * returns undefined when nothing matches, or when the only capture is too long or
 * crosses a sentence boundary.
 */
export function extractRole(msg: NormalizedMessage): RoleExtraction {
  const reasons: string[] = [];

  for (const [haystackName, haystack] of [
    ["subject", msg.subject],
    ["body", msg.text],
  ] as const) {
    for (const { name, re } of ROLE_PATTERNS) {
      const m = haystack.match(re);
      const captured = m?.[1]?.trim();
      if (!captured) continue;
      if (isValidCapture(captured)) {
        reasons.push(`role from pattern ${name} in ${haystackName}`);
        return { role: captured, reasons };
      }
      reasons.push(`role pattern ${name} matched in ${haystackName} but the capture was rejected (too long or crosses a sentence)`);
    }
  }

  for (const [haystackName, haystack] of [
    ["subject", msg.subject],
    ["body", msg.text],
  ] as const) {
    for (const phrase of candidatePhrases(haystack)) {
      const cleaned = phrase
        .replace(/^[-–•\s]+|[-–:\s]+$/g, "")
        .replace(/^(?:role|position|title)\s*:\s*/i, "");
      if (containsRoleKeyword(cleaned) && isValidCapture(cleaned)) {
        reasons.push(`role from a phrase containing a role keyword, in ${haystackName}`);
        return { role: cleaned, reasons };
      }
    }
  }

  reasons.push("no role pattern matched; role left undefined (never guessed)");
  return { reasons };
}
