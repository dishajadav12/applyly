import "server-only";

import type { GmailMessage } from "./mime";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";

export type Params = Record<string, string | number | string[] | undefined>;

export class GmailApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

export type GmailClientOptions = {
  /** Returns a bearer token. `forceRefresh` is true after a 401, to bypass the cached token. */
  getToken: (forceRefresh: boolean) => Promise<string>;
  fetchImpl?: typeof fetch;
  /** Retries for 429 / 5xx / network errors (the single 401 refresh retry is separate). */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Returns a value in [0, 1); injectable so tests are deterministic. */
  random?: () => number;
};

export type GmailClient = {
  getJson<T>(path: string, params?: Params): Promise<T>;
};

function buildUrl(path: string, params: Params = {}): string {
  const url = new URL(GMAIL_BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, v);
    else url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Gmail sometimes signals rate limiting with 403 + a rateLimitExceeded reason. */
async function isRateLimited403(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as { error?: { errors?: { reason?: string }[]; status?: string } };
    return Boolean(body.error?.errors?.some((e) => /ratelimit/i.test(e.reason ?? "")));
  } catch {
    return false;
  }
}

/**
 * Gmail REST client: bearer auth, one retry on 401 after a forced token refresh,
 * exponential backoff (with jitter, honoring Retry-After) on 429 / 5xx / rate-limit 403 / network errors.
 */
export function createGmailClient(options: GmailClientOptions): GmailClient {
  const {
    getToken,
    fetchImpl = fetch,
    maxRetries = 5,
    baseDelayMs = 500,
    maxDelayMs = 30_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = options;

  async function getJson<T>(path: string, params?: Params): Promise<T> {
    const url = buildUrl(path, params);
    let forceRefresh = false;
    let refreshedOn401 = false;
    let retries = 0;

    for (;;) {
      const token = await getToken(forceRefresh);
      forceRefresh = false;

      let res: Response | undefined;
      let networkError: unknown;
      try {
        res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
      } catch (err) {
        networkError = err;
      }

      if (res?.ok) return (await res.json()) as T;

      if (res?.status === 401 && !refreshedOn401) {
        refreshedOn401 = true;
        forceRefresh = true;
        continue;
      }

      const retriable =
        !res || res.status === 429 || res.status >= 500 || (res.status === 403 && (await isRateLimited403(res)));

      if (retriable && retries < maxRetries) {
        const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** retries);
        const jittered = backoff + Math.floor(random() * backoff * 0.25);
        const retryAfter = Number(res?.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.max(jittered, retryAfter * 1000) : jittered;
        retries++;
        await sleep(delay);
        continue;
      }

      if (!res) throw new GmailApiError(0, `Gmail request failed: ${(networkError as Error)?.message ?? "network error"}`);
      const detail = await res.text().catch(() => "");
      throw new GmailApiError(res.status, `Gmail API ${res.status}: ${detail.slice(0, 200)}`);
    }
  }

  return { getJson };
}

/**
 * Maps `fn` over `items` with at most `concurrency` calls in flight.
 * Results keep the input order. Rejects on the first error.
 */
export async function pool<T, R>(items: readonly T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, worker));
  return results;
}

/** Fetches one message. `full` for parsing; `metadata` (with header names) for cheap sender counts. Never fetches attachments. */
export function getMessage(
  client: GmailClient,
  id: string,
  opts: { format: "full" } | { format: "metadata"; metadataHeaders: string[] },
) {
  return client.getJson<GmailMessage>(`/users/me/messages/${encodeURIComponent(id)}`, {
    format: opts.format,
    metadataHeaders: "metadataHeaders" in opts ? opts.metadataHeaders : undefined,
  });
}
