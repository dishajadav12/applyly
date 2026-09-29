import "server-only";

import { AI_GEMINI_MODEL } from "@/lib/config";
import { buildAiPrompt, parseAiResponse, type AiInput, type AiProvider } from "./types";

/** Google Gemini API free tier (Phase 12). Only `input` (subject/sender/2KB text) ever leaves the server. */
export function createGeminiProvider(apiKey: string, model: string = AI_GEMINI_MODEL): AiProvider {
  return {
    name: "gemini",
    async classify(input: AiInput) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: buildAiPrompt(input) }] }],
              generationConfig: { temperature: 0, responseMimeType: "application/json" },
            }),
          },
        );
        if (!res.ok) return null;
        const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
        return typeof text === "string" ? parseAiResponse(text) : null;
      } catch {
        return null;
      }
    },
  };
}
