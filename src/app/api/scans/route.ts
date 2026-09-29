import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SCAN_START_RATE_LIMIT_MS } from "@/lib/config";
import { getLastScanStartedAt } from "@/lib/db/repo";
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

  // Phase 11: DB-backed rate limit (not in-memory, so it holds across serverless instances) —
  // repeated clicks or a second tab can't spam Gmail with overlapping scan starts.
  const lastStartedAt = await getLastScanStartedAt(supabase);
  if (lastStartedAt) {
    const elapsedMs = Date.now() - Date.parse(lastStartedAt);
    if (elapsedMs < SCAN_START_RATE_LIMIT_MS) {
      const retryAfterSeconds = Math.ceil((SCAN_START_RATE_LIMIT_MS - elapsedMs) / 1000);
      return NextResponse.json(
        { error: `Please wait ${retryAfterSeconds}s before starting another scan` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
      );
    }
  }

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
