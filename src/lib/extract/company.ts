import { ASSESSMENT_DOMAINS, ATS_DOMAINS, COMPANY_ALIASES, FREEMAIL_DOMAINS, GENERIC_SENDER_NAMES, NON_EMPLOYER_SENDER_DOMAINS } from "@/lib/config";
import { registrableDomain } from "@/lib/gmail/domains";
import { extractAshbyCompany } from "./ats/ashby";
import { extractAssessmentCompany } from "./ats/assessment";
import { extractGreenhouseCompany } from "./ats/greenhouse";
import { extractLeverCompany } from "./ats/lever";
import { extractWorkdayCompany } from "./ats/workday";
import type { NormalizedMessage } from "./normalize";
import { NAME_RUN, normalizeCompanyKey, sentenceCasePhrase, stripTrailingCompanySuffix, titleCase } from "./text-utils";

export type CompanyExtraction = { company?: string; companyKey?: string; atsSource?: string; reasons: string[] };

// A7 step 2: generic regex patterns, in order, tried on the subject then the body.
// No "i" flag: it would also let the NAME_RUN capture run on into lowercase words.
const GENERIC_PATTERNS = [
  { name: '"applying to/at/with X"', re: new RegExp(`\\b${sentenceCasePhrase("applying")} (?:to|at|with)\\s+(${NAME_RUN})`) },
  { name: '"interest in X"', re: new RegExp(`\\b${sentenceCasePhrase("interest")} in\\s+(${NAME_RUN})`) },
  { name: '"position at X"', re: new RegExp(`\\b${sentenceCasePhrase("position")} at\\s+(${NAME_RUN})`) },
  { name: '"X Talent Acquisition"', re: new RegExp(`\\b(${NAME_RUN})\\s+Talent Acquisition\\b`) },
];

// A7 step 1: ATS-specific parsers, tried in the order the spec lists them.
const ATS_PARSERS = [
  extractGreenhouseCompany,
  extractLeverCompany,
  extractWorkdayCompany,
  extractAshbyCompany,
  extractAssessmentCompany,
];

function finalize(company: string, atsSource: string | undefined, reasons: string[]): CompanyExtraction {
  const cleaned = stripTrailingCompanySuffix(company);
  if (!cleaned) {
    return { atsSource, reasons: [...reasons, "extracted company was empty after cleanup; left undefined"] };
  }
  return { company: cleaned, companyKey: normalizeCompanyKey(cleaned), atsSource, reasons };
}

/**
 * Company extraction, in A7 priority order: ATS-specific parsers, then generic regex
 * patterns, then a non-freemail sender domain through the alias map. Never guesses:
 * returns undefined (reviewed by a human) when nothing matches.
 */
export function extractCompany(msg: NormalizedMessage): CompanyExtraction {
  const reasons: string[] = [];
  let atsSource: string | undefined;

  // Sender domains are mutually exclusive across ATS parsers, so at most one matches;
  // if it finds no company we still remember atsSource and fall through to steps 2-3.
  for (const parse of ATS_PARSERS) {
    const result = parse(msg);
    if (!result) continue;
    atsSource = result.atsSource;
    reasons.push(...result.reasons);
    if (result.company) return finalize(result.company, atsSource, reasons);
    break;
  }

  for (const haystack of [msg.subject, msg.text]) {
    for (const { name, re } of GENERIC_PATTERNS) {
      const m = haystack.match(re);
      if (m?.[1]) {
        reasons.push(`company from regex pattern ${name}`);
        return finalize(m[1].trim(), atsSource, reasons);
      }
    }
  }

  const domain = registrableDomain(msg.from);
  if (domain && !(FREEMAIL_DOMAINS as readonly string[]).includes(domain)) {
    for (const [fragment, company] of Object.entries(COMPANY_ALIASES)) {
      if (domain.includes(fragment)) {
        reasons.push(`company "${company}" from alias map for sender domain "${domain}"`);
        return finalize(company, atsSource, reasons);
      }
    }
  }

  reasons.push("no company pattern matched; company left undefined (never guessed)");
  return { atsSource, reasons };
}

/**
 * Last-resort company from the sender itself, used only for emails already classified job-related
 * (so newsletters and digests never get a company). ATS mail is sent on an employer's behalf with the
 * employer as display name ("Roblox <no-reply@us.greenhouse-mail.io>"); any other corporate domain is
 * taken as the employer. Every use is recorded in reasons[] as a fallback.
 */
export function extractCompanyFromSender(msg: NormalizedMessage): CompanyExtraction | undefined {
  const domain = registrableDomain(msg.from);
  if (!domain || (FREEMAIL_DOMAINS as readonly string[]).includes(domain)) return undefined;

  if ((ATS_DOMAINS as readonly string[]).includes(domain)) {
    const name = msg.fromName ? stripTrailingCompanySuffix(msg.fromName.replace(/["']/g, "")) : "";
    if (!name || GENERIC_SENDER_NAMES.some((g) => name.toLowerCase().includes(g))) return undefined;
    return finalize(name, undefined, [`company "${name}" from ATS sender display name (fallback)`]);
  }

  const excluded = [...ASSESSMENT_DOMAINS, ...NON_EMPLOYER_SENDER_DOMAINS] as readonly string[];
  const label = domain.split(".")[0]!;
  if (excluded.includes(domain) || label.length < 2) return undefined;
  const name = titleCase(label);
  return finalize(name, undefined, [`company "${name}" from sender domain "${domain}" (fallback)`]);
}

export { normalizeCompanyKey };
