import { COMPANY_SUFFIXES } from "@/lib/config";

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TRAILING_SUFFIX_PATTERN = new RegExp(
  `[\\s,.-]*\\b(?:${COMPANY_SUFFIXES.map(escapeRegex).join("|")})\\b\\.?$`,
  "i",
);

/** Strips a trailing company suffix ("Inc", "Recruiting", "Hiring Team", …) and punctuation, repeatedly. */
export function stripTrailingCompanySuffix(name: string): string {
  let out = name.trim();
  let prev: string;
  do {
    prev = out;
    out = out.replace(TRAILING_SUFFIX_PATTERN, "").trim().replace(/[,.\s]+$/, "");
  } while (out !== prev && out.length > 0);
  return out;
}

/**
 * company_key normalization (A7): lowercase, strip suffix words anywhere, then strip all
 * remaining punctuation and whitespace so formatting differences don't create separate keys.
 */
export function normalizeCompanyKey(name: string): string {
  let key = name.toLowerCase();
  for (const suffix of COMPANY_SUFFIXES) {
    key = key.replace(new RegExp(`\\b${escapeRegex(suffix)}\\b`, "gi"), " ");
  }
  return key.replace(/[^a-z0-9]+/g, "");
}

/**
 * A capitalized proper-noun-like run of up to 4 words (e.g. "Acme Corp"), used to
 * capture a company name out of free text. Deliberately excludes ".", so a run
 * never swallows a trailing sentence period or runs on into the next sentence.
 */
export const NAME_RUN = "[A-Z][\\w&'-]*(?:\\s+[A-Z][\\w&'-]*){0,3}";

/**
 * A case-sensitive regex source for `phrase` (given in lowercase) that still matches
 * it capitalized at the start of a sentence ("On behalf of…") or lowercase mid-sentence
 * ("…sent on behalf of…"). Deliberately not the "i" flag: applying "i" to a whole pattern
 * that also captures a NAME_RUN would make that capture's own capital-letter boundary
 * match lowercase words too, letting it run on into the rest of the sentence.
 */
export function sentenceCasePhrase(phrase: string): string {
  const [first, ...rest] = phrase;
  return `[${first!.toUpperCase()}${first!.toLowerCase()}]${escapeRegex(rest.join(""))}`;
}

/** "acme" -> "Acme"; "acme-corp" / "acme_corp" / "acme.corp" -> "Acme Corp". */
export function titleCase(s: string): string {
  return s
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
