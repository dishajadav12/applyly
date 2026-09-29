import { ASSESSMENT_DOMAINS, ATS_DOMAINS, NOREPLY_PATTERNS, RECRUITER_KEYWORDS } from "@/lib/config";
import { registrableDomain } from "@/lib/gmail/domains";
import type { NormalizedMessage } from "./normalize";

export type RecruiterExtraction = { recruiterEmail?: string; recruiterName?: string; reasons: string[] };

const ATS_AND_ASSESSMENT_DOMAINS = [...ATS_DOMAINS, ...ASSESSMENT_DOMAINS] as readonly string[];

function localPartOf(email: string): string {
  return email.split("@")[0] ?? "";
}

function looksLikeNoreply(email: string): boolean {
  const local = localPartOf(email).toLowerCase();
  return NOREPLY_PATTERNS.some((p) => local.includes(p));
}

/**
 * Recruiter detection (A7). The sender must not be a noreply, ATS, or scheduler
 * address, and must then either have a display name/signature that says
 * recruiter/talent/sourcer/university recruiting, or a Reply-To that looks like a
 * human address. Agency and gmail.com senders are allowed (not excluded like company
 * extraction excludes freemail domains). Thread-linked-to-an-application escalation
 * (A7's third condition) needs match-time context and is applied in Phase 7/8, not here.
 */
export function extractRecruiter(msg: NormalizedMessage): RecruiterExtraction {
  const reasons: string[] = [];
  const domain = registrableDomain(msg.from);
  const isAtsOrScheduler = domain !== undefined && ATS_AND_ASSESSMENT_DOMAINS.includes(domain);
  const isNoreply = looksLikeNoreply(msg.from);

  if (isNoreply || isAtsOrScheduler) {
    reasons.push(
      isNoreply
        ? "sender local part looks like a noreply address; not treated as a recruiter"
        : "sender domain is an ATS/assessment platform; not treated as a recruiter",
    );
    return { reasons };
  }

  const nameAndSignature = `${msg.fromName ?? ""} ${msg.text}`.toLowerCase();
  const keyword = RECRUITER_KEYWORDS.find((k) => nameAndSignature.includes(k));
  if (keyword) {
    reasons.push(`sender display name or signature contains recruiter keyword "${keyword}"`);
    return { recruiterEmail: msg.from, recruiterName: msg.fromName, reasons };
  }

  if (msg.replyTo && !looksLikeNoreply(msg.replyTo)) {
    reasons.push(`Reply-To "${msg.replyTo}" looks like a human address`);
    return { recruiterEmail: msg.replyTo, recruiterName: msg.fromName, reasons };
  }

  reasons.push("sender is not a noreply/ATS address, but no recruiter signal matched");
  return { reasons };
}
