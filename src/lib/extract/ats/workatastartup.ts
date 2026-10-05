import type { NormalizedMessage } from "../normalize";
import { stripTrailingCompanySuffix } from "../text-utils";
import { matchesDomain, type AtsCompanyResult } from "./shared";

export const WORKATASTARTUP_DOMAINS = ["ycombinator.com"] as const;

/** Y Combinator's Work at a Startup confirmations: "Your application to X has been received". */
const BODY_PATTERN = /\bYour application to\s+(.+?)\s+has been received\b/i;
/** Subject: "Your application for X - Role (Team)". */
export const WAAS_SUBJECT_PATTERN = /\bapplication for\s+(.+?)\s+[-–]\s+(.+)$/i;

export function isWorkAtAStartupSender(email: string): boolean {
  return matchesDomain(email, WORKATASTARTUP_DOMAINS) && email.toLowerCase().startsWith("workatastartup@");
}

/** The sender is YC, never the employer; the company is named in the body or subject. */
export function extractWorkAtAStartupCompany(msg: NormalizedMessage): AtsCompanyResult | undefined {
  if (!isWorkAtAStartupSender(msg.from)) return undefined;
  const reasons = ["sender is Y Combinator's Work at a Startup"];

  const fromBody = msg.text.match(BODY_PATTERN)?.[1];
  const fromSubject = msg.subject.match(WAAS_SUBJECT_PATTERN)?.[1];
  const company = fromBody ?? fromSubject;
  if (company) {
    reasons.push(`company from Work at a Startup ${fromBody ? "body" : "subject"} pattern`);
    return { company: stripTrailingCompanySuffix(company.trim()), atsSource: "workatastartup", reasons };
  }

  reasons.push("Work at a Startup sender but no company pattern matched");
  return { atsSource: "workatastartup", reasons };
}
