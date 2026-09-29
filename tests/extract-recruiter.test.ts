import { describe, expect, it } from "vitest";
import { extractRecruiter } from "@/lib/extract/recruiter";
import { normalizeMessage } from "@/lib/extract/normalize";
import type { ParsedMessage } from "@/lib/gmail/mime";

function msg(overrides: Partial<ParsedMessage>) {
  return normalizeMessage({
    messageId: "m1",
    threadId: "t1",
    receivedAt: "2026-05-15T12:00:00.000Z",
    from: "someone@example.com",
    subject: "",
    snippet: "",
    text: "",
    headers: {},
    labelIds: ["INBOX"],
    ...overrides,
  });
}

describe("extractRecruiter: exclusions", () => {
  it("excludes a noreply local part even with a recruiter keyword in the name", () => {
    const result = extractRecruiter(msg({ from: "no-reply@smallco.example", fromName: "SmallCo Recruiting" }));
    expect(result.recruiterEmail).toBeUndefined();
  });

  it("excludes an ATS/assessment sender domain even with a recruiter keyword in the name", () => {
    const result = extractRecruiter(msg({ from: "notify@greenhouse.io", fromName: "Acme Recruiting Team" }));
    expect(result.recruiterEmail).toBeUndefined();
  });
});

describe("extractRecruiter: allowed signals", () => {
  it("matches a recruiter keyword in the display name", () => {
    const result = extractRecruiter(msg({ from: "jamie@agency.example", fromName: "Jamie Fake, Technical Recruiter" }));
    expect(result.recruiterEmail).toBe("jamie@agency.example");
    expect(result.recruiterName).toBe("Jamie Fake, Technical Recruiter");
  });

  it("matches a recruiter keyword in the signature (body text)", () => {
    const result = extractRecruiter(msg({ from: "jamie@agency.example", text: "Best,\nJamie\nUniversity Recruiting" }));
    expect(result.recruiterEmail).toBe("jamie@agency.example");
  });

  it("matches a human Reply-To when there is no keyword", () => {
    const result = extractRecruiter(msg({ from: "team@agency.example", replyTo: "jamie@agency.example" }));
    expect(result.recruiterEmail).toBe("jamie@agency.example");
  });

  it("does not treat a noreply Reply-To as human", () => {
    const result = extractRecruiter(msg({ from: "team@agency.example", replyTo: "no-reply@agency.example" }));
    expect(result.recruiterEmail).toBeUndefined();
  });

  it("allows a gmail.com sender (freemail is not excluded for recruiter detection)", () => {
    const result = extractRecruiter(msg({ from: "jamie@gmail.com", fromName: "Jamie, Talent Sourcer" }));
    expect(result.recruiterEmail).toBe("jamie@gmail.com");
  });

  it("returns undefined with a reason when nothing matches", () => {
    const result = extractRecruiter(msg({ from: "jamie@agency.example", fromName: "Jamie" }));
    expect(result.recruiterEmail).toBeUndefined();
    expect(result.reasons.at(-1)).toMatch(/no recruiter signal/);
  });
});
