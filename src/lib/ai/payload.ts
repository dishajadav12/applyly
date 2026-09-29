import { AI_TEXT_BYTES } from "@/lib/config";
import { truncateBytes } from "@/lib/gmail/mime";
import type { AiInput } from "./types";

/**
 * Builds the exact payload sent to an AI provider (Phase 12): subject, sender, and the first
 * AI_TEXT_BYTES of the body — nothing else, regardless of what's on the source message. Pure and
 * unit-tested so the "only these three fields, only 2KB of text" guarantee doesn't silently drift.
 */
export function buildAiPayload(subject: string, sender: string, text: string): AiInput {
  return { subject, sender, text: truncateBytes(text, AI_TEXT_BYTES) };
}
