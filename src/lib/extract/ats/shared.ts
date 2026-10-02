import { GENERIC_SENDER_NAMES } from "@/lib/config";
import { registrableDomain } from "@/lib/gmail/domains";
import type { NormalizedMessage } from "../normalize";
import { stripTrailingCompanySuffix } from "../text-utils";

export type AtsCompanyResult = { company?: string; atsSource: string; reasons: string[] };

export function matchesDomain(email: string, domains: readonly string[]): boolean {
  const domain = registrableDomain(email);
  return domain !== undefined && domains.includes(domain);
}

/**
 * Greenhouse/Lever-style company extraction (A7): the sender display name
 * ("Stripe Recruiting" -> Stripe), else a subject "application to/at X" pattern.
 */
export function extractFromNameOrSubject(
  msg: NormalizedMessage,
  atsSource: string,
  excludedName: string,
  subjectPattern: RegExp,
): AtsCompanyResult {
  const label = atsSource[0]!.toUpperCase() + atsSource.slice(1);
  const reasons = [`sender is a ${label} domain`];

  if (msg.fromName) {
    const stripped = stripTrailingCompanySuffix(msg.fromName);
    const lower = stripped.toLowerCase();
    if (stripped && lower !== excludedName.toLowerCase() && !GENERIC_SENDER_NAMES.some((g) => lower.includes(g))) {
      reasons.push(`company from ${label} sender display name "${msg.fromName}"`);
      return { company: stripped, atsSource, reasons };
    }
  }

  const m = msg.subject.match(subjectPattern);
  if (m?.[1]) {
    reasons.push(`company from ${label} subject pattern "application to/at X"`);
    return { company: m[1].trim(), atsSource, reasons };
  }

  reasons.push(`${label} sender but no company pattern matched`);
  return { atsSource, reasons };
}
