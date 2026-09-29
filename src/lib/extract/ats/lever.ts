import type { NormalizedMessage } from "../normalize";
import { extractFromNameOrSubject, matchesDomain, type AtsCompanyResult } from "./shared";
import { NAME_RUN, sentenceCasePhrase } from "../text-utils";

export const LEVER_DOMAINS = ["lever.co"] as const;

// No "i" flag: it would also let the NAME_RUN capture run on into lowercase words.
const SUBJECT_APPLICATION_TO = new RegExp(`\\b${sentenceCasePhrase("application")} (?:to|at)\\s+(${NAME_RUN})`);

export function isLeverSender(email: string): boolean {
  return matchesDomain(email, LEVER_DOMAINS);
}

export function extractLeverCompany(msg: NormalizedMessage): AtsCompanyResult | undefined {
  if (!isLeverSender(msg.from)) return undefined;
  return extractFromNameOrSubject(msg, "lever", "lever", SUBJECT_APPLICATION_TO);
}
