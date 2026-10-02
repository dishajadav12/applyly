import { describe, expect, it } from "vitest";
import { classify } from "@/lib/extract/classify";
import { extractCompany } from "@/lib/extract/company";
import { extractRole } from "@/lib/extract/role";
import { normalizeMessage } from "@/lib/extract/normalize";

const m = normalizeMessage({
  messageId: "a1",
  threadId: "t1",
  receivedAt: "2026-10-01T14:02:00.000Z",
  from: "appleworldwiderecruiting@email.apple.com",
  fromName: "Apple Worldwide Recruiting",
  subject: "Thanks for your interest in Apple.",
  snippet: "We just received your resume for the following role",
  text: "Hi Jane,\n\nWe just received your resume for the following role: Software Engineer, Applied AI 200684521. Thanks for thinking of us.\n\nHere’s what happens next: If you’re a potential match for the role, you’ll hear from one of our recruiters.\n\nRegards,\nApple Worldwide Recruiting",
  headers: {},
  labelIds: ["INBOX"],
} as never);

describe("Apple confirmation", () => {
  it("is classified, and company/role extracted", () => {
    const c = classify(m);
    expect(c.isJobRelated).toBe(true);
    expect(c.eventType).toBe("application_confirmation");
    expect(extractCompany(m).company).toBe("Apple");
    expect(extractRole(m).role).toBe("Software Engineer, Applied AI");
  });
});
