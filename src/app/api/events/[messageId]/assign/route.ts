import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { moveEventToApplication } from "@/lib/actions/mutations";
import { getApplication } from "@/lib/db/repo";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ applicationId: z.uuid() });

/**
 * Attaches one email to an existing application: used by the review dialog's "assign to
 * existing" and by the detail sheet's "Move event" (same underlying operation).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const target = await getApplication(supabase, parsed.data.applicationId);
  if (!target) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  await moveEventToApplication(supabase, messageId, parsed.data.applicationId);
  return NextResponse.json({ ok: true });
}
