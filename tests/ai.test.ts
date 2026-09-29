import { describe, expect, it } from "vitest";
import { applyAiFallback, isAiEligible } from "@/lib/ai";
import { buildAiPayload } from "@/lib/ai/payload";
import type { AiClassification, AiProvider } from "@/lib/ai/types";
import { AI_LOW_CONFIDENCE_THRESHOLD, AI_TEXT_BYTES } from "@/lib/config";
import type { ExtractionResult } from "@/lib/extract";

function stubProvider(result: AiClassification | null): AiProvider {
  return { name: "gemini", classify: async () => result };
}

function baseExtraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    isJobRelated: true,
    score: 3,
    confidence: 3,
    eventType: "other_update",
    company: undefined,
    companyKey: undefined,
    role: undefined,
    reasons: ["existing:reason"],
    parserVersion: 1,
    ...overrides,
  };
}

describe("buildAiPayload", () => {
  it("contains only subject, sender, and text — nothing else", () => {
    const payload = buildAiPayload("Subject line", "sender@example.com", "short body");
    expect(Object.keys(payload).sort()).toEqual(["sender", "subject", "text"]);
    expect(payload.subject).toBe("Subject line");
    expect(payload.sender).toBe("sender@example.com");
    expect(payload.text).toBe("short body");
  });

  it("truncates text to the first AI_TEXT_BYTES bytes", () => {
    const longText = "x".repeat(AI_TEXT_BYTES * 2);
    const payload = buildAiPayload("s", "f@example.com", longText);
    expect(Buffer.byteLength(payload.text, "utf8")).toBeLessThanOrEqual(AI_TEXT_BYTES);
    expect(payload.text.length).toBe(AI_TEXT_BYTES);
  });

  it("leaves text under the limit untouched", () => {
    const payload = buildAiPayload("s", "f@example.com", "hello world");
    expect(payload.text).toBe("hello world");
  });
});

describe("isAiEligible", () => {
  it("is eligible when confidence is below the low-confidence threshold", () => {
    expect(isAiEligible({ isJobRelated: true, confidence: AI_LOW_CONFIDENCE_THRESHOLD - 1, company: "Acme", role: "Engineer" })).toBe(true);
  });

  it("is eligible when company is missing, even at high confidence", () => {
    expect(isAiEligible({ isJobRelated: true, confidence: 99, company: undefined, role: "Engineer" })).toBe(true);
  });

  it("is eligible when role is missing, even at high confidence", () => {
    expect(isAiEligible({ isJobRelated: true, confidence: 99, company: "Acme", role: undefined })).toBe(true);
  });

  it("is not eligible when high-confidence and both company/role are known", () => {
    expect(isAiEligible({ isJobRelated: true, confidence: 99, company: "Acme", role: "Engineer" })).toBe(false);
  });

  it("is never eligible for a non-job-related message, regardless of confidence", () => {
    expect(isAiEligible({ isJobRelated: false, confidence: 0, company: undefined, role: undefined })).toBe(false);
  });
});

describe("applyAiFallback", () => {
  it("fills in a missing company and role, and records ai:<provider> in reasons", async () => {
    const extraction = baseExtraction({ company: undefined, role: undefined });
    const result = await applyAiFallback(
      extraction,
      { subject: "s", sender: "f@example.com", text: "body" },
      stubProvider({ company: "Acme", role: "Software Engineer", eventType: null }),
    );
    expect(result.company).toBe("Acme");
    expect(result.companyKey).toBeTruthy();
    expect(result.role).toBe("Software Engineer");
    expect(result.reasons).toContain("ai:gemini");
  });

  it("never overrides a company the rules already found", async () => {
    const extraction = baseExtraction({ company: "Rule-Based Co", role: undefined });
    const result = await applyAiFallback(
      extraction,
      { subject: "s", sender: "f@example.com", text: "body" },
      stubProvider({ company: "AI Said Different Co", role: "Engineer", eventType: null }),
    );
    expect(result.company).toBe("Rule-Based Co");
    // Role was genuinely missing, so it's still filled in — the guarantee is per-field, not all-or-nothing.
    expect(result.role).toBe("Engineer");
  });

  it("never overrides a role the rules already found", async () => {
    const extraction = baseExtraction({ company: undefined, role: "Rule-Based Role" });
    const result = await applyAiFallback(
      extraction,
      { subject: "s", sender: "f@example.com", text: "body" },
      stubProvider({ company: "Acme", role: "AI Said Different Role", eventType: null }),
    );
    expect(result.role).toBe("Rule-Based Role");
    expect(result.company).toBe("Acme");
  });

  it("never overrides eventType when the rule-based classification was already high-confidence", async () => {
    const extraction = baseExtraction({
      confidence: AI_LOW_CONFIDENCE_THRESHOLD + 5,
      eventType: "offer",
      company: "Acme",
      role: "Engineer",
    });
    const result = await applyAiFallback(
      extraction,
      { subject: "s", sender: "f@example.com", text: "body" },
      stubProvider({ company: null, role: null, eventType: "rejection" }),
    );
    expect(result.eventType).toBe("offer");
    // Nothing changed, so no ai: reason was added either.
    expect(result.reasons).toEqual(extraction.reasons);
  });

  it("does replace eventType when the rule-based classification was low-confidence", async () => {
    const extraction = baseExtraction({ confidence: AI_LOW_CONFIDENCE_THRESHOLD - 1, eventType: "other_update" });
    const result = await applyAiFallback(
      extraction,
      { subject: "s", sender: "f@example.com", text: "body" },
      stubProvider({ company: null, role: null, eventType: "recruiter_outreach" }),
    );
    expect(result.eventType).toBe("recruiter_outreach");
    expect(result.reasons).toContain("ai:gemini");
  });

  it("returns the extraction unchanged when the provider fails or returns invalid output", async () => {
    const extraction = baseExtraction({ company: undefined });
    const result = await applyAiFallback(extraction, { subject: "s", sender: "f@example.com", text: "body" }, stubProvider(null));
    expect(result).toEqual(extraction);
  });
});
