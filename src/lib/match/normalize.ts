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

const COMPANY_KEY_AFFIXES = ["hello", "get", "try", "join", "meet", "hq", "app", "labs", "ai", "io", "jobs", "careers", "co", "inc"] as const;

/**
 * Whether two company_keys name the same employer: equal, or one is the other plus a common
 * brand affix ("pebl" / "hellopebl", "acme" / "acmehq"). The shorter key must be 4+ characters so
 * short keys never collapse unrelated companies.
 */
export function companyKeysCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 4) return false;
  return COMPANY_KEY_AFFIXES.some((x) => long === x + short || long === short + x);
}
