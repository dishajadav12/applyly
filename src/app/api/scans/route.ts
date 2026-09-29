import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { NeedsReconnectError } from "@/lib/gmail/tokens";
import { startScan } from "@/lib/scan/start";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ rangeStart: z.iso.datetime(), rangeEnd: z.iso.datetime() });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const rangeStart = new Date(parsed.data.rangeStart);
  const rangeEnd = new Date(parsed.data.rangeEnd);
  if (rangeStart >= rangeEnd) return NextResponse.json({ error: "rangeStart must be before rangeEnd" }, { status: 400 });

  try {
    const result = await startScan(supabase, userId, rangeStart, rangeEnd);
    if (!result.ok) {
      return NextResponse.json({ error: "A scan is already running", scanId: result.activeScanId }, { status: 409 });
    }
    return NextResponse.json({ scanId: result.scanId, total: result.total });
  } catch (err) {
    if (err instanceof NeedsReconnectError) {
      return NextResponse.json({ error: "Gmail needs to be reconnected", needsReconnect: true }, { status: 409 });
    }
    console.error("start scan failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not start the scan" }, { status: 502 });
  }
}
