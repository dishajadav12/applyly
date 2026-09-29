import type { NormalizedMessage } from "../normalize";
import { NAME_RUN, stripTrailingCompanySuffix } from "../text-utils";
import { matchesDomain, type AtsCompanyResult } from "./shared";

export const ASHBY_DOMAINS = ["ashbyhq.com"] as const;

/** Ashby's own pattern (A7): "X Hiring Team". */
const HIRING_TEAM_PATTERN = new RegExp(`\\b(${NAME_RUN})\\s+Hiring Team\\b`);

export function isAshbySender(email: string): boolean {
  return matchesDomain(email, ASHBY_DOMAINS);
}

export function extractAshbyCompany(msg: NormalizedMessage): AtsCompanyResult | undefined {
  if (!isAshbySender(msg.from)) return undefined;
  const reasons = ["sender is an Ashby domain"];

  for (const haystack of [msg.fromName ?? "", msg.subject, msg.text]) {
    const m = haystack.match(HIRING_TEAM_PATTERN);
    if (m?.[1]) {
      reasons.push('company from Ashby "X Hiring Team" pattern');
      return { company: stripTrailingCompanySuffix(m[1].trim()), atsSource: "ashby", reasons };
    }
  }

  reasons.push("Ashby sender but no company pattern matched");
  return { atsSource: "ashby", reasons };
}
