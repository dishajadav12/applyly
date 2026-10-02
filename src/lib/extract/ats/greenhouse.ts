import type { NormalizedMessage } from "../normalize";
import { extractFromNameOrSubject, matchesDomain, type AtsCompanyResult } from "./shared";
import { NAME_RUN, sentenceCasePhrase } from "../text-utils";

export const GREENHOUSE_DOMAINS = ["greenhouse.io", "greenhouse-mail.io"] as const;

// No "i" flag: it would also let the NAME_RUN capture run on into lowercase words.
const SUBJECT_APPLICATION_TO = new RegExp(`\\b${sentenceCasePhrase("application")} (?:(?:to|at)|for\\b[^\\n]*?\\bat)\\s+(${NAME_RUN})`);

export function isGreenhouseSender(email: string): boolean {
  return matchesDomain(email, GREENHOUSE_DOMAINS);
}

export function extractGreenhouseCompany(msg: NormalizedMessage): AtsCompanyResult | undefined {
  if (!isGreenhouseSender(msg.from)) return undefined;
  return extractFromNameOrSubject(msg, "greenhouse", "greenhouse", SUBJECT_APPLICATION_TO);
}
