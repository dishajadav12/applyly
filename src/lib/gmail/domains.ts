const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

/**
 * Registrable domain of an email address or host, so subdomains group together
 * ("us.greenhouse-mail.io" -> "greenhouse-mail.io"). Heuristic for common two-part
 * country suffixes ("x.co.uk" -> "x.co.uk"); not a full public-suffix lookup.
 */
export function registrableDomain(addressOrHost: string): string | undefined {
  const host = addressOrHost.includes("@") ? addressOrHost.split("@").pop()! : addressOrHost;
  const labels = host.trim().toLowerCase().replace(/[>\s]/g, "").split(".").filter(Boolean);
  if (labels.length < 2) return undefined;
  const last = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  const take = labels.length > 2 && last.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** Counts domains and returns the `limit` most common, ties broken alphabetically. */
export function topDomains(domains: (string | undefined)[], limit = 20): { domain: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of domains) if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}
