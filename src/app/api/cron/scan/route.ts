import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runAutoScan } from "@/lib/scan/auto";

// Hobby with Fluid compute allows up to 300s; the scan loop stops itself at AUTO_SCAN_TIME_BUDGET_MS.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel cron sends `Authorization: Bearer $CRON_SECRET`; external schedulers must send the same. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!isAuthorized(request, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await runAutoScan());
  } catch (err) {
    console.error("auto scan failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Auto scan failed" }, { status: 502 });
  }
}
