import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { extractFromMessage } from "@/lib/extract";
import { getUserSettings } from "@/lib/db/repo";
import { createGmailClient, getMessage, pool } from "@/lib/gmail/client";
import { buildQueries, listMessageIds, type QueryName } from "@/lib/gmail/query";
import { parseMessage } from "@/lib/gmail/mime";
import { getAccessToken, NeedsReconnectError } from "@/lib/gmail/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getGmailConnection } from "@/lib/db/repo";

const bodySchema = z.object({
  rangeStart: z.iso.datetime(),
  rangeEnd: z.iso.datetime(),
  sampleSize: z.number().int().min(1).max(500).default(100),
});

const FETCH_CONCURRENCY = 8;
const QUERY_NAMES: QueryName[] = ["q1", "q2", "q3"];

/**
 * Dev-only classify preview: fetches a sample of matching messages (format=full),
 * runs them through src/lib/extract, and returns per-message rows. Read-only;
 * writes nothing to the database (no processed_messages, no email_events).
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { rangeStart, rangeEnd, sampleSize } = parsed.data;

  const admin = createAdminClient();
  const [settings, connection] = await Promise.all([getUserSettings(supabase, userId), getGmailConnection(admin, userId)]);
  const context = { firstName: settings?.first_name ?? undefined, selfEmail: connection?.google_email };

  const queries = buildQueries(new Date(rangeStart), new Date(rangeEnd));
  const client = createGmailClient({ getToken: (forceRefresh) => getAccessToken(userId, { forceRefresh }) });

  try {
    const idLists = await Promise.all(QUERY_NAMES.map((name) => listMessageIds(client, queries[name])));
    const ids = [...new Set(idLists.flat())].slice(0, sampleSize);

    const rows = await pool(ids, FETCH_CONCURRENCY, async (id) => {
      const raw = await getMessage(client, id, { format: "full" });
      const parsedMessage = parseMessage(raw);
      const result = extractFromMessage(parsedMessage, context);
      return {
        messageId: id,
        subject: parsedMessage.subject,
        from: parsedMessage.from,
        isJobRelated: result.isJobRelated,
        eventType: result.eventType,
        company: result.company,
        role: result.role,
        confidence: result.confidence,
        reasons: result.reasons,
      };
    });

    return NextResponse.json({ sampledCount: ids.length, totalMatched: new Set(idLists.flat()).size, rows });
  } catch (err) {
    if (err instanceof NeedsReconnectError) {
      return NextResponse.json({ error: "Gmail needs to be reconnected", needsReconnect: true }, { status: 409 });
    }
    console.error("classify preview failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Classify preview failed" }, { status: 502 });
  }
}
