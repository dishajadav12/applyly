import { NextResponse } from "next/server";
import { rematchReviewEvents } from "@/lib/scan/step";
import { createClient } from "@/lib/supabase/server";

/** Re-runs the matcher over the review queue; returns how many emails were linked automatically. */
export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const resolved = await rematchReviewEvents(supabase);
  return NextResponse.json({ resolved });
}
