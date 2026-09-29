import { NextResponse } from "next/server";
import { getScan, updateScan } from "@/lib/db/repo";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const scan = await getScan(supabase, id);
  if (!scan || scan.user_id !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scan.status !== "listing" && scan.status !== "processing") {
    return NextResponse.json({ error: "Scan is not active" }, { status: 409 });
  }

  await updateScan(supabase, id, { status: "cancelled", finished_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
