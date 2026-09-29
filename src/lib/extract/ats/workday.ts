import { NOREPLY_PATTERNS } from "@/lib/config";
import type { NormalizedMessage } from "../normalize";
import { titleCase } from "../text-utils";
import type { AtsCompanyResult } from "./shared";

function hostOf(email: string): string | undefined {
  return email.split("@")[1]?.toLowerCase();
}

/**
 * Workday tenants use their own hostnames (acme@myworkday.com,
 * acme.wd5.myworkdayjobs.com), so this checks the raw host rather than the
 * registrable domain, which would collapse the tenant subdomain away.
 */
export function isWorkdaySender(email: string): boolean {
  const host = hostOf(email);
  if (!host) return false;
  return host.endsWith("myworkday.com") || host.endsWith("workday.com") || host.endsWith("myworkdayjobs.com");
}

export function extractWorkdayCompany(msg: NormalizedMessage): AtsCompanyResult | undefined {
  if (!isWorkdaySender(msg.from)) return undefined;
  const reasons = ["sender is a Workday domain"];
  const host = hostOf(msg.from)!;
  const localPart = msg.from.split("@")[0] ?? "";
  const isNoreplyLocal = NOREPLY_PATTERNS.some((p) => localPart.toLowerCase().includes(p));

  if (host.endsWith("myworkdayjobs.com") && host.split(".").length > 3) {
    const tenant = host.split(".")[0]!;
    reasons.push(`company "${tenant}" from Workday tenant subdomain "${host}"`);
    return { company: titleCase(tenant), atsSource: "workday", reasons };
  }

  if ((host === "myworkday.com" || host === "workday.com") && localPart && !isNoreplyLocal) {
    reasons.push(`company "${localPart}" from Workday sender local part`);
    return { company: titleCase(localPart), atsSource: "workday", reasons };
  }

  reasons.push("Workday sender but no tenant pattern matched");
  return { atsSource: "workday", reasons };
}
