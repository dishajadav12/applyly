import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "./types.gen";

/**
 * Typed data helpers. Every function takes the client as its first argument so
 * callers choose the right one: the session client for user data (RLS applies),
 * the admin (secret-key) client ONLY for gmail_connections.
 */
export type Db = SupabaseClient<Database>;

export type UserSettings = Tables<"user_settings">;
export type GmailConnection = Tables<"gmail_connections">;
export type Application = Tables<"applications">;
export type EmailEvent = Tables<"email_events">;
export type ProcessedMessage = Tables<"processed_messages">;
export type Scan = Tables<"scans">;
export type ScanItem = Tables<"scan_items">;

export type ScanStatus = "listing" | "processing" | "done" | "failed" | "cancelled";

/** Max rows per scan_items insert (A4). */
const SCAN_ITEM_BATCH = 1000;

function fail(op: string, error: { message: string }): never {
  throw new Error(`${op}: ${error.message}`);
}

// --- user_settings -----------------------------------------------------------

export async function getUserSettings(db: Db, userId: string): Promise<UserSettings | null> {
  const { data, error } = await db.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) fail("getUserSettings", error);
  return data;
}

export async function setLastScanAt(db: Db, userId: string, at: Date): Promise<void> {
  const { error } = await db
    .from("user_settings")
    .update({ last_scan_at: at.toISOString() })
    .eq("user_id", userId);
  if (error) fail("setLastScanAt", error);
}

/** Phase 12: sets (or clears, with null) the user's AI fallback provider. Off by default. */
export async function setAiProvider(db: Db, userId: string, provider: string | null): Promise<void> {
  const { error } = await db.from("user_settings").update({ ai_provider: provider }).eq("user_id", userId);
  if (error) fail("setAiProvider", error);
}

// --- gmail_connections (admin client only) ---------------------------------------

export async function getGmailConnection(admin: Db, userId: string): Promise<GmailConnection | null> {
  const { data, error } = await admin.from("gmail_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) fail("getGmailConnection", error);
  return data;
}

export async function upsertGmailConnection(
  admin: Db,
  row: TablesInsert<"gmail_connections">,
): Promise<void> {
  // Never overwrite a stored refresh token with an empty one.
  if (!row.refresh_token_enc) throw new Error("upsertGmailConnection: refresh_token_enc must not be empty");
  const { error } = await admin.from("gmail_connections").upsert(row, { onConflict: "user_id" });
  if (error) fail("upsertGmailConnection", error);
}

export async function updateGmailConnection(
  admin: Db,
  userId: string,
  patch: TablesUpdate<"gmail_connections">,
): Promise<void> {
  if (patch.refresh_token_enc === "") throw new Error("updateGmailConnection: refresh_token_enc must not be empty");
  const { error } = await admin.from("gmail_connections").update(patch).eq("user_id", userId);
  if (error) fail("updateGmailConnection", error);
}

export async function deleteGmailConnection(admin: Db, userId: string): Promise<void> {
  const { error } = await admin.from("gmail_connections").delete().eq("user_id", userId);
  if (error) fail("deleteGmailConnection", error);
}

// --- applications ------------------------------------------------------------

export async function listApplications(db: Db): Promise<Application[]> {
  const { data, error } = await db.from("applications").select("*").order("applied_at", { ascending: false });
  if (error) fail("listApplications", error);
  return data;
}

export async function getApplication(db: Db, id: string): Promise<Application | null> {
  const { data, error } = await db.from("applications").select("*").eq("id", id).maybeSingle();
  if (error) fail("getApplication", error);
  return data;
}

export async function insertApplication(db: Db, row: TablesInsert<"applications">): Promise<Application> {
  const { data, error } = await db.from("applications").insert(row).select("*").single();
  if (error) fail("insertApplication", error);
  return data;
}

export async function updateApplication(
  db: Db,
  id: string,
  patch: TablesUpdate<"applications">,
): Promise<Application> {
  const { data, error } = await db.from("applications").update(patch).eq("id", id).select("*").single();
  if (error) fail("updateApplication", error);
  return data;
}

/** Deletes an application; its events move to review and become user-locked (A8). */
export async function deleteApplication(db: Db, id: string): Promise<void> {
  const { error } = await db.rpc("delete_application", { app_id: id });
  if (error) fail("deleteApplication", error);
}

/** For the matcher's company-key rules (M3–M6). */
export async function getApplicationsByCompanyKey(db: Db, companyKey: string): Promise<Application[]> {
  const { data, error } = await db.from("applications").select("*").eq("company_key", companyKey);
  if (error) fail("getApplicationsByCompanyKey", error);
  return data;
}

/**
 * Raw delete, no side effects on its events (A9 "Merge into…"): the caller must have already
 * moved this application's events elsewhere. Deliberately distinct from the `delete_application`
 * RPC used by the Delete action, which moves events to review — that would be wrong here, since
 * the events were already reassigned to the merge target.
 */
export async function deleteApplicationRow(db: Db, id: string): Promise<void> {
  const { error } = await db.from("applications").delete().eq("id", id);
  if (error) fail("deleteApplicationRow", error);
}

/** A9 "Merge into…": moves every event off `fromApplicationId` onto `toApplicationId`, user-locked (D15). */
export async function reassignApplicationEvents(db: Db, fromApplicationId: string, toApplicationId: string): Promise<void> {
  const { error } = await db
    .from("email_events")
    .update({ application_id: toApplicationId, state: "linked", user_locked: true })
    .eq("application_id", fromApplicationId);
  if (error) fail("reassignApplicationEvents", error);
}

// --- email_events ------------------------------------------------------------

export async function getEvent(db: Db, messageId: string): Promise<EmailEvent | null> {
  const { data, error } = await db.from("email_events").select("*").eq("message_id", messageId).maybeSingle();
  if (error) fail("getEvent", error);
  return data;
}

export async function listEventsForApplication(db: Db, applicationId: string): Promise<EmailEvent[]> {
  const { data, error } = await db
    .from("email_events")
    .select("*")
    .eq("application_id", applicationId)
    .order("received_at", { ascending: true });
  if (error) fail("listEventsForApplication", error);
  return data;
}

/** For the matcher's M1 (same-thread) check. */
export async function getEventsByThread(db: Db, threadId: string): Promise<EmailEvent[]> {
  const { data, error } = await db.from("email_events").select("*").eq("thread_id", threadId);
  if (error) fail("getEventsByThread", error);
  return data;
}

export async function listReviewEvents(db: Db): Promise<EmailEvent[]> {
  const { data, error } = await db
    .from("email_events")
    .select("*")
    .eq("state", "review")
    .order("received_at", { ascending: false });
  if (error) fail("listReviewEvents", error);
  return data;
}

/**
 * Idempotent on (user_id, message_id). Callers must NOT pass application_id/state
 * for an event with user_locked = true (D15); the scan pipeline enforces that.
 */
export async function upsertEvent(db: Db, row: TablesInsert<"email_events">): Promise<void> {
  const { error } = await db.from("email_events").upsert(row, { onConflict: "user_id,message_id" });
  if (error) fail("upsertEvent", error);
}

export async function updateEvent(
  db: Db,
  messageId: string,
  patch: TablesUpdate<"email_events">,
): Promise<void> {
  const { error } = await db.from("email_events").update(patch).eq("message_id", messageId);
  if (error) fail("updateEvent", error);
}

/** A9 assign/move: attaches one event to an application, user-locked (D15). */
export async function lockEventToApplication(db: Db, messageId: string, applicationId: string): Promise<void> {
  await updateEvent(db, messageId, { application_id: applicationId, state: "linked", user_locked: true });
}

/** A9 review dialog "Dismiss": the email is not job-related; never re-added by a rescan (D15). */
export async function dismissEvent(db: Db, messageId: string): Promise<void> {
  await updateEvent(db, messageId, { state: "dismissed", user_locked: true });
}

// --- processed_messages ------------------------------------------------------

/** Which of these IDs were already processed under this parser version. */
export async function getProcessedIds(db: Db, messageIds: string[], parserVersion: number): Promise<Set<string>> {
  const done = new Set<string>();
  for (let i = 0; i < messageIds.length; i += 200) {
    const { data, error } = await db
      .from("processed_messages")
      .select("message_id")
      .eq("parser_version", parserVersion)
      .in("message_id", messageIds.slice(i, i + 200));
    if (error) fail("getProcessedIds", error);
    for (const r of data) done.add(r.message_id);
  }
  return done;
}

/** Sender addresses of events linked to an application (RLS-scoped to the session user); source of Q5's learned domains. */
export async function getLinkedSenderEmails(db: Db): Promise<string[]> {
  const { data, error } = await db.from("email_events").select("from_email").eq("state", "linked").not("application_id", "is", null);
  if (error) fail("getLinkedSenderEmails", error);
  return data.map((r) => r.from_email);
}

export async function markProcessed(db: Db, rows: TablesInsert<"processed_messages">[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("processed_messages").upsert(rows, { onConflict: "user_id,message_id" });
  if (error) fail("markProcessed", error);
}

/**
 * "Re-process all": deletes processed_messages rows stamped with an older PARSER_VERSION, so the
 * next scan re-fetches and re-extracts those message IDs. Rows already at the current version are
 * left alone (a scan is otherwise a no-op the second time it covers the same range).
 */
export async function deleteStaleProcessedMessages(db: Db, userId: string, currentParserVersion: number): Promise<number> {
  const { data, error } = await db
    .from("processed_messages")
    .delete()
    .eq("user_id", userId)
    .neq("parser_version", currentParserVersion)
    .select("message_id");
  if (error) fail("deleteStaleProcessedMessages", error);
  return data.length;
}

// --- scans -------------------------------------------------------------------

export async function getScan(db: Db, id: string): Promise<Scan | null> {
  const { data, error } = await db.from("scans").select("*").eq("id", id).maybeSingle();
  if (error) fail("getScan", error);
  return data;
}

/** Phase 11 rate limiting: when this user's most recent scan (any status) was started. */
export async function getLastScanStartedAt(db: Db): Promise<string | null> {
  const { data, error } = await db.from("scans").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) fail("getLastScanStartedAt", error);
  return data?.started_at ?? null;
}

export async function getActiveScan(db: Db): Promise<Scan | null> {
  const { data, error } = await db
    .from("scans")
    .select("*")
    .in("status", ["listing", "processing"])
    .maybeSingle();
  if (error) fail("getActiveScan", error);
  return data;
}

/**
 * Inserts a scan in 'listing'. Returns null when the one-active-scan index rejects it
 * (Postgres 23505); the caller then returns 409 with the active scan id.
 */
export async function createScan(
  db: Db,
  row: Pick<TablesInsert<"scans">, "user_id" | "range_start" | "range_end">,
): Promise<Scan | null> {
  const { data, error } = await db.from("scans").insert({ ...row, status: "listing" }).select("*").single();
  if (error) {
    if (error.code === "23505") return null;
    fail("createScan", error);
  }
  return data;
}

export async function updateScan(db: Db, id: string, patch: TablesUpdate<"scans">): Promise<void> {
  const { error } = await db.from("scans").update(patch).eq("id", id);
  if (error) fail("updateScan", error);
}

/** Claims the 90s step lease. Returns the lock_token, or null when busy (A4). */
export async function claimScanLease(db: Db, scanId: string): Promise<string | null> {
  const { data, error } = await db.rpc("claim_scan_lease", { scan_id: scanId });
  if (error) fail("claimScanLease", error);
  return data;
}

/** Releases the lease only if lock_token still matches. */
export async function releaseScanLease(db: Db, scanId: string, lockToken: string): Promise<void> {
  const { error } = await db
    .from("scans")
    .update({ locked_until: null })
    .eq("id", scanId)
    .eq("lock_token", lockToken);
  if (error) fail("releaseScanLease", error);
}

// --- scan_items --------------------------------------------------------------

export async function insertScanItems(db: Db, rows: TablesInsert<"scan_items">[]): Promise<void> {
  for (let i = 0; i < rows.length; i += SCAN_ITEM_BATCH) {
    const { error } = await db.from("scan_items").insert(rows.slice(i, i + SCAN_ITEM_BATCH));
    if (error) fail("insertScanItems", error);
  }
}

export async function getPendingScanItems(db: Db, scanId: string, limit: number): Promise<ScanItem[]> {
  const { data, error } = await db
    .from("scan_items")
    .select("*")
    .eq("scan_id", scanId)
    .eq("status", "pending")
    .order("seq", { ascending: true })
    .limit(limit);
  if (error) fail("getPendingScanItems", error);
  return data;
}

/**
 * Authoritative item counts for a scan, straight from scan_items. A step interrupted
 * mid-run (e.g. the tab was reloaded) can leave scans.processed stale even though every
 * scan_items row in its batch was in fact marked done; this is what reconciles it before
 * a scan is marked done, so the final numbers shown always match reality.
 */
export async function countScanItemStatuses(db: Db, scanId: string): Promise<{ total: number; pending: number; error: number }> {
  const [total, pending, errored] = await Promise.all([
    db.from("scan_items").select("*", { count: "exact", head: true }).eq("scan_id", scanId),
    db.from("scan_items").select("*", { count: "exact", head: true }).eq("scan_id", scanId).eq("status", "pending"),
    db.from("scan_items").select("*", { count: "exact", head: true }).eq("scan_id", scanId).eq("status", "error"),
  ]);
  if (total.error) fail("countScanItemStatuses", total.error);
  if (pending.error) fail("countScanItemStatuses", pending.error);
  if (errored.error) fail("countScanItemStatuses", errored.error);
  return { total: total.count ?? 0, pending: pending.count ?? 0, error: errored.count ?? 0 };
}

export async function markScanItem(
  db: Db,
  scanId: string,
  messageId: string,
  status: "done" | "error",
  errorMessage?: string,
): Promise<void> {
  const { error } = await db
    .from("scan_items")
    .update({ status, error: errorMessage ?? null })
    .eq("scan_id", scanId)
    .eq("message_id", messageId);
  if (error) fail("markScanItem", error);
}

/** Phase 11 "retry failed items": resets a scan's errored items back to pending. Returns how many. */
export async function resetFailedScanItems(db: Db, scanId: string): Promise<number> {
  const { data, error } = await db
    .from("scan_items")
    .update({ status: "pending", error: null })
    .eq("scan_id", scanId)
    .eq("status", "error")
    .select("message_id");
  if (error) fail("resetFailedScanItems", error);
  return data.length;
}
