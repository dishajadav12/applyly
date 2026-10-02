import { describe, expect, it } from "vitest";
import { extractCompanyFromSender } from "@/lib/extract/company";
import { fixMojibake, normalizeMessage } from "@/lib/extract/normalize";
import { extractRole } from "@/lib/extract/role";
import { looksLikePersonName } from "@/lib/extract/text-utils";
import { companyKeysCompatible } from "@/lib/match/normalize";
import { roleSimilarity } from "@/lib/match/similarity";

const msg = (o: Record<string, unknown>) =>
  normalizeMessage({ messageId: "m", threadId: "t", receivedAt: "2026-06-12T12:00:00.000Z", from: "x@example.com", subject: "", snippet: "", text: "", headers: {}, labelIds: ["INBOX"], ...o } as never);

describe("person names are never companies", () => {
  it("recognises a person by the mailbox, not a company display name", () => {
    expect(looksLikePersonName("Eileen Poeung", "eileen.poeung@rippling.com")).toBe(true);
    expect(looksLikePersonName("Chris Tung", "ctung@rippling.com")).toBe(true);
    expect(looksLikePersonName("Goldman Sachs", "gs-recruiting@goldman.com")).toBe(false);
    expect(looksLikePersonName("Roblox", "no-reply@x.com")).toBe(false);
  });

  it("a person at an ATS vendor's own domain means the vendor is the employer", () => {
    const r = extractCompanyFromSender(msg({ from: "eileen.poeung@rippling.com", fromName: "Eileen Poeung" }));
    expect(r?.company).toBe("Rippling");
  });
});

describe("role extraction", () => {
  it("drops 'Confirmation | Interview for' and trailing noise", () => {
    expect(extractRole(msg({ subject: "Confirmation | Interview for Full Stack Software Engineer Intern - Winter" })).role).toBe("Full Stack Software Engineer Intern - Winter");
  });

  it("never returns a sentence fragment", () => {
    const r = extractRole(msg({ text: "We would like to proceed to the next steps for the Software Engineer Intern," }));
    expect(r.role).toBe("Software Engineer Intern");
  });

  it("repairs mojibake so 'Â' never reaches a role", () => {
    expect(fixMojibake("Winter 2027Â and")).toBe("Winter 2027 and");
    expect(extractRole(msg({ subject: "Full Stack Software Engineer Intern - Winter 2027Â and" })).role).toBe("Full Stack Software Engineer Intern - Winter 2027");
  });

  it("cleaned variants of one role are similar enough to merge", () => {
    expect(roleSimilarity("Full Stack Software Engineer Intern - Winter 2027", "Full Stack Software Engineer Intern - Winter")).toBeGreaterThanOrEqual(0.85);
  });
});

describe("company key compatibility", () => {
  it("treats brand-affix variants as one company, but not unrelated or short keys", () => {
    expect(companyKeysCompatible("pebl", "hellopebl")).toBe(true);
    expect(companyKeysCompatible("acme", "acmehq")).toBe(true);
    expect(companyKeysCompatible("rippling", "rippling")).toBe(true);
    expect(companyKeysCompatible("ab", "getab")).toBe(false);
    expect(companyKeysCompatible("stripe", "strip")).toBe(false);
  });
});
