import {
  GMAIL_LIST_PAGE_SIZE,
  Q1_DOMAINS,
  Q2_EXCLUDED_SENDERS,
  Q2_PHRASES,
  Q2_SUBJECT_TERMS,
  Q3_SENDERS,
  Q3_SUBJECT_TERMS,
  QUERY_EXCLUSIONS,
} from "@/lib/config";

export type QueryName = "q1" | "q2" | "q3";
export type Queries = Record<QueryName, string>;

const epochSeconds = (d: Date) => Math.floor(d.getTime() / 1000);

/**
 * The three Gmail searches from PROJECT_SPEC.md A6, each restricted to
 * [rangeStart, rangeEnd] with epoch-second filters and the standard exclusions.
 * All lists come from src/lib/config.ts.
 */
export function buildQueries(rangeStart: Date, rangeEnd: Date): Queries {
  const suffix = `after:${epochSeconds(rangeStart)} before:${epochSeconds(rangeEnd)} ${QUERY_EXCLUSIONS}`;

  const q1 = `from:(${Q1_DOMAINS.join(" OR ")})`;

  const q2Terms = [...Q2_PHRASES.map((p) => `"${p}"`), ...Q2_SUBJECT_TERMS.map((t) => `subject:${t}`)];
  const q2 = `(${q2Terms.join(" OR ")}) -from:(${Q2_EXCLUDED_SENDERS.join(" OR ")})`;

  const q3 = `from:(${Q3_SENDERS.join(" OR ")}) subject:(${Q3_SUBJECT_TERMS.join(" OR ")})`;

  return { q1: `${q1} ${suffix}`, q2: `${q2} ${suffix}`, q3: `${q3} ${suffix}` };
}

/** The slice of the Gmail client that listing needs (keeps this module pure and easy to test). */
export type ListClient = {
  getJson<T>(path: string, params?: Record<string, string | number | string[] | undefined>): Promise<T>;
};

type ListResponse = { messages?: { id: string; threadId: string }[]; nextPageToken?: string };

/** Lists every message ID matching `query`, following nextPageToken. Newest first (Gmail order). */
export async function listMessageIds(client: ListClient, query: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const page = await client.getJson<ListResponse>("/users/me/messages", {
      q: query,
      maxResults: GMAIL_LIST_PAGE_SIZE,
      pageToken,
    });
    for (const m of page.messages ?? []) ids.push(m.id);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return ids;
}
