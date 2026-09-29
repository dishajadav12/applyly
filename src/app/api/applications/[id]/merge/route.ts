import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { mergeApplications } from "@/lib/actions/mutations";
import { getApplication } from "@/lib/db/repo";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ targetId: z.uuid() });

/** A9 "Merge into…": moves this application's events onto `targetId`, then deletes it. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (parsed.data.targetId === id) return NextResponse.json({ error: "Cannot merge an application into itself" }, { status: 400 });

  const [source, target] = await Promise.all([getApplication(supabase, id), getApplication(supabase, parsed.data.targetId)]);
  if (!source || !target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await mergeApplications(supabase, id, parsed.data.targetId);
  return NextResponse.json({ ok: true });
}
