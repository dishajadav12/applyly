import { describe, expect, it } from "vitest";
import { classify } from "@/lib/extract/classify";
import { extractRole } from "@/lib/extract/role";
import { normalizeMessage } from "@/lib/extract/normalize";

const survey = normalizeMessage({
  messageId: "z1",
  threadId: "t1",
  receivedAt: "2026-08-19T12:00:00.000Z",
  from: "support@roblox-assessment.zendesk.com",
  fromName: "Roblox Early Careers",
  subject: "Request #123015: How would you rate the support you received?",
  snippet: "",
  text: "Hello,\n\nPlease take a moment to answer one simple question by clicking either link below:\n\nHow would you rate the support you received?",
  headers: {},
  labelIds: ["INBOX"],
} as never);

describe("Zendesk support survey", () => {
  it("never reads a sentence containing 'answer' as a role", () => {
    expect(extractRole(survey).role).toBeUndefined();
  });

  it("matches short role keywords on word boundaries only, but still matches Engineering", () => {
    const m = (text: string) => normalizeMessage({ ...survey, subject: "", text } as never);
    expect(extractRole(m("Software Engineering Intern")).role).toBe("Software Engineering Intern");
  });

  it("is penalised as a support survey", () => {
    expect(classify(survey).reasons.some((r) => r.includes("support-survey"))).toBe(true);
  });
});

describe("email open-tracker notifications", () => {
  const tracker = normalizeMessage({
    messageId: "t1", threadId: "t", receivedAt: "2026-09-01T12:00:00.000Z",
    from: "notifications@mailtrack.io", fromName: "Mailtrack", subject: "MailTracker update",
    snippet: "", text: "Your email to the Acme Hiring Team about your application was opened.",
    headers: {}, labelIds: ["INBOX"],
  } as never);

  it("is never job-related, even when its body mentions an application", () => {
    expect(classify(tracker).isJobRelated).toBe(false);
  });

  it("is caught by subject alone when the sender domain is unknown", () => {
    const m = normalizeMessage({ ...tracker, from: "noreply@unknown-tracker.com" } as never);
    expect(classify(m).isJobRelated).toBe(false);
  });
});
