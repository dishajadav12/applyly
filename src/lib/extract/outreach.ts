import { ASSESSMENT_DOMAINS, ATS_DOMAINS, COMPANY_ALIASES, FREEMAIL_DOMAINS, NON_EMPLOYER_SENDER_DOMAINS, NOREPLY_PATTERNS } from "@/lib/config";
import { registrableDomain } from "@/lib/gmail/domains";
import { parseAddress, type ParsedMessage } from "@/lib/gmail/mime";
import { normalizeCompanyKey, titleCase } from "./text-utils";

export type OutreachRecipient = { email: string; name?: string; company: string; companyKey: string };
export type OutreachExtraction = { recipients: OutreachRecipient[]; reasons: string[] };

const NON_COMPANY_DOMAINS = [...FREEMAIL_DOMAINS, ...NON_EMPLOYER_SENDER_DOMAINS, ...ATS_DOMAINS, ...ASSESSMENT_DOMAINS] as readonly string[];

/** Splits an address-list header on commas that are not inside quotes or angle brackets. */
export function splitAddressList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angled = false;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") angled = true;
    else if (!quoted && ch === ">") angled = false;
    if (ch === "," && !quoted && !angled) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** "datadoghq.com" -> "Datadog" (alias map); "acme-corp.co.uk" -> "Acme Corp". */
export function companyFromDomain(domain: string): string {
  for (const [fragment, company] of Object.entries(COMPANY_ALIASES)) {
    if (domain.includes(fragment)) return company;
  }
  return titleCase(domain.split(".")[0] ?? domain);
}

/**
 * Recruiter outreach (beyond spec A7): who the user wrote to, from a message in their SENT mail.
 * Takes the To recipients that sit on a corporate domain, so the company can be named from the
 * address. Freemail, noreply, ATS/assessment/job-board and the user's own domain are skipped.
 * The company is read from the domain, never guessed from the body.
 */
export function extractOutreach(msg: ParsedMessage, selfEmail?: string): OutreachExtraction {
  const reasons: string[] = [];
  if (!msg.labelIds.includes("SENT")) return { recipients: [], reasons: ["message is not in the user's sent mail; no outreach"] };

  const self = selfEmail?.toLowerCase();
  const selfDomain = self ? registrableDomain(self) : undefined;
  const recipients: OutreachRecipient[] = [];
  const seen = new Set<string>();

  for (const raw of splitAddressList(msg.headers.to ?? "")) {
    const addr = parseAddress(raw);
    if (!addr || seen.has(addr.email)) continue;
    seen.add(addr.email);

    const domain = registrableDomain(addr.email);
    const local = addr.email.split("@")[0] ?? "";
    if (addr.email === self) reasons.push(`skipped ${addr.email}: the user's own address`);
    else if (!domain) reasons.push(`skipped ${addr.email}: no usable domain`);
    else if (NOREPLY_PATTERNS.some((p) => local.includes(p))) reasons.push(`skipped ${addr.email}: noreply address`);
    else if (NON_COMPANY_DOMAINS.includes(domain)) reasons.push(`skipped ${addr.email}: "${domain}" is freemail, a job board or an ATS, so it names no company`);
    else if (domain === selfDomain) reasons.push(`skipped ${addr.email}: the user's own domain`);
    else {
      const company = companyFromDomain(domain);
      const companyKey = normalizeCompanyKey(company);
      if (!companyKey) {
        reasons.push(`skipped ${addr.email}: company name from "${domain}" was empty`);
        continue;
      }
      reasons.push(`recipient ${addr.email}: company "${company}" from domain "${domain}"`);
      recipients.push({ email: addr.email, name: addr.name, company, companyKey });
    }
  }
  return { recipients, reasons };
}
