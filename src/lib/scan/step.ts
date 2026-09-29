import "server-only";

import { PARSER_VERSION, SCAN_STEP_BATCH_SIZE, type EventType, type Status } from "@/lib/config";
import type { Db, Scan } from "@/lib/db/repo";
import * as repo from "@/lib/db/repo";
import type { TablesInsert, TablesUpdate } from "@/lib/db/types.gen";
import { extractFromMessage, type ExtractionResult } from "@/lib/extract";
import { createGmailClient, getMessage, pool } from "@/lib/gmail/client";
import { parseMessage, type ParsedMessage } from "@/lib/gmail/mime";
import { getAccessToken, NeedsReconnectError } from "@/lib/gmail/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { derive, type DeriveEvent, type Overrides } from "@/lib/match/derive";
import { matchEvent, type MatchApplicationSummary, type MatchContext, type MatchExistingEvent, type MatchInputEvent } from "@/lib/match/matcher";

const FETCH_CONCURRENCY = 8;
/** Gmail snippets are ~200 chars already; this is a hard ceiling so nothing longer is ever stored. */
const MAX_SNIPPET_CHARS = 200;

export type StepCounters = { processed: number; jobRelated: number; appsCreated: number; appsUpdated: number; total: number; failed: number };
export type StepResult = ({ done: boolean } & StepCounters) | { busy: true };

function toCounters(scan: Scan, failed = 0): StepCounters {
  return {
    processed: scan.processed,
    jobRelated: scan.job_related,
    appsCreated: scan.apps_created,
    appsUpdated: scan.apps_updated,
    total: scan.total,
    failed,
  };
}

/**
 * Processes up to SCAN_STEP_BATCH_SIZE items (A4 step 2): claims the scan's lease (returns
 * `{busy: true}` if another step already holds it), fetches+extracts+matches each item, and
 * updates counters. Returns `done: true` once no pending items remain.
 */
export async function stepScan(db: Db, userId: string, scanId: string): Promise<StepResult> {
  const scan = await repo.getScan(db, scanId);
  if (!scan || scan.user_id !== userId) throw new Error("Scan not found");
  if (scan.status !== "processing") {
    const { error: failedCount } = await repo.countScanItemStatuses(db, scanId);
    return { done: true, ...toCounters(scan, failedCount) };
  }

  const lockToken = await repo.claimScanLease(db, scanId);
  if (!lockToken) return { busy: true };

  try {
    const items = await repo.getPendingScanItems(db, scanId, SCAN_STEP_BATCH_SIZE);

    if (items.length === 0) {
      const { error: failedCount } = await reconcileProcessedCount(db, scanId, scan);
      await finishScan(db, userId, scanId);
      return { done: true, ...toCounters((await repo.getScan(db, scanId))!, failedCount) };
    }

    const admin = createAdminClient();
    const [settings, connection] = await Promise.all([repo.getUserSettings(db, userId), repo.getGmailConnection(admin, userId)]);
    const classifyContext = { firstName: settings?.first_name ?? undefined, selfEmail: connection?.google_email };

    const client = createGmailClient({ getToken: (forceRefresh) => getAccessToken(userId, { forceRefresh }) });

    // Phase A: fetch + parse + extract concurrently (I/O-bound, safe to parallelize).
    type Fetched = { messageId: string; parsed?: ParsedMessage; extraction?: ExtractionResult; error?: string };
    let needsReconnect = false;
    const fetched: Fetched[] = await pool(items, FETCH_CONCURRENCY, async (item): Promise<Fetched> => {
      if (needsReconnect) return { messageId: item.message_id, error: "Gmail needs to be reconnected" };
      try {
        const raw = await getMessage(client, item.message_id, { format: "full" });
        const parsed = parseMessage(raw);
        const extraction = extractFromMessage(parsed, classifyContext);
        return { messageId: item.message_id, parsed, extraction };
      } catch (err) {
        if (err instanceof NeedsReconnectError) needsReconnect = true;
        return { messageId: item.message_id, error: err instanceof Error ? err.message : "Fetch failed" };
      }
    });

    if (needsReconnect) {
      await repo.updateScan(db, scanId, { status: "failed", error: "needs_reconnect", finished_at: new Date().toISOString() });
      throw new NeedsReconnectError();
    }

    // Phase B: match + write SEQUENTIALLY. Matching reads and writes application state, and
    // two events for the same new company processed concurrently could both see "no
    // application yet" and each create one; the lease only keeps two STEPS from overlapping,
    // not writes within one step, so this phase must not run inside the pool() above.
    let jobRelatedDelta = 0;
    let appsCreatedDelta = 0;
    const touchedApplicationIds = new Set<string>();

    for (const r of fetched) {
      if (r.error || !r.parsed || !r.extraction) {
        await repo.markScanItem(db, scanId, r.messageId, "error", r.error ?? "Unknown error");
        continue;
      }

      await repo.markProcessed(db, [
        { user_id: userId, message_id: r.messageId, parser_version: PARSER_VERSION, is_job_related: r.extraction.isJobRelated },
      ]);

      if (r.extraction.isJobRelated) {
        jobRelatedDelta++;
        const created = await processJobRelatedEvent(db, userId, r.parsed, r.extraction, touchedApplicationIds);
        if (created) appsCreatedDelta++;
      }

      await repo.markScanItem(db, scanId, r.messageId, "done");
    }

    let appsUpdatedDelta = 0;
    for (const applicationId of touchedApplicationIds) {
      await rederiveApplication(db, applicationId);
      appsUpdatedDelta++;
    }

    const counters: StepCounters = {
      processed: scan.processed + items.length,
      jobRelated: scan.job_related + jobRelatedDelta,
      appsCreated: scan.apps_created + appsCreatedDelta,
      appsUpdated: scan.apps_updated + appsUpdatedDelta,
      total: scan.total,
      // Only known once the scan finishes (below); left at 0 for in-progress steps.
      failed: 0,
    };
    await repo.updateScan(db, scanId, {
      processed: counters.processed,
      job_related: counters.jobRelated,
      apps_created: counters.appsCreated,
      apps_updated: counters.appsUpdated,
    });

    const remaining = await repo.getPendingScanItems(db, scanId, 1);
    const done = remaining.length === 0;
    if (done) {
      const reconciled = await reconcileProcessedCount(db, scanId, { ...scan, processed: counters.processed });
      if (reconciled.processed !== undefined) counters.processed = reconciled.processed;
      counters.failed = reconciled.error;
      await finishScan(db, userId, scanId);
    }

    return { done, ...counters };
  } finally {
    await repo.releaseScanLease(db, scanId, lockToken);
  }
}

/**
 * Corrects scans.processed/total against the authoritative scan_items counts before a scan
 * is marked done, in case an earlier step was interrupted after marking its batch's items
 * done but before saving its counter update. Also returns the current error count, used for
 * the "N items failed" retry affordance (Phase 11).
 */
async function reconcileProcessedCount(
  db: Db,
  scanId: string,
  scan: Pick<Scan, "processed" | "total">,
): Promise<{ processed: number | undefined; error: number }> {
  const { total, pending, error } = await repo.countScanItemStatuses(db, scanId);
  // "processed" counts both done and error items (both were processed; error ones just failed) — unchanged from before Phase 11.
  const trueProcessed = total - pending;
  const patch: TablesUpdate<"scans"> = {};
  if (trueProcessed !== scan.processed) patch.processed = trueProcessed;
  if (total !== scan.total) patch.total = total; // scan_items is the source of truth; total should already match
  if (Object.keys(patch).length > 0) await repo.updateScan(db, scanId, patch);
  return { processed: patch.processed, error };
}

/**
 * Phase 11 "retry failed items": resets a scan's errored scan_items to pending and reopens the
 * scan (if it had already finished) so the client's step loop picks them back up.
 */
export async function retryFailedScanItems(db: Db, userId: string, scanId: string): Promise<{ retried: number }> {
  const scan = await repo.getScan(db, scanId);
  if (!scan || scan.user_id !== userId) throw new Error("Scan not found");
  if (scan.status !== "done" && scan.status !== "failed") throw new Error("Only a finished scan's items can be retried");

  const retried = await repo.resetFailedScanItems(db, scanId);
  if (retried > 0) {
    // Reopening this scan collides with scans_one_active_per_user (A4) if another scan is
    // already active; surface that clearly rather than as a raw constraint-violation message.
    const active = await repo.getActiveScan(db);
    if (active && active.id !== scanId) throw new Error("Another scan is already running; wait for it to finish before retrying.");
    await repo.updateScan(db, scanId, { status: "processing", error: null, finished_at: null });
  }
  return { retried };
}

async function finishScan(db: Db, userId: string, scanId: string): Promise<void> {
  await repo.updateScan(db, scanId, { status: "done", finished_at: new Date().toISOString() });
  await repo.setLastScanAt(db, userId, new Date());
}

/**
 * Handles one job-related message: upserts its email_events row (matching a fresh event, or
 * preserving application_id/state for a user_locked one per D15) and returns whether a new
 * application was created.
 */
async function processJobRelatedEvent(
  db: Db,
  userId: string,
  parsed: ParsedMessage,
  extraction: ExtractionResult,
  touched: Set<string>,
): Promise<boolean> {
  const baseRow: Omit<TablesInsert<"email_events">, "application_id" | "state" | "user_locked" | "match_confidence"> = {
    user_id: userId,
    message_id: parsed.messageId,
    thread_id: parsed.threadId,
    rfc822_message_id: parsed.rfc822MessageId ?? null,
    received_at: parsed.receivedAt,
    from_email: parsed.from,
    from_name: parsed.fromName ?? null,
    subject: parsed.subject,
    snippet: parsed.snippet ? parsed.snippet.slice(0, MAX_SNIPPET_CHARS) : null,
    event_type: extraction.eventType!,
    company: extraction.company ?? null,
    role: extraction.role ?? null,
    req_id: extraction.reqId ?? null,
    recruiter_email: extraction.recruiterEmail ?? null,
    recruiter_name: extraction.recruiterName ?? null,
    ats_source: extraction.atsSource ?? null,
    confidence: extraction.confidence,
    reasons: extraction.reasons,
    parser_version: extraction.parserVersion,
  };

  const existing = await repo.getEvent(db, parsed.messageId);

  if (existing?.user_locked) {
    // D15: re-processing refreshes extracted fields but never touches application_id/state.
    await repo.upsertEvent(db, {
      ...baseRow,
      application_id: existing.application_id,
      state: existing.state,
      user_locked: true,
      match_confidence: existing.match_confidence,
    });
    if (existing.application_id) touched.add(existing.application_id);
    return false;
  }

  const [threadEvents, companyApps] = await Promise.all([
    repo.getEventsByThread(db, parsed.threadId),
    extraction.companyKey ? repo.getApplicationsByCompanyKey(db, extraction.companyKey) : Promise.resolve([]),
  ]);

  const matchInput: MatchInputEvent = {
    messageId: parsed.messageId,
    threadId: parsed.threadId,
    eventType: extraction.eventType!,
    companyKey: extraction.companyKey,
    role: extraction.role,
    reqId: extraction.reqId,
    userLocked: false,
  };
  const existingEvents: MatchExistingEvent[] = threadEvents.map((e) => ({
    messageId: e.message_id,
    threadId: e.thread_id,
    state: e.state as MatchExistingEvent["state"],
    applicationId: e.application_id ?? undefined,
  }));
  const applications: MatchApplicationSummary[] = companyApps.map((a) => ({
    id: a.id,
    companyKey: a.company_key,
    role: a.role,
    status: a.status as Status,
    reqIds: a.req_ids,
  }));
  const context: MatchContext = { existingEvents, applications };

  const result = matchEvent(matchInput, context);

  let applicationId: string | null = null;
  let state: "linked" | "review" = "linked";
  let created = false;

  if (result.action === "attach") {
    applicationId = result.applicationId!;
  } else if (result.action === "create") {
    const role = extraction.role ?? "Unknown";
    const app = await repo.insertApplication(db, {
      user_id: userId,
      company: extraction.company ?? "Unknown",
      company_key: extraction.companyKey!,
      role,
      role_key: normalizeRoleKey(role),
    });
    applicationId = app.id;
    created = true;
  } else {
    state = "review";
    // M5 only: flag the candidate applications so the table shows a dot prompting the user
    // to resolve the ambiguity from the review queue. M8 (unknown company) has no candidates.
    if (result.rule === "M5") {
      await Promise.all(applications.map((a) => repo.updateApplication(db, a.id, { needs_review: true })));
    }
  }

  await repo.upsertEvent(db, {
    ...baseRow,
    application_id: applicationId,
    state,
    user_locked: false,
    match_confidence: result.matchConfidence ?? null,
  });

  if (applicationId) touched.add(applicationId);
  return created;
}

export function normalizeRoleKey(role: string): string {
  return role.trim().toLowerCase();
}

/**
 * Recomputes an application's derived fields from its currently-linked events (A8), respecting
 * overrides. Exported for reuse by Phase 10's mutations (merge/move/assign/reset-to-auto all
 * need to re-derive the applications they touch).
 */
export async function rederiveApplication(db: Db, applicationId: string): Promise<void> {
  const [app, events] = await Promise.all([repo.getApplication(db, applicationId), repo.listEventsForApplication(db, applicationId)]);
  if (!app) return;

  const overrides = (app.overrides ?? {}) as Overrides;
  const deriveEvents: DeriveEvent[] = events.map((e) => ({
    messageId: e.message_id,
    threadId: e.thread_id,
    eventType: e.event_type as EventType,
    role: e.role ?? undefined,
    reqId: e.req_id ?? undefined,
    recruiterEmail: e.recruiter_email ?? undefined,
    recruiterName: e.recruiter_name ?? undefined,
    receivedAt: e.received_at,
    state: e.state as DeriveEvent["state"],
  }));
  const derived = derive(deriveEvents, overrides);

  const patch: TablesUpdate<"applications"> = {
    recruiters: derived.recruiters,
    thread_ids: derived.threadIds,
    req_ids: derived.reqIds,
  };
  if ("appliedAt" in derived) {
    patch.applied_at = derived.appliedAt ?? null;
    patch.applied_date_source = derived.appliedDateSource;
  }
  if ("role" in derived && derived.role) {
    patch.role = derived.role;
    patch.role_key = normalizeRoleKey(derived.role);
  }
  if ("status" in derived) patch.status = derived.status;
  if ("primaryRecruiterEmail" in derived) patch.primary_recruiter_email = derived.primaryRecruiterEmail ?? null;

  await repo.updateApplication(db, applicationId, patch);
}
