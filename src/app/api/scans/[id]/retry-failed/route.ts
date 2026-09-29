import { NextResponse } from "next/server";
import { retryFailedScanItems } from "@/lib/scan/step";
import { createClient } from "@/lib/supabase/server";

/** Phase 11: resets a finished scan's errored items to pending and reopens it for stepping. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const result = await retryFailedScanItems(supabase, userId, id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("retry failed items failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not retry failed items" }, { status: 400 });
  }
}
