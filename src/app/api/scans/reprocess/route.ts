import { NextResponse } from "next/server";
import { PARSER_VERSION } from "@/lib/config";
import { deleteStaleProcessedMessages } from "@/lib/db/repo";
import { createClient } from "@/lib/supabase/server";

/**
 * "Re-process all" (A8 idempotency): drops processed_messages rows stamped with an older
 * PARSER_VERSION, so the next scan re-fetches and re-extracts them. A no-op until
 * PARSER_VERSION is bumped, since every row is already at the current version.
 */
export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const count = await deleteStaleProcessedMessages(supabase, userId, PARSER_VERSION);
  return NextResponse.json({ ok: true, clearedCount: count });
}
