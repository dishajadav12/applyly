import type { ParsedMessage } from "@/lib/gmail/mime";

/** A ParsedMessage with footer noise stripped from `text`. Whitespace/quote/truncation
 * normalization already happened in gmail/mime.ts; this is the last A7 normalize step. */
export type NormalizedMessage = ParsedMessage & { text: string };

const FOOTER_LINE_PATTERNS: RegExp[] = [
  /^sent from my (iphone|ipad|android|samsung|galaxy|mobile device)\b/i,
  /^get outlook for (ios|android)\b/i,
  /^unsubscribe\b/i,
  /^manage (your )?email preferences\b/i,
  /^view (this )?(email|message) in (your )?browser\b/i,
  /^you('re| are) receiving this (email|because)\b/i,
  /^this (email|message)( and any (files|attachments))?.*\bconfidential\b/i,
];

/** Removes marketing/legal footer lines (unsubscribe links, "Sent from my iPhone", disclaimers). */
export function stripFooters(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !FOOTER_LINE_PATTERNS.some((re) => re.test(line.trim())))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Repairs UTF-8 read as Windows-1252/Latin-1, which leaves a stray "Â" where a non-breaking space was
 * ("2027Â and") and "â€™"-style sequences for curly quotes/dashes, so they can't leak into extracted fields.
 */
export function fixMojibake(s: string): string {
  return s
    .replace(/Â[\u00a0 ]/g, " ")
    .replace(/Â(?=[^\w]|$)/g, "")
    .replace(/â€™/g, "’")
    .replace(/â€˜/g, "‘")
    .replace(/â€œ|â€\u009d|â€/g, '"')
    .replace(/â€“/g, "–")
    .replace(/â€”/g, "—");
}

export function normalizeMessage(parsed: ParsedMessage): NormalizedMessage {
  return {
    ...parsed,
    subject: parsed.subject && fixMojibake(parsed.subject),
    fromName: parsed.fromName ? fixMojibake(parsed.fromName) : parsed.fromName,
    text: stripFooters(parsed.text && fixMojibake(parsed.text)),
  };
}
