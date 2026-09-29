import { ROLE_SIMILARITY_THRESHOLD, TERMINAL_STATUSES, type EventType, type Status } from "@/lib/config";
import { roleSimilarity } from "./similarity";

export type MatchAction = "attach" | "create" | "review";

/** The event being matched. `role`/`companyKey`/`reqId` come straight from extraction (undefined when unknown). */
export type MatchInputEvent = {
  messageId: string;
  threadId: string;
  eventType: EventType;
  companyKey?: string;
  role?: string;
  reqId?: string;
  /** D15: matchEvent must never be called for a user_locked event; see the guard below. */
  userLocked: boolean;
};

/** The subset of an existing linked email_events row the matcher needs, for the M1 thread check. */
export type MatchExistingEvent = {
  messageId: string;
  threadId: string;
  state: "linked" | "review" | "dismissed";
  applicationId?: string;
};

/** The subset of an existing application the matcher needs. */
export type MatchApplicationSummary = {
  id: string;
  companyKey: string;
  /** "Unknown" when the role hasn't been determined yet (A5 default). */
  role: string;
  status: Status;
  reqIds: readonly string[];
};

export type MatchContext = {
  /** Other users' events are never passed in; scope this to the current user. Excludes the event being matched. */
  existingEvents: readonly MatchExistingEvent[];
  applications: readonly MatchApplicationSummary[];
};

export type MatchResult = {
  action: MatchAction;
  applicationId?: string;
  /** Per the A8 table; undefined for M6/M7/M8, which have no confidence ("—"). */
  matchConfidence?: number;
  /** Which rule fired (M1–M8), for tests and debugging. */
  rule: string;
  reason: string;
};

function isTerminalStatus(status: Status): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Matching (A8): rules M1–M8, evaluated in order; the first that fires decides.
 * Pure: no Supabase, no fetch, no Next imports. Sender domain is never used as a
 * signal (so third-party assessment emails match on company/role/thread like any other).
 */
export function matchEvent(event: MatchInputEvent, context: MatchContext): MatchResult {
  if (event.userLocked) {
    throw new Error("matchEvent must not be called for a user_locked event (D15); it keeps its existing application_id and state");
  }

  // M1: same thread as an event already linked to an application.
  const threadMatch = context.existingEvents.find(
    (e) => e.threadId === event.threadId && e.state === "linked" && e.applicationId && e.messageId !== event.messageId,
  );
  if (threadMatch?.applicationId) {
    return {
      action: "attach",
      applicationId: threadMatch.applicationId,
      matchConfidence: 1.0,
      rule: "M1",
      reason: `M1: same thread as a linked event on application ${threadMatch.applicationId}`,
    };
  }

  // M2: same req_id as an application.
  if (event.reqId) {
    const reqMatch = context.applications.find((a) => a.reqIds.includes(event.reqId!));
    if (reqMatch) {
      return {
        action: "attach",
        applicationId: reqMatch.id,
        matchConfidence: 0.95,
        rule: "M2",
        reason: `M2: req id "${event.reqId}" matches application ${reqMatch.id}`,
      };
    }
  }

  // M8: company unknown.
  const companyKey = event.companyKey;
  if (!companyKey) {
    return { action: "review", rule: "M8", reason: "M8: company unknown" };
  }

  const companyApps = context.applications.filter((a) => a.companyKey === companyKey);

  // M7: no application exists yet for this company.
  if (companyApps.length === 0) {
    return { action: "create", rule: "M7", reason: `M7: no application exists yet for company_key "${companyKey}"` };
  }

  if (event.role) {
    // M3: same company, and role similarity >= threshold against a named-role application.
    const named = companyApps.filter((a) => a.role !== "Unknown");
    let best: { app: MatchApplicationSummary; sim: number } | undefined;
    for (const app of named) {
      const sim = roleSimilarity(event.role, app.role);
      if (!best || sim > best.sim) best = { app, sim };
    }
    if (best && best.sim >= ROLE_SIMILARITY_THRESHOLD) {
      return {
        action: "attach",
        applicationId: best.app.id,
        matchConfidence: 0.9,
        rule: "M3",
        reason: `M3: role similarity ${best.sim.toFixed(2)} >= ${ROLE_SIMILARITY_THRESHOLD} with application ${best.app.id} ("${best.app.role}")`,
      };
    }

    // M3b: the event has a role, and the company has exactly one application with role Unknown.
    const unknown = companyApps.filter((a) => a.role === "Unknown");
    if (unknown.length === 1) {
      return {
        action: "attach",
        applicationId: unknown[0].id,
        matchConfidence: 0.8,
        rule: "M3b",
        reason: `M3b: company's only application (${unknown[0].id}) has an unknown role; derive will fill it in`,
      };
    }

    // M6: the event's role matches no existing application.
    return { action: "create", rule: "M6", reason: `M6: role "${event.role}" matches no existing application at "${companyKey}"` };
  }

  // From here, the event has no role.
  const nonTerminal = companyApps.filter((a) => !isTerminalStatus(a.status));

  // M4: exactly one non-terminal application at this company.
  if (nonTerminal.length === 1) {
    return {
      action: "attach",
      applicationId: nonTerminal[0].id,
      matchConfidence: 0.75,
      rule: "M4",
      reason: `M4: company's only non-terminal application is ${nonTerminal[0].id}`,
    };
  }

  if (nonTerminal.length === 0) {
    const terminal = companyApps.filter((a) => isTerminalStatus(a.status));
    const isFollowUp = event.eventType === "rejection" || event.eventType === "withdrawal" || event.eventType === "other_update";
    // M4b: no non-terminal application, exactly one terminal one, and this looks like a follow-up to it.
    if (terminal.length === 1 && isFollowUp) {
      return {
        action: "attach",
        applicationId: terminal[0].id,
        matchConfidence: 0.7,
        rule: "M4b",
        reason: `M4b: follow-up ("${event.eventType}") to the company's only (closed) application ${terminal[0].id}`,
      };
    }
  }

  // M5: ambiguous — several candidates, or a new-stage email for a company whose only application is closed.
  return {
    action: "review",
    matchConfidence: 0.4,
    rule: "M5",
    reason: `M5: roleless "${event.eventType}" at "${companyKey}" with ${nonTerminal.length} non-terminal application(s); ambiguous`,
  };
}
