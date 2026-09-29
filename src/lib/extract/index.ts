import { PARSER_VERSION, type EventType } from "@/lib/config";
import type { ParsedMessage } from "@/lib/gmail/mime";
import { classify, type ClassifyContext } from "./classify";
import { extractCompany } from "./company";
import { normalizeMessage } from "./normalize";
import { extractRecruiter } from "./recruiter";
import { extractReqId } from "./reqId";
import { extractRole } from "./role";

export type { ClassifyContext } from "./classify";
export type { NormalizedMessage } from "./normalize";

/** One extracted email event. Mirrors the email_events columns (A5); reasons[] explains every decision. */
export type ExtractionResult = {
  isJobRelated: boolean;
  score: number;
  /** Stored as email_events.confidence; currently the raw classification score. */
  confidence: number;
  eventType?: EventType;
  company?: string;
  companyKey?: string;
  role?: string;
  reqId?: string;
  recruiterEmail?: string;
  recruiterName?: string;
  atsSource?: string;
  reasons: string[];
  parserVersion: number;
};

/**
 * The full A7 pipeline: normalize -> classify -> extract company/role/reqId/recruiter.
 * Pure: no Supabase, no fetch, no Next imports. `parsed` should already be normalized
 * MIME output from gmail/mime.ts (decoded, quoted-reply-stripped, truncated).
 */
export function extractFromMessage(parsed: ParsedMessage, context: ClassifyContext = {}): ExtractionResult {
  const msg = normalizeMessage(parsed);

  const cls = classify(msg, context);
  const companyResult = extractCompany(msg);
  const roleResult = extractRole(msg);
  const recruiterResult = extractRecruiter(msg);
  const reqIdResult = extractReqId(msg);

  return {
    isJobRelated: cls.isJobRelated,
    score: cls.score,
    confidence: cls.score,
    eventType: cls.eventType,
    company: companyResult.company,
    companyKey: companyResult.companyKey,
    role: roleResult.role,
    reqId: reqIdResult.reqId,
    recruiterEmail: recruiterResult.recruiterEmail,
    recruiterName: recruiterResult.recruiterName,
    atsSource: companyResult.atsSource,
    reasons: [...cls.reasons, ...companyResult.reasons, ...roleResult.reasons, ...recruiterResult.reasons, ...reqIdResult.reasons],
    parserVersion: PARSER_VERSION,
  };
}
