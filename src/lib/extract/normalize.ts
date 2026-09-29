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

export function normalizeMessage(parsed: ParsedMessage): NormalizedMessage {
  return { ...parsed, text: stripFooters(parsed.text) };
}
