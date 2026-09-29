import {
  STAGE_EVENT_TYPES,
  STATUS_RANK,
  STATUS_RANK_BY_EVENT_TYPE,
  TERMINAL_STATUS_BY_EVENT_TYPE,
  type EventType,
  type Status,
} from "@/lib/config";

/** The subset of an email_events row derive.ts needs. Only state === "linked" rows count (A8). */
export type DeriveEvent = {
  messageId: string;
  threadId: string;
  eventType: EventType;
  role?: string;
  reqId?: string;
  recruiterEmail?: string;
  recruiterName?: string;
  receivedAt: string; // ISO
  state: "linked" | "review" | "dismissed";
};

/** applications.overrides (A5): which fields the user has edited and derive must never overwrite. */
export type Overrides = Partial<Record<"role" | "appliedAt" | "status" | "recruiterEmail", boolean>>;

export type Recruiter = { email: string; name?: string; lastSeen: string };

export type DerivedFields = {
  appliedAt?: string;
  appliedDateSource: "explicit" | "inferred";
  role: string;
  status: Status;
  primaryRecruiterEmail?: string;
  recruiters: Recruiter[];
  threadIds: string[];
  reqIds: string[];
};

const STAGE_EVENT_TYPE_SET = new Set<EventType>(STAGE_EVENT_TYPES);

/** Word count as a simple, documented proxy for "most specific" (A8 doesn't define one). */
function specificity(role: string): number {
  return role.trim().split(/\s+/).filter(Boolean).length;
}

function mostSpecific(roles: string[]): string {
  return roles.reduce((best, r) => (specificity(r) > specificity(best) ? r : best));
}

function computeStatus(sorted: readonly DeriveEvent[]): Status {
  const stageEvents = sorted.filter((e) => STAGE_EVENT_TYPE_SET.has(e.eventType));

  if (stageEvents.length > 0) {
    const latest = stageEvents[stageEvents.length - 1]!;
    const terminal = (TERMINAL_STATUS_BY_EVENT_TYPE as Partial<Record<EventType, Status>>)[latest.eventType];
    // A later STAGE event can reopen a terminal one; a later non-stage email never does,
    // because non-stage events aren't in `stageEvents` and so can never become "latest" here.
    if (terminal) return terminal;
  }

  // Otherwise: the highest status rank seen (confirmation/recruiter_outreach count here even
  // though they aren't "stage events"; a lower-rank later event can never lower this max, which
  // is exactly "recruiter emails never downgrade the status").
  let bestRank: number = STATUS_RANK.Applied;
  let bestStatus: Status = "Applied";
  for (const e of sorted) {
    const rank = (STATUS_RANK_BY_EVENT_TYPE as Partial<Record<EventType, number>>)[e.eventType];
    if (rank && rank > bestRank) {
      bestRank = rank;
      bestStatus = (Object.entries(STATUS_RANK).find(([, r]) => r === rank)?.[0] as Status) ?? bestStatus;
    }
  }
  return bestStatus;
}

/**
 * Recomputes applied_at/source, role, status, primary_recruiter_email, recruiters,
 * thread_ids and req_ids from an application's linked events (A8). Pure and
 * order-independent: events are sorted internally, so any input order (or a partial
 * rescan in a different order) produces identical output. A field named in `overrides`
 * is omitted from the result entirely, so a caller that does
 * `db.update(app.id, derive(events, app.overrides))` never overwrites a user edit.
 */
export function derive(events: readonly DeriveEvent[], overrides: Overrides = {}): Partial<DerivedFields> {
  const linked = events.filter((e) => e.state === "linked");
  // Sort by receivedAt, then messageId, so ties break the same way regardless of input order.
  const sorted = [...linked].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt) || a.messageId.localeCompare(b.messageId));

  // --- applied_at / source ---------------------------------------------------------
  const confirmations = sorted.filter((e) => e.eventType === "application_confirmation");
  let appliedAt: string | undefined;
  let appliedDateSource: "explicit" | "inferred" = "inferred";
  if (confirmations.length > 0) {
    appliedAt = confirmations[0]!.receivedAt;
    appliedDateSource = "explicit";
  } else if (sorted.length > 0) {
    appliedAt = sorted[0]!.receivedAt;
  }

  // --- role: most specific non-Unknown role, preferring confirmation emails --------
  let role = "Unknown";
  const confirmationRoles = confirmations.map((e) => e.role).filter((r): r is string => Boolean(r));
  if (confirmationRoles.length > 0) {
    role = mostSpecific(confirmationRoles);
  } else {
    const allRoles = sorted.map((e) => e.role).filter((r): r is string => Boolean(r));
    if (allRoles.length > 0) role = mostSpecific(allRoles);
  }

  // --- status -----------------------------------------------------------------------
  const status = computeStatus(sorted);

  // --- recruiters / primary_recruiter_email -----------------------------------------
  const recruiterMap = new Map<string, Recruiter>();
  for (const e of sorted) {
    if (!e.recruiterEmail) continue;
    const existing = recruiterMap.get(e.recruiterEmail);
    if (!existing || Date.parse(e.receivedAt) >= Date.parse(existing.lastSeen)) {
      recruiterMap.set(e.recruiterEmail, { email: e.recruiterEmail, name: e.recruiterName, lastSeen: e.receivedAt });
    }
  }
  const recruiters = [...recruiterMap.values()].sort((a, b) => a.email.localeCompare(b.email));
  const recruiterEvents = sorted.filter((e) => e.recruiterEmail);
  const primaryRecruiterEmail = recruiterEvents.length > 0 ? recruiterEvents[recruiterEvents.length - 1]!.recruiterEmail : undefined;

  // --- thread_ids / req_ids ----------------------------------------------------------
  const threadIds = [...new Set(sorted.map((e) => e.threadId))].sort();
  const reqIds = [...new Set(sorted.map((e) => e.reqId).filter((r): r is string => Boolean(r)))].sort();

  const result: DerivedFields = { appliedAt, appliedDateSource, role, status, primaryRecruiterEmail, recruiters, threadIds, reqIds };

  const output: Partial<DerivedFields> = { ...result };
  if (overrides.appliedAt) {
    delete output.appliedAt;
    delete output.appliedDateSource;
  }
  if (overrides.role) delete output.role;
  if (overrides.status) delete output.status;
  if (overrides.recruiterEmail) delete output.primaryRecruiterEmail;

  return output;
}
