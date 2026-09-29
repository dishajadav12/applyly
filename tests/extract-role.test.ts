import { describe, expect, it } from "vitest";
import { MAX_ROLE_LENGTH } from "@/lib/config";
import { normalizeMessage } from "@/lib/extract/normalize";
import { extractRole } from "@/lib/extract/role";
import type { ParsedMessage } from "@/lib/gmail/mime";

function msg(overrides: Partial<ParsedMessage>) {
  return normalizeMessage({
    messageId: "m1",
    threadId: "t1",
    receivedAt: "2026-05-15T12:00:00.000Z",
    from: "hr@acme.example",
    subject: "",
    snippet: "",
    text: "",
    headers: {},
    labelIds: ["INBOX"],
    ...overrides,
  });
}

describe("extractRole: the four named patterns", () => {
  it('"for the X position/role"', () => {
    expect(extractRole(msg({ text: "for the Software Engineer position" })).role).toBe("Software Engineer");
    expect(extractRole(msg({ text: "for the Backend Engineer role" })).role).toBe("Backend Engineer");
  });

  it('"application for X"', () => {
    expect(extractRole(msg({ text: "your application for Data Analyst has been received" })).role).toBe("Data Analyst");
  });

  it('"applied to X at"', () => {
    expect(extractRole(msg({ text: "you applied to Site Reliability Engineer at Acme" })).role).toBe("Site Reliability Engineer");
  });

  it('"X – Application Received"', () => {
    expect(extractRole(msg({ subject: "Backend Engineer – Application Received" })).role).toBe("Backend Engineer");
    expect(extractRole(msg({ subject: "Backend Engineer - Application Received" })).role).toBe("Backend Engineer");
  });

  it("tries the subject before the body", () => {
    expect(extractRole(msg({ subject: "for the Frontend Engineer role", text: "for the Backend Engineer role" })).role).toBe(
      "Frontend Engineer",
    );
  });
});

describe("extractRole: rejection rules", () => {
  it("rejects a capture over MAX_ROLE_LENGTH characters", () => {
    const long = "X".repeat(MAX_ROLE_LENGTH + 1);
    expect(extractRole(msg({ text: `for the ${long} position` })).role).toBeUndefined();
  });

  it("accepts a capture exactly at MAX_ROLE_LENGTH", () => {
    const exact = "X".repeat(MAX_ROLE_LENGTH);
    expect(extractRole(msg({ text: `for the ${exact} position` })).role).toBe(exact);
  });

  it("rejects a capture containing sentence punctuation", () => {
    // No ROLE_KEYWORDS word on either side of the mid-word period, so the keyword
    // fallback can't independently pick up a valid phrase from the same text.
    expect(extractRole(msg({ text: "for the Product. Manager position" })).role).toBeUndefined();
  });

  it("rejects filler-only captures", () => {
    expect(extractRole(msg({ text: "your application for the position has been received" })).role).toBeUndefined();
  });
});

describe("extractRole: keyword-phrase fallback", () => {
  it("matches a phrase containing a role keyword when no named pattern applies", () => {
    expect(extractRole(msg({ text: "Backend Engineer, New Grad 2027" })).role).toBe("Backend Engineer, New Grad 2027");
  });

  it("strips a leading Role:/Position:/Title: label", () => {
    expect(extractRole(msg({ text: "Role: Backend Engineer" })).role).toBe("Backend Engineer");
    expect(extractRole(msg({ text: "Position: SWE Intern" })).role).toBe("SWE Intern");
  });

  it("does not use a keyword phrase that crosses a sentence boundary", () => {
    const result = extractRole(msg({ text: "We wanted to mention the Software Engineer opening in this note to you." }));
    expect(result.role).toBeUndefined();
  });
});

describe("extractRole: never guesses", () => {
  it("returns undefined with a reason when nothing matches", () => {
    const result = extractRole(msg({ text: "Thanks for your application. We'll be in touch." }));
    expect(result.role).toBeUndefined();
    expect(result.reasons.at(-1)).toMatch(/never guessed/);
  });
});
