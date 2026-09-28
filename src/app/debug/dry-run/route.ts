import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createGmailClient, getMessage, pool } from "@/lib/gmail/client";
import { registrableDomain, topDomains } from "@/lib/gmail/domains";
import { getHeader, parseAddress } from "@/lib/gmail/mime";
import { buildQueries, listMessageIds, type QueryName } from "@/lib/gmail/query";
import { getAccessToken, NeedsReconnectError } from "@/lib/gmail/tokens";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  rangeStart: z.iso.datetime(),
  rangeEnd: z.iso.datetime(),
  /** Max messages per query to fetch sender metadata for. */
  sampleSize: z.number().int().min(0).max(5000).default(1000),
});

const METADATA_CONCURRENCY = 8;
const QUERY_NAMES: QueryName[] = ["q1", "q2", "q3"];

/**
 * Dev-only dry run (A6 tuning): unique message-ID counts per query and combined, plus the top 20
 * sender domains per query. Read-only against Gmail; writes nothing to the database.
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

  const queries = buildQueries(new Date(rangeStart), new Date(rangeEnd));
  const client = createGmailClient({ getToken: (forceRefresh) => getAccessToken(userId, { forceRefresh }) });

  try {
    // 1. List IDs per query (in parallel), then union.
    const idLists = await Promise.all(QUERY_NAMES.map((name) => listMessageIds(client, queries[name])));
    const perQuery = Object.fromEntries(QUERY_NAMES.map((name, i) => [name, idLists[i]])) as Record<QueryName, string[]>;
    const combined = new Set(idLists.flat());

    // 2. Sender domain per sampled ID (newest first), fetching each unique ID once (format=metadata: headers only).
    const sampled = Object.fromEntries(QUERY_NAMES.map((name) => [name, perQuery[name].slice(0, sampleSize)])) as Record<QueryName, string[]>;
    const toFetch = [...new Set(QUERY_NAMES.flatMap((name) => sampled[name]))];
    const domains = new Map<string, string | undefined>();
    await pool(toFetch, METADATA_CONCURRENCY, async (id) => {
      const msg = await getMessage(client, id, { format: "metadata", metadataHeaders: ["From"] });
      const from = parseAddress(getHeader(msg.payload?.headers, "from"));
      domains.set(id, from ? registrableDomain(from.email) : undefined);
    });

    return NextResponse.json({
      queries,
      combinedCount: combined.size,
      perQuery: Object.fromEntries(
        QUERY_NAMES.map((name) => [
          name,
          {
            count: perQuery[name].length,
            sampled: sampled[name].length,
            topDomains: topDomains(sampled[name].map((id) => domains.get(id)), 20),
          },
        ]),
      ),
    });
  } catch (err) {
    if (err instanceof NeedsReconnectError) {
      return NextResponse.json({ error: "Gmail needs to be reconnected", needsReconnect: true }, { status: 409 });
    }
    console.error("dry run failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Dry run failed" }, { status: 502 });
  }
}
