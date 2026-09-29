import { ASSESSMENT_DOMAINS } from "@/lib/config";
import type { NormalizedMessage } from "../normalize";
import { NAME_RUN, sentenceCasePhrase, stripTrailingCompanySuffix } from "../text-utils";
import { matchesDomain, type AtsCompanyResult } from "./shared";

// No "i" flag: it would also let the NAME_RUN capture run on into lowercase words.
const PATTERNS = [
  { name: '"X has invited you"', re: new RegExp(`\\b(${NAME_RUN})\\s+has invited you\\b`) },
  { name: '"on behalf of X"', re: new RegExp(`\\b${sentenceCasePhrase("on behalf of")}\\s+(${NAME_RUN})`) },
  { name: '"X Coding Assessment"', re: new RegExp(`\\b(${NAME_RUN})\\s+Coding Assessment\\b`) },
];

export function isAssessmentSender(email: string): boolean {
  return matchesDomain(email, ASSESSMENT_DOMAINS);
}

export function extractAssessmentCompany(msg: NormalizedMessage): AtsCompanyResult | undefined {
  if (!isAssessmentSender(msg.from)) return undefined;
  const reasons = ["sender is a third-party assessment platform"];

  for (const { name, re } of PATTERNS) {
    for (const haystack of [msg.subject, msg.text]) {
      const m = haystack.match(re);
      if (m?.[1]) {
        reasons.push(`company from assessment-platform pattern ${name}`);
        return { company: stripTrailingCompanySuffix(m[1].trim()), atsSource: "assessment", reasons };
      }
    }
  }

  reasons.push("assessment-platform sender but no company pattern matched");
  return { atsSource: "assessment", reasons };
}
