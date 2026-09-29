import { ROLE_IGNORED_TOKENS } from "@/lib/config";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MULTI_WORD_IGNORED = ROLE_IGNORED_TOKENS.filter((p) => p.includes(" "));
const SINGLE_WORD_IGNORED = new Set<string>(ROLE_IGNORED_TOKENS.filter((p) => !p.includes(" ")));

/**
 * Tokenizes a role title for similarity comparison (A8): lowercase, drop noise words/phrases
 * (new grad, 2027, entry level, early career, university, "I"), then split into word tokens.
 * Noise phrases are removed with word boundaries first so a single-letter entry like "i"
 * never strips a substring out of an unrelated word (e.g. "engineerIng" is untouched).
 */
export function normalizeRoleTokens(role: string): Set<string> {
  let s = role.toLowerCase();
  for (const phrase of MULTI_WORD_IGNORED) {
    s = s.replace(new RegExp(`\\b${escapeRegex(phrase)}\\b`, "g"), " ");
  }
  const tokens = s
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => !SINGLE_WORD_IGNORED.has(t));
  return new Set(tokens);
}
