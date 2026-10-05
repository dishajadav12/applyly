import "server-only";

import { AUTO_SCAN_OVERLAP_MS, AUTO_SCAN_TIME_BUDGET_MS } from "@/lib/config";
import * as repo from "@/lib/db/repo";
import { NeedsReconnectError } from "@/lib/gmail/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { startScan } from "./start";
import { stepScan } from "./step";

export type AutoScanResult =
  | { ran: false; reason: string }
  | { ran: true; scanId: string; done: boolean; processed: number; total: number; failed: number };

/**
 * Scheduled scan (Vercel cron / external trigger). There is no user session here, so this runs
 * the normal start/step code under the ADMIN client, a documented exception (D18) to "session
 * client for user data". The repo helpers rely on RLS rather than user_id filters, so this is
 * only safe with exactly one connected user; it refuses to run otherwise.
 *
 * Resumes an unfinished scan if one exists; otherwise scans from the last finished scan minus an
 * overlap. Steps until done or the time budget is spent (the next run resumes the rest).
 */
export async function runAutoScan(): Promise<AutoScanResult> {
  const admin = createAdminClient();

  const connections = await repo.listGmailConnections(admin);
  if (connections.length !== 1) return { ran: false, reason: `expected exactly 1 Gmail connection, found ${connections.length}` };
  const connection = connections[0];
  if (connection.status !== "active") return { ran: false, reason: "needs_reconnect" };
  const userId = connection.user_id;

  try {
    let scanId: string;
    const active = await repo.getActiveScan(admin);
    if (active) {
      scanId = active.id;
    } else {
      const settings = await repo.getUserSettings(admin, userId);
      // The first scan is the user's to run (they pick the range); auto-scan only keeps it fresh.
      if (!settings?.last_scan_at) return { ran: false, reason: "no initial scan yet" };
      const now = new Date();
      const rangeStart = new Date(Date.parse(settings.last_scan_at) - AUTO_SCAN_OVERLAP_MS);
      const started = await startScan(admin, userId, rangeStart, now);
      if (!started.ok) return { ran: false, reason: "a scan is already running" };
      scanId = started.scanId;
    }

    const deadline = Date.now() + AUTO_SCAN_TIME_BUDGET_MS;
    for (;;) {
      const step = await stepScan(admin, userId, scanId);
      if ("busy" in step) return { ran: false, reason: "scan busy (another step holds the lease)" };
      if (step.done || Date.now() >= deadline) {
        return { ran: true, scanId, done: step.done, processed: step.processed, total: step.total, failed: step.failed };
      }
    }
  } catch (err) {
    if (err instanceof NeedsReconnectError) return { ran: false, reason: "needs_reconnect" };
    throw err;
  }
}
