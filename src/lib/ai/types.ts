import { z } from "zod";
import { AI_PROVIDERS, EVENT_TYPE_PRIORITY, type AiProviderName } from "@/lib/config";

export type { AiProviderName };
export const AI_PROVIDER_NAMES = AI_PROVIDERS;

/** Exactly the fields sent to an AI provider (Phase 12): never the full email, never more than this. */
export type AiInput = { subject: string; sender: string; text: string };

/** Strict — an extra or missing key fails validation and the result is ignored (Phase 12 DoD). */
export const aiClassificationSchema = z
  .object({
    company: z.string().min(1).nullable(),
    role: z.string().min(1).nullable(),
    eventType: z.enum(EVENT_TYPE_PRIORITY).nullable(),
  })
  .strict();

export type AiClassification = z.infer<typeof aiClassificationSchema>;

export type AiProvider = {
  name: AiProviderName;
  /** Returns null on any failure (network, non-JSON, schema mismatch) — never throws. */
  classify(input: AiInput): Promise<AiClassification | null>;
};

/** Parses a raw model response as strict AiClassification JSON; null on any failure. */
export function parseAiResponse(raw: string): AiClassification | null {
  try {
    const result = aiClassificationSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = [
  "You classify one job-application-related email. Read the subject, sender, and body below.",
  "Respond with ONLY strict JSON, no markdown, no prose, matching exactly this shape:",
  '{"company": string or null, "role": string or null, "eventType": one of ' +
    JSON.stringify(EVENT_TYPE_PRIORITY) +
    " or null}",
  "Use null for anything you cannot determine with confidence. Never guess a company or role that isn't clearly stated.",
].join("\n");

export function buildAiPrompt(input: AiInput): string {
  return `${SYSTEM_PROMPT}\n\nSubject: ${input.subject}\nFrom: ${input.sender}\n\nBody:\n${input.text}`;
}
