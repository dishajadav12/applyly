import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createApplicationForEvent } from "@/lib/actions/mutations";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ company: z.string().trim().min(1), role: z.string().trim().min(1) });

/** Review dialog "Create new": makes a fresh application for this email and attaches it. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const applicationId = await createApplicationForEvent(supabase, userId, messageId, parsed.data.company, parsed.data.role);
  return NextResponse.json({ ok: true, applicationId });
}
