import "server-only";

import { normalizeCompanyKey } from "@/lib/extract/company";
import type { Db } from "@/lib/db/repo";
import * as repo from "@/lib/db/repo";
import { normalizeRoleKey, rederiveApplication } from "@/lib/scan/step";

/**
 * Phase 10 mutations (A8/A9/D15): the assign/move/merge/dismiss/create-new/delete actions that
 * let a user correct the matcher's output. Every one of these sets `user_locked = true` on the
 * events it touches, per D15, and re-derives every application it affects, per A8.
 */

/**
 * Moves one event onto `targetApplicationId`, user-locking it. Used both by the review dialog's
 * "assign to existing" and the detail sheet's "Move event" — the operation is identical; only the
 * caller differs. Re-derives the target, and the event's previous application (if any and if
 * different), since removing an event changes that application's derived fields too.
 */
export async function moveEventToApplication(db: Db, messageId: string, targetApplicationId: string): Promise<void> {
  const event = await repo.getEvent(db, messageId);
  const previousApplicationId = event?.application_id ?? null;

  await repo.lockEventToApplication(db, messageId, targetApplicationId);
  await rederiveApplication(db, targetApplicationId);
  if (previousApplicationId && previousApplicationId !== targetApplicationId) {
    await rederiveApplication(db, previousApplicationId);
  }
}

/** Review dialog "Create new": makes a fresh application for this event, then attaches it. */
export async function createApplicationForEvent(
  db: Db,
  userId: string,
  messageId: string,
  company: string,
  role: string,
): Promise<string> {
  const app = await repo.insertApplication(db, {
    user_id: userId,
    company,
    company_key: normalizeCompanyKey(company),
    role,
    role_key: normalizeRoleKey(role),
  });
  await moveEventToApplication(db, messageId, app.id);
  return app.id;
}

/**
 * Detail sheet "Merge into…": moves every event off `fromId` onto `toId`, deletes `fromId`
 * (a raw delete — its events are already gone, so the delete_application RPC's "move events to
 * review" behavior would be wrong here), then re-derives the surviving application.
 */
export async function mergeApplications(db: Db, fromId: string, toId: string): Promise<void> {
  await repo.reassignApplicationEvents(db, fromId, toId);
  await repo.deleteApplicationRow(db, fromId);
  await rederiveApplication(db, toId);
}
