import "server-only";

import { PARSER_VERSION } from "@/lib/config";
import type { Db } from "@/lib/db/repo";
import { createScan, getActiveScan, getProcessedIds, insertScanItems, updateScan } from "@/lib/db/repo";
import { createGmailClient } from "@/lib/gmail/client";
import { buildQueries, listMessageIds } from "@/lib/gmail/query";
import { getAccessToken } from "@/lib/gmail/tokens";

export type StartScanResult = { ok: true; scanId: string; total: number } | { ok: false; activeScanId: string };

/**
 * Starts a scan (A4 step 1): lists Q1–Q3, unions and drops IDs already processed at the
 * current PARSER_VERSION, and queues the rest oldest-first. Only one active scan per user
 * is allowed (scans_one_active_per_user); a second attempt returns the running scan's id
 * instead of an error, so the caller can offer to follow it.
 */
export async function startScan(db: Db, userId: string, rangeStart: Date, rangeEnd: Date): Promise<StartScanResult> {
  const scan = await createScan(db, {
    user_id: userId,
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
  });
  if (!scan) {
    const active = await getActiveScan(db);
    // The unique index just rejected us, so an active scan must exist; if the race is
    // this tight (it finished between the two queries), fail closed with a clear error.
    if (!active) throw new Error("Could not start a scan and no active scan was found; please retry");
    return { ok: false, activeScanId: active.id };
  }

  try {
    const queries = buildQueries(rangeStart, rangeEnd);
    const client = createGmailClient({ getToken: (forceRefresh) => getAccessToken(userId, { forceRefresh }) });

    const idLists = await Promise.all(Object.values(queries).map((q) => listMessageIds(client, q)));
    // Each query lists newest-first; reversing the deduplicated union is a best-effort
    // oldest-first ordering (A4). Merging three separately-ordered lists into one exactly
    // chronological sequence would need each message's date, which means fetching it —
    // exactly the per-message work the cheap "list" phase is meant to avoid.
    const unionIds = [...new Set(idLists.flat())];
    const alreadyProcessed = await getProcessedIds(db, unionIds, PARSER_VERSION);
    const toProcess = unionIds.filter((id) => !alreadyProcessed.has(id)).reverse();

    await insertScanItems(
      db,
      toProcess.map((message_id, seq) => ({ scan_id: scan.id, user_id: userId, message_id, seq })),
    );
    await updateScan(db, scan.id, { status: "processing", total: toProcess.length });

    return { ok: true, scanId: scan.id, total: toProcess.length };
  } catch (err) {
    await updateScan(db, scan.id, {
      status: "failed",
      error: err instanceof Error ? err.message : "Listing messages failed",
      finished_at: new Date().toISOString(),
    });
    throw err;
  }
}
