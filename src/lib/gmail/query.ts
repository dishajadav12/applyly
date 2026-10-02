import {
  GMAIL_LIST_PAGE_SIZE,
  Q1_DOMAINS,
  Q2_EXCLUDED_SENDERS,
  Q2_PHRASES,
  Q2_SUBJECT_TERMS,
  Q4_EXCLUDED_SENDERS,
  Q4_SENDER_TERMS,
  Q5_DOMAINS_PER_QUERY,
  Q3_SENDERS,
  Q3_SUBJECT_TERMS,
  QUERY_EXCLUSIONS,
} from "@/lib/config";

export type QueryName = "q1" | "q2" | "q3" | "q4";
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

  // Q4 (beyond spec A6): sender-based, so a company's confirmation is found whatever its wording.
  const q4 = `from:(${Q4_SENDER_TERMS.join(" OR ")}) -from:(${Q4_EXCLUDED_SENDERS.join(" OR ")})`;

  return { q1: `${q1} ${suffix}`, q2: `${q2} ${suffix}`, q3: `${q3} ${suffix}`, q4: `${q4} ${suffix}` };
}

/**
 * Q5 (beyond spec A6): every message from an employer domain the user already has a linked
 * application with, so follow-ups (rejections, invites, assessments) are found whatever their wording.
 */
export function buildLearnedDomainQueries(domains: readonly string[], rangeStart: Date, rangeEnd: Date): string[] {
  const suffix = `after:${epochSeconds(rangeStart)} before:${epochSeconds(rangeEnd)} ${QUERY_EXCLUSIONS}`;
  const queries: string[] = [];
  for (let i = 0; i < domains.length; i += Q5_DOMAINS_PER_QUERY) {
    queries.push(`from:(${domains.slice(i, i + Q5_DOMAINS_PER_QUERY).join(" OR ")}) ${suffix}`);
  }
  return queries;
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
