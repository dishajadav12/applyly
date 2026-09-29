import { NextResponse } from "next/server";
import { NeedsReconnectError } from "@/lib/gmail/tokens";
import { stepScan } from "@/lib/scan/step";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const result = await stepScan(supabase, userId, id);
    if ("busy" in result) return NextResponse.json({ busy: true }, { status: 409 });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NeedsReconnectError) {
      return NextResponse.json({ error: "Gmail needs to be reconnected", needsReconnect: true }, { status: 409 });
    }
    console.error("scan step failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Scan step failed" }, { status: 502 });
  }
}
