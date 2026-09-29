import { describe, expect, it } from "vitest";
import { extractCompany, normalizeCompanyKey } from "@/lib/extract/company";
import { normalizeMessage } from "@/lib/extract/normalize";
import { stripTrailingCompanySuffix } from "@/lib/extract/text-utils";
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

describe("stripTrailingCompanySuffix / normalizeCompanyKey", () => {
  it.each([
    ["Acme Inc", "Acme"],
    ["Acme, Inc.", "Acme"],
    ["Acme LLC", "Acme"],
    ["Acme Technologies", "Acme"],
    ["Acme Recruiting", "Acme"],
    ["Acme Careers", "Acme"],
    ["Acme Hiring Team", "Acme"],
    ["Acme", "Acme"],
  ])("strips trailing suffixes: %s -> %s", (input, expected) => {
    expect(stripTrailingCompanySuffix(input)).toBe(expected);
  });

  it("normalizes formatting differences to the same company_key", () => {
    expect(normalizeCompanyKey("Goldman Sachs")).toBe(normalizeCompanyKey("GOLDMAN SACHS, Inc."));
    expect(normalizeCompanyKey("Acme Corp")).toBe("acme");
    expect(normalizeCompanyKey("Acme")).toBe("acme");
  });
});

describe("extractCompany: generic regex step (A7 step 2)", () => {
  it("does not run on to swallow the next sentence", () => {
    const result = extractCompany(msg({ text: "Thank you for applying to SmallStartup. We're reviewing applications now." }));
    expect(result.company).toBe("SmallStartup");
  });

  it("matches each of the four generic patterns", () => {
    expect(extractCompany(msg({ text: "I'm applying to Acme Corp for a role." })).company).toBe("Acme");
    expect(extractCompany(msg({ text: "Thanks for your interest in Globex today." })).company).toBe("Globex");
    expect(extractCompany(msg({ text: "This is a position at Initech Labs." })).company).toBe("Initech");
    expect(extractCompany(msg({ text: "Reach out to Nimbus Talent Acquisition with questions." })).company).toBe("Nimbus");
  });

  it("tries the subject before the body", () => {
    const result = extractCompany(
      msg({ subject: "Your interest in Acme", text: "This is a position at Globex, unrelated text." }),
    );
    expect(result.company).toBe("Acme");
  });
});

describe("extractCompany: alias map (A7 step 3)", () => {
  it("excludes freemail domains from the alias map", () => {
    // "datadoghq" is not a real fragment of gmail.com, but freemail must never resolve via alias/domain heuristics.
    const result = extractCompany(msg({ from: "someone@gmail.com", text: "no company pattern here at all" }));
    expect(result.company).toBeUndefined();
  });

  it("matches a fragment anywhere in the domain", () => {
    expect(extractCompany(msg({ from: "careers@eu.datadoghq.example", text: "no pattern" })).company).toBe("Datadog");
  });
});

describe("extractCompany: never guesses", () => {
  it("leaves company undefined with a reason when nothing matches", () => {
    const result = extractCompany(msg({ from: "hr@unknownco.example", text: "hello there, thanks" }));
    expect(result.company).toBeUndefined();
    expect(result.reasons.at(-1)).toMatch(/never guessed/);
  });
});
