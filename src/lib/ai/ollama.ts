import "server-only";

import { AI_OLLAMA_DEFAULT_BASE_URL, AI_OLLAMA_DEFAULT_MODEL } from "@/lib/config";
import { buildAiPrompt, parseAiResponse, type AiInput, type AiProvider } from "./types";

/** Local Ollama (Phase 12, dev use): same interface as the Gemini provider, no API key, nothing leaves the machine. */
export function createOllamaProvider(baseUrl: string = AI_OLLAMA_DEFAULT_BASE_URL, model: string = AI_OLLAMA_DEFAULT_MODEL): AiProvider {
  return {
    name: "ollama",
    async classify(input: AiInput) {
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: buildAiPrompt(input), format: "json", stream: false, options: { temperature: 0 } }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { response?: string };
        return typeof body.response === "string" ? parseAiResponse(body.response) : null;
      } catch {
        return null;
      }
    },
  };
}
