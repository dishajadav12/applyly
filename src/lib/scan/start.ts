import "server-only";

import { ASSESSMENT_DOMAINS, ATS_DOMAINS, FREEMAIL_DOMAINS, NON_EMPLOYER_SENDER_DOMAINS, PARSER_VERSION } from "@/lib/config";
import type { Db, ScanKind } from "@/lib/db/repo";
import { createScan, getActiveScan, getLinkedSenderEmails, getProcessedIds, insertScanItems, updateScan } from "@/lib/db/repo";
import { createGmailClient } from "@/lib/gmail/client";
import { learnedEmployerDomains } from "@/lib/gmail/domains";
import { buildLearnedDomainQueries, buildQueries, buildSentQuery, listMessageIds } from "@/lib/gmail/query";
import { getAccessToken } from "@/lib/gmail/tokens";

export type StartScanResult = { ok: true; scanId: string; total: number } | { ok: false; activeScanId: string };

/**
 * Starts a scan (A4 step 1): lists Q1–Q6 (Q4: recruiting-style senders; Q5: domains of employers already linked; Q6: sent mail that reads like recruiter outreach), unions and drops IDs already processed at the
 * current PARSER_VERSION, and queues the rest oldest-first. Only one active scan per user
 * is allowed (scans_one_active_per_user); a second attempt returns the running scan's id
 * instead of an error, so the caller can offer to follow it.
 */
export async function startScan(db: Db, userId: string, rangeStart: Date, rangeEnd: Date, kind: ScanKind = "full"): Promise<StartScanResult> {
  const scan = await createScan(db, {
    user_id: userId,
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
    kind,
  });
  if (!scan) {
    const active = await getActiveScan(db);
    // The unique index just rejected us, so an active scan must exist; if the race is
    // this tight (it finished between the two queries), fail closed with a clear error.
    if (!active) throw new Error("Could not start a scan and no active scan was found; please retry");
    return { ok: false, activeScanId: active.id };
  }

  try {
    const client = createGmailClient({ getToken: (forceRefresh) => getAccessToken(userId, { forceRefresh }) });

    // Outreach-only: every sent message to a non-freemail address (no wording filter, so nothing is missed). Nothing is filtered by processed_messages, because this
    // kind never marks messages processed (a later full scan must still see them).
    if (kind === "outreach") {
      const ids = (await listMessageIds(client, buildSentQuery(rangeStart, rangeEnd, { all: true }))).reverse();
      await insertScanItems(db, ids.map((message_id, seq) => ({ scan_id: scan.id, user_id: userId, message_id, seq })));
      await updateScan(db, scan.id, { status: "processing", total: ids.length });
      return { ok: true, scanId: scan.id, total: ids.length };
    }

    const queries = buildQueries(rangeStart, rangeEnd);

    const learnedDomains = learnedEmployerDomains(await getLinkedSenderEmails(db), [
      ...FREEMAIL_DOMAINS,
      ...NON_EMPLOYER_SENDER_DOMAINS,
      ...ATS_DOMAINS,
      ...ASSESSMENT_DOMAINS,
    ]);
    const allQueries = [
      ...Object.values(queries),
      ...buildLearnedDomainQueries(learnedDomains, rangeStart, rangeEnd),
      buildSentQuery(rangeStart, rangeEnd),
    ];

    const idLists = await Promise.all(allQueries.map((q) => listMessageIds(client, q)));
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
