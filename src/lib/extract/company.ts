import { ASSESSMENT_DOMAINS, ATS_DOMAINS, COMPANY_ALIASES, FREEMAIL_DOMAINS, GENERIC_SENDER_NAMES, HELPDESK_DOMAINS, NON_EMPLOYER_SENDER_DOMAINS, VENDOR_AS_EMPLOYER_DOMAINS } from "@/lib/config";
import { registrableDomain } from "@/lib/gmail/domains";
import { extractAshbyCompany } from "./ats/ashby";
import { extractAssessmentCompany } from "./ats/assessment";
import { extractGreenhouseCompany } from "./ats/greenhouse";
import { extractLeverCompany } from "./ats/lever";
import { extractWorkAtAStartupCompany } from "./ats/workatastartup";
import { extractWorkdayCompany } from "./ats/workday";
import type { NormalizedMessage } from "./normalize";
import { NAME_RUN, looksLikePersonName, normalizeCompanyKey, sentenceCasePhrase, stripTrailingCompanySuffix, titleCase } from "./text-utils";

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
  extractWorkAtAStartupCompany,
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

const HELPDESK_LABEL_SUFFIX = /[-_](?:assessment|assessments|support|help|careers|recruiting|talent|hiring|candidates?|jobs|apply|early-?careers?)$/i;

/**
 * Help-desk mail ("Roblox Early Careers <support@roblox-assessment.zendesk.com>") is sent by the employer
 * through a vendor, so the employer is named by the display name, then the vendor subdomain, then a
 * "[Roblox]" subject tag. The vendor itself (Zendesk) is never the company.
 */
function extractCompanyFromHelpdesk(msg: NormalizedMessage): CompanyExtraction | undefined {
  const name = msg.fromName ? stripTrailingCompanySuffix(msg.fromName.replace(/["']/g, "")) : "";
  if (name && !looksLikePersonName(name, msg.from) && !GENERIC_SENDER_NAMES.some((g) => name.toLowerCase().includes(g)) && !/\b(?:support|help|service)\b/i.test(name)) {
    return finalize(name, undefined, [`company "${name}" from help-desk sender display name (fallback)`]);
  }

  const host = (msg.from.split("@").pop() ?? "").toLowerCase();
  const label = host.split(".")[0]?.replace(HELPDESK_LABEL_SUFFIX, "");
  if (host.split(".").length > 2 && label && label.length >= 2 && !["support", "help", "mail", "email"].includes(label)) {
    const cleaned = titleCase(label);
    return finalize(cleaned, undefined, [`company "${cleaned}" from help-desk vendor subdomain "${host}" (fallback)`]);
  }

  const tag = msg.subject.match(/^\s*(?:(?:re|fwd?):\s*)*\[([A-Z][\w &'-]{1,30})\]/i)?.[1]?.trim();
  if (tag) return finalize(tag, undefined, [`company "${tag}" from subject tag (help-desk fallback)`]);
  return undefined;
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
    // A person writing from the vendor's own domain (Eileen Poeung <eileen@rippling.com>) is that company's
    // employee: the vendor is the employer, and the person's name is never the company.
    const isPerson = msg.fromName ? looksLikePersonName(msg.fromName.replace(/["']/g, "").trim(), msg.from) : false;
    if (isPerson && !VENDOR_AS_EMPLOYER_DOMAINS.includes(domain)) return undefined;
    if (isPerson) {
      const label = titleCase(domain.split(".")[0]!);
      return finalize(label, undefined, [`company "${label}" from sender domain "${domain}": a person (${msg.fromName}) emailing from the platform's own domain is its employee (fallback)`]);
    }
    const name = msg.fromName ? stripTrailingCompanySuffix(msg.fromName.replace(/["']/g, "")) : "";
    if (!name || GENERIC_SENDER_NAMES.some((g) => name.toLowerCase().includes(g))) return undefined;
    return finalize(name, undefined, [`company "${name}" from ATS sender display name (fallback)`]);
  }

  if ((HELPDESK_DOMAINS as readonly string[]).includes(domain)) return extractCompanyFromHelpdesk(msg);

  const excluded = [...ASSESSMENT_DOMAINS, ...NON_EMPLOYER_SENDER_DOMAINS] as readonly string[];
  const label = domain.split(".")[0]!;
  if (excluded.includes(domain) || label.length < 2) return undefined;
  const name = titleCase(label);
  return finalize(name, undefined, [`company "${name}" from sender domain "${domain}" (fallback)`]);
}

export { normalizeCompanyKey };
