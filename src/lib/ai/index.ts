import "server-only";

import { AI_LOW_CONFIDENCE_THRESHOLD, type AiProviderName } from "@/lib/config";
import { normalizeCompanyKey } from "@/lib/extract/company";
import type { ExtractionResult } from "@/lib/extract";
import { createGeminiProvider } from "./gemini";
import { createOllamaProvider } from "./ollama";
import { buildAiPayload } from "./payload";
import type { AiProvider } from "./types";

export { buildAiPayload } from "./payload";
export type { AiProvider, AiProviderName } from "./types";

/**
 * Instantiates the configured provider, or null when the toggle is off or misconfigured (e.g.
 * Gemini selected but GEMINI_API_KEY isn't set) — callers treat null as "run without AI", never
 * an error, since the fallback is optional by design.
 */
export function getAiProvider(providerName: AiProviderName | null): AiProvider | null {
  if (providerName === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    return apiKey ? createGeminiProvider(apiKey) : null;
  }
  if (providerName === "ollama") {
    return createOllamaProvider(process.env.OLLAMA_BASE_URL, process.env.OLLAMA_MODEL);
  }
  return null;
}

/** Phase 12: only low-confidence or company/role-missing job-related events are eligible. */
export function isAiEligible(extraction: Pick<ExtractionResult, "isJobRelated" | "confidence" | "company" | "role">): boolean {
  return extraction.isJobRelated && (extraction.confidence < AI_LOW_CONFIDENCE_THRESHOLD || !extraction.company || !extraction.role);
}

/**
 * Calls the provider and folds its output into `extraction`. Never overrides a rule result that
 * was already there with higher confidence than the eligibility gate itself allows:
 * - company/role are filled in only when the rule-based extraction left them empty.
 * - eventType is replaced only when the rule-based classification was itself low-confidence
 *   (isAiEligible's own threshold) — so there is never a "higher-confidence" eventType to override.
 * On any failure (network, bad JSON, schema mismatch) the original extraction is returned unchanged.
 */
export async function applyAiFallback(extraction: ExtractionResult, input: { subject: string; sender: string; text: string }, provider: AiProvider): Promise<ExtractionResult> {
  const payload = buildAiPayload(input.subject, input.sender, input.text);
  const result = await provider.classify(payload);
  if (!result) return extraction;

  const patch: Partial<ExtractionResult> = {};
  if (!extraction.company && result.company) {
    patch.company = result.company;
    patch.companyKey = normalizeCompanyKey(result.company);
  }
  if (!extraction.role && result.role) {
    patch.role = result.role;
  }
  if (extraction.confidence < AI_LOW_CONFIDENCE_THRESHOLD && result.eventType) {
    patch.eventType = result.eventType;
  }

  if (Object.keys(patch).length === 0) return extraction;
  return { ...extraction, ...patch, reasons: [...extraction.reasons, `ai:${provider.name}`] };
}
