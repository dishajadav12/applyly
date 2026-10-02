import { MAX_ROLE_LENGTH, ROLE_KEYWORDS } from "@/lib/config";
import type { NormalizedMessage } from "./normalize";
import { escapeRegex } from "./text-utils";

export type RoleExtraction = { role?: string; reasons: string[] };

// A7: search the subject first, then the body, for these patterns.
const ROLE_PATTERNS = [
  { name: '"following role: X"', re: /\bfollowing (?:role|position)\s*:\s*(.+?)(?:\s+\d{6,})?\s*(?:\.\s|\.$|\n|$)/i },
  { name: '"for the X position/role"', re: /\bfor the\s+(.+?)\s+(?:position|role)\b/i },
  { name: '"application for X"', re: /\bapplication for\s+(.+?)(?=\s+(?:position|role|has|have|was|is|will|been)\b|[.,;\n]|$)/i },
  { name: '"applied to X at"', re: /\bapplied to\s+(.+?)\s+at\b/i },
  { name: '"X – Application Received"', re: /^(.+?)\s*[–-]\s*application received\b/im },
];

/** Filler-only captures ("the", "this position") are never a real role. */
const FILLER_ONLY = /^(?:the|a|an|this|that|our|your|it|this position|the position|that role|this role|following)$/i;

/** Leading boilerplate a subject puts before the role ("Confirmation | Interview for X"). */
const ROLE_LEADING_NOISE = /^(?:(?:re|fwd?)\s*:\s*|(?:confirmation|confirmed|invitation|reminder|update|action required|next steps?)\s*[|:–-]\s*|(?:interview|application|assessment)\s+(?:for|to)\s+(?:the\s+)?)+/i;

function cleanRole(raw: string): string {
  return raw
    .replace(ROLE_LEADING_NOISE, "")
    .replace(/\s*[([](?:job|req|requisition)\b[^)\]]*[)\]]\s*$/i, "")
    .replace(/\s+(?:and|or|at|for|with|to|the|a|of)$/i, "")
    .replace(/[\s,;:|–-]+$/, "")
    .trim();
}

const TITLE_CONNECTORS = new Set(["-", "–", "—", "&", "/", "(", ")", "of", "and", "+"]);

/** Whether a word can be part of a job title: capitalized, a number/year, or a connector like "-" or "&". */
function isTitleWord(w: string): boolean {
  const bare = w.replace(/^[(]|[),]$/g, "");
  return /^[A-Z0-9]/.test(bare) || TITLE_CONNECTORS.has(bare.toLowerCase());
}

/**
 * From a sentence, the longest run of title-like words that contains a role keyword
 * ("We would like to proceed for the Software Engineer Intern," -> "Software Engineer Intern").
 * Prose around a title is never part of the role.
 */
function titleRunWithKeyword(sentence: string): string | undefined {
  const words = sentence.split(/\s+/).filter(Boolean);
  let best: string[] = [];
  let run: string[] = [];
  // Only a run that ends the sentence counts: a title mid-prose ("mention the Software Engineer
  // opening in this note") is not a role statement.
  const flush = (atEnd: boolean) => {
    if (atEnd && run.length > best.length && containsRoleKeyword(run.join(" "))) best = run;
    run = [];
  };
  for (const w of words) {
    if (isTitleWord(w)) run.push(w);
    else flush(false);
  }
  flush(true);
  // Trim leading/trailing connectors and a leading sentence-start word that isn't part of the title.
  while (best.length && TITLE_CONNECTORS.has(best[best.length - 1]!.toLowerCase())) best = best.slice(0, -1);
  while (best.length && TITLE_CONNECTORS.has(best[0]!.toLowerCase())) best = best.slice(1);
  return best.length > 0 ? best.join(" ") : undefined;
}

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
  // Word start always; word end too for short keywords, so "swe" can't match inside "answer"
  // while "engineer" still matches "Engineering".
  return ROLE_KEYWORDS.some((k) => new RegExp(`(?<![a-z0-9])${escapeRegex(k)}${k.length <= 3 ? "(?![a-z0-9])" : ""}`, "i").test(s));
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
      // "Software Engineer (Job number: 200058252)" -> "Software Engineer"
      const captured = m?.[1] ? cleanRole(m[1]) : undefined;
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
      const cleaned = titleRunWithKeyword(
        phrase.replace(/^[-–•\s]+|[-–:\s]+$/g, "").replace(/^(?:role|position|title)\s*:\s*/i, ""),
      );
      const role = cleaned ? cleanRole(cleaned) : undefined;
      if (role && containsRoleKeyword(role) && isValidCapture(role)) {
        reasons.push(`role from a title-like phrase containing a role keyword, in ${haystackName}`);
        return { role, reasons };
      }
    }
  }

  reasons.push("no role pattern matched; role left undefined (never guessed)");
  return { reasons };
}
