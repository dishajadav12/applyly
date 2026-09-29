import { NextResponse, type NextRequest } from "next/server";
import { dismissEvent } from "@/lib/db/repo";
import { createClient } from "@/lib/supabase/server";

/** Review dialog "Dismiss": not job-related; state='dismissed', user-locked so rescans never re-add it (D15). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await dismissEvent(supabase, messageId);
  return NextResponse.json({ ok: true });
}
