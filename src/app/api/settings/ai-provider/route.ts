import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AI_PROVIDERS } from "@/lib/config";
import { setAiProvider } from "@/lib/db/repo";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ provider: z.enum(AI_PROVIDERS).nullable() });

/** Phase 12: the AI fallback toggle — off (null) by default; opting in picks Gemini or Ollama. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await setAiProvider(supabase, userId, parsed.data.provider);
  return NextResponse.json({ ok: true });
}
