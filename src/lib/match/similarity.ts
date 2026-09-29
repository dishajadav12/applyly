import { normalizeRoleTokens } from "./normalize";

/**
 * Token-based (Jaccard) similarity between two role titles, ignoring noise tokens (A8).
 * Two roles that are both entirely noise (e.g. "New Grad 2027" vs "New Grad") are treated
 * as maximally similar; a noise-only role compared with a real one has no similarity.
 */
export function roleSimilarity(a: string, b: string): number {
  const ta = normalizeRoleTokens(a);
  const tb = normalizeRoleTokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;

  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return intersection / union;
}
